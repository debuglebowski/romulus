// Combat calculation functions extracted for testability

export const UNIT_BASE_HP = 100;
export const UNIT_STRENGTH = 20;
export const UNIT_DEFENSE = 0.2; // 20%
export const DEFENDER_BONUS = 0.1; // +10% defense for defender

export function calculateArmyDefense(isDefender: boolean): number {
	return isDefender ? UNIT_DEFENSE + DEFENDER_BONUS : UNIT_DEFENSE;
}

export function calculateEnemyStrength(enemyUnitCount: number): number {
	return enemyUnitCount * UNIT_STRENGTH;
}

export function calculateDamageReceived(
	enemyStrength: number,
	armyDefense: number,
	randomMultiplier: number,
): number {
	return (enemyStrength / 10) * (1 - armyDefense) * randomMultiplier;
}

export function calculateDamagePerUnit(totalDamage: number, unitCount: number): number {
	return totalDamage / unitCount;
}

export function applyDamageToUnit(currentHp: number, damage: number): number {
	return currentHp - damage;
}

export function isUnitDead(hp: number): boolean {
	return hp <= 0;
}
