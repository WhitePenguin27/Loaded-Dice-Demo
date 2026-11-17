// ============================================================
// LOADED DICE - 데이터베이스
// 기획서의 족보/주사위/월드룰/로컬룰/와일드페이스/리드미노/스테이지 테이블
// ============================================================

// ---------- 유틸 ----------
const counts = (vals) => {
  const m = new Map();
  for (const v of vals) m.set(v, (m.get(v) || 0) + 1);
  return m;
};
const hasRun = (vals, run) => {
  const s = new Set(vals);
  for (const start of run) if (!s.has(start)) return false;
  return true;
};
const anyRunOfLen = (vals, len, min, max) => {
  const s = new Set(vals);
  for (let a = min; a + len - 1 <= max; a++) {
    let ok = true;
    for (let v = a; v < a + len; v++) if (!s.has(v)) { ok = false; break; }
    if (ok) return a;
  }
  return null;
};

// ---------- 족보 (Categories) ----------
// calc(dice): dice = [{value, die}] → {score, used, isSum}
// used: 리드미노/와일드페이스 '포함' 판정에 쓰이는 주사위 목록
const num = (face, name) => ({
  id: `n${face}`, name, type: 'number', face,
  desc: `눈금이 ${face}인 주사위 눈의 합`,
  calc(dice) {
    const used = dice.filter(d => d.value === face);
    return { score: used.reduce((a, d) => a + d.value, 0), used, isSum: true };
  },
});

