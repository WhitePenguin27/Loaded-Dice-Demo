// ============================================================
// UI + 게임 플로우 컨트롤러
// 메인 → 월드 룰 → (로컬 룰 → 플레이 → 보상 → 상점)루프 → 게임아웃/승리
// ============================================================
import {
  WORLD_RULES, LOCAL_RULES, WILDFACES, DICE_DEFS, CAT, TIPS, MAX_STAGE,
  MINO_UPGRADE_COST, BASE_SHEET,
} from './data/db.js';
import {
  loadMeta, saveMeta, isWorldUnlocked, evaluateUnlocks,
  newRun, startStage, genLocalChoices, activeDice, runTotal, bonusState,
  genRewardChoices, genShopItems, shopPrice, settleClearGold, wildSlotMax,
  makeDie, makeMino, refreshMino, tryPlaceMino, removeMino, rotatedShape,
  saveRun, loadRun, hasSave, deleteSave,
} from './engine/state.js';
import { scoreCategory, shiftedValue, dieWeightInfo, numberSectionSum } from './engine/scoring.js';
import { DiceScene } from './engine/physics.js';
import { sfx } from './engine/audio.js';
import {
  startTutorial, stopTutorial, tutAllows, tutEvent, isTutorialDone, resetTutorial, tutIndex,
} from './tutorial.js';

// ---------- 전역 상태 ----------
let meta = loadMeta();
let run = null;
let scene = null;        // DiceScene
let rolling = false;
let worldIdx = 0;
let placingMino = null;  // 배치 모드 중인 미노 inst

const $ = (sel) => document.querySelector(sel);
const h = (tag, cls, html) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (html != null) el.innerHTML = html;
  return el;
};
const icon = (name, cls = '') =>
  `<img class="icon ${cls}" src="assets/icon_${name}.png" alt="" onerror="this.style.display='none'">`;

// ---------- 토스트 / 모달 ----------
export function toast(msg, kind = '') {
  const el = h('div', `toast ${kind}`, msg);
  $('#toast-root').appendChild(el);
  setTimeout(() => el.classList.add('show'), 10);
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 2200);
}

function showModal(contentEl, { closable = true, cls = '' } = {}) {
  const root = $('#modal-root');
  const back = h('div', 'modal-back');
  const box = h('div', `modal panel ${cls}`);
  box.appendChild(contentEl);
  back.appendChild(box);
  root.appendChild(back);
  const close = () => back.remove();
  if (closable) {
    back.addEventListener('click', (e) => { if (e.target === back) close(); });
    const esc = (e) => { if (e.key === 'Escape') { close(); window.removeEventListener('keydown', esc); } };
    window.addEventListener('keydown', esc);
  }
  return { close, box };
}

function confirmModal(msg, onYes, { yesText = '네', noText = '아니오' } = {}) {
  const c = h('div', 'confirm');
  c.innerHTML = `<p class="confirm-msg">${msg}</p>`;
  const row = h('div', 'row center-row');
  const yes = h('button', 'btn primary', yesText);
  const no = h('button', 'btn', noText);
  row.append(yes, no);
  c.appendChild(row);
  const m = showModal(c);
  yes.onclick = () => { m.close(); onYes(); };
  no.onclick = () => m.close();
}

// ---------- 화면 전환 ----------
function showScreen(id) {
  for (const s of document.querySelectorAll('.screen')) s.hidden = true;
  $(id).hidden = false;
}
function showGamePanel(id) {
  for (const p of document.querySelectorAll('.game-panel')) p.hidden = true;
  $(id).hidden = false;
}

// ============================================================
// 메인 화면
// ============================================================
export function initUI() {
  $('#main-tip').textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
  const startNewGameFlow = () => {
    if (hasSave()) {
      confirmModal('플레이하던 데이터가 남아있습니다.<br>새로 시작하시겠습니까?<br><small>※기존 데이터는 삭제됩니다.</small>', () => {
        deleteSave(); showWorldSelect();
      });
    } else showWorldSelect();
  };
  $('#btn-start').onclick = () => { sfx.click(); startNewGameFlow(); };
  $('#btn-tutorial').onclick = () => { sfx.click(); resetTutorial(); startNewGameFlow(); };
  $('#btn-continue').onclick = () => {
    sfx.click();
    const loaded = loadRun();
    if (!loaded) { toast('세이브 데이터를 불러올 수 없습니다', 'warn'); return; }
    run = loaded;
    enterGame();
  };
  $('#btn-collection').onclick = () => { sfx.click(); showCollection(); };
  $('#btn-giveup').onclick = () => {
    sfx.click();
    confirmModal('현재 게임을 포기하시겠습니까?<br><small>세이브 데이터가 삭제됩니다.</small>', () => giveUp());
  };
  $('#world-prev').onclick = () => { sfx.click(); worldIdx = (worldIdx - 1 + WORLD_RULES.length) % WORLD_RULES.length; renderWorldSelect(); };
  $('#world-next').onclick = () => { sfx.click(); worldIdx = (worldIdx + 1) % WORLD_RULES.length; renderWorldSelect(); };
  $('#btn-world-back').onclick = () => { sfx.click(); showMain(); };
  $('#btn-world-start').onclick = () => startWorld();
  $('#btn-roll').onclick = () => doRoll();
  $('#btn-nextstage').onclick = () => nextStage();
  $('#btn-minobag').onclick = () => showMinoBag();
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && run?.phase === 'play' && !$('#screen-game').hidden) {
      e.preventDefault(); doRoll();
    }
  });
  setupTooltip();
  showMain();

  // QA용 디버그 훅 (콘솔 전용)
  window.__LD = {
    get run() { return run; },
    get meta() { return meta; },
    debugRoll(vals) { // 물리 생략하고 결과 주입 (테스트 전용)
      if (!run || run.phase !== 'play') return 'not in play';
      const act = activeDice(run);
      run.rolled = act.map((d, i) => ({ uid: d.uid, raw: vals[i] ?? 1, value: vals[i] ?? 1, kept: false }));
      rolling = false;
      renderPlay();
      if (scene) applyZones(false);
      tutEvent('rolled');
      return run.rolled.map(r => r.value);
    },
    register(catId) { registerScore(catId); },
    gold(n) { if (run) { run.gold = n; renderTopbar(); } },
    get tutStep() { return tutIndex(); },
  };
}

