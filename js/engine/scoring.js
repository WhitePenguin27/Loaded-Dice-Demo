// ============================================================
// 점수 계산 파이프라인
// 기획서 순서: 기본 족보 → 월드/로컬 룰 → 와일드페이스 → 리드미노
// ============================================================
import { CAT } from '../data/db.js';

// 활성 룰 효과 수집 (월드 룰 + 로컬 룰)
export function activeRuleEffects(run) {
  const list = [];
  if (run.worldRule?.effects) list.push(run.worldRule.effects);
  if (run.localRule?.effects) list.push(run.localRule.effects);
  return list;
}

// 활성 와일드페이스 효과 수집 (비활성 제외)
export function activeWildEffects(run) {
  return run.wilds.filter(w => !w.disabled).map(w => w.def.effects);
}

// 주사위 인스턴스의 리드미노 효과 수집
export function dieMinoEffects(die) {
  return (die.minos || []).map(p => p.inst.effectObj);
}

// 눈금 값 보정 (리드미노 '끌': minoValueShift) — 굴림 결과에 적용
export function shiftedValue(die, rawValue) {
  let v = rawValue;
  for (const e of dieMinoEffects(die)) {
    if (e.minoValueShift) v += e.minoValueShift;
  }
  return Math.max(0, Math.min(10, v));
}

// 물리 가중(minoWeight): 해당 주사위의 선호 면 index와 세기 반환
export function dieWeightInfo(die) {
  let best = null;
  for (const e of dieMinoEffects(die)) {
    if (e.minoWeight) {
      const faceIdx = die.faces.indexOf(e.minoWeight.face);
      if (faceIdx >= 0 && (!best || e.minoWeight.level > best.level)) {
        best = { faceIdx, level: e.minoWeight.level };
      }
    }
  }
  return best;
}

/**
 * 족보 점수 계산 (미리보기/확정 공용)
 * @param catId 족보 id
 * @param rolled [{die, value}] 현재 주사위 전체 (배치+굴림 완료 상태)
 * @param run 런 상태
 * @returns {base, final, gold, rerolls, breakdown[]}
 */