export const CATEGORIES = [
  num(1, 'Ace'), num(2, 'Two'), num(3, 'Three'),
  num(4, 'Four'), num(5, 'Five'), num(6, 'Six'),
  // 추가 족보(숫자)
  num(7, 'Seven'), num(8, 'Eight'), num(9, 'Nine'), num(10, 'Ten'),
  {
    id: 'choice', name: 'Choice', type: 'combo',
    desc: '모든 주사위 눈의 총합',
    calc(dice) { return { score: dice.reduce((a, d) => a + d.value, 0), used: dice, isSum: true }; },
  },
  {
    id: 'fourkind', name: 'Four of a Kind', type: 'combo',
    desc: '같은 눈금 4개 이상 → 모든 주사위 눈의 합',
    calc(dice) {
      const ok = [...counts(dice.map(d => d.value)).values()].some(c => c >= 4);
      return ok
        ? { score: dice.reduce((a, d) => a + d.value, 0), used: dice, isSum: true }
        : { score: 0, used: [], isSum: true };
    },
  },
  {
    id: 'fullhouse', name: 'Full House', type: 'combo',
    desc: '같은 눈금 3개 + 다른 같은 눈금 2개 → 총합',
    calc(dice) {
      const cs = [...counts(dice.map(d => d.value)).values()].sort((a, b) => b - a);
      const ok = cs[0] >= 5 || (cs.length >= 2 && cs[0] >= 3 && cs[1] >= 2);
      return ok
        ? { score: dice.reduce((a, d) => a + d.value, 0), used: dice, isSum: true }
        : { score: 0, used: [], isSum: true };
    },
  },
  {
    id: 'lstraight', name: 'Little Straight', type: 'combo', comboType: 'straight',
    desc: '1,2,3,4,5 조합 → 15점',
    calc(dice) {
      const ok = hasRun(dice.map(d => d.value), [1, 2, 3, 4, 5]);
      return { score: ok ? 15 : 0, used: ok ? dice : [], isSum: false };
    },
  },
  {
    id: 'bstraight', name: 'Big Straight', type: 'combo', comboType: 'straight',
    desc: '2,3,4,5,6 조합 → 30점',
    calc(dice) {
      const ok = hasRun(dice.map(d => d.value), [2, 3, 4, 5, 6]);
      return { score: ok ? 30 : 0, used: ok ? dice : [], isSum: false };
    },
  },
  {
    id: 'yacht', name: 'Yacht', type: 'combo', comboType: 'yacht',
    desc: '같은 눈금 5개 이상 → 50점',
    calc(dice) {
      const ok = [...counts(dice.map(d => d.value)).values()].some(c => c >= 5);
      return { score: ok ? 50 : 0, used: ok ? dice : [], isSum: false };
    },
  },
  // ----- 추가 족보(조합) : 룰/아이템으로 해금 -----
  {
    id: 'megastraight', name: 'Mega Straight', type: 'combo', comboType: 'straight', extra: true,
    desc: '7 이상이 포함된 5연속 조합 → 40점',
    calc(dice) {
      const a = anyRunOfLen(dice.map(d => d.value), 5, 3, 10); // 3-7 이상부터 7+ 포함
      const ok = a !== null && a + 4 >= 7;
      return { score: ok ? 40 : 0, used: ok ? dice : [], isSum: false };
    },
  },
  {
    id: 'mountain', name: 'Mountain', type: 'combo', comboType: 'straight', extra: true,
    desc: '6,7,8,9,10 조합 → 60점',
    calc(dice) {
      const ok = hasRun(dice.map(d => d.value), [6, 7, 8, 9, 10]);
      return { score: ok ? 60 : 0, used: ok ? dice : [], isSum: false };
    },
  },
  {
    id: 'odd', name: 'Odd', type: 'combo', extra: true,
    desc: '홀수 눈금 눈의 합',
    calc(dice) {
      const used = dice.filter(d => d.value % 2 === 1);
      return { score: used.reduce((a, d) => a + d.value, 0), used, isSum: true };
    },
  },
  {
    id: 'uniqueodd', name: 'Unique Odd', type: 'combo', extra: true,
    desc: '1,3,5,7,9 조합 → 50점',
    calc(dice) {
      const ok = hasRun(dice.map(d => d.value), [1, 3, 5, 7, 9]);
      return { score: ok ? 50 : 0, used: ok ? dice : [], isSum: false };
    },
  },
  {
    id: 'even', name: 'Even', type: 'combo', extra: true,
    desc: '짝수 눈금 눈의 합 (0 제외)',
    calc(dice) {
      const used = dice.filter(d => d.value > 0 && d.value % 2 === 0);
      return { score: used.reduce((a, d) => a + d.value, 0), used, isSum: true };
    },
  },
  {
    id: 'uniqueeven', name: 'Unique Even', type: 'combo', extra: true,
    desc: '2,4,6,8,10 조합 → 50점',
    calc(dice) {
      const ok = hasRun(dice.map(d => d.value), [2, 4, 6, 8, 10]);
      return { score: ok ? 50 : 0, used: ok ? dice : [], isSum: false };
    },
  },
  {
    id: 'fullstraight', name: 'Full Straight', type: 'combo', comboType: 'straight', extra: true,
    desc: '6개 연속 조합 → 100점 (주사위 6개 필요)',
    calc(dice) {
      const ok = anyRunOfLen(dice.map(d => d.value), 6, 1, 10) !== null;
      return { score: ok ? 100 : 0, used: ok ? dice : [], isSum: false };
    },
  },
  {
    id: 'threepair', name: 'Three Pair', type: 'combo', extra: true,
    desc: '서로 다른 3종류의 페어 → 75점 (주사위 6개 필요)',
    calc(dice) {
      const pairKinds = [...counts(dice.map(d => d.value)).values()].filter(c => c >= 2).length;
      const ok = pairKinds >= 3;
      return { score: ok ? 75 : 0, used: ok ? dice : [], isSum: false };
    },
  },
  {
    id: 'doubletriple', name: 'Double Triple', type: 'combo', extra: true,
    desc: '서로 다른 2종류의 트리플 → 75점 (주사위 6개 필요)',
    calc(dice) {
      const tripleKinds = [...counts(dice.map(d => d.value)).values()].filter(c => c >= 3).length;
      const ok = tripleKinds >= 2;
      return { score: ok ? 75 : 0, used: ok ? dice : [], isSum: false };
    },
  },
  {
    id: 'yachtyacht', name: 'Yacht Yacht', type: 'combo', comboType: 'yacht', extra: true,
    desc: '같은 눈금 6개 이상 → 200점 (주사위 6개 필요)',
    calc(dice) {
      const ok = [...counts(dice.map(d => d.value)).values()].some(c => c >= 6);
      return { score: ok ? 200 : 0, used: ok ? dice : [], isSum: false };
    },
  },
];
export const CAT = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));

// 기본 점수판 구성 (숫자 6 + 조합 6). Bonus는 숫자 족보 합계로 자동 계산.
export const BASE_SHEET = ['n1', 'n2', 'n3', 'n4', 'n5', 'n6',
  'choice', 'fourkind', 'fullhouse', 'lstraight', 'bstraight', 'yacht'];