function showMain() {
  stopTutorial(false); // 메인 복귀 시 튜토리얼 중단 (완료 처리 안 함)
  showScreen('#screen-main');
  $('#btn-continue').hidden = !hasSave();
  $('#main-tip').textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
}

// ============================================================
// 월드 룰 선택 (캐러셀)
// ============================================================
function showWorldSelect() {
  showScreen('#screen-world');
  renderWorldSelect();
  if (!isTutorialDone()) startTutorial();
}
function worldCardHTML(w, locked) {
  return `<div class="wc-icon">${icon(w.icon)}</div>
    <div class="wc-name">${w.name}</div>
    ${locked ? `<div class="wc-lock">${icon('chain')}<div class="wc-lock-text">미해금</div></div>` : ''}`;
}
function renderWorldSelect() {
  const n = WORLD_RULES.length;
  const cur = WORLD_RULES[worldIdx];
  const left = WORLD_RULES[(worldIdx - 1 + n) % n];
  const right = WORLD_RULES[(worldIdx + 1) % n];
  const lockedCur = !isWorldUnlocked(meta, cur.id);
  $('#world-card-left').innerHTML = worldCardHTML(left, !isWorldUnlocked(meta, left.id));
  $('#world-card-right').innerHTML = worldCardHTML(right, !isWorldUnlocked(meta, right.id));
  const cardEl = $('#world-card');
  cardEl.innerHTML = worldCardHTML(cur, lockedCur);
  cardEl.classList.toggle('locked', lockedCur);
  $('#world-desc').innerHTML = lockedCur
    ? `<b>???</b><br>${cur.desc.replace(/\n/g, '<br>')}<br><span class="unlock-cond">해금 조건: ${cur.unlock?.text ?? '?'}</span>`
    : `<b>${cur.name}</b><br>${cur.desc.replace(/\n/g, '<br>')}`;
}
function startWorld() {
  const cur = WORLD_RULES[worldIdx];
  if (!isWorldUnlocked(meta, cur.id)) {
    sfx.deny();
    $('#world-card').classList.remove('shake');
    void $('#world-card').offsetWidth;
    $('#world-card').classList.add('shake');
    return;
  }
  sfx.click();
  run = newRun(cur.id);
  saveRun(run); // 세이브 시점: 월드 룰 확정 시
  enterGame();
  tutEvent('world-start');
}

// ============================================================
// 게임 레이아웃 공통
// ============================================================
function enterGame() {
  showScreen('#screen-game');
  route();
}
function route() {
  if (!run) return;
  renderTopbar(); renderItembox();
  if (run.phase === 'local-select') renderLocalSelect();
  else if (run.phase === 'play') initPlay();
  else if (run.phase === 'reward') { renderScoreboard(false); showGamePanel('#panel-play'); renderReward(); }
  else if (run.phase === 'shop') renderShop();
}

function renderTopbar() {
  $('#tb-stage').textContent = `${run.stage} Stage`;
  $('#tb-gold').textContent = `${run.gold}$`;
  const wrap = $('#tb-wilds');
  wrap.innerHTML = '';
  const max = wildSlotMax(run);
  for (let i = 0; i < max; i++) {
    const w = run.wilds[i];
    const slot = h('div', 'wild-slot' + (w ? (w.disabled ? ' disabled' : ' filled') : ''));
    if (w) {
      slot.innerHTML = icon(w.def.icon);
      slot.dataset.tip = `<b>${w.def.name}</b>${w.disabled ? ' (비활성)' : ''}<br>${w.def.desc.replace(/\n/g, '<br>')}`;
    } else slot.dataset.tip = '빈 와일드 페이스 칸';
    wrap.appendChild(slot);
  }
}

