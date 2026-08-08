const BOSS_ARMOR_BY_TIER = [0, 10, 14, 18, 22, 26, 30, 34, 38] as const;

export type BossDamageResult = {
  raw: number;
  armor: number;
  final: number;
};

/**
 * 보스 방어는 공격력과 무관한 고정 퍼센트가 아니라 완만한 방어 등급 곡선이다.
 * 공격력이 커지면 최종 피해도 계속 같은 비율로 커지므로 강화 성장성이 막히지 않는다.
 */
export function bossDamageAfterDefense(rawDamage: number, bossTier: number): BossDamageResult {
  const raw = Math.max(1, Math.round(Number.isFinite(rawDamage) ? rawDamage : 1));
  const tier = Math.max(1, Math.min(8, Math.round(bossTier)));
  const armor = BOSS_ARMOR_BY_TIER[tier];
  return { raw, armor, final: Math.max(1, Math.round(raw * 100 / (100 + armor))) };
}

export function bossArmorForTier(bossTier: number) {
  const tier = Math.max(1, Math.min(8, Math.round(bossTier)));
  return BOSS_ARMOR_BY_TIER[tier];
}
