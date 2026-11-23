// ============================================================
// 런(게임) 상태 관리 + 세이브/해금
// ============================================================
import {
  DICE_DEFS, WORLD_RULES, LOCAL_RULES, WILDFACES, LEADMINO_TEMPLATES,
  POLYOMINOES, MINO_COLORS, BASE_SHEET, BONUS, BASE_REGS, BASE_REROLLS,
  stageTarget, clearGold, SHOP_SLOTS, SHOP_WEIGHTS, MAX_STAGE,
  checkUnlockCondition, CAT,
} from '../data/db.js';
import { sheetTotal, numberSectionSum } from './scoring.js';

const SAVE_KEY = 'loadedDice.save.v1';
const META_KEY = 'loadedDice.meta.v1';

let uidCounter = 1;
const uid = () => `u${uidCounter++}_${Date.now() % 100000}`;
const rand = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rand(arr.length)];

// ================= 메타 (해금/통계) =================
export function loadMeta() {
  try {
    const m = JSON.parse(localStorage.getItem(META_KEY));
    if (m && m.unlocked) return m;
  } catch (e) { /* 손상 데이터 무시 */ }
  return { unlocked: { worlds: ['w_standard', 'w_rich'], dice: [], wilds: [] }, bestStage: 0 };
}
export function saveMeta(meta) {
  localStorage.setItem(META_KEY, JSON.stringify(meta));
}
export function isWorldUnlocked(meta, id) {
  const def = WORLD_RULES.find(w => w.id === id);
  return !def.locked || meta.unlocked.worlds.includes(id);
}
export function isDiceUnlocked(meta, id) {
  return !DICE_DEFS[id].locked || meta.unlocked.dice.includes(id);
}
export function isWildUnlocked(meta, id) {
  const def = WILDFACES.find(w => w.id === id);
  return !def.locked || meta.unlocked.wilds.includes(id);
}

// 런 종료(패배/승리) 시 해금 평가 → 새로 해금된 항목 목록 반환
export function evaluateUnlocks(meta, stats) {
  const newly = [];
  for (const w of WORLD_RULES) {
    if (w.locked && !meta.unlocked.worlds.includes(w.id) && checkUnlockCondition(w.unlock, stats)) {
      meta.unlocked.worlds.push(w.id);
      newly.push({ kind: '월드 룰', name: w.name, desc: w.desc, icon: w.icon, id: w.id });
    }
  }
  for (const d of Object.values(DICE_DEFS)) {
    if (d.locked && !meta.unlocked.dice.includes(d.id)) {
      // 주사위 해금 조건: 과장된 주사위=4스테이지, 황금 주사위=6스테이지 클리어
      const need = d.id === 'd_wild' ? 4 : 6;
      if ((stats.maxStageCleared || 0) >= need) {
        meta.unlocked.dice.push(d.id);
        newly.push({ kind: '주사위', name: d.name, desc: `${d.desc}\n눈금: [${d.faces.join(',')}]`, icon: 'die', id: d.id });
      }
    }
  }
  for (const w of WILDFACES) {
    if (w.locked && !meta.unlocked.wilds.includes(w.id) && checkUnlockCondition(w.unlock, stats)) {
      meta.unlocked.wilds.push(w.id);
      newly.push({ kind: '와일드 페이스', name: w.name, desc: w.desc, icon: w.icon, id: w.id });
    }
  }
  meta.bestStage = Math.max(meta.bestStage || 0, stats.maxStageCleared || 0);
  saveMeta(meta);
  return newly;
}

// ================= 주사위/리드미노 인스턴스 =================
export function makeDie(defId) {
  const def = DICE_DEFS[defId];
  return {
    uid: uid(), defId, name: def.name, faces: [...def.faces], color: def.color,
    grid: def.grid.map(row => [...row]), // 1=배치 가능
    minos: [], // {inst, cells:[[r,c],...]}
    sealed: false, rerollSealed: false,
  };
}