// ---------- 점수판 ----------
function previewFor(catId) {
  if (!run.rolled || rolling) return null;
  const diceObjs = run.rolled.map(r => ({ die: run.dice.find(d => d.uid === r.uid), value: r.value }));
  return scoreCategory(catId, diceObjs, run);
}
function renderScoreboard(interactive) {
  const rulesEl = $('#sb-rules');
  rulesEl.innerHTML = '';
  const wr = h('div', 'sb-rule', `${icon(run.worldRule.icon)}<span>${run.worldRule.name}</span>`);
  wr.dataset.tip = `<b>월드 룰: ${run.worldRule.name}</b><br>${run.worldRule.desc.replace(/\n/g, '<br>')}`;
  rulesEl.appendChild(wr);
  if (run.localRule && (run.phase === 'play' || run.phase === 'reward')) {
    const lr = h('div', 'sb-rule local', `${icon(run.localRule.icon)}<span>${run.localRule.name}</span>`);
    lr.dataset.tip = `<b>로컬 룰: ${run.localRule.name}</b><br>${run.localRule.desc.replace(/\n/g, '<br>')}`;
    rulesEl.appendChild(lr);
  }

  const total = runTotal(run);
  const tEl = $('#sb-target');
  if (run.phase === 'play' || run.phase === 'reward') {
    const pct = Math.min(100, Math.round(total / run.target * 100));
    tEl.innerHTML = `<div class="target-line"><span>목표 ${run.target}</span><b>${total}</b></div>
      <div class="target-bar"><div class="target-fill" style="width:${pct}%"></div></div>`;
  } else tEl.innerHTML = '';

  const table = $('#sb-table');
  table.innerHTML = '';
  const bonus = bonusState(run);
  const canRegister = interactive && run.rolled && !rolling;
  const sheetRows = run.sheet.length ? run.sheet : BASE_SHEET.map(id => ({ catId: id, score: null }));
  // 구분된 레이아웃: 숫자 족보(Ace~Bonus) / 조합 족보(Choice~Yacht)
  const numberRows = sheetRows.filter(r => CAT[r.catId].type === 'number');
  const comboRows = sheetRows.filter(r => CAT[r.catId].type !== 'number');

  const addSectionHeader = (label, cls) => {
    const tr = h('tr', `section-row ${cls}`);
    tr.innerHTML = `<td colspan="2">${label}</td>`;
    table.appendChild(tr);
  };
  const addCatRow = (row, cls) => {
    const cat = CAT[row.catId];
    const tr = h('tr', `${cls} ` + (row.score != null ? 'filled' : (canRegister ? 'open' : '')));
    tr.dataset.tip = `<b>${cat.name}</b><br>${cat.desc}`;
    let scoreCell;
    if (row.score != null) scoreCell = `${row.score}`;
    else if (canRegister) {
      const pv = previewFor(row.catId);
      scoreCell = `<span class="preview">${pv ? pv.final : ''}</span>`;
    } else scoreCell = '';
    tr.innerHTML = `<td>${cat.name}</td><td class="score">${scoreCell}</td>`;
    if (row.score == null && canRegister) {
      tr.onclick = () => registerScore(row.catId);
    }
    table.appendChild(tr);
  };

  addSectionHeader('숫자 족보', 'sec-num');
  for (const row of numberRows) addCatRow(row, 'sec-num');
  const btr = h('tr', 'bonus-row sec-num');
  btr.dataset.tip = `<b>Bonus</b><br>숫자 족보 합계가 ${bonus.threshold} 이상이면 +${bonus.score}점`;
  btr.innerHTML = `<td>Bonus (${Math.min(bonus.sum, bonus.threshold)} / ${bonus.threshold})</td>
    <td class="score">${bonus.active ? `+${bonus.score}` : `<span class="dim">+${bonus.score}</span>`}</td>`;
  table.appendChild(btr);

  addSectionHeader('조합 족보', 'sec-combo');
  for (const row of comboRows) addCatRow(row, 'sec-combo');

  const totalTr = h('tr', 'total-row');
  totalTr.innerHTML = `<td>합계</td><td class="score">${total}</td>`;
  table.appendChild(totalTr);

  const counters = $('#sb-counters');
  if (run.phase === 'play') {
    counters.innerHTML = `
      <div class="counter"><span>등록</span><b>${run.regsLeft}</b></div>
      <div class="counter"><span>재굴림</span><b>${run.rerollsLeft}</b></div>`;
  } else counters.innerHTML = '';
}

// ---------- 아이템 박스 (하단) ----------
function renderItembox() {
  const dEl = $('#ib-dice');
  dEl.innerHTML = '<span class="ib-label">주사위</span>';
  for (const die of run.dice) {
    const chip = h('div', 'die-chip' + (die.sealed ? ' sealed' : ''));
    chip.style.setProperty('--die-color', die.color);
    chip.innerHTML = `<span class="die-face-mini">${die.faces[0]}~${Math.max(...die.faces)}</span>
      ${die.sealed ? icon('chain', 'seal-ic') : ''}`;
    chip.dataset.tip = dieTipHTML(die);
    chip.onclick = () => showDieDetail(die);
    dEl.appendChild(chip);
  }
  const mEl = $('#ib-minos');
  mEl.innerHTML = `<span class="ib-label">리드미노 가방 (${run.minoBag.length})</span>`;
  for (const inst of run.minoBag) {
    const chip = minoChip(inst);
    chip.onclick = () => {
      if (run.phase === 'shop') startPlacing(inst);
      else showMinoDetail(inst, { placed: false });
    };
    mEl.appendChild(chip);
  }
}
function minoChip(inst) {
  const chip = h('div', 'mino-chip');
  chip.appendChild(minoShapeEl(inst, 8));
  chip.appendChild(h('span', 'mino-text', `Lv${inst.level}`));
  chip.dataset.tip = `<b>${inst.name}</b> (Lv${inst.level})<br>${inst.text}`;
  return chip;
}
function minoShapeEl(inst, cell = 10) {
  const cells = rotatedShape(inst.shape, 0);
  const maxR = Math.max(...cells.map(c => c[0])) + 1;
  const maxC = Math.max(...cells.map(c => c[1])) + 1;
  const el = h('div', 'mino-shape');
  el.style.width = `${maxC * cell}px`;
  el.style.height = `${maxR * cell}px`;
  for (const [r, c] of cells) {
    const sq = h('div', 'mino-sq');
    sq.style.cssText = `left:${c * cell}px;top:${r * cell}px;width:${cell - 1}px;height:${cell - 1}px;background:${inst.color}`;
    el.appendChild(sq);
  }
  return el;
}
function dieTipHTML(die) {
  let s = `<b>${die.name}</b><br>눈금: [${die.faces.join(', ')}]`;
  if (die.sealed) s += '<br><span class="warn">봉인됨 (이번 판 사용 불가)</span>';
  if (die.rerollSealed) s += '<br><span class="warn">재굴림 불가 (첫 굴림 후 고정)</span>';
  for (const p of die.minos) s += `<br>· ${p.inst.text}`;
  return s;
}

