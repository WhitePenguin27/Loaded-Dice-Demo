// ============================================================
// 인터랙티브 튜토리얼 — "주인장의 안내"
// 하이라이트 + 말풍선 코치마크. 실제 플레이 행동(굴리기/배치/등록)을
// 따라가며 진행되고, 완료 여부는 localStorage에 저장된다.
//
// ui.js와의 연결점:
//  - tutAllows(action): 튜토리얼 중 허용된 행동인지 (roll/keep/register/local-select)
//  - tutEvent(name):    플레이 진행 이벤트 통지 → 대기 중인 스텝을 전진
//  - startTutorial():   월드 선택 화면 진입 시 (미완료라면) 시작
//  - stopTutorial():    게임 아웃/포기/메인 복귀 시 중단
// ============================================================

const DONE_KEY = 'loadedDice.tutorial.v1';

// ---------- 스텝 정의 ----------
// target: 하이라이트할 셀렉터 (null = 화면 중앙 말풍선)
// block:  'all' = 전체 클릭 차단(읽기 스텝) / 'hole' = 대상만 클릭 가능 / 'none' = 차단 없음
// advance:'next' = [다음] 버튼  /  waitEvent: 해당 이벤트가 올 때까지 대기(직접 해보기)
// allow:  대기 스텝 동안 허용되는 행동 ('*' = 전부)
// dim:    false면 어둡게 깔지 않고 테두리 링만 표시
const STEPS = [
  { // 0. 월드 룰
    target: '.world-carousel', pos: 'top', block: 'none', allow: '*', waitEvent: 'world-start',
    title: '월드 룰',
    text: '어서 오게! 먼저 게임 전체에 적용되는 <b>월드 룰</b>을 고르지.<br>◀ ▶ 로 둘러보고 <b>시작하기</b>를 누르게. 처음이라면 <b>스탠다드</b>를 추천하네.',
  },
  { // 1. 로컬 룰
    target: '#local-cards', pos: 'top', block: 'hole', allow: ['local-select'], waitEvent: 'local-select',
    title: '로컬 룰',
    text: '매 스테이지는 <b>로컬 룰</b> 선택으로 시작해. 셋 다 패널티지만, 클리어하면 카드에 적힌 <b>보상 골드</b>를 받지.<br>감당할 수 있는 걸 하나 골라보게.',
  },
  { // 2. 목표 점수
    target: '#sb-target', block: 'all', advance: 'next',
    title: '목표 점수',
    text: '이번 스테이지의 <b>목표 점수</b>야. 족보에 점수를 등록해서 합계가 목표를 넘기면 클리어!',
  },
  { // 3. 등록/재굴림 카운터
    target: '#sb-counters', block: 'all', advance: 'next',
    title: '등록 · 재굴림',
    text: '<b>등록</b> 횟수를 다 쓰기 전에 목표를 넘어야 해. 다 쓰면 <b>게임 아웃</b>이지.<br><b>재굴림</b>은 스테이지마다 다시 채워지지 않고 게임 내내 공유하니 아껴 쓰게.',
  },
  { // 4. 굴리기
    target: '#btn-roll', block: 'hole', allow: ['roll'], waitEvent: 'rolled',
    title: '굴리기',
    text: '자, <b>굴리기</b> 버튼(또는 <b>Space</b>)으로 주사위를 던져보게!',
  },
  { // 5. 주사위 배치(킵)
    target: '#dice-3d', pos: 'top', block: 'hole', allow: ['keep'], waitEvent: 'kept', skippable: true,
    title: '주사위 배치',
    text: '결과는 낮은 눈 순서로 정렬돼. 마음에 드는 <b>주사위를 클릭</b>하면 뒤쪽 <b>배치 칸</b>에 올려두고, 재굴림 때 그 주사위는 굴리지 않아.<br>한번 눌러보게. (다시 클릭하면 해제)',
  },
  { // 6. 점수 등록
    target: '#sb-table', dim: false, block: 'none', allow: ['roll', 'keep', 'register'], waitEvent: 'registered',
    title: '점수 등록',
    text: '점수판의 <b class="good-green">초록 숫자</b>는 지금 등록하면 받을 점수 미리보기야.<br>재굴림으로 족보를 노리다가, 원하는 족보를 <b>클릭해서 등록</b>해보게. 등록한 족보는 이번 판에선 다시 못 쓰네!',
  },
  { // 7. 한 판의 흐름
    target: null, block: 'all', advance: 'next',
    title: '한 판의 흐름',
    text: '등록하면 주사위를 처음부터 다시 굴리지. 이걸 반복해서 <b>합계가 목표를 넘기면 즉시 클리어</b>야.<br>이제 자유롭게 플레이해서 이번 스테이지를 클리어해보게!',
  },
  { // 8. 자유 플레이 (숨김 대기)
    hidden: true, allow: '*', waitEvent: 'reward',
  },
  { // 9. 보상
    target: null, pos: 'top', block: 'none', allow: '*', waitEvent: 'shop',
    title: '스테이지 클리어!',
    text: '정산된 골드를 받고, 전리품으로 <b>리드미노</b> 하나를 골라 가방에 넣게.',
  },
  { // 10. 상점
    target: '#shop-items', block: 'all', advance: 'next',
    title: '상점',
    text: '여긴 <b>상점</b>. 골드로 <b>주사위 · 와일드 페이스 · 리드미노</b>를 살 수 있어.<br>와일드 페이스는 화면 상단 슬롯에 장착되는 패시브 효과지.',
  },
  { // 11. 리드미노 배치
    target: '#shop-dice', block: 'all', advance: 'next',
    title: '리드미노 — 사기 주사위 만들기',
    text: '하단 가방의 <b>리드미노를 클릭</b>한 뒤, 주사위의 빈 칸을 클릭하면 배치돼.<br><b>무게추</b> 리드미노는 주사위의 무게중심을 실제로 기울여 특정 눈이 더 잘 나오게 하지 — 그게 바로 <b>LOADED DICE</b>!<br>배치된 리드미노를 클릭하면 강화·회수할 수 있네.',
  },
  { // 12. 다음 스테이지
    target: '#btn-nextstage', dim: false, block: 'none', allow: '*', waitEvent: 'next-stage',
    title: '다음 스테이지로',
    text: '쇼핑이 끝나면 <b>Next Stage</b>! 스테이지가 오를수록 목표 점수도 가파르게 오르지.<br><b>10 스테이지</b>를 모두 깨면 승리야. 행운을 비네!',
  },
];