export function scoreCategory(catId, rolled, run) {
  const cat = CAT[catId];
  const dice = rolled.map(r => ({ value: r.value, die: r.die }));
  const res = cat.calc(dice);
  let score = res.score;
  const breakdown = [`기본 ${res.score}점`];
  const ruleFx = activeRuleEffects(run);
  const wildFx = activeWildEffects(run);

  // ---------- 1) 월드/로컬 룰 ----------
  // faceDelta: 합계형 족보에서 눈금별 가감
  if (res.isSum && score > 0) {
    let delta = 0;
    for (const fx of ruleFx) {
      if (fx.faceDelta) {
        for (const d of res.used) {
          const isEven = d.value > 0 && d.value % 2 === 0;
          const match = fx.faceDelta.parity === 'even' ? isEven : (d.value % 2 === 1);
          if (match) delta += fx.faceDelta.value;
        }
      }
    }
    if (delta !== 0) { score = Math.max(0, score + delta); breakdown.push(`룰 눈금 보정 ${delta > 0 ? '+' : ''}${delta}`); }
  }
  // noPairPenalty: 같은 수가 하나도 없으면 감소
  const vals = dice.map(d => d.value);
  const uniq = new Set(vals);
  for (const fx of ruleFx) {
    if (fx.noPairPenalty && uniq.size === vals.length && score > 0) {
      score = Math.floor(score * fx.noPairPenalty);
      breakdown.push(`뇨쇼 패널티 x${fx.noPairPenalty}`);
    }
    if (fx.tripleSamePenalty && score > 0) {
      // 해당 족보가 '사용하는' 주사위 중 3개 이상 같은 눈금이 있을 때만
      const cmap = {};
      res.used.forEach(d => cmap[d.value] = (cmap[d.value] || 0) + 1);
      if (Object.values(cmap).some(c => c >= 3)) {
        score = Math.floor(score * fx.tripleSamePenalty);
        breakdown.push(`짝을 구해! 패널티 x${fx.tripleSamePenalty}`);
      }
    }
  }
  // scoreMult (월드 룰: 스코어 n% 감소 등)
  for (const fx of ruleFx) {
    if (fx.scoreMult != null && score > 0) {
      score = Math.floor(score * fx.scoreMult);
      breakdown.push(`월드 룰 x${fx.scoreMult}`);
    }
  }

  // ---------- 2) 와일드페이스 ----------
  // 가산 먼저
  for (const fx of wildFx) {
    if (fx.catTypeAdd && cat.type === fx.catTypeAdd.type && score > 0) {
      score += fx.catTypeAdd.value; breakdown.push(`와일드 +${fx.catTypeAdd.value}`);
    }
    if (fx.catAdd && fx.catAdd.cat === catId && score > 0) {
      score += fx.catAdd.value; breakdown.push(`와일드 +${fx.catAdd.value}`);
    }
    if (fx.comboTypeAdd && cat.comboType === fx.comboTypeAdd.comboType && score > 0) {
      score += fx.comboTypeAdd.value; breakdown.push(`와일드 +${fx.comboTypeAdd.value}`);
    }
    if (fx.faceDelta && res.isSum && score > 0) {
      let delta = 0;
      for (const d of res.used) {
        const isEven = d.value > 0 && d.value % 2 === 0;
        const match = fx.faceDelta.parity === 'even' ? isEven : (d.value % 2 === 1);
        if (match) delta += fx.faceDelta.value;
      }
      if (delta) { score = Math.max(0, score + delta); breakdown.push(`와일드 눈금 +${delta}`); }
    }
    if (fx.perFaceScore && score >= 0) {
      const n = dice.filter(d => d.value === fx.perFaceScore.face).length;
      if (n > 0 && score > 0) { score += n * fx.perFaceScore.value; breakdown.push(`[${fx.perFaceScore.face}]x${n} +${n * fx.perFaceScore.value}`); }
    }
  }
  // 배수
  for (const fx of wildFx) {
    if (fx.containsFaceMult && score > 0 && vals.includes(fx.containsFaceMult.face)) {
      score = Math.floor(score * fx.containsFaceMult.mult);
      breakdown.push(`[${fx.containsFaceMult.face}] 포함 x${fx.containsFaceMult.mult}`);
    }
    if (fx.comboTypeMult && cat.comboType === fx.comboTypeMult.comboType && score > 0) {
      score = Math.floor(score * fx.comboTypeMult.mult);
      breakdown.push(`와일드 x${fx.comboTypeMult.mult}`);
    }
  }

  // ---------- 3) 리드미노 ----------
  let gold = 0;
  let minoAdd = 0;
  const usedDies = new Set(res.used.map(u => u.die));
  for (const r of rolled) {
    const inCombo = usedDies.has(r.die) || (!res.isSum && res.score > 0 && res.used.length > 0);
    for (const e of dieMinoEffects(r.die)) {
      if (e.minoFaceBonus && r.value === e.minoFaceBonus.face && usedDies.has(r.die) && score > 0) {
        minoAdd += e.minoFaceBonus.value;
      }
      if (e.minoFlat && usedDies.has(r.die) && score > 0) {
        minoAdd += e.minoFlat;
      }
      if (e.minoGoldOn && r.value === e.minoGoldOn.face && inCombo && score > 0) {
        gold += e.minoGoldOn.value;
      }
    }
  }
  if (minoAdd > 0) { score += minoAdd; breakdown.push(`리드미노 +${minoAdd}`); }

  // 와일드페이스 골드 (수금원 등): 등록한 족보의 주사위에서 계산
  for (const fx of wildFx) {
    if (fx.goldPerFace) {
      const n = dice.filter(d => d.value === fx.goldPerFace.face).length;
      gold += n * fx.goldPerFace.value;
    }
  }

  return { base: res.score, final: Math.max(0, Math.round(score)), gold, breakdown };
}

// 숫자 족보 합계(보너스 판정용) — 등록된 숫자 족보 점수의 합
export function numberSectionSum(sheet) {
  let sum = 0;
  for (const row of sheet) {
    if (CAT[row.catId].type === 'number' && row.score != null) sum += row.score;
  }
  return sum;
}

// 시트 총점 (보너스 포함)
export function sheetTotal(sheet, bonusDef) {
  let total = 0;
  for (const row of sheet) if (row.score != null) total += row.score;
  if (numberSectionSum(sheet) >= bonusDef.threshold) total += bonusDef.score;
  return total;
}