export function makeMino(templateId = null) {
  const tpl = templateId
    ? LEADMINO_TEMPLATES.find(t => t.id === templateId)
    : pick(LEADMINO_TEMPLATES);
  const face = tpl.needsFace ? 1 + rand(6) : null;
  const shape = pick(tpl.shapes);
  const inst = {
    uid: uid(), tplId: tpl.id, face, shape, level: 1,
    color: pick(MINO_COLORS),
  };
  refreshMino(inst);
  return inst;
}
export function refreshMino(inst) {
  const tpl = LEADMINO_TEMPLATES.find(t => t.id === inst.tplId);
  inst.name = `${tpl.name} 리드미노`;
  inst.text = tpl.text(inst.face, inst.level);
  inst.effectObj = tpl.effect(inst.face, inst.level);
  inst.maxLevel = tpl.maxLevel;
  inst.price = tpl.price;
}

// 폴리오미노 회전 (90도 x n)
export function rotatedShape(shapeKey, rot) {
  let cells = POLYOMINOES[shapeKey].map(c => [...c]);
  for (let i = 0; i < rot; i++) cells = cells.map(([r, c]) => [c, -r]);
  // 정규화 (최소 좌표 0,0)
  const minR = Math.min(...cells.map(c => c[0]));
  const minC = Math.min(...cells.map(c => c[1]));
  return cells.map(([r, c]) => [r - minR, c - minC]);
}

// 주사위 그리드에 미노 배치 시도 (anchor = 그리드 좌표, 자동 회전)
export function tryPlaceMino(die, inst, anchorR, anchorC) {
  const R = die.grid.length, C = die.grid[0].length;
  const occupied = new Set();
  for (const p of die.minos) for (const [r, c] of p.cells) occupied.add(`${r},${c}`);
  for (let rot = 0; rot < 4; rot++) {
    const shape = rotatedShape(inst.shape, rot);
    // anchor를 shape의 각 셀에 맞춰 시도
    for (const [ar, ac] of shape) {
      const cells = shape.map(([r, c]) => [anchorR + r - ar, anchorC + c - ac]);
      const ok = cells.every(([r, c]) =>
        r >= 0 && r < R && c >= 0 && c < C && die.grid[r][c] === 1 && !occupied.has(`${r},${c}`));
      if (ok) {
        die.minos.push({ inst, cells });
        return true;
      }
    }
  }
  return false;
}
export function removeMino(die, instUid) {
  const idx = die.minos.findIndex(p => p.inst.uid === instUid);
  if (idx >= 0) {
    const [p] = die.minos.splice(idx, 1);
    return p.inst;
  }
  return null;
}

// ================= 런 생성 =================
export function newRun(worldId) {
  const worldRule = WORLD_RULES.find(w => w.id === worldId);
  const fx = worldRule.effects || {};
  const diceCount = fx.diceCount ?? 5;
  const startDefs = fx.startDice ?? Array(diceCount).fill('d_std');
  const dice = [];
  for (let i = 0; i < diceCount; i++) dice.push(makeDie(startDefs[i % startDefs.length]));

  const run = {
    stage: 1,
    gold: fx.goldStart ?? 4,
    worldId, worldRule,
    localId: null, localRule: null,
    dice,
    minoBag: [],
    wilds: [], // {def, disabled}
    sheet: [], regsLeft: 0, rerollsLeft: 0, target: 0,
    phase: 'local-select',
    localChoices: [], rewardChoices: null, shopItems: null,
    freeRoll: true,
    rolled: null, // [{dieUid, value, kept}]
    lastClear: null,
    stats: { maxStageCleared: 0, bestSingleScore: 0, yachtMade: false, goldEarnedRun: 0, noRerollClear: false, wonRun: false, usedRerollThisStage: false },
  };
  genLocalChoices(run);
  return run;
}

export function wildSlotMax(run) {
  return 5 + (run.worldRule.effects?.wildSlots ?? 0);
}