// ============================================================
// 로컬 룰 선택
// ============================================================
function renderLocalSelect() {
  showGamePanel('#panel-local');
  renderScoreboard(false);
  const wrap = $('#local-cards');
  wrap.innerHTML = '';
  for (const id of run.localChoices) {
    const lr = LOCAL_RULES.find(l => l.id === id);
    const card = h('div', 'local-card panel');
    card.innerHTML = `
      <div class="lc-icon">${icon(lr.icon)}</div>
      <div class="lc-name">${lr.name}</div>
      <div class="lc-desc">${lr.desc.replace(/\n/g, '<br>')}</div>
      <div class="lc-gold">클리어 보상 +${lr.gold}$</div>`;
    card.onclick = () => {
      if (!tutAllows('local-select')) return;
      sfx.click();
      startStage(run, id);
      route();
      tutEvent('local-select');
    };
    wrap.appendChild(card);
  }
}

// ============================================================
// 요트 플레이
// ============================================================
function initPlay() {
  showGamePanel('#panel-play');
  if (!scene) scene = new DiceScene($('#dice-3d'));
  scene.onDieClick = (uid) => toggleKeep(uid);
  scene.syncDice(activeDice(run));
  scene.idleLineup();
  run.rolled = null;
  rolling = false;
  renderPlay();
}

// 배치 칸(선반) / 굴림 결과 라인에 3D 주사위 재배치 + 라벨 갱신
function applyZones(animate = true) {
  if (!run.rolled) { scene.idleLineup(); return; }
  const kept = run.rolled.filter(r => r.kept);
  const line = run.rolled.filter(r => !r.kept).sort((a, b) => a.value - b.value); // 낮은 눈금 순 정렬
  scene.layoutZones(kept.map(r => r.uid), line.map(r => r.uid), animate);
  for (const r of run.rolled) {
    scene.setDieLabel(r.uid, r.value !== r.raw ? `${r.value}*` : `${r.value}`, r.kept);
  }
}

function renderPlay() {
  renderTopbar();
  renderScoreboard(true);
  renderItembox();
  // 굴리기 버튼
  const btn = $('#btn-roll');
  const unkept = run.rolled ? run.rolled.filter(r => !r.kept) : null;
  let label = '굴리기 (Space)';
  let disabled = rolling;
  if (run.rolled) {
    const cost = run.localRule?.effects?.rerollCostGold ?? 0;
    label = `재굴림 ${cost ? `(-1회, -${cost}$)` : '(-1회)'}`;
    if (!unkept.length) { label = '전부 배치됨'; disabled = true; }
    else if (run.rerollsLeft < 1) { label = '재굴림 소진'; disabled = true; }
    else if (cost && run.gold < cost) { label = `골드 부족 (${cost}$)`; disabled = true; }
  }
  if (rolling) label = '굴리는 중...';
  btn.textContent = label;
  btn.disabled = disabled;

  // 안내 문구
  const hint = $('#play-hint');
  if (rolling) hint.textContent = '주사위가 구르는 중...';
  else if (run.rolled) hint.textContent = '주사위를 클릭하면 배치 칸으로 이동 · 다시 클릭하면 해제 · 점수판의 족보를 클릭해 등록';
  else hint.textContent = '굴리기 버튼으로 주사위를 던지세요';
}

function doRoll() {
  if (!run || run.phase !== 'play' || rolling) return;
  if (!tutAllows('roll')) return;
  const active = activeDice(run);
  const targets = run.rolled ? active.filter(d => !run.rolled.find(r => r.uid === d.uid)?.kept) : active;
  if (!targets.length) { toast('굴릴 주사위가 없습니다'); return; }
  if (run.rolled) { // 재굴림 비용
    if (run.rerollsLeft < 1) { sfx.deny(); return; }
    const cost = run.localRule?.effects?.rerollCostGold ?? 0;
    if (cost && run.gold < cost) { sfx.deny(); toast(`재굴림에 ${cost}$가 필요합니다`, 'warn'); return; }
    if (cost) { run.gold -= cost; }
    run.rerollsLeft--;
    run.stats.usedRerollThisStage = true;
  }
  rolling = true;
  // 무게추 세팅 (Loaded Dice!)
  for (const d of active) scene.setWeight(d.uid, dieWeightInfo(d));
  sfx.roll();
  renderPlay();
  scene.roll(targets.map(d => d.uid), (results) => onSettled(results));
}

function onSettled(results) {
  rolling = false;
  sfx.settle();
  if (!run.rolled) run.rolled = [];
  for (const res of results) {
    const die = run.dice.find(d => d.uid === res.uid);
    const value = shiftedValue(die, res.raw);
    const entry = run.rolled.find(r => r.uid === res.uid);
    if (entry) { entry.raw = res.raw; entry.value = value; }
    else run.rolled.push({ uid: res.uid, raw: res.raw, value, kept: false });
    // 리드미노: [N] 등장 시 재굴림
    for (const p of die.minos) {
      const e = p.inst.effectObj;
      if (e.minoRerollOn && value === e.minoRerollOn.face) {
        run.rerollsLeft += e.minoRerollOn.value;
        toast(`${die.name}: [${value}] → 재굴림 +${e.minoRerollOn.value}`, 'good');
      }
    }
    // 첫 굴림 후 고정(로컬 룰)
    if (die.rerollSealed) {
      const en = run.rolled.find(r => r.uid === res.uid);
      en.kept = true;
    }
  }
  renderPlay();
  applyZones(); // 정착한 주사위를 낮은 눈금 순으로 결과 라인에 정렬
  tutEvent('rolled');
}

function toggleKeep(uidv) {
  if (rolling || !run.rolled) return;
  if (!tutAllows('keep')) return;
  const entry = run.rolled.find(r => r.uid === uidv);
  const die = run.dice.find(d => d.uid === uidv);
  if (!entry) return;
  if (die.rerollSealed) { sfx.deny(); toast('이 주사위는 고정되어 해제할 수 없습니다', 'warn'); return; }
  sfx.click();
  entry.kept = !entry.kept;
  renderPlay();
  applyZones(); // 주사위 오브젝트를 배치 칸 ↔ 결과 라인으로 이동
  if (entry.kept) tutEvent('kept');
}