export const BONUS = { threshold: 50, score: 30 }; // 숫자 족보 합계 50 이상 → +30

// ---------- 주사위 ----------
// grid: 리드미노 배치 칸 (4x4 마스크, 1=배치 가능). 기본 주사위 = 4x4 전부 사용.
export const DICE_DEFS = {
  d_std:   { id: 'd_std',   name: '기본 주사위',   faces: [1, 2, 3, 4, 5, 6],   color: '#e8dcc0', price: 5,
             grid: [[1,1,1,1],[1,1,1,1],[1,1,1,1],[1,1,1,1]], desc: '평범한 육면체 주사위.' },
  d_odd:   { id: 'd_odd',   name: '홀수 주사위',   faces: [1, 3, 3, 5, 5, 7],   color: '#b7cde2', price: 6,
             grid: [[1,1,0,0],[1,1,0,0],[1,1,0,0],[1,1,0,0]], desc: '홀수 눈만 새겨진 주사위.' },
  d_even:  { id: 'd_even',  name: '짝수 주사위',   faces: [2, 4, 4, 6, 6, 8],   color: '#e2c3b7', price: 6,
             grid: [[0,0,1,1],[0,0,1,1],[0,0,1,1],[0,0,1,1]], desc: '짝수 눈만 새겨진 주사위.' },
  d_heavy: { id: 'd_heavy', name: '묵직한 주사위', faces: [0, 0, 4, 4, 8, 8],   color: '#9a9aa8', price: 7,
             grid: [[1,1,1,1],[1,1,1,1],[1,1,1,1],[0,0,0,0]], desc: '0 아니면 큰 수. 도박꾼의 주사위.' },
  d_mini:  { id: 'd_mini',  name: '미니 주사위',   faces: [1, 1, 2, 2, 3, 3],   color: '#c9e2b7', price: 5,
             grid: [[0,1,1,1],[1,1,1,1],[1,1,1,1],[1,1,1,0]], desc: '눈은 작지만 배치 칸이 넓다.' },
  d_twin:  { id: 'd_twin',  name: '쌍둥이 주사위', faces: [3, 3, 3, 4, 4, 4],   color: '#d9b7e2', price: 7,
             grid: [[0,1,1,0],[1,1,1,1],[1,1,1,1],[0,1,1,0]], desc: '3 아니면 4. 짝 맞추기의 달인.' },
  d_wild:  { id: 'd_wild',  name: '과장된 주사위', faces: [1, 1, 1, 8, 9, 10],  color: '#e2b7b7', price: 9,
             grid: [[1,1,0,0],[1,1,0,0],[0,1,1,0],[0,0,0,0]], desc: '전부 아니면 전무.', locked: true },
  d_gold:  { id: 'd_gold',  name: '황금 주사위',   faces: [5, 6, 7, 8, 9, 10],  color: '#e8c84a', price: 10,
             grid: [[0,0,0,0],[0,1,1,0],[0,1,1,0],[0,0,0,0]], desc: '낮은 눈이 없는 사치품.', locked: true },
};