// ---------- 상태 ----------
let active = false;
let idx = -1;
let layer = null;

export function isTutorialDone() {
  try { return localStorage.getItem(DONE_KEY) === '1'; } catch { return false; }
}
export function resetTutorial() {
  try { localStorage.removeItem(DONE_KEY); } catch { /* ignore */ }
}
export function isTutorialActive() { return active; }
export function tutIndex() { return active ? idx : -1; }

export function startTutorial() {
  if (isTutorialDone()) return;
  active = true;
  window.addEventListener('resize', reposition);
  goto(0);
}

export function stopTutorial(markDone = false) {
  if (!active) return;
  active = false;
  idx = -1;
  window.removeEventListener('resize', reposition);
  if (markDone) { try { localStorage.setItem(DONE_KEY, '1'); } catch { /* ignore */ } }
  if (layer) { layer.remove(); layer = null; }
}

// 튜토리얼 중엔 현재 스텝이 허용한 행동만 가능
export function tutAllows(action) {
  if (!active) return true;
  const s = STEPS[idx];
  if (!s || !s.allow) return false;
  return s.allow === '*' || s.allow.includes(action);
}

// 플레이 진행 이벤트: 현재(또는 그 뒤) 스텝이 기다리는 이벤트면 전진
export function tutEvent(name) {
  if (!active) return;
  for (let i = idx; i < STEPS.length; i++) {
    if (STEPS[i].waitEvent === name) { goto(i + 1); return; }
  }
}

// ---------- 진행/렌더 ----------
function goto(i) {
  idx = i;
  if (idx >= STEPS.length) { finish(); return; }
  render();
}

function finish() {
  stopTutorial(true);
}

function ensureLayer() {
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'tut-layer';
    document.body.appendChild(layer);
  }
  layer.innerHTML = '';
  return layer;
}

function targetRect(step) {
  if (!step.target) return null;
  const el = document.querySelector(step.target);
  if (!el || el.offsetParent === null) return null; // 숨겨진 대상 → 중앙 말풍선
  const r = el.getBoundingClientRect();
  const pad = 6;
  return {
    left: r.left - pad, top: r.top - pad,
    width: r.width + pad * 2, height: r.height + pad * 2,
    right: r.right + pad, bottom: r.bottom + pad,
  };
}