function registerScore(catId) {
  if (!run.rolled || rolling) return;
  if (!tutAllows('register')) return;
  const row = run.sheet.find(r => r.catId === catId && r.score == null);
  if (!row) return;
  const diceObjs = run.rolled.map(r => ({ die: run.dice.find(d => d.uid === r.uid), value: r.value }));
  const result = scoreCategory(catId, diceObjs, run);
  row.score = result.final;
  if (result.final === 0) sfx.zero(); else sfx.score();
  // 통계
  run.stats.bestSingleScore = Math.max(run.stats.bestSingleScore, result.final);
  if (CAT[catId].comboType === 'yacht' && result.final > 0) run.stats.yachtMade = true;
  // 골드 트리거 (수금원/금니)
  if (result.gold > 0) {
    run.gold += result.gold;
    run.goldFromPlay = (run.goldFromPlay || 0) + result.gold;
    sfx.coin();
    toast(`+${result.gold}$`, 'good');
  }
  // 0점 등록 → 재굴림 보상 (재활용)
  if (result.final === 0) {
    for (const w of run.wilds) {
      if (!w.disabled && w.def.effects.rerollOnZero) {
        run.rerollsLeft += w.def.effects.rerollOnZero;
        toast(`${w.def.name}: 재굴림 +${w.def.effects.rerollOnZero}`, 'good');
      }
    }
  }
  run.regsLeft--;
  run.rolled = null;
  run.freeRoll = true;
  saveRun(run); // 세이브 시점: 점수 기입 시
  tutEvent('registered');

  const total = runTotal(run);
  if (total >= run.target) { stageClear(); return; }
  if (run.regsLeft <= 0) {
    // 패배 방지 (낡은 부적)
    const charm = run.wilds.find(w => !w.disabled && w.def.effects.saveFromDefeat);
    if (charm) {
      charm.disabled = true;
      run.regsLeft = 1;
      toast(`${charm.def.name}이(가) 패배를 막았다! 등록 +1`, 'good');
      sfx.unlock();
      saveRun(run);
    } else { gameOver(); return; }
  }
  scene.idleLineup(true);
  renderPlay();
}

// ============================================================
// 보상 (G. 보상 팝업)
// ============================================================
function stageClear() {
  sfx.win();
  run.stats.maxStageCleared = Math.max(run.stats.maxStageCleared, run.stage);
  if (!run.stats.usedRerollThisStage) run.stats.noRerollClear = true;
  run.lastClear = {
    target: run.target, total: runTotal(run),
    goldInfo: settleClearGold(run),
    localRule: run.localRule,
  };
  genRewardChoices(run);
  run.phase = 'reward';
  saveRun(run);
  route();
}

function renderReward() {
  const c = h('div', 'reward');
  const info = run.lastClear;
  const goldRows = info.goldInfo.rows.map(r =>
    `<div class="tally-line"><span>${r.name}</span><b>${r.value != null ? r.value + '$' : ''}</b></div>`).join('');
  c.innerHTML = `
    <div class="reward-cols">
      <div class="tally panel">
        <h3>Tally Stick</h3>
        <div class="tally-line"><span>로컬 룰</span><b>${info.localRule.name}</b></div>
        <div class="tally-line"><span>목표 점수</span><b>${info.target}</b></div>
        <div class="tally-line"><span>클리어 점수</span><b class="good">${info.total}</b></div>
        <hr>${goldRows}
        <div class="tally-line total"><span>최종 획득 골드</span><b class="gold">+${info.goldInfo.total}$</b></div>
      </div>
      <div class="loot panel">
        <h3>전리품 — 리드미노 1개 선택</h3>
        <div class="loot-list" id="loot-list"></div>
      </div>
    </div>`;
  const m = showModal(c, { closable: false, cls: 'wide' });
  tutEvent('reward');
  const list = c.querySelector('#loot-list');
  run.rewardChoices.forEach((inst, i) => {
    const card = h('div', 'loot-card');
    card.appendChild(minoShapeEl(inst, 12));
    card.appendChild(h('div', 'loot-name', `${inst.name}`));
    card.appendChild(h('div', 'loot-desc', inst.text));
    card.onclick = () => {
      sfx.buy();
      run.minoBag.push(inst);
      run.rewardChoices = null;
      genShopItems(run, meta);
      run.phase = 'shop';
      saveRun(run);
      m.close();
      route();
    };
    list.appendChild(card);
  });
}

// ============================================================
// 상점 (H)
// ============================================================
function renderShop() {
  showGamePanel('#panel-shop');
  renderTopbar();
  renderScoreboard(false);
  renderItembox();
  const wrap = $('#shop-items');
  wrap.innerHTML = '';
  for (const item of run.shopItems) {
    const card = h('div', 'shop-card panel' + (item.sold ? ' sold' : ''));
    const price = shopPrice(run, item.price);
    if (item.kind === 'mino') {
      card.appendChild(h('div', 'shop-kind', '리드미노'));
      card.appendChild(minoShapeEl(item.inst, 10));
      card.appendChild(h('div', 'shop-name', item.inst.name));
      card.appendChild(h('div', 'shop-desc', item.inst.text));
    } else if (item.kind === 'wildface') {
      card.appendChild(h('div', 'shop-kind', '와일드 페이스'));
      card.appendChild(h('div', 'shop-icon', icon(item.def.icon)));
      card.appendChild(h('div', 'shop-name', item.def.name));
      card.appendChild(h('div', 'shop-desc', item.def.desc.replace(/\n/g, '<br>')));
    } else {
      card.appendChild(h('div', 'shop-kind', '주사위'));
      const dc = h('div', 'shop-die');
      dc.style.setProperty('--die-color', item.def.color);
      dc.textContent = `[${item.def.faces.join(',')}]`;
      card.appendChild(dc);
      card.appendChild(h('div', 'shop-name', item.def.name));
      card.appendChild(h('div', 'shop-desc', item.def.desc));
    }
    const priceBtn = h('button', 'btn price', item.sold ? '판매 완료' : `${price}$`);
    priceBtn.disabled = item.sold;
    priceBtn.onclick = () => buyItem(item, price, priceBtn);
    card.appendChild(priceBtn);
    wrap.appendChild(card);
  }
  renderShopDice();
  tutEvent('shop');
}

