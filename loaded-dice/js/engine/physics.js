// ============================================================
// 물리 주사위 엔진 (Three.js 렌더 + cannon-es 물리)
// - 주사위 눈은 시드가 아니라 "실제 물리 시뮬레이션 결과"로 결정된다.
// - 리드미노 '무게추'는 무게중심을 치우치게 하는 추가 중력 토크로 구현 (진짜 Loaded Dice)
// ============================================================
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

const DIE_SIZE = 0.95;
const BOARD_W = 10.4, BOARD_D = 6.6;
const TRAY_Z = -BOARD_D / 2 - 1.35;   // 배치 칸(선반): 보드 뒤쪽 바깥
const LINE_Z = BOARD_D / 2 - 1.05;    // 굴림 결과 정렬 라인: 보드 앞쪽
const SLOT_GAP = 1.3;
// BoxGeometry 머티리얼 순서: +x, -x, +y, -y, +z, -z
const FACE_AXES = [
  new CANNON.Vec3(1, 0, 0), new CANNON.Vec3(-1, 0, 0),
  new CANNON.Vec3(0, 1, 0), new CANNON.Vec3(0, -1, 0),
  new CANNON.Vec3(0, 0, 1), new CANNON.Vec3(0, 0, -1),
];

// ---------- 주사위 면 텍스처 (픽셀 스타일, 0~10 지원) ----------
const PIP_LAYOUTS = {
  1: [[2, 2]],
  2: [[1, 1], [3, 3]],
  3: [[1, 1], [2, 2], [3, 3]],
  4: [[1, 1], [1, 3], [3, 1], [3, 3]],
  5: [[1, 1], [1, 3], [2, 2], [3, 1], [3, 3]],
  6: [[1, 1], [1, 3], [2, 1], [2, 3], [3, 1], [3, 3]],
};
function makeFaceTexture(value, baseColor) {
  const S = 64;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = baseColor;
  g.fillRect(0, 0, S, S);
  // 테두리/모서리 음영 (픽셀 느낌)
  g.fillStyle = 'rgba(0,0,0,0.28)';
  g.fillRect(0, 0, S, 4); g.fillRect(0, S - 4, S, 4);
  g.fillRect(0, 0, 4, S); g.fillRect(S - 4, 0, 4, S);
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.fillRect(4, 4, S - 8, 4);
  const pip = '#2a2222';
  if (PIP_LAYOUTS[value]) {
    const cell = S / 5;
    const r = 6;
    for (const [px, py] of PIP_LAYOUTS[value]) {
      const cx = (px + 0.5) * cell, cy = (py + 0.5) * cell;
      g.fillStyle = pip;
      g.fillRect(cx - r, cy - r, r * 2, r * 2);
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(cx - r, cy - r, r, r);
    }
  } else {
    // 0, 7~10은 숫자로 표기
    g.fillStyle = pip;
    g.font = 'bold 34px monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(value), S / 2, S / 2 + 2);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeBoardTexture() {
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = '#2e5839';
  g.fillRect(0, 0, S, S);
  // 펠트 노이즈
  for (let i = 0; i < 700; i++) {
    const a = Math.random() * 0.1;
    g.fillStyle = Math.random() < 0.5 ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a * 0.6})`;
    g.fillRect(Math.floor(Math.random() * S), Math.floor(Math.random() * S), 2, 2);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 2);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
function makeWoodTexture() {
  const S = 64;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  g.fillStyle = '#5a3c22';
  g.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 4) {
    g.fillStyle = `rgba(0,0,0,${0.05 + 0.1 * Math.random()})`;
    g.fillRect(0, y, S, 2);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ============================================================
export class DiceScene {
  constructor(container) {
    this.container = container;
    this.entries = new Map(); // uid → {mesh, body, die, weight}
    this.rollingUids = new Set();
    this.onSettle = null;
    this.settleFrames = 0;
    this.rollTimer = 0;
    this.speedScale = 1;

    // --- Three ---
    this.scene = new THREE.Scene();
    this.scene.background = null;
    const w = container.clientWidth || 640, h = container.clientHeight || 400;
    this.camera = new THREE.PerspectiveCamera(44, w / h, 0.1, 100);
    this.camera.position.set(0, 10.6, 6.6);
    this.camera.lookAt(0, 0, -0.55);
    this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(1, window.devicePixelRatio) * 0.75); // 픽셀 느낌
    this.renderer.domElement.style.imageRendering = 'pixelated';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.BasicShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene.add(new THREE.AmbientLight(0xfff2dd, 0.75));
    const sun = new THREE.DirectionalLight(0xffe8c0, 1.6);
    sun.position.set(3, 10, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(512, 512);
    sun.shadow.camera.left = -7; sun.shadow.camera.right = 7;
    sun.shadow.camera.top = 6; sun.shadow.camera.bottom = -6;
    this.scene.add(sun);

    // 보드 (펠트 + 나무 테두리)
    const felt = new THREE.Mesh(
      new THREE.BoxGeometry(BOARD_W, 0.4, BOARD_D),
      new THREE.MeshLambertMaterial({ map: makeBoardTexture() }));
    felt.position.y = -0.2;
    felt.receiveShadow = true;
    this.scene.add(felt);
    const woodMat = new THREE.MeshLambertMaterial({ map: makeWoodTexture() });
    const rimH = 0.75, rimT = 0.5;
    const mkRim = (sx, sz, x, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx, rimH, sz), woodMat);
      m.position.set(x, rimH / 2 - 0.25, z);
      m.castShadow = true; m.receiveShadow = true;
      this.scene.add(m);
    };
    mkRim(BOARD_W + rimT * 2, rimT, 0, -BOARD_D / 2 - rimT / 2);
    mkRim(BOARD_W + rimT * 2, rimT, 0, BOARD_D / 2 + rimT / 2);
    mkRim(rimT, BOARD_D, -BOARD_W / 2 - rimT / 2, 0);
    mkRim(rimT, BOARD_D, BOARD_W / 2 + rimT / 2, 0);

    // 배치 칸 선반 (보드 뒤쪽, 물리 영역 밖)
    const shelf = new THREE.Mesh(
      new THREE.BoxGeometry(BOARD_W + rimT * 2, 0.5, 1.9), woodMat);
    shelf.position.set(0, -0.25, TRAY_Z);
    shelf.receiveShadow = true;
    this.scene.add(shelf);
    this.trayMarkers = new THREE.Group();
    this.scene.add(this.trayMarkers);

    // --- Cannon ---
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -34, 0) });
    this.world.allowSleep = true;
    this.world.defaultContactMaterial.friction = 0.25;
    this.world.defaultContactMaterial.restitution = 0.42;
    const ground = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane() });
    ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(ground);
    const wall = (nx, nz, dist) => {
      const b = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane() });
      // plane normal 기본 +z → 회전으로 설정
      const q = new CANNON.Quaternion();
      if (nx === 1) q.setFromEuler(0, Math.PI / 2, 0);
      else if (nx === -1) q.setFromEuler(0, -Math.PI / 2, 0);
      else if (nz === 1) q.setFromEuler(0, 0, 0);
      else q.setFromEuler(0, Math.PI, 0);
      b.quaternion.copy(q);
      b.position.set(nx * -dist, 0, nz * -dist);
      this.world.addBody(b);
    };
    wall(1, 0, BOARD_W / 2);   // 왼쪽 벽 (normal +x)
    wall(-1, 0, BOARD_W / 2);  // 오른쪽 벽
    wall(0, 1, BOARD_D / 2);   // 뒤쪽 벽
    wall(0, -1, BOARD_D / 2);  // 앞쪽 벽
    const ceiling = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane() });
    ceiling.quaternion.setFromEuler(Math.PI / 2, 0, 0);
    ceiling.position.set(0, 7, 0);
    this.world.addBody(ceiling);

    // 무게추(Loaded) 효과: postStep에서 치우친 지점에 추가 중력 적용
    this.world.addEventListener('postStep', () => this.applyLoadedWeights());

    this.clock = new THREE.Clock();
    this.running = true;
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
    // 워치독: rAF가 멈춰도(백그라운드) 일정 시간 후 강제 정착
    this.rollStartMs = 0;
    this.watchdog = setInterval(() => {
      if (this.onSettle && this.rollingUids.size &&
          performance.now() - this.rollStartMs > 7000) {
        this.world.step(1 / 60, 3, 120); // 남은 시뮬레이션 몰아서 진행
        this.finishRoll();
      }
    }, 600);

    this.resizeObs = new ResizeObserver(() => this.onResize());
    this.resizeObs.observe(container);

    // ---- 주사위 눈금 라벨 오버레이 ----
    this.labelLayer = document.createElement('div');
    this.labelLayer.className = 'dice-label-layer';
    container.appendChild(this.labelLayer);

    // ---- 주사위 클릭/호버 (레이캐스트) ----
    this.onDieClick = null; // (uid) => void
    this.raycaster = new THREE.Raycaster();
    const pick = (e) => {
      const rect = this.renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1);
      this.raycaster.setFromCamera(ndc, this.camera);
      const meshes = [...this.entries.values()].map(en => en.mesh);
      const hit = this.raycaster.intersectObjects(meshes)[0];
      if (!hit) return null;
      for (const [uid, en] of this.entries) if (en.mesh === hit.object) return uid;
      return null;
    };
    this.renderer.domElement.addEventListener('pointerdown', (e) => {
      if (!this.onDieClick || this.rollingUids.size) return;
      const uid = pick(e);
      if (uid) this.onDieClick(uid);
    });
    this.renderer.domElement.addEventListener('pointermove', (e) => {
      if (!this.onDieClick || this.rollingUids.size) {
        this.renderer.domElement.style.cursor = '';
        return;
      }
      this.renderer.domElement.style.cursor = pick(e) ? 'pointer' : '';
    });

    // ---- 구역 이동 트윈 ----
    this.tweens = new Map(); // uid → {fp, fq, tp, tq, t, dur}
  }

  // 슬롯 x 좌표 (n개 기준 중앙 정렬)
  slotX(i, n) { return (i - (n - 1) / 2) * SLOT_GAP; }

  // 특정 위치로 부드럽게 이동 (현재 윗면 유지)
  placeAt(uid, x, z, animate = true) {
    const e = this.entries.get(uid);
    if (!e) return;
    this.tweens.delete(uid);
    e.body.type = CANNON.Body.STATIC;
    e.body.velocity.setZero();
    e.body.angularVelocity.setZero();
    const snapped = this.snapQuaternion(e.body.quaternion);
    const tp = new CANNON.Vec3(x, DIE_SIZE / 2, z);
    if (!animate) {
      e.body.position.copy(tp);
      e.body.quaternion.copy(snapped);
      this.syncMesh(uid);
      return;
    }
    this.tweens.set(uid, {
      fp: e.body.position.clone(),
      fq: new THREE.Quaternion(e.body.quaternion.x, e.body.quaternion.y, e.body.quaternion.z, e.body.quaternion.w),
      tp,
      tq: new THREE.Quaternion(snapped.x, snapped.y, snapped.z, snapped.w),
      t: 0, dur: 0.38,
    });
  }

  // 배치 칸(선반) / 굴림 결과 라인에 주사위 배열
  layoutZones(trayUids, lineUids, animate = true) {
    const n = this.entries.size;
    trayUids.forEach((uid, i) => this.placeAt(uid, this.slotX(i, n), TRAY_Z, animate));
    lineUids.forEach((uid, i) => this.placeAt(uid, this.slotX(i, lineUids.length), LINE_Z, animate));
  }

  // ---- 눈금 라벨 ----
  setDieLabel(uid, text, kept = false) {
    const e = this.entries.get(uid);
    if (!e) return;
    if (text == null) { e.labelEl.style.display = 'none'; return; }
    e.labelEl.style.display = '';
    e.labelEl.textContent = text;
    e.labelEl.classList.toggle('kept', kept);
  }
  clearLabels() {
    for (const [, e] of this.entries) e.labelEl.style.display = 'none';
  }
  updateLabels() {
    const w = this.container.clientWidth, hgt = this.container.clientHeight;
    const v = new THREE.Vector3();
    for (const [uid, e] of this.entries) {
      if (e.labelEl.style.display === 'none') continue;
      if (this.rollingUids.has(uid)) { e.labelEl.style.opacity = '0'; continue; }
      e.labelEl.style.opacity = '1';
      v.set(e.body.position.x, e.body.position.y + DIE_SIZE * 0.72, e.body.position.z);
      v.project(this.camera);
      const x = (v.x * 0.5 + 0.5) * w, y = (-v.y * 0.5 + 0.5) * hgt;
      e.labelEl.style.transform = `translate(-50%,-100%) translate(${x}px,${y}px)`;
    }
  }

  onResize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  // 주사위 세트 동기화 (스테이지 시작 시)
  syncDice(dice) {
    for (const [uid, e] of this.entries) {
      this.scene.remove(e.mesh);
      this.world.removeBody(e.body);
      e.mesh.geometry.dispose();
      e.mesh.material.forEach(m => { m.map?.dispose(); m.dispose(); });
      e.labelEl.remove();
    }
    this.entries.clear();
    this.tweens.clear();
    // 배치 칸 슬롯 마커 재생성
    this.trayMarkers.clear();
    for (let i = 0; i < dice.length; i++) {
      const marker = new THREE.Mesh(
        new THREE.PlaneGeometry(DIE_SIZE + 0.14, DIE_SIZE + 0.14),
        new THREE.MeshBasicMaterial({ color: 0x2a1c0e, transparent: true, opacity: 0.55 }));
      marker.rotation.x = -Math.PI / 2;
      marker.position.set(this.slotX(i, dice.length), 0.01, TRAY_Z);
      this.trayMarkers.add(marker);
    }
    dice.forEach((die, i) => {
      const mats = die.faces.map(v => new THREE.MeshLambertMaterial({ map: makeFaceTexture(v, die.color) }));
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(DIE_SIZE, DIE_SIZE, DIE_SIZE), mats);
      mesh.castShadow = true; mesh.receiveShadow = true;
      this.scene.add(mesh);
      const body = new CANNON.Body({
        mass: 1,
        shape: new CANNON.Box(new CANNON.Vec3(DIE_SIZE / 2, DIE_SIZE / 2, DIE_SIZE / 2)),
        sleepSpeedLimit: 0.35, sleepTimeLimit: 0.25,
        angularDamping: 0.12, linearDamping: 0.02,
      });
      body.position.set(this.slotX(i, dice.length), DIE_SIZE / 2, LINE_Z);
      this.world.addBody(body);
      const labelEl = document.createElement('div');
      labelEl.className = 'dice-label';
      labelEl.style.display = 'none';
      this.labelLayer.appendChild(labelEl);
      this.entries.set(die.uid, { mesh, body, die, weight: null, labelEl });
      this.syncMesh(die.uid);
    });
  }

  setWeight(uid, weightInfo) { // {faceIdx, level} | null
    const e = this.entries.get(uid);
    if (e) e.weight = weightInfo;
  }

  applyLoadedWeights() {
    for (const uid of this.rollingUids) {
      const e = this.entries.get(uid);
      if (!e || !e.weight) continue;
      const n = FACE_AXES[e.weight.faceIdx];
      // 선호 면의 반대쪽에 무게추 → 선호 면이 위로 가게 됨
      const local = n.scale(-DIE_SIZE * 0.45);
      const worldOffset = e.body.quaternion.vmult(local);
      const f = 34 * 0.5 * e.weight.level; // 질량 1 기준 추가 중력
      e.body.applyForce(new CANNON.Vec3(0, -f, 0), worldOffset);
    }
  }

  // 굴릴 주사위들을 컵 위치에서 던진다
  roll(uids, onSettle, speed = 1) {
    this.speedScale = speed;
    this.onSettle = onSettle;
    this.rollingUids = new Set(uids);
    this.settleFrames = 0;
    this.rollTimer = 0;
    this.rollStartMs = performance.now();
    let i = 0;
    for (const uid of uids) {
      const e = this.entries.get(uid);
      if (!e) continue;
      this.tweens.delete(uid);
      e.labelEl.style.display = 'none';
      const b = e.body;
      b.type = CANNON.Body.DYNAMIC;
      b.wakeUp();
      b.position.set(BOARD_W / 2 - 1.2 - (i % 2) * 0.9, 2.2 + i * 0.75, BOARD_D / 2 - 1.1);
      b.quaternion.setFromEuler(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      b.velocity.set(-7.5 - Math.random() * 4, 0.6, -4.5 - Math.random() * 2.5);
      b.angularVelocity.set(
        (Math.random() - 0.5) * 24, (Math.random() - 0.5) * 24, (Math.random() - 0.5) * 24);
      i++;
    }
  }

  // 모든 주사위를 굴림 결과 라인으로 복귀 (등록 후/스테이지 시작)
  idleLineup(animate = false) {
    this.clearLabels();
    this.layoutZones([], [...this.entries.keys()], animate);
  }

  // 쿼터니언을 가장 가까운 축 정렬 방향으로 스냅
  snapQuaternion(q) {
    const euler = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(q.x, q.y, q.z, q.w));
    const snap = (a) => Math.round(a / (Math.PI / 2)) * (Math.PI / 2);
    const tq = new THREE.Quaternion().setFromEuler(new THREE.Euler(snap(euler.x), snap(euler.y), snap(euler.z)));
    return new CANNON.Quaternion(tq.x, tq.y, tq.z, tq.w);
  }

  // 윗면 판정 → faces 인덱스
  topFaceIndex(body) {
    const up = new CANNON.Vec3(0, 1, 0);
    let best = -1, bestDot = -2;
    for (let i = 0; i < 6; i++) {
      const world = body.quaternion.vmult(FACE_AXES[i]);
      const d = world.dot(up);
      if (d > bestDot) { bestDot = d; best = i; }
    }
    return best;
  }

  readResults() {
    const results = [];
    for (const uid of this.rollingUids) {
      const e = this.entries.get(uid);
      if (!e) continue;
      const idx = this.topFaceIndex(e.body);
      results.push({ uid, faceIdx: idx, raw: e.die.faces[idx] });
    }
    return results;
  }

  syncMesh(uid) {
    const e = this.entries.get(uid);
    if (!e) return;
    e.mesh.position.copy(e.body.position);
    e.mesh.quaternion.copy(e.body.quaternion);
  }

  animate() {
    if (!this.running) return;
    requestAnimationFrame(this.animate);
    // 실제 경과 시간만큼 시뮬레이션 (백그라운드 스로틀 시에도 실시간 추적)
    const dt = Math.min(this.clock.getDelta(), 1.0);
    this.world.step(1 / 60, dt * this.speedScale, 60);

    // 구역 이동 트윈 진행
    for (const [uid, tw] of this.tweens) {
      const e = this.entries.get(uid);
      if (!e) { this.tweens.delete(uid); continue; }
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      const ease = 1 - Math.pow(1 - k, 3); // easeOutCubic
      e.body.position.set(
        tw.fp.x + (tw.tp.x - tw.fp.x) * ease,
        tw.fp.y + (tw.tp.y - tw.fp.y) * ease + Math.sin(ease * Math.PI) * 0.55, // 포물선 점프
        tw.fp.z + (tw.tp.z - tw.fp.z) * ease);
      const q = tw.fq.clone().slerp(tw.tq, ease);
      e.body.quaternion.set(q.x, q.y, q.z, q.w);
      if (k >= 1) this.tweens.delete(uid);
    }

    for (const [uid] of this.entries) this.syncMesh(uid);
    this.updateLabels();

    // 정착 감지
    if (this.onSettle && this.rollingUids.size) {
      this.rollTimer += dt;
      let still = true;
      for (const uid of this.rollingUids) {
        const b = this.entries.get(uid)?.body;
        if (!b) continue;
        if (b.sleepState !== CANNON.Body.SLEEPING &&
            (b.velocity.length() > 0.12 || b.angularVelocity.length() > 0.15)) {
          still = false; break;
        }
      }
      if (still) this.settleFrames += dt;
      else this.settleFrames = 0;
      if (this.settleFrames >= 0.25 || this.rollTimer > 5.5) this.finishRoll();
    }
    this.renderer.render(this.scene, this.camera);
  }

  // 정착 확정: 스냅 후 판독 → 콜백
  finishRoll() {
    if (!this.onSettle) return;
    for (const uid of this.rollingUids) {
      const e = this.entries.get(uid);
      if (!e) continue;
      e.body.quaternion.copy(this.snapQuaternion(e.body.quaternion));
      e.body.velocity.setZero();
      e.body.angularVelocity.setZero();
      e.body.type = CANNON.Body.STATIC;
      if (e.body.position.y < DIE_SIZE / 2 - 0.05) e.body.position.y = DIE_SIZE / 2;
      this.syncMesh(uid);
    }
    const results = this.readResults();
    const cb = this.onSettle;
    this.onSettle = null;
    this.rollingUids = new Set();
    this.renderer.render(this.scene, this.camera);
    cb(results);
  }

  dispose() {
    this.running = false;
    clearInterval(this.watchdog);
    this.resizeObs?.disconnect();
    this.renderer.dispose();
    this.container.innerHTML = '';
  }
}