// ---------- 월드 룰 ----------
export const WORLD_RULES = [
  { id: 'w_standard', name: '평범한 시작', icon: 'die',
    desc: '아무런 특수 규칙이 없다.\n기본 주사위 5개로 시작한다.',
    effects: {} },
  { id: 'w_rich', name: '두둑한 주머니', icon: 'coin',
    desc: '골드 10$를 가지고 시작한다.',
    effects: { goldStart: 10 } },
  { id: 'w_bigger', name: '큰 판', icon: 'six',
    desc: '6개의 주사위를 사용한다.\n획득 스코어가 50% 감소한다.',
    effects: { diceCount: 6, scoreMult: 0.5 }, locked: true,
    unlock: { type: 'clear_stage', n: 3, text: '3스테이지 클리어' } },
  { id: 'w_fixed', name: '굳은 손', icon: 'lock',
    desc: '재굴림 횟수가 0으로 고정된다.\n와일드 페이스를 1개 더 소지할 수 있다.\n등록 횟수 +2.',
    effects: { rerollSet: 0, wildSlots: 1, regsDelta: 2 }, locked: true,
    unlock: { type: 'no_reroll_clear', text: '재굴림을 쓰지 않고 스테이지 클리어' } },
  { id: 'w_parity', name: '홀짝의 세계', icon: 'yinyang',
    desc: '홀수 주사위 3개 + 짝수 주사위 2개로 시작한다.',
    effects: { startDice: ['d_odd', 'd_odd', 'd_odd', 'd_even', 'd_even'] }, locked: true,
    unlock: { type: 'clear_stage', n: 2, text: '2스테이지 클리어' } },
  { id: 'w_inflation', name: '인플레이션', icon: 'chart',
    desc: '목표 점수가 30% 증가한다.\n획득 골드가 2배가 된다.',
    effects: { targetMult: 1.3, goldMult: 2 }, locked: true,
    unlock: { type: 'gold_total', n: 30, text: '한 게임에서 누적 30$ 획득' } },
  { id: 'w_minimal', name: '미니멀리즘', icon: 'small',
    desc: '주사위를 4개만 사용한다.\n목표 점수가 25% 감소한다.',
    effects: { diceCount: 4, targetMult: 0.75 }, locked: true,
    unlock: { type: 'single_score', n: 80, text: '한 번의 등록으로 80점 이상 획득' } },
  { id: 'w_high', name: '하이 롤러', icon: 'crown',
    desc: '모든 시작 주사위가 황금 주사위가 된다.\n목표 점수가 40% 증가한다.',
    effects: { startDice: ['d_gold', 'd_gold', 'd_gold', 'd_gold', 'd_gold'], targetMult: 1.4 }, locked: true,
    unlock: { type: 'yacht_made', text: 'Yacht 족보 달성' } },
];

// ---------- 로컬 룰 ----------
export const LOCAL_RULES = [
  { id: 'l_calm', name: '평온한 밤', gold: 2, icon: 'moon',
    desc: '아무 일도 일어나지 않는다.', effects: {} },
  { id: 'l_rusty', name: '녹슨 컵', gold: 4, icon: 'cup',
    desc: '재굴림을 할 때마다 1$를 소모한다.\n(골드가 없으면 재굴림 불가)', effects: { rerollCostGold: 1 } },
  { id: 'l_high', name: '높은 기준', gold: 5, icon: 'chart',
    desc: '목표 점수가 50% 증가한다.', effects: { targetMult: 1.5 } },
  { id: 'l_seal', name: '봉인된 주사위', gold: 4, icon: 'chain',
    desc: '주사위 1개를 사용할 수 없다.', effects: { sealDice: 1 } },
  { id: 'l_nopair', name: '뇨쇼', gold: 4, icon: 'scatter',
    desc: '같은 수가 하나도 없는 조합의\n획득 스코어가 50% 감소한다.', effects: { noPairPenalty: 0.5 } },
  { id: 'l_triple', name: '짝을 구해!', gold: 5, icon: 'triple',
    desc: '3개 이상 같은 눈금을 사용하는\n족보의 최종 점수가 50% 감소한다.', effects: { tripleSamePenalty: 0.5 } },
  { id: 'l_eventax', name: '짝수 세금', gold: 4, icon: 'tax2',
    desc: '짝수 눈금의 점수가 2점 감소한다.\n(합계형 족보에만 적용)', effects: { faceDelta: { parity: 'even', value: -2 } } },
  { id: 'l_oddtax', name: '홀수 세금', gold: 4, icon: 'tax1',
    desc: '홀수 눈금의 점수가 2점 감소한다.\n(합계형 족보에만 적용)', effects: { faceDelta: { parity: 'odd', value: -2 } } },
  { id: 'l_heavyhand', name: '무거운 손', gold: 5, icon: 'hand',
    desc: '등록 횟수가 1 감소한다.', effects: { regsDelta: -1 } },
  { id: 'l_rerollseal', name: '굳은 주사위', gold: 3, icon: 'freeze',
    desc: '주사위 1개가 첫 굴림 후 고정된다.\n(재굴림 불가)', effects: { sealReroll: 1 } },
];