function buyItem(item, price, btn) {
  if (item.sold) return;
  if (run.gold < price) { // 구매 불가 연출 (진동 + 빨강)
    sfx.deny();
    btn.classList.add('deny');
    setTimeout(() => btn.classList.remove('deny'), 500);
    return;
  }
  if (item.kind === 'mino') {
    run.gold -= price; item.sold = true;
    run.minoBag.push(item.inst);
    sfx.buy(); toast(`${item.inst.name} 구매! 가방에 추가됨`);
    saveRun(run); renderShop();
  } else if (item.kind === 'wildface') {
    if (run.wilds.length < wildSlotMax(run)) {
      run.gold -= price; item.sold = true;
      run.wilds.push({ def: item.def, disabled: false });
      sfx.buy(); toast(`${item.def.name} 장착!`);
      saveRun(run); renderShop();
    } else {
      showWildReplace(item, price);
    }
  } else if (item.kind === 'dice') {
    showDiceReplace(item, price);
  }
}

// 와일드페이스 교체 팝업 (H-5)
function showWildReplace(item, price) {
  const c = h('div');
  c.innerHTML = `<h3>교체할 와일드페이스를 선택해주세요</h3>`;
  const list = h('div', 'replace-list');
  run.wilds.forEach((w, i) => {
    const el = h('div', 'replace-item panel');
    el.innerHTML = `${icon(w.def.icon)}<b>${w.def.name}</b><p>${w.def.desc.replace(/\n/g, '<br>')}</p>`;
    el.onclick = () => {
      run.wilds.splice(i, 1);
      run.wilds.push({ def: item.def, disabled: false });
      run.gold -= price; item.sold = true;
      sfx.buy(); toast(`${w.def.name} → ${item.def.name} 교체 완료`);
      m.close(); saveRun(run); renderShop();
    };
    list.appendChild(el);
  });
  c.appendChild(list);
  const m = showModal(c);
}

// 주사위 교체 팝업 (H-5)
function showDiceReplace(item, price) {
  const c = h('div');
  c.innerHTML = `<h3>교체할 주사위를 선택해주세요</h3>
    <p class="dim">선택한 주사위는 제거되고, 배치된 리드미노는 가방으로 돌아갑니다.</p>`;
  const list = h('div', 'replace-list');
  run.dice.forEach((die, i) => {
    const el = h('div', 'replace-item panel');
    el.innerHTML = `<b style="color:${die.color}">■</b> <b>${die.name}</b> [${die.faces.join(',')}]
      <p>${die.minos.length ? die.minos.map(p => p.inst.text).join('<br>') : '리드미노 없음'}</p>`;
    el.onclick = () => {
      for (const p of [...die.minos]) run.minoBag.push(removeMino(die, p.inst.uid));
      run.dice.splice(i, 1, makeDie(item.def.id));
      run.gold -= price; item.sold = true;
      sfx.buy(); toast(`${die.name} → ${item.def.name} 교체 완료`);
      m.close(); saveRun(run); renderShop();
    };
    list.appendChild(el);
  });
  c.appendChild(list);
  const m = showModal(c);
}

// 상점: 주사위 그리드 + 리드미노 배치/강화
function renderShopDice() {
  const wrap = $('#shop-dice');
  wrap.innerHTML = '';
  for (const die of run.dice) {
    const card = h('div', 'die-card panel');
    const head = h('div', 'die-head', `<b style="color:${die.color}">■</b> ${die.name} <span class="dim">[${die.faces.join(',')}]</span>`);
    card.appendChild(head);
    card.appendChild(dieGridEl(die, true));
    wrap.appendChild(card);
  }
  const hint = placingMino
    ? `<div class="placing-banner">배치 중: <b>${placingMino.text}</b> — 놓을 칸을 클릭 (ESC 취소)</div>` : '';
  wrap.insertAdjacentHTML('beforeend', hint);
}

function dieGridEl(die, interactive) {
  const grid = h('div', 'die-grid');
  const R = die.grid.length, C = die.grid[0].length;
  const cellSize = C > 3 ? 22 : 26;
  grid.style.gridTemplateColumns = `repeat(${C}, ${cellSize}px)`;
  grid.style.gridTemplateRows = `repeat(${R}, ${cellSize}px)`;
  const cellOwner = {};
  for (const p of die.minos) for (const [r, c] of p.cells) cellOwner[`${r},${c}`] = p;
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    const cell = h('div', 'grid-cell');
    if (die.grid[r][c] !== 1) cell.classList.add('blocked');
    const owner = cellOwner[`${r},${c}`];
    if (owner) {
      cell.style.background = owner.inst.color;
      cell.classList.add('occupied');
      cell.dataset.tip = `<b>${owner.inst.name}</b> (Lv${owner.inst.level})<br>${owner.inst.text}<br><span class="dim">클릭: 강화/회수</span>`;
      if (interactive) cell.onclick = () => showMinoManage(die, owner.inst);
    } else if (die.grid[r][c] === 1 && interactive) {
      cell.onclick = () => {
        if (!placingMino) return;
        if (tryPlaceMino(die, placingMino, r, c)) {
          run.minoBag = run.minoBag.filter(m => m.uid !== placingMino.uid);
          sfx.buy(); toast(`리드미노 배치 완료: ${die.name}`);
          placingMino = null;
          saveRun(run); renderShop(); renderItembox();
        } else { sfx.deny(); toast('이 위치에는 배치할 수 없습니다', 'warn'); }
      };
    }
    grid.appendChild(cell);
  }
  return grid;
}