// 스테이지의 로컬 룰 선택지 생성 (3개, 중복 없음)
export function genLocalChoices(run) {
  const pool = [...LOCAL_RULES];
  const picks = [];
  while (picks.length < 3 && pool.length) {
    const i = rand(pool.length);
    picks.push(pool.splice(i, 1)[0]);
  }
  run.localChoices = picks.map(p => p.id);
}

// 로컬 룰 선택 → 요트 게임 시작 준비
export function startStage(run, localId) {
  run.localId = localId;
  run.localRule = LOCAL_RULES.find(l => l.id === localId);
  const wfx = run.worldRule.effects || {};
  const lfx = run.localRule.effects || {};

  // 점수판 구성: 기본 + 와일드페이스 추가 족보
  const catIds = [...BASE_SHEET];
  for (const w of run.wilds) {
    if (!w.disabled && w.def.effects.addCategory && !catIds.includes(w.def.effects.addCategory)) {
      catIds.push(w.def.effects.addCategory);
    }
  }
  run.sheet = catIds.map(catId => ({ catId, score: null }));

  // 등록/재굴림
  let regs = BASE_REGS + (wfx.regsDelta ?? 0) + (lfx.regsDelta ?? 0);
  let rerolls = BASE_REROLLS;
  if (wfx.rerollSet != null) rerolls = wfx.rerollSet;
  run.regsLeft = Math.max(1, regs);
  run.rerollsLeft = Math.max(0, rerolls);

  // 목표 점수
  let target = stageTarget(run.stage);
  if (wfx.targetMult) target = Math.round(target * wfx.targetMult);
  if (lfx.targetMult) target = Math.round(target * lfx.targetMult);
  run.target = Math.max(10, Math.round(target / 5) * 5);

  // 주사위 봉인 초기화 및 적용
  for (const d of run.dice) { d.sealed = false; d.rerollSealed = false; }
  if (lfx.sealDice) {
    const usable = run.dice.filter(d => !d.sealed);
    for (let i = 0; i < lfx.sealDice && usable.length > 1; i++) {
      pick(usable.filter(d => !d.sealed)).sealed = true;
    }
  }
  if (lfx.sealReroll) {
    const usable = run.dice.filter(d => !d.sealed);
    for (let i = 0; i < lfx.sealReroll && i < usable.length; i++) {
      pick(usable.filter(d => !d.rerollSealed)).rerollSealed = true;
    }
  }

  run.phase = 'play';
  run.freeRoll = true;
  run.rolled = null;
  run.goldFromPlay = 0;
  run.stats.usedRerollThisStage = false;
  saveRun(run);
}

export function activeDice(run) {
  return run.dice.filter(d => !d.sealed);
}

export function runTotal(run) {
  return sheetTotal(run.sheet, BONUS);
}
export function bonusState(run) {
  const sum = numberSectionSum(run.sheet);
  return { sum, threshold: BONUS.threshold, score: BONUS.score, active: sum >= BONUS.threshold };
}

// ================= 보상/상점 =================
export function genRewardChoices(run) {
  run.rewardChoices = [makeMino(), makeMino(), makeMino()];
}

export function genShopItems(run, meta) {
  const items = [];
  const ownedWilds = new Set(run.wilds.map(w => w.def.id));
  const offeredWilds = new Set();
  for (let i = 0; i < SHOP_SLOTS; i++) {
    const r = Math.random();
    let kind = r < SHOP_WEIGHTS.mino ? 'mino' : r < SHOP_WEIGHTS.mino + SHOP_WEIGHTS.wildface ? 'wildface' : 'dice';
    // 와일드페이스 중복 금지 (소지/진열 모두)
    if (kind === 'wildface') {
      const pool = WILDFACES.filter(w => isWildUnlocked(meta, w.id) && !ownedWilds.has(w.id) && !offeredWilds.has(w.id));
      if (!pool.length) kind = 'mino';
      else {
        const def = pick(pool);
        offeredWilds.add(def.id);
        items.push({ slot: i, kind, def, price: def.price, sold: false });
        continue;
      }
    }
    if (kind === 'dice') {
      const pool = Object.values(DICE_DEFS).filter(d => isDiceUnlocked(meta, d.id) && d.id !== 'd_std');
      const def = pick(pool);
      items.push({ slot: i, kind, def, price: def.price, sold: false });
      continue;
    }
    const inst = makeMino();
    items.push({ slot: i, kind: 'mino', inst, price: inst.price, sold: false });
  }
  run.shopItems = items;
}