// ---------- 와일드 페이스 ----------
export const WILDFACES = [
  { id: 'wf_single', name: '외눈 장인', price: 6, icon: 'eye',
    desc: '숫자 족보(Ace~Ten)의 점수 +15',
    effects: { catTypeAdd: { type: 'number', value: 15 } } },
  { id: 'wf_three', name: '삼삼이', price: 8, icon: 'three',
    desc: '[3] 눈금을 포함한 족보의 점수 x3',
    effects: { containsFaceMult: { face: 3, mult: 3 } } },
  { id: 'wf_collector', name: '수금원', price: 5, icon: 'coin',
    desc: '등록한 족보의 [1] 눈금마다 1$ 획득',
    effects: { goldPerFace: { face: 1, value: 1 } } },
  { id: 'wf_charm', name: '낡은 부적', price: 7, icon: 'charm',
    desc: '패배를 1회 막고 등록 횟수를 1회 추가 제공.\n이후 이 와일드 페이스는 비활성화된다.',
    effects: { saveFromDefeat: true } },
  { id: 'wf_evenking', name: '짝수 왕', price: 5, icon: 'two',
    desc: '합계형 족보에서 짝수 눈금 점수 +2',
    effects: { faceDelta: { parity: 'even', value: 2 } } },
  { id: 'wf_oddqueen', name: '홀수 여왕', price: 5, icon: 'one',
    desc: '합계형 족보에서 홀수 눈금 점수 +2',
    effects: { faceDelta: { parity: 'odd', value: 2 } } },
  { id: 'wf_straightm', name: '일자 거래', price: 8, icon: 'straight',
    desc: '스트레이트 류 족보의 점수 x2',
    effects: { comboTypeMult: { comboType: 'straight', mult: 2 } } },
  { id: 'wf_fullhouse', name: '하숙집 주인', price: 5, icon: 'house',
    desc: 'Full House 점수 +30',
    effects: { catAdd: { cat: 'fullhouse', value: 30 } } },
  { id: 'wf_miser', name: '구두쇠', price: 6, icon: 'bag',
    desc: '스테이지 클리어 시 소지 골드 5$당 1$ 이자 획득 (최대 5$)',
    effects: { interest: { per: 5, max: 5 } } },
  { id: 'wf_recycle', name: '재활용', price: 4, icon: 'recycle',
    desc: '0점을 등록하면 재굴림 횟수 +2',
    effects: { rerollOnZero: 2 } },
  { id: 'wf_yachtlove', name: '야추 광신도', price: 7, icon: 'yacht',
    desc: 'Yacht 류 족보의 점수 +100',
    effects: { comboTypeAdd: { comboType: 'yacht', value: 100 } }, locked: true,
    unlock: { type: 'yacht_made', text: 'Yacht 족보 달성' } },
  { id: 'wf_lucky7', name: '럭키 세븐', price: 6, icon: 'seven',
    desc: '등록한 족보의 [7] 눈금마다 +7점',
    effects: { perFaceScore: { face: 7, value: 7 } }, locked: true,
    unlock: { type: 'single_score', n: 60, text: '한 번의 등록으로 60점 이상 획득' } },
  { id: 'wf_oddcat', name: '홀수 수집가', price: 5, icon: 'listodd',
    desc: '점수판에 Odd 족보가 추가된다.\n(홀수 눈금 눈의 합)',
    effects: { addCategory: 'odd' } },
  { id: 'wf_evencat', name: '짝수 수집가', price: 5, icon: 'listeven',
    desc: '점수판에 Even 족보가 추가된다.\n(짝수 눈금 눈의 합)',
    effects: { addCategory: 'even' } },
];

// ---------- 리드미노 ----------
// 폴리오미노 형태 정의 (셀 좌표 목록)
export const POLYOMINOES = {
  M1: [[0, 0]],
  I2: [[0, 0], [0, 1]],
  I3: [[0, 0], [0, 1], [0, 2]],
  L3: [[0, 0], [1, 0], [1, 1]],
  O4: [[0, 0], [0, 1], [1, 0], [1, 1]],
  T4: [[0, 0], [0, 1], [0, 2], [1, 1]],
};
export const MINO_COLORS = ['#d4524e', '#4e8ed4', '#55b24f', '#d4a94e', '#9c5ed0', '#4fb2a7'];