function startPlacing(inst) {
  placingMino = inst;
  toast(`배치할 주사위 칸을 클릭하세요 (자동 회전)`, 'good');
  renderShopDice();
  const esc = (e) => {
    if (e.key === 'Escape') { placingMino = null; renderShopDice(); window.removeEventListener('keydown', esc); }
  };
  window.addEventListener('keydown', esc);
}

// 배치된 미노 관리 (강화/회수)
function showMinoManage(die, inst) {
  const c = h('div');
  const cost = MINO_UPGRADE_COST(inst.level);
  const canUp = inst.level < inst.maxLevel;
  c.innerHTML = `<h3>${inst.name} (Lv${inst.level})</h3><p>${inst.text}</p>
    ${canUp ? `<p class="dim">강화 시: ${previewUpgradeText(inst)} <b class="gold">(${cost}$)</b></p>` : '<p class="dim">최대 강화</p>'}`;
  const row = h('div', 'row center-row');
  const up = h('button', 'btn primary', canUp ? `강화하기 (${cost}$)` : '최대 강화');
  up.disabled = !canUp || run.gold < cost;
  if (canUp && run.gold < cost) up.classList.add('deny-static');
  up.onclick = () => {
    if (!canUp || run.gold < cost) { sfx.deny(); return; }
    run.gold -= cost; inst.level++; refreshMino(inst);
    sfx.unlock(); toast(`강화 완료! ${inst.text}`, 'good');
    m.close(); saveRun(run); renderShop(); renderTopbar();
  };
  const take = h('button', 'btn', '회수 (가방으로)');
  take.onclick = () => {
    removeMino(die, inst.uid);
    run.minoBag.push(inst);
    sfx.click(); m.close(); saveRun(run); renderShop(); renderItembox();
  };
  const cancel = h('button', 'btn', '취소');
  cancel.onclick = () => m.close();
  row.append(up, take, cancel);
  c.appendChild(row);
  const m = showModal(c);
}
function previewUpgradeText(inst) {
  const copy = { ...inst, level: inst.level + 1 };
  refreshMino(copy);
  const t = copy.text;
  refreshMino(inst); // 원복
  return t;
}

// 가방 상세 (플레이 중에도 열람 가능)
function showMinoBag() {
  sfx.click();
  const c = h('div');
  c.innerHTML = `<h3>리드미노 보관함 (${run.minoBag.length})</h3>
    <p class="dim">상점에서 가방의 리드미노를 클릭하면 주사위에 배치할 수 있습니다.</p>`;
  const list = h('div', 'replace-list');
  if (!run.minoBag.length) list.innerHTML = '<p class="dim">보관함이 비어 있습니다.</p>';
  for (const inst of run.minoBag) {
    const el = h('div', 'replace-item panel');
    el.appendChild(minoShapeEl(inst, 10));
    el.insertAdjacentHTML('beforeend', `<b>${inst.name}</b> (Lv${inst.level})<p>${inst.text}</p>`);
    if (run.phase === 'shop') {
      el.onclick = () => { m.close(); startPlacing(inst); };
    }
    list.appendChild(el);
  }
  c.appendChild(list);
  const m = showModal(c);
}

function showMinoDetail(inst) {
  const c = h('div');
  c.appendChild(minoShapeEl(inst, 12));
  c.insertAdjacentHTML('beforeend', `<h3>${inst.name} (Lv${inst.level})</h3><p>${inst.text}</p>
    <p class="dim">상점에서 주사위에 배치할 수 있습니다.</p>`);
  showModal(c);
}

function showDieDetail(die) {
  const c = h('div');
  c.innerHTML = `<h3 style="color:${die.color}">${die.name}</h3>
    <p>눈금: <b>[${die.faces.join(', ')}]</b></p>
    ${die.sealed ? '<p class="warn">이번 판 봉인됨</p>' : ''}
    ${die.rerollSealed ? '<p class="warn">첫 굴림 후 고정 (재굴림 불가)</p>' : ''}
    <p class="dim">리드미노 배치 칸:</p>`;
  c.appendChild(dieGridEl(die, false));
  if (die.minos.length) {
    c.insertAdjacentHTML('beforeend',
      `<p>${die.minos.map(p => `· ${p.inst.text} (Lv${p.inst.level})`).join('<br>')}</p>`);
  }
  showModal(c);
}

// ============================================================
// 스테이지 전환 / 종료
// ============================================================
function nextStage() {
  sfx.click();
  tutEvent('next-stage'); // 튜토리얼 마지막 스텝 → 완료 처리
  placingMino = null;
  run.stage++;
  if (run.stage > MAX_STAGE) { winRun(); return; }
  run.phase = 'local-select';
  run.localId = null; run.localRule = null;
  genLocalChoices(run);
  saveRun(run);
  route();
}

function giveUp() {
  stopTutorial(false);
  deleteSave();
  const newly = evaluateUnlocks(meta, run.stats);
  run = null;
  showUnlocksThen(newly, () => showMain());
}