function render() {
  const step = STEPS[idx];
  const root = ensureLayer();
  if (step.hidden) return; // 자유 플레이 구간: 아무것도 표시하지 않음

  const rect = targetRect(step);

  // 1) 하이라이트
  if (rect) {
    const hl = document.createElement('div');
    hl.className = 'tut-hl' + (step.dim === false ? ' ring' : '');
    hl.style.cssText = `left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px`;
    root.appendChild(hl);
  } else if (step.block === 'all') {
    const dimEl = document.createElement('div');
    dimEl.className = 'tut-fulldim';
    root.appendChild(dimEl);
  }

  // 2) 클릭 차단막
  const block = step.block ?? (step.waitEvent ? 'hole' : 'all');
  if (block === 'all') {
    addBlock(root, 0, 0, window.innerWidth, window.innerHeight);
  } else if (block === 'hole' && rect) {
    const vw = window.innerWidth, vh = window.innerHeight;
    addBlock(root, 0, 0, vw, Math.max(0, rect.top));                                  // 위
    addBlock(root, 0, rect.bottom, vw, Math.max(0, vh - rect.bottom));                // 아래
    addBlock(root, 0, rect.top, Math.max(0, rect.left), rect.height);                 // 왼쪽
    addBlock(root, rect.right, rect.top, Math.max(0, vw - rect.right), rect.height);  // 오른쪽
  }

  // 3) 말풍선
  const bubble = document.createElement('div');
  bubble.className = 'tut-bubble';
  const shown = STEPS.filter(s => !s.hidden);
  const shownIdx = shown.indexOf(step) + 1;
  bubble.innerHTML = `
    <div class="tut-head">
      <img class="icon" src="assets/icon_die.png" alt="" onerror="this.style.display='none'">
      <span class="tut-title">${step.title}</span>
      <span class="tut-count">${shownIdx}/${shown.length}</span>
      <button class="tut-skip" type="button">튜토리얼 건너뛰기</button>
    </div>
    <div class="tut-text">${step.text}</div>`;
  const actions = document.createElement('div');
  actions.className = 'tut-actions';
  if (step.advance === 'next') {
    const next = document.createElement('button');
    next.className = 'btn primary';
    next.textContent = idx === STEPS.length - 1 ? '완료' : '다음';
    next.onclick = () => goto(idx + 1);
    actions.appendChild(next);
  } else if (step.waitEvent) {
    const wait = document.createElement('div');
    wait.className = 'tut-wait';
    wait.textContent = '▶ 직접 해보세요';
    actions.appendChild(wait);
    if (step.skippable) {
      const skip = document.createElement('button');
      skip.className = 'btn small';
      skip.textContent = '넘어가기';
      skip.onclick = () => goto(idx + 1);
      actions.appendChild(skip);
    }
  }
  bubble.appendChild(actions);
  bubble.querySelector('.tut-skip').onclick = () => stopTutorial(true);
  root.appendChild(bubble);
  positionBubble(bubble, rect, step.pos);
}

function addBlock(root, x, y, w, h) {
  if (w <= 0 || h <= 0) return;
  const b = document.createElement('div');
  b.className = 'tut-block';
  b.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px`;
  root.appendChild(b);
}

function positionBubble(bubble, rect, pos) {
  const vw = window.innerWidth, vh = window.innerHeight;
  const bw = bubble.offsetWidth, bh = bubble.offsetHeight;
  const M = 14;
  let x, y;
  if (pos === 'top') { // 큰 영역을 가리킬 때: 화면 상단 고정
    x = rect ? rect.left + rect.width / 2 - bw / 2 : (vw - bw) / 2;
    x = Math.max(8, Math.min(vw - bw - 8, x));
    y = 14;
  } else if (!rect) {
    x = (vw - bw) / 2;
    y = Math.max(14, (vh - bh) * 0.42);
  } else {
    x = rect.left + rect.width / 2 - bw / 2;
    if (rect.bottom + M + bh < vh) y = rect.bottom + M;                 // 아래
    else if (rect.top - M - bh > 0) y = rect.top - M - bh;              // 위
    else {                                                              // 옆
      y = Math.max(8, Math.min(vh - bh - 8, rect.top + rect.height / 2 - bh / 2));
      if (rect.right + M + bw < vw) x = rect.right + M;
      else if (rect.left - M - bw > 0) x = rect.left - M - bw;
    }
    x = Math.max(8, Math.min(vw - bw - 8, x));
  }
  bubble.style.left = `${x}px`;
  bubble.style.top = `${y}px`;
}

function reposition() {
  if (active) render();
}