// 효과 템플릿: 생성 시 face(1~6)와 형태가 랜덤 부여됨
export const LEADMINO_TEMPLATES = [
  { id: 'lm_facebonus', name: '돋보기', needsFace: true, maxLevel: 3, price: 4,
    shapes: ['M1', 'I2', 'L3'],
    text: (f, lv) => `[${f}] 눈금 점수 +${2 * lv}`,
    effect: (f, lv) => ({ minoFaceBonus: { face: f, value: 2 * lv } }) },
  { id: 'lm_weight', name: '무게추', needsFace: true, maxLevel: 3, price: 5,
    shapes: ['I2', 'I3', 'O4'],
    text: (f, lv) => `[${f}] 눈금 등장 확률 증가 (물리 가중 ${lv}단계)`,
    effect: (f, lv) => ({ minoWeight: { face: f, level: lv } }) },
  { id: 'lm_shift', name: '끌', needsFace: false, maxLevel: 2, price: 6,
    shapes: ['I3', 'T4', 'O4'],
    text: (f, lv) => `이 주사위의 눈금 값 +${lv} (최대 10)`,
    effect: (f, lv) => ({ minoValueShift: lv }) },
  { id: 'lm_reroll', name: '태엽', needsFace: true, maxLevel: 2, price: 4,
    shapes: ['M1', 'I2', 'L3'],
    text: (f, lv) => `[${f}] 눈금 등장 시 재굴림 +${lv}`,
    effect: (f, lv) => ({ minoRerollOn: { face: f, value: lv } }) },
  { id: 'lm_gold', name: '금니', needsFace: true, maxLevel: 3, price: 5,
    shapes: ['M1', 'I2', 'I3'],
    text: (f, lv) => `[${f}] 눈금 포함 족보 등록 시 +${lv}$`,
    effect: (f, lv) => ({ minoGoldOn: { face: f, value: lv } }) },
  { id: 'lm_flat', name: '장식 보석', needsFace: false, maxLevel: 3, price: 5,
    shapes: ['L3', 'T4', 'O4'],
    text: (f, lv) => `이 주사위가 족보에 포함되면 +${3 * lv}점`,
    effect: (f, lv) => ({ minoFlat: 3 * lv }) },
];
export const MINO_UPGRADE_COST = (lv) => 3 + lv * 3; // lv→lv+1 비용

// ---------- 스테이지 ----------
export const MAX_STAGE = 10;
export const BASE_REGS = 6;      // 스테이지당 등록(점수 기입) 횟수
export const BASE_REROLLS = 10;  // 스테이지당 재굴림 횟수
export const stageTarget = (n) => Math.round((70 * Math.pow(1.42, n - 1)) / 5) * 5;
// 1~10: 70,100,140,200,285,405,575,815,1160,1645

// 보상 공식: 로컬 룰 배정 골드 + floor(log2(stage)) + 남은 등록횟수
export const clearGold = (localRule, stage) =>
  (localRule?.gold ?? 2) + Math.floor(Math.log2(Math.max(1, stage)));

// ---------- 상점 ----------
export const SHOP_SLOTS = 4;
export const SHOP_WEIGHTS = { mino: 0.5, wildface: 0.3, dice: 0.2 };

// ---------- 로딩 팁 ----------
export const TIPS = [
  '주사위는 기원전 6,000년에도 발견되었습니다.',
  'Loaded Dice(사기 주사위)는 무게중심을 조작한 주사위를 뜻합니다.',
  '무게추 리드미노는 주사위의 무게중심을 실제로 옮깁니다.',
  '숫자 족보 합계가 50을 넘으면 보너스 +30점!',
  '재굴림 횟수는 스테이지 전체에서 공유됩니다. 아껴 쓰세요.',
  '와일드 페이스는 최대 5개까지만 소지할 수 있습니다.',
  '남은 등록 횟수 1개당 1$를 추가로 받습니다.',
];

// ---------- 해금 조건 평가 ----------
export function checkUnlockCondition(cond, stats) {
  switch (cond?.type) {
    case 'clear_stage': return (stats.maxStageCleared || 0) >= cond.n;
    case 'single_score': return (stats.bestSingleScore || 0) >= cond.n;
    case 'yacht_made': return !!stats.yachtMade;
    case 'gold_total': return (stats.goldEarnedRun || 0) >= cond.n;
    case 'no_reroll_clear': return !!stats.noRerollClear;
    case 'win_run': return !!stats.wonRun;
    default: return false;
  }
}