function gameOver() {
  stopTutorial(false);
  sfx.lose();
  deleteSave();
  const total = runTotal(run);
  const newly = evaluateUnlocks(meta, run.stats);
  const c = h('div', 'gameout');
  c.innerHTML = `<h2 class="go-title">GAME OUT</h2>
    <div class="tally panel">
      <div class="tally-line"><span>월드 룰</span><b>${run.worldRule.name}</b></div>
      <div class="tally-line"><span>로컬 룰</span><b>${run.localRule?.name ?? '-'}</b></div>
      <div class="tally-line"><span>목표 점수</span><b>${run.target}</b></div>
      <div class="tally-line"><span>최종 점수</span><b class="warn">${total}</b></div>
      <div class="tally-line"><span>도달 스테이지</span><b>${run.stage} Stage</b></div>
    </div>`;
  const row = h('div', 'row center-row');
  const retry = h('button', 'btn big primary', '다시하기');
  const home = h('button', 'btn big', '처음으로');
  row.append(retry, home);
  c.appendChild(row);
  const m = showModal(c, { closable: false });
  const worldId = run.worldId;
  retry.onclick = () => {
    m.close();
    showUnlocksThen(newly, () => {
      run = newRun(worldId);
      saveRun(run);
      enterGame();
    });
  };
  home.onclick = () => {
    m.close();
    showUnlocksThen(newly, () => { run = null; showMain(); });
  };
}

function winRun() {
  stopTutorial(true); // 1스테이지를 지나 승리까지 갔다면 튜토리얼은 본 것으로 처리
  run.stats.wonRun = true;
  sfx.win();
  deleteSave();
  const newly = evaluateUnlocks(meta, run.stats);
  const c = h('div', 'gameout win');
  c.innerHTML = `<h2 class="go-title gold">YOU LOADED THE DICE!</h2>
    <p>${MAX_STAGE}스테이지를 모두 클리어했습니다!</p>
    <div class="tally panel">
      <div class="tally-line"><span>월드 룰</span><b>${run.worldRule.name}</b></div>
      <div class="tally-line"><span>남은 골드</span><b class="gold">${run.gold}$</b></div>
      <div class="tally-line"><span>최고 단일 등록 점수</span><b>${run.stats.bestSingleScore}</b></div>
    </div>`;
  const row = h('div', 'row center-row');
  const home = h('button', 'btn big primary', '처음으로');
  row.append(home);
  c.appendChild(row);
  const m = showModal(c, { closable: false });
  home.onclick = () => {
    m.close();
    showUnlocksThen(newly, () => { run = null; showMain(); });
  };
}

// 해금 연출 (J): 순차적으로 표시
function showUnlocksThen(newly, done) {
  if (!newly || !newly.length) { done(); return; }
  const [first, ...rest] = newly;
  sfx.unlock();
  const c = h('div', 'unlock-view');
  c.innerHTML = `<h2 class="unlock-title">${first.kind} 해금!</h2>
    <div class="unlock-icon">${icon(first.icon)}</div>
    <h3>${first.name}</h3>
    <p>${first.desc.replace(/\n/g, '<br>')}</p>
    <p class="dim">(클릭해서 계속)</p>`;
  const m = showModal(c, { closable: false });
  m.box.style.cursor = 'pointer';
  m.box.onclick = () => { m.close(); showUnlocksThen(rest, done); };
}

// ============================================================
// 도감 (컬렉션, 간이)
// ============================================================
function showCollection() {
  const c = h('div', 'collection');
  c.innerHTML = '<h3>도감</h3>';
  const sec = (title, rows) => {
    c.insertAdjacentHTML('beforeend', `<h4>${title}</h4>`);
    const list = h('div', 'col-grid');
    for (const r of rows) list.appendChild(r);
    c.appendChild(list);
  };
  sec('월드 룰', WORLD_RULES.map(w => {
    const un = isWorldUnlocked(meta, w.id);
    const el = h('div', 'col-item panel' + (un ? '' : ' locked'));
    el.innerHTML = un ? `${icon(w.icon)}<b>${w.name}</b>` : `${icon('chain')}<b>???</b>`;
    el.dataset.tip = un ? `<b>${w.name}</b><br>${w.desc.replace(/\n/g, '<br>')}`
      : `해금 조건: ${w.unlock?.text ?? '?'}`;
    return el;
  }));
  sec('주사위', Object.values(DICE_DEFS).map(d => {
    const un = !d.locked || meta.unlocked.dice.includes(d.id);
    const el = h('div', 'col-item panel' + (un ? '' : ' locked'));
    el.innerHTML = un ? `<b style="color:${d.color}">■</b><b>${d.name}</b>` : `${icon('chain')}<b>???</b>`;
    el.dataset.tip = un ? `<b>${d.name}</b><br>[${d.faces.join(',')}]<br>${d.desc}` : '스테이지를 깊이 진행하면 해금';
    return el;
  }));
  sec('와일드 페이스', WILDFACES.map(w => {
    const un = !w.locked || meta.unlocked.wilds.includes(w.id);
    const el = h('div', 'col-item panel' + (un ? '' : ' locked'));
    el.innerHTML = un ? `${icon(w.icon)}<b>${w.name}</b>` : `${icon('chain')}<b>???</b>`;
    el.dataset.tip = un ? `<b>${w.name}</b><br>${w.desc.replace(/\n/g, '<br>')}`
      : `해금 조건: ${w.unlock?.text ?? '?'}`;
    return el;
  }));
  showModal(c, { cls: 'wide' });
}

// ---------- 툴팁 ----------
function setupTooltip() {
  const tip = h('div', 'tooltip');
  tip.hidden = true;
  document.body.appendChild(tip);
  document.addEventListener('mouseover', (e) => {
    const t = e.target.closest('[data-tip]');
    if (t) { tip.innerHTML = t.dataset.tip; tip.hidden = false; }
    else tip.hidden = true;
  });
  document.addEventListener('mousemove', (e) => {
    if (tip.hidden) return;
    const x = Math.min(e.clientX + 14, window.innerWidth - tip.offsetWidth - 8);
    const y = Math.min(e.clientY + 16, window.innerHeight - tip.offsetHeight - 8);
    tip.style.left = `${x}px`; tip.style.top = `${y}px`;
  });
}
