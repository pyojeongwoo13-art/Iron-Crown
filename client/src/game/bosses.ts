export type BossShape = "circle" | "ring" | "cone" | "line";
export type BossElement = "earth" | "iron" | "crystal" | "poison" | "war" | "ice" | "lava" | "king";
export type BossAim = "boss" | "target" | "predicted" | "arena" | "behindTarget";
export type BossMove = "none" | "charge" | "leap" | "teleport";

export type BossStep = {
  at: number;
  name: string;
  windup: number;
  shape: BossShape;
  aim: BossAim;
  radius?: number;
  innerRadius?: number;
  range?: number;
  width?: number;
  arc?: number;
  offset?: number;
  damage: number;
  move?: BossMove;
  persistent?: number;
  repeat?: number;
  count?: number;
  spread?: number;
  cue?: string;
};

export type BossPattern = {
  id: string;
  name: string;
  phases: number[];
  recovery: number;
  minDistance?: number;
  maxDistance?: number;
  weight?: number;
  exposes?: number;
  steps: BossStep[];
};

export type BossDefinition = {
  id: string;
  element: BossElement;
  preferredDistance: number;
  phases: Array<{ at: number; name: string }>;
  patterns: BossPattern[];
};

const step = (value: BossStep) => value;

export const BOSS_DEFINITIONS: Record<string, BossDefinition> = {
  hornBeast: {
    id: "hornBeast", element: "earth", preferredDistance: 185,
    phases: [{ at: 1, name: "초원의 포효" }, { at: .5, name: "쌍뿔의 격노" }],
    patterns: [
      { id: "horn-charge", name: "기본 돌진", phases: [1,2], minDistance: 150, recovery: 1050, steps: [
        step({ at: 0, name: "뿔 돌진", windup: 760, shape: "line", aim: "target", range: 520, width: 88, damage: 1.05, move: "charge", cue: "horn" }),
      ]},
      { id: "horn-sweep", name: "뿔 휩쓸기", phases: [1,2], maxDistance: 245, recovery: 980, steps: [
        step({ at: 0, name: "뿔 휩쓸기", windup: 520, shape: "cone", aim: "target", range: 225, arc: 2.25, damage: .82, cue: "sweep" }),
      ]},
      { id: "horn-quake", name: "대지 찍기", phases: [1,2], maxDistance: 390, recovery: 1250, steps: [
        step({ at: 0, name: "대지 찍기", windup: 900, shape: "circle", aim: "boss", radius: 142, damage: 1.05, cue: "quake" }),
        step({ at: 560, name: "외곽 충격파", windup: 480, shape: "ring", aim: "boss", innerRadius: 135, radius: 292, damage: .8, cue: "shockwave" }),
      ]},
      { id: "horn-double", name: "연속 돌진", phases: [2], minDistance: 130, recovery: 1450, exposes: 900, steps: [
        step({ at: 0, name: "첫 돌진", windup: 700, shape: "line", aim: "target", range: 470, width: 82, damage: .82, move: "charge", cue: "horn" }),
        step({ at: 1150, name: "재조준 돌진", windup: 520, shape: "line", aim: "predicted", range: 430, width: 86, damage: .9, move: "charge", cue: "horn" }),
        step({ at: 1970, name: "마무리 휩쓸기", windup: 460, shape: "cone", aim: "target", range: 215, arc: 2.15, damage: .72, cue: "sweep" }),
      ]},
    ],
  },
  chiefUrk: {
    id: "chiefUrk", element: "iron", preferredDistance: 165,
    phases: [{ at: 1, name: "방패 족장" }, { at: .7, name: "고블린 집결" }, { at: .35, name: "마지막 지원" }, { at: .25, name: "방패 파괴" }],
    patterns: [
      { id: "urk-triple", name: "철퇴 3연격", phases: [1,2,3,4], maxDistance: 245, recovery: 1500, exposes: 1050, weight: 1.35, steps: [
        step({ at: 0, name: "좌측 휘두르기", windup: 520, shape: "cone", aim: "target", range: 220, arc: 1.9, damage: .56, offset: -.45, cue: "mace" }),
        step({ at: 690, name: "우측 휘두르기", windup: 440, shape: "cone", aim: "target", range: 225, arc: 1.95, damage: .58, offset: .42, cue: "mace" }),
        step({ at: 1390, name: "강한 내려찍기", windup: 780, shape: "circle", aim: "predicted", radius: 155, damage: 1.12, cue: "quake" }),
      ]},
      { id: "urk-delayed", name: "지연 내려찍기", phases: [3,4], maxDistance: 380, recovery: 1300, steps: [
        step({ at: 0, name: "지연 내려찍기", windup: 1180, shape: "circle", aim: "predicted", radius: 175, damage: 1.18, cue: "delayed" }),
      ]},
      { id: "urk-shield-charge", name: "방패 돌진", phases: [1,2,3], minDistance: 180, recovery: 1800, exposes: 1500, steps: [
        step({ at: 0, name: "방패 돌진", windup: 720, shape: "line", aim: "target", range: 610, width: 112, damage: 1.05, move: "charge", cue: "shield" }),
      ]},
      { id: "urk-goblins", name: "지원 고블린", phases: [2,3], recovery: 1250, weight: .62, steps: [
        step({ at: 0, name: "지원 고블린", windup: 820, shape: "circle", aim: "target", radius: 78, damage: .38, count: 3, spread: 155, persistent: 5200, repeat: 1150, cue: "summon" }),
      ]},
      { id: "urk-rampage", name: "방패 없는 맹공", phases: [4], recovery: 1750, exposes: 1200, steps: [
        step({ at: 0, name: "광전 휘두르기", windup: 430, shape: "cone", aim: "target", range: 255, arc: 2.15, damage: .62, cue: "mace" }),
        step({ at: 610, name: "역회전", windup: 400, shape: "cone", aim: "target", range: 260, arc: 2.3, damage: .68, cue: "mace" }),
        step({ at: 1240, name: "족장의 분쇄", windup: 720, shape: "circle", aim: "predicted", radius: 185, damage: 1.2, cue: "quake" }),
      ]},
    ],
  },
  mineGuardian: {
    id: "mineGuardian", element: "crystal", preferredDistance: 230,
    phases: [{ at: 1, name: "수정 수호" }, { at: .5, name: "수정 갑옷" }, { at: .28, name: "파열된 핵" }],
    patterns: [
      { id: "guardian-quake", name: "지진 내려찍기", phases: [1,2,3], maxDistance: 420, recovery: 1350, steps: [
        step({ at: 0, name: "지진 내려찍기", windup: 880, shape: "circle", aim: "boss", radius: 165, damage: 1.0, cue: "crystal" }),
        step({ at: 520, name: "수정 충격파", windup: 520, shape: "ring", aim: "boss", innerRadius: 155, radius: 330, damage: .86, cue: "shockwave" }),
      ]},
      { id: "guardian-spikes", name: "수정 가시", phases: [1,2,3], recovery: 1250, weight: 1.25, steps: [
        step({ at: 0, name: "수정 가시", windup: 780, shape: "circle", aim: "predicted", radius: 68, damage: .68, count: 3, spread: 190, cue: "crystal" }),
        step({ at: 680, name: "추적 수정 가시", windup: 650, shape: "circle", aim: "predicted", radius: 72, damage: .72, count: 3, spread: 225, cue: "crystal" }),
      ]},
      { id: "guardian-spike-charge", name: "수정 가시 연계", phases: [2,3], minDistance: 160, recovery: 1650, exposes: 1150, steps: [
        step({ at: 0, name: "경로 봉쇄 가시", windup: 720, shape: "circle", aim: "predicted", radius: 72, damage: .62, count: 5, spread: 250, cue: "crystal" }),
        step({ at: 1150, name: "거대 돌진", windup: 720, shape: "line", aim: "target", range: 620, width: 130, damage: 1.12, move: "charge", cue: "stone" }),
      ]},
    ],
  },
  mistWitch: {
    id: "mistWitch", element: "poison", preferredDistance: 335,
    phases: [{ at: 1, name: "독안개" }, { at: .62, name: "환영 분열" }, { at: .32, name: "보랏빛 월식" }],
    patterns: [
      { id: "witch-orbs", name: "독 구체", phases: [1,2,3], minDistance: 180, recovery: 1050, steps: [
        step({ at: 0, name: "독 구체", windup: 620, shape: "line", aim: "predicted", range: 650, width: 46, damage: .52, count: 3, spread: .24, cue: "poison" }),
      ]},
      { id: "witch-pools", name: "독 웅덩이", phases: [1,2,3], recovery: 900, weight: 1.1, steps: [
        step({ at: 0, name: "독 웅덩이", windup: 820, shape: "circle", aim: "predicted", radius: 112, damage: .28, persistent: 9000, repeat: 900, count: 2, spread: 220, cue: "pool" }),
      ]},
      { id: "witch-teleport", name: "독안개 순간이동", phases: [1,2,3], recovery: 1150, maxDistance: 520, steps: [
        step({ at: 0, name: "등 뒤 출현", windup: 680, shape: "circle", aim: "behindTarget", radius: 145, damage: .78, move: "teleport", cue: "teleport" }),
      ]},
      { id: "witch-clones", name: "분신", phases: [2,3], recovery: 1450, steps: [
        step({ at: 0, name: "환영 분신", windup: 860, shape: "circle", aim: "target", radius: 72, damage: .42, count: 3, spread: 245, persistent: 4200, repeat: 1300, cue: "clone" }),
      ]},
      { id: "witch-eclipse", name: "독안개 연계", phases: [3], recovery: 1850, exposes: 900, steps: [
        step({ at: 0, name: "월식 웅덩이", windup: 800, shape: "circle", aim: "predicted", radius: 118, damage: .3, persistent: 7200, repeat: 850, count: 2, spread: 210, cue: "pool" }),
        step({ at: 620, name: "환영 이동", windup: 620, shape: "circle", aim: "behindTarget", radius: 140, damage: .66, move: "teleport", cue: "teleport" }),
        step({ at: 1260, name: "오연 독 구체", windup: 560, shape: "line", aim: "predicted", range: 680, width: 42, damage: .46, count: 5, spread: .2, cue: "poison" }),
      ]},
    ],
  },
  warlord: {
    id: "warlord", element: "war", preferredDistance: 175,
    phases: [{ at: 1, name: "붉은 대검" }, { at: .58, name: "피의 전술" }, { at: .3, name: "전쟁광" }],
    patterns: [
      { id: "warlord-four", name: "대검 4연격", phases: [1,2,3], maxDistance: 255, recovery: 1750, exposes: 1200, weight: 1.35, steps: [
        step({ at: 0, name: "1타", windup: 500, shape: "cone", aim: "target", range: 235, arc: 1.75, damage: .46, cue: "blade" }),
        step({ at: 610, name: "2타", windup: 420, shape: "cone", aim: "target", range: 240, arc: 1.85, damage: .5, cue: "blade" }),
        step({ at: 1340, name: "3타", windup: 560, shape: "cone", aim: "predicted", range: 260, arc: 2.0, damage: .58, cue: "blade" }),
        step({ at: 2100, name: "4타", windup: 760, shape: "circle", aim: "predicted", radius: 180, damage: 1.12, cue: "quake" }),
      ]},
      { id: "warlord-thrust", name: "추적 돌진 찌르기", phases: [1,2,3], minDistance: 190, recovery: 1150, steps: [
        step({ at: 0, name: "추적 돌진 찌르기", windup: 840, shape: "line", aim: "predicted", range: 650, width: 82, damage: 1.0, move: "charge", cue: "thrust" }),
      ]},
      { id: "warlord-wave", name: "충격파 베기", phases: [1,2,3], minDistance: 150, recovery: 1050, steps: [
        step({ at: 0, name: "충격파 베기", windup: 720, shape: "line", aim: "target", range: 720, width: 72, damage: .8, cue: "wave" }),
      ]},
      { id: "warlord-kick", name: "근접 대응", phases: [1,2,3], maxDistance: 145, recovery: 1150, steps: [
        step({ at: 0, name: "밀어내기", windup: 420, shape: "cone", aim: "target", range: 155, arc: 2.35, damage: .42, cue: "kick" }),
        step({ at: 560, name: "응징 내려찍기", windup: 680, shape: "circle", aim: "predicted", radius: 165, damage: .92, cue: "quake" }),
      ]},
    ],
  },
  frozenColossus: {
    id: "frozenColossus", element: "ice", preferredDistance: 245,
    phases: [{ at: 1, name: "영구빙결" }, { at: .58, name: "눈보라" }, { at: .25, name: "깨진 얼음 갑옷" }],
    patterns: [
      { id: "ice-breath", name: "회전 얼음 숨결", phases: [1,2,3], maxDistance: 420, recovery: 1300, steps: [
        step({ at: 0, name: "얼음 숨결", windup: 850, shape: "cone", aim: "target", range: 390, arc: 1.55, damage: .38, persistent: 1800, repeat: 420, cue: "frost" }),
      ]},
      { id: "ice-spikes", name: "얼음 가시", phases: [1,2,3], recovery: 1050, steps: [
        step({ at: 0, name: "얼음 가시", windup: 760, shape: "circle", aim: "predicted", radius: 66, damage: .58, count: 5, spread: 270, persistent: 3200, repeat: 1200, cue: "ice" }),
      ]},
      { id: "ice-leap", name: "도약 공격", phases: [1,2,3], minDistance: 165, recovery: 1450, steps: [
        step({ at: 0, name: "도약 착지", windup: 940, shape: "circle", aim: "predicted", radius: 150, damage: .92, move: "leap", cue: "leap" }),
        step({ at: 520, name: "착지 충격파", windup: 480, shape: "ring", aim: "boss", innerRadius: 140, radius: 325, damage: .72, cue: "shockwave" }),
      ]},
      { id: "ice-blizzard", name: "눈보라 연속 돌진", phases: [2,3], recovery: 1900, exposes: 1050, steps: [
        step({ at: 0, name: "눈보라 돌진 I", windup: 700, shape: "line", aim: "target", range: 620, width: 118, damage: .58, move: "charge", cue: "blizzard" }),
        step({ at: 930, name: "눈보라 돌진 II", windup: 560, shape: "line", aim: "predicted", range: 620, width: 118, damage: .62, move: "charge", cue: "blizzard" }),
        step({ at: 1760, name: "눈보라 돌진 III", windup: 500, shape: "line", aim: "target", range: 620, width: 124, damage: .68, move: "charge", cue: "blizzard" }),
      ]},
    ],
  },
  forgeLord: {
    id: "forgeLord", element: "lava", preferredDistance: 220,
    phases: [{ at: 1, name: "용광로 점화" }, { at: .68, name: "용암 범람" }, { at: .4, name: "과열" }],
    patterns: [
      { id: "forge-crush", name: "용암 분쇄", phases: [1,2,3], maxDistance: 430, recovery: 1250, steps: [
        step({ at: 0, name: "용암 분쇄", windup: 900, shape: "circle", aim: "predicted", radius: 155, damage: .86, cue: "magma" }),
        step({ at: 480, name: "용암 균열", windup: 620, shape: "line", aim: "arena", range: 520, width: 62, damage: .72, count: 5, spread: .6, cue: "fissure" }),
      ]},
      { id: "forge-throw", name: "용암 투척", phases: [1,2,3], minDistance: 150, recovery: 1000, steps: [
        step({ at: 0, name: "현재 위치 투척", windup: 680, shape: "circle", aim: "target", radius: 105, damage: .62, count: 2, spread: 180, cue: "magma" }),
        step({ at: 520, name: "예측 투척", windup: 620, shape: "circle", aim: "predicted", radius: 112, damage: .68, count: 2, spread: 200, cue: "magma" }),
      ]},
      { id: "forge-spin", name: "이중 회전", phases: [1,2,3], maxDistance: 300, recovery: 1450, exposes: 900, steps: [
        step({ at: 0, name: "첫 회전", windup: 720, shape: "circle", aim: "boss", radius: 255, damage: .65, cue: "spin" }),
        step({ at: 720, name: "외곽 회전", windup: 560, shape: "ring", aim: "boss", innerRadius: 205, radius: 390, damage: .72, cue: "spin" }),
      ]},
      { id: "forge-floor", name: "용암 장판", phases: [2,3], recovery: 1050, steps: [
        step({ at: 0, name: "용암 위험지대", windup: 880, shape: "circle", aim: "predicted", radius: 130, damage: .3, persistent: 7000, repeat: 850, count: 3, spread: 260, cue: "magma" }),
      ]},
      { id: "forge-overheat", name: "과열 연속 분쇄", phases: [3], recovery: 1900, exposes: 2600, steps: [
        step({ at: 0, name: "과열 분쇄", windup: 760, shape: "circle", aim: "predicted", radius: 170, damage: .82, cue: "magma" }),
        step({ at: 560, name: "추가 폭발", windup: 460, shape: "ring", aim: "target", innerRadius: 85, radius: 235, damage: .56, cue: "fissure" }),
        step({ at: 1120, name: "균열 폭발", windup: 620, shape: "line", aim: "arena", range: 560, width: 68, damage: .7, count: 6, spread: .52, cue: "fissure" }),
      ]},
    ],
  },
  ironKing: {
    id: "ironKing", element: "king", preferredDistance: 185,
    phases: [{ at: 1, name: "1페이즈 · 철왕" }, { at: .65, name: "2페이즈 · 부서진 왕관" }, { at: .25, name: "3페이즈 · 최후의 철왕" }],
    patterns: [
      { id: "king-combo", name: "왕의 연격", phases: [1], maxDistance: 260, recovery: 1450, exposes: 850, steps: [
        step({ at: 0, name: "왕의 검 I", windup: 480, shape: "cone", aim: "target", range: 235, arc: 1.7, damage: .42, cue: "kingBlade" }),
        step({ at: 560, name: "왕의 검 II", windup: 420, shape: "cone", aim: "target", range: 240, arc: 1.85, damage: .46, cue: "kingBlade" }),
        step({ at: 1080, name: "왕의 검 III", windup: 430, shape: "cone", aim: "predicted", range: 250, arc: 1.95, damage: .5, cue: "kingBlade" }),
        step({ at: 1670, name: "왕의 검 IV", windup: 650, shape: "circle", aim: "predicted", radius: 170, damage: .92, cue: "royal" }),
      ]},
      { id: "king-charge", name: "왕의 돌진", phases: [1], minDistance: 185, recovery: 1050, steps: [
        step({ at: 0, name: "왕의 돌진", windup: 820, shape: "line", aim: "predicted", range: 670, width: 82, damage: .92, move: "charge", cue: "royal" }),
      ]},
      { id: "king-shield", name: "방패 반격", phases: [1], maxDistance: 165, recovery: 1200, steps: [
        step({ at: 0, name: "방패 충격", windup: 480, shape: "cone", aim: "target", range: 175, arc: 2.45, damage: .54, cue: "shield" }),
        step({ at: 510, name: "왕의 반격", windup: 540, shape: "line", aim: "predicted", range: 360, width: 95, damage: .82, cue: "royal" }),
      ]},
      { id: "king-judgment", name: "왕의 단죄", phases: [2], recovery: 1350, steps: [
        step({ at: 0, name: "왕의 단죄", windup: 980, shape: "circle", aim: "predicted", radius: 185, damage: 1.0, cue: "judgment" }),
        step({ at: 420, name: "단죄 충격파", windup: 520, shape: "line", aim: "target", range: 760, width: 88, damage: .72, cue: "royal" }),
      ]},
      { id: "king-spin", name: "회전 참격", phases: [2], maxDistance: 340, recovery: 1350, steps: [
        step({ at: 0, name: "회전 참격", windup: 720, shape: "circle", aim: "boss", radius: 245, damage: .62, cue: "kingBlade" }),
        step({ at: 700, name: "왕관 파동", windup: 560, shape: "ring", aim: "boss", innerRadius: 205, radius: 410, damage: .7, cue: "royal" }),
      ]},
      { id: "king-shards", name: "검의 파편", phases: [2], minDistance: 150, recovery: 1000, steps: [
        step({ at: 0, name: "검의 파편", windup: 680, shape: "line", aim: "target", range: 720, width: 50, damage: .52, count: 5, spread: .3, cue: "shard" }),
      ]},
      { id: "king-final-a", name: "철왕 콤보 · 파쇄", phases: [3], recovery: 1750, exposes: 950, steps: [
        step({ at: 0, name: "최후의 돌진", windup: 680, shape: "line", aim: "predicted", range: 680, width: 90, damage: .62, move: "charge", cue: "royal" }),
        step({ at: 840, name: "왕의 횡베기", windup: 430, shape: "cone", aim: "target", range: 275, arc: 2.1, damage: .58, cue: "kingBlade" }),
        step({ at: 1450, name: "파쇄 충격파", windup: 620, shape: "ring", aim: "boss", innerRadius: 155, radius: 385, damage: .76, cue: "judgment" }),
      ]},
      { id: "king-final-b", name: "철왕 콤보 · 추격", phases: [3], recovery: 1900, exposes: 1100, steps: [
        step({ at: 0, name: "왕의 검기", windup: 540, shape: "line", aim: "predicted", range: 760, width: 52, damage: .42, count: 3, spread: .24, cue: "shard" }),
        step({ at: 650, name: "추격 베기 I", windup: 420, shape: "cone", aim: "target", range: 250, arc: 1.8, damage: .44, move: "leap", cue: "kingBlade" }),
        step({ at: 1180, name: "추격 베기 II", windup: 390, shape: "cone", aim: "predicted", range: 260, arc: 1.9, damage: .48, cue: "kingBlade" }),
        step({ at: 1740, name: "최후의 단죄", windup: 780, shape: "circle", aim: "predicted", radius: 195, damage: 1.05, cue: "judgment" }),
      ]},
      { id: "king-final-c", name: "철왕 콤보 · 왕관", phases: [3], recovery: 1850, exposes: 1000, steps: [
        step({ at: 0, name: "최후의 회전", windup: 620, shape: "circle", aim: "boss", radius: 255, damage: .58, cue: "kingBlade" }),
        step({ at: 680, name: "엇박 왕관 파동", windup: 760, shape: "ring", aim: "boss", innerRadius: 205, radius: 420, damage: .72, cue: "royal" }),
        step({ at: 1580, name: "왕의 단죄", windup: 700, shape: "line", aim: "predicted", range: 760, width: 105, damage: .92, cue: "judgment" }),
      ]},
    ],
  },
};

export const BOSS_XP: Record<string, number> = {
  hornBeast: 450,
  chiefUrk: 1_500,
  mineGuardian: 4_500,
  mistWitch: 15_000,
  warlord: 45_000,
  frozenColossus: 140_000,
  forgeLord: 400_000,
  ironKing: 1_200_000,
};

export function bossPhase(id: string, hpRatio: number) {
  const definition = BOSS_DEFINITIONS[id];
  if (!definition) return 1;
  let phase = 1;
  for (let index = 1; index < definition.phases.length; index += 1) {
    if (hpRatio <= definition.phases[index].at) phase = index + 1;
  }
  return phase;
}

export function patternsFor(id: string, phase: number) {
  return (BOSS_DEFINITIONS[id]?.patterns ?? []).filter((pattern) => pattern.phases.includes(phase));
}