export function shopPrice(run, basePrice) {
  const disc = run.worldRule.effects?.shopDiscount ?? 0;
  return Math.max(1, Math.round(basePrice * (1 - disc)));
}

// 스테이지 클리어 골드 정산 → breakdown 반환
export function settleClearGold(run) {
  const wfx = run.worldRule.effects || {};
  const rows = [];
  const base = clearGold(run.localRule, run.stage);
  rows.push({ name: '클리어 골드', value: base });
  if (run.regsLeft > 0) rows.push({ name: '남은 등록 보너스', value: run.regsLeft });
  if (run.goldFromPlay > 0) rows.push({ name: '플레이 획득', value: run.goldFromPlay });
  // 구두쇠 이자
  for (const w of run.wilds) {
    if (!w.disabled && w.def.effects.interest) {
      const it = Math.min(w.def.effects.interest.max, Math.floor(run.gold / w.def.effects.interest.per));
      if (it > 0) rows.push({ name: `이자 (${w.def.name})`, value: it });
    }
  }
  let total = rows.reduce((a, r) => a + r.value, 0);
  if (wfx.goldMult) {
    total = total * wfx.goldMult;
    rows.push({ name: `월드 룰 x${wfx.goldMult}`, value: null });
  }
  run.gold += total;
  run.stats.goldEarnedRun += total;
  return { rows, total };
}

// ================= 세이브 =================
export function saveRun(run) {
  try {
    const slim = JSON.parse(JSON.stringify(run, (k, v) => (k === 'worldRule' || k === 'localRule' || k === 'def') ? undefined : v));
    // def 참조 복원용 id 저장
    slim.wilds = run.wilds.map(w => ({ defId: w.def.id, disabled: w.disabled }));
    if (run.shopItems) {
      slim.shopItems = run.shopItems.map(it => ({
        slot: it.slot, kind: it.kind, price: it.price, sold: it.sold,
        defId: it.def?.id, inst: it.inst || null,
      }));
    }
    localStorage.setItem(SAVE_KEY, JSON.stringify(slim));
  } catch (e) { console.warn('save failed', e); }
}

export function loadRun() {
  try {
    const slim = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!slim || !slim.worldId) return null;
    slim.worldRule = WORLD_RULES.find(w => w.id === slim.worldId);
    slim.localRule = slim.localId ? LOCAL_RULES.find(l => l.id === slim.localId) : null;
    slim.wilds = (slim.wilds || []).map(w => ({ def: WILDFACES.find(x => x.id === w.defId), disabled: w.disabled }));
    if (slim.shopItems) {
      slim.shopItems = slim.shopItems.map(it => ({
        ...it,
        def: it.kind === 'wildface' ? WILDFACES.find(x => x.id === it.defId)
          : it.kind === 'dice' ? DICE_DEFS[it.defId] : undefined,
      }));
    }
    // 미노 인스턴스 효과객체 복원
    const fixMino = (m) => { if (m) refreshMino(m); return m; };
    (slim.minoBag || []).forEach(fixMino);
    (slim.dice || []).forEach(d => (d.minos || []).forEach(p => fixMino(p.inst)));
    (slim.rewardChoices || []).forEach(fixMino);
    (slim.shopItems || []).forEach(it => fixMino(it.inst));
    // 굴림 도중 저장본은 굴림 전 상태로 복원
    slim.rolled = null;
    slim.freeRoll = true;
    return slim;
  } catch (e) {
    console.warn('load failed', e);
    return null;
  }
}

export function hasSave() {
  return !!localStorage.getItem(SAVE_KEY);
}
export function deleteSave() {
  localStorage.removeItem(SAVE_KEY);
}
