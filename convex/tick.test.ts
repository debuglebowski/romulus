import { describe, it, expect, vi, beforeEach } from 'vitest';

// Import actual combat functions and constants
import {
	UNIT_BASE_HP,
	UNIT_STRENGTH,
	UNIT_DEFENSE,
	DEFENDER_BONUS,
	calculateArmyDefense,
	calculateEnemyStrength,
	calculateDamageReceived,
	calculateDamagePerUnit,
	applyDamageToUnit,
	isUnitDead,
} from './lib/combat';

// Import actual economy functions and constants
import {
	UPKEEP_PER_UNIT,
	UPKEEP_PER_SPY,
	calculateMilitaryUpkeep,
	calculateSpyUpkeep,
	calculateTotalUpkeep,
	calculateGoldPerTick,
	calculateLabourers,
	calculateMilitaryFromRatio,
	calculateSpiesFromRatio,
	calculatePopulationGrowthPerTick,
	MILITARY_DETECTION_RATE,
	SPY_DETECTION_RATE,
	calculateMilitaryDetectionChance,
	calculateSpyDetectionChance,
} from './lib/economy';

// Helper function to create a predictable random range for testing
function createRandomRange(value: number) {
	return () => value;
}

// Helper function for testing combined detection (not in lib as it's test-specific)
function calculateTotalDetectionChance(militaryChance: number, spyChance: number): number {
	// Note: In the actual code, these are checked separately, not combined
	// This function is for testing the individual components
	return militaryChance + spyChance;
}

describe('Combat Constants', () => {
	it('has correct unit base HP', () => {
		expect(UNIT_BASE_HP).toBe(100);
	});

	it('has correct unit strength', () => {
		expect(UNIT_STRENGTH).toBe(20);
	});

	it('has correct unit defense percentage', () => {
		expect(UNIT_DEFENSE).toBe(0.2);
	});

	it('has correct defender bonus', () => {
		expect(DEFENDER_BONUS).toBe(0.1);
	});
});

describe('calculateArmyDefense', () => {
	it('calculates defender defense with bonus', () => {
		const defense = calculateArmyDefense(true);
		expect(defense).toBeCloseTo(0.3, 10); // 0.2 + 0.1
	});

	it('calculates attacker defense without bonus', () => {
		const defense = calculateArmyDefense(false);
		expect(defense).toBe(0.2);
	});

	it('defender has 50% more defense than attacker', () => {
		const attackerDefense = calculateArmyDefense(false);
		const defenderDefense = calculateArmyDefense(true);
		expect(defenderDefense - attackerDefense).toBeCloseTo(0.1, 10);
	});
});

describe('calculateEnemyStrength', () => {
	it('calculates strength for single enemy unit', () => {
		const strength = calculateEnemyStrength(1);
		expect(strength).toBe(20);
	});

	it('calculates strength for multiple enemy units', () => {
		const strength = calculateEnemyStrength(5);
		expect(strength).toBe(100);
	});

	it('calculates strength for large enemy force', () => {
		const strength = calculateEnemyStrength(50);
		expect(strength).toBe(1000);
	});

	it('returns zero for no enemy units', () => {
		const strength = calculateEnemyStrength(0);
		expect(strength).toBe(0);
	});

	it('strength scales linearly with unit count', () => {
		const strength10 = calculateEnemyStrength(10);
		const strength20 = calculateEnemyStrength(20);
		expect(strength20).toBe(strength10 * 2);
	});
});

describe('calculateDamageReceived', () => {
	it('calculates damage with no defense and no randomness', () => {
		const damage = calculateDamageReceived(100, 0, 1.0);
		expect(damage).toBe(10); // (100 / 10) * (1 - 0) * 1.0
	});

	it('calculates damage with attacker defense and no randomness', () => {
		const damage = calculateDamageReceived(100, UNIT_DEFENSE, 1.0);
		expect(damage).toBe(8); // (100 / 10) * (1 - 0.2) * 1.0
	});

	it('calculates damage with defender defense and no randomness', () => {
		const defenderDefense = UNIT_DEFENSE + DEFENDER_BONUS;
		const damage = calculateDamageReceived(100, defenderDefense, 1.0);
		expect(damage).toBe(7); // (100 / 10) * (1 - 0.3) * 1.0
	});

	it('applies random multiplier at minimum (0.9)', () => {
		const baseDamage = calculateDamageReceived(100, 0, 1.0);
		const minDamage = calculateDamageReceived(100, 0, 0.9);
		expect(minDamage).toBe(baseDamage * 0.9);
	});

	it('applies random multiplier at maximum (1.1)', () => {
		const baseDamage = calculateDamageReceived(100, 0, 1.0);
		const maxDamage = calculateDamageReceived(100, 0, 1.1);
		expect(maxDamage).toBe(baseDamage * 1.1);
	});

	it('calculates damage for realistic attacker scenario', () => {
		// 5 enemy units attacking a 3-unit army
		const enemyStrength = calculateEnemyStrength(5); // 100
		const attackerDefense = calculateArmyDefense(false); // 0.2
		const damage = calculateDamageReceived(enemyStrength, attackerDefense, 1.0);
		expect(damage).toBe(8); // (100 / 10) * 0.8 * 1.0
	});

	it('calculates damage for realistic defender scenario', () => {
		// 5 enemy units attacking a 3-unit defending army
		const enemyStrength = calculateEnemyStrength(5); // 100
		const defenderDefense = calculateArmyDefense(true); // 0.3
		const damage = calculateDamageReceived(enemyStrength, defenderDefense, 1.0);
		expect(damage).toBe(7); // (100 / 10) * 0.7 * 1.0
	});

	it('defender takes less damage than attacker from same strength', () => {
		const enemyStrength = calculateEnemyStrength(10);
		const attackerDamage = calculateDamageReceived(enemyStrength, calculateArmyDefense(false), 1.0);
		const defenderDamage = calculateDamageReceived(enemyStrength, calculateArmyDefense(true), 1.0);
		expect(defenderDamage).toBeLessThan(attackerDamage);
	});

	it('damage scales with enemy strength', () => {
		const damage5 = calculateDamageReceived(calculateEnemyStrength(5), UNIT_DEFENSE, 1.0);
		const damage10 = calculateDamageReceived(calculateEnemyStrength(10), UNIT_DEFENSE, 1.0);
		expect(damage10).toBe(damage5 * 2);
	});

	it('returns zero damage when no enemy strength', () => {
		const damage = calculateDamageReceived(0, UNIT_DEFENSE, 1.0);
		expect(damage).toBe(0);
	});
});

describe('calculateDamagePerUnit', () => {
	it('distributes damage evenly among units', () => {
		const damagePerUnit = calculateDamagePerUnit(30, 3);
		expect(damagePerUnit).toBe(10);
	});

	it('calculates damage for single unit', () => {
		const damagePerUnit = calculateDamagePerUnit(20, 1);
		expect(damagePerUnit).toBe(20);
	});

	it('calculates fractional damage per unit', () => {
		const damagePerUnit = calculateDamagePerUnit(10, 3);
		expect(damagePerUnit).toBeCloseTo(3.333, 2);
	});

	it('distributes large damage among many units', () => {
		const damagePerUnit = calculateDamagePerUnit(100, 10);
		expect(damagePerUnit).toBe(10);
	});

	it('distributes small damage among many units', () => {
		const damagePerUnit = calculateDamagePerUnit(5, 20);
		expect(damagePerUnit).toBe(0.25);
	});

	it('more units means less damage per unit', () => {
		const damage5 = calculateDamagePerUnit(100, 5);
		const damage10 = calculateDamagePerUnit(100, 10);
		expect(damage10).toBe(damage5 / 2);
	});
});

describe('applyDamageToUnit', () => {
	it('reduces HP by damage amount', () => {
		const newHp = applyDamageToUnit(100, 20);
		expect(newHp).toBe(80);
	});

	it('can reduce HP to exactly zero', () => {
		const newHp = applyDamageToUnit(50, 50);
		expect(newHp).toBe(0);
	});

	it('can reduce HP below zero', () => {
		const newHp = applyDamageToUnit(50, 60);
		expect(newHp).toBe(-10);
	});

	it('handles fractional damage', () => {
		const newHp = applyDamageToUnit(100, 3.5);
		expect(newHp).toBe(96.5);
	});

	it('handles very small damage', () => {
		const newHp = applyDamageToUnit(100, 0.1);
		expect(newHp).toBeCloseTo(99.9, 1);
	});

	it('handles damage to already damaged unit', () => {
		const newHp = applyDamageToUnit(45.5, 10.5);
		expect(newHp).toBe(35);
	});
});

describe('isUnitDead', () => {
	it('unit is alive with positive HP', () => {
		expect(isUnitDead(100)).toBe(false);
		expect(isUnitDead(50)).toBe(false);
		expect(isUnitDead(1)).toBe(false);
		expect(isUnitDead(0.1)).toBe(false);
	});

	it('unit is dead at exactly zero HP', () => {
		expect(isUnitDead(0)).toBe(true);
	});

	it('unit is dead with negative HP', () => {
		expect(isUnitDead(-1)).toBe(true);
		expect(isUnitDead(-50)).toBe(true);
		expect(isUnitDead(-0.1)).toBe(true);
	});
});

describe('Combat Scenarios', () => {
	it('calculates full combat round for small armies', () => {
		// 3 attackers vs 2 defenders
		const attackerUnitCount = 3;
		const defenderUnitCount = 2;

		// Attacker receives damage
		const enemyStrengthAgainstAttacker = calculateEnemyStrength(defenderUnitCount);
		const attackerDefense = calculateArmyDefense(false);
		const attackerTotalDamage = calculateDamageReceived(enemyStrengthAgainstAttacker, attackerDefense, 1.0);
		const attackerDamagePerUnit = calculateDamagePerUnit(attackerTotalDamage, attackerUnitCount);

		// Defender receives damage
		const enemyStrengthAgainstDefender = calculateEnemyStrength(attackerUnitCount);
		const defenderDefense = calculateArmyDefense(true);
		const defenderTotalDamage = calculateDamageReceived(enemyStrengthAgainstDefender, defenderDefense, 1.0);
		const defenderDamagePerUnit = calculateDamagePerUnit(defenderTotalDamage, defenderUnitCount);

		// Each attacker unit receives: (40 / 10) * 0.8 / 3 = 1.067
		expect(attackerDamagePerUnit).toBeCloseTo(1.067, 2);

		// Each defender unit receives: (60 / 10) * 0.7 / 2 = 2.1
		expect(defenderDamagePerUnit).toBeCloseTo(2.1, 2);

		// Units survive first round
		const attackerHp = applyDamageToUnit(UNIT_BASE_HP, attackerDamagePerUnit);
		const defenderHp = applyDamageToUnit(UNIT_BASE_HP, defenderDamagePerUnit);

		expect(isUnitDead(attackerHp)).toBe(false);
		expect(isUnitDead(defenderHp)).toBe(false);
	});

	it('calculates unit death in one round with overwhelming force', () => {
		// 50 attackers vs 1 defender
		const attackerUnitCount = 50;
		const defenderUnitCount = 1;

		const enemyStrengthAgainstDefender = calculateEnemyStrength(attackerUnitCount);
		const defenderDefense = calculateArmyDefense(true);
		const defenderTotalDamage = calculateDamageReceived(enemyStrengthAgainstDefender, defenderDefense, 1.0);
		const defenderDamagePerUnit = calculateDamagePerUnit(defenderTotalDamage, defenderUnitCount);

		// Defender receives: (1000 / 10) * 0.7 / 1 = 70 damage
		expect(defenderDamagePerUnit).toBe(70);

		const defenderHp = applyDamageToUnit(UNIT_BASE_HP, defenderDamagePerUnit);
		expect(defenderHp).toBe(30);
		expect(isUnitDead(defenderHp)).toBe(false);

		// But after 2 rounds, defender is dead
		const defenderHp2 = applyDamageToUnit(defenderHp, defenderDamagePerUnit);
		expect(isUnitDead(defenderHp2)).toBe(true);
	});

	it('calculates even battle between equal forces', () => {
		// 5 attackers vs 5 defenders
		const attackerUnitCount = 5;
		const defenderUnitCount = 5;

		// Attacker damage
		const enemyStrengthAgainstAttacker = calculateEnemyStrength(defenderUnitCount);
		const attackerDefense = calculateArmyDefense(false);
		const attackerDamagePerUnit = calculateDamagePerUnit(
			calculateDamageReceived(enemyStrengthAgainstAttacker, attackerDefense, 1.0),
			attackerUnitCount,
		);

		// Defender damage
		const enemyStrengthAgainstDefender = calculateEnemyStrength(attackerUnitCount);
		const defenderDefense = calculateArmyDefense(true);
		const defenderDamagePerUnit = calculateDamagePerUnit(
			calculateDamageReceived(enemyStrengthAgainstDefender, defenderDefense, 1.0),
			defenderUnitCount,
		);

		// Attacker takes more damage per unit than defender
		expect(attackerDamagePerUnit).toBeGreaterThan(defenderDamagePerUnit);

		// Each attacker: (100 / 10) * 0.8 / 5 = 1.6 damage
		expect(attackerDamagePerUnit).toBe(1.6);

		// Each defender: (100 / 10) * 0.7 / 5 = 1.4 damage
		expect(defenderDamagePerUnit).toBe(1.4);

		// Defender advantage: takes 12.5% less damage
		const damageRatio = attackerDamagePerUnit / defenderDamagePerUnit;
		expect(damageRatio).toBeCloseTo(1.143, 2);
	});

	it('simulates multiple combat rounds until units die', () => {
		// 2 vs 2 battle
		const unitCount = 2;
		let attackerHp = UNIT_BASE_HP;
		let defenderHp = UNIT_BASE_HP;

		const attackerDefense = calculateArmyDefense(false);
		const defenderDefense = calculateArmyDefense(true);

		let rounds = 0;
		const maxRounds = 100; // Safety limit

		while (!isUnitDead(attackerHp) && !isUnitDead(defenderHp) && rounds < maxRounds) {
			// Calculate damage each round
			const attackerDamagePerUnit = calculateDamagePerUnit(
				calculateDamageReceived(calculateEnemyStrength(unitCount), attackerDefense, 1.0),
				unitCount,
			);

			const defenderDamagePerUnit = calculateDamagePerUnit(
				calculateDamageReceived(calculateEnemyStrength(unitCount), defenderDefense, 1.0),
				unitCount,
			);

			attackerHp = applyDamageToUnit(attackerHp, attackerDamagePerUnit);
			defenderHp = applyDamageToUnit(defenderHp, defenderDamagePerUnit);

			rounds++;
		}

		// Attacker should die first due to lower defense
		expect(isUnitDead(attackerHp)).toBe(true);
		expect(isUnitDead(defenderHp)).toBe(false);

		// Should take multiple rounds
		expect(rounds).toBeGreaterThan(1);
		expect(rounds).toBeLessThan(maxRounds);
	});

	it('verifies defender advantage in prolonged combat', () => {
		// Equal forces: 10 vs 10
		const unitCount = 10;
		const attackerDamagePerUnit = calculateDamagePerUnit(
			calculateDamageReceived(
				calculateEnemyStrength(unitCount),
				calculateArmyDefense(false),
				1.0,
			),
			unitCount,
		);

		const defenderDamagePerUnit = calculateDamagePerUnit(
			calculateDamageReceived(
				calculateEnemyStrength(unitCount),
				calculateArmyDefense(true),
				1.0,
			),
			unitCount,
		);

		// Calculate rounds to kill
		const roundsToKillAttacker = Math.ceil(UNIT_BASE_HP / attackerDamagePerUnit);
		const roundsToKillDefender = Math.ceil(UNIT_BASE_HP / defenderDamagePerUnit);

		// Defender survives longer
		expect(roundsToKillDefender).toBeGreaterThan(roundsToKillAttacker);
	});

	it('calculates damage variance with random multiplier range', () => {
		const enemyStrength = calculateEnemyStrength(10);
		const defense = calculateArmyDefense(false);

		const minDamage = calculateDamageReceived(enemyStrength, defense, 0.9);
		const avgDamage = calculateDamageReceived(enemyStrength, defense, 1.0);
		const maxDamage = calculateDamageReceived(enemyStrength, defense, 1.1);

		// Verify variance is ±10%
		expect(minDamage).toBeCloseTo(avgDamage * 0.9, 2);
		expect(maxDamage).toBeCloseTo(avgDamage * 1.1, 2);

		// Verify damage range
		const damageRange = maxDamage - minDamage;
		expect(damageRange).toBeCloseTo(avgDamage * 0.2, 2);
	});

	it('handles edge case of 1 unit vs many', () => {
		const singleUnitCount = 1;
		const manyUnitsCount = 100;

		const damageToSingleUnit = calculateDamagePerUnit(
			calculateDamageReceived(
				calculateEnemyStrength(manyUnitsCount),
				calculateArmyDefense(true),
				1.0,
			),
			singleUnitCount,
		);

		// Single unit takes massive damage: (2000 / 10) * 0.7 = 140
		expect(damageToSingleUnit).toBe(140);

		// Single unit dies in one hit
		const hp = applyDamageToUnit(UNIT_BASE_HP, damageToSingleUnit);
		expect(isUnitDead(hp)).toBe(true);
	});

	it('handles edge case of many units vs 1', () => {
		const manyUnitsCount = 100;
		const singleUnitCount = 1;

		const damagePerUnitInLargeArmy = calculateDamagePerUnit(
			calculateDamageReceived(
				calculateEnemyStrength(singleUnitCount),
				calculateArmyDefense(false),
				1.0,
			),
			manyUnitsCount,
		);

		// Each unit in large army takes tiny damage: (20 / 10) * 0.8 / 100 = 0.016
		expect(damagePerUnitInLargeArmy).toBe(0.016);

		// Units survive easily
		const hp = applyDamageToUnit(UNIT_BASE_HP, damagePerUnitInLargeArmy);
		expect(isUnitDead(hp)).toBe(false);
		expect(hp).toBeCloseTo(99.984, 3);
	});
});

describe('Combat Formulas Integration', () => {
	it('verifies complete damage calculation pipeline', () => {
		// Setup: 8 attacking units vs 5 defending units
		const attackers = 8;
		const defenders = 5;

		// Step 1: Calculate enemy strength
		const strengthAgainstDefenders = calculateEnemyStrength(attackers);
		expect(strengthAgainstDefenders).toBe(160);

		// Step 2: Calculate defense
		const defenderDefense = calculateArmyDefense(true);
		expect(defenderDefense).toBeCloseTo(0.3, 10);

		// Step 3: Calculate total damage (no randomness)
		const totalDamage = calculateDamageReceived(strengthAgainstDefenders, defenderDefense, 1.0);
		expect(totalDamage).toBe(11.2); // (160 / 10) * 0.7

		// Step 4: Distribute damage
		const damagePerUnit = calculateDamagePerUnit(totalDamage, defenders);
		expect(damagePerUnit).toBeCloseTo(2.24, 10);

		// Step 5: Apply damage
		const newHp = applyDamageToUnit(UNIT_BASE_HP, damagePerUnit);
		expect(newHp).toBe(97.76);

		// Step 6: Check if dead
		expect(isUnitDead(newHp)).toBe(false);
	});

	it('verifies damage calculation with maximum randomness', () => {
		const attackers = 10;
		const defenders = 10;

		const strengthAgainstAttackers = calculateEnemyStrength(defenders);
		const attackerDefense = calculateArmyDefense(false);

		// Max damage with 1.1 multiplier
		const maxTotalDamage = calculateDamageReceived(strengthAgainstAttackers, attackerDefense, 1.1);
		const maxDamagePerUnit = calculateDamagePerUnit(maxTotalDamage, attackers);

		expect(maxTotalDamage).toBeCloseTo(17.6, 2); // (200 / 10) * 0.8 * 1.1
		expect(maxDamagePerUnit).toBeCloseTo(1.76, 2);
	});

	it('verifies damage calculation with minimum randomness', () => {
		const attackers = 10;
		const defenders = 10;

		const strengthAgainstDefenders = calculateEnemyStrength(attackers);
		const defenderDefense = calculateArmyDefense(true);

		// Min damage with 0.9 multiplier
		const minTotalDamage = calculateDamageReceived(strengthAgainstDefenders, defenderDefense, 0.9);
		const minDamagePerUnit = calculateDamagePerUnit(minTotalDamage, defenders);

		expect(minTotalDamage).toBeCloseTo(12.6, 2); // (200 / 10) * 0.7 * 0.9
		expect(minDamagePerUnit).toBeCloseTo(1.26, 2);
	});
});

describe('Combat Balance Verification', () => {
	it('verifies defender has 10% defense advantage', () => {
		const attackerDefense = calculateArmyDefense(false);
		const defenderDefense = calculateArmyDefense(true);

		const advantagePercentage = (defenderDefense - attackerDefense) / attackerDefense;
		expect(advantagePercentage).toBeCloseTo(0.5, 10); // 50% more defense
	});

	it('verifies base defense reduces damage by 20%', () => {
		const strength = 100;
		const noDamage = calculateDamageReceived(strength, 0, 1.0);
		const withDefense = calculateDamageReceived(strength, UNIT_DEFENSE, 1.0);

		const reductionPercentage = (noDamage - withDefense) / noDamage;
		expect(reductionPercentage).toBe(0.2); // 20% reduction
	});

	it('verifies defender bonus reduces damage by additional 10%', () => {
		const strength = 100;
		const attackerDamage = calculateDamageReceived(strength, UNIT_DEFENSE, 1.0);
		const defenderDamage = calculateDamageReceived(strength, UNIT_DEFENSE + DEFENDER_BONUS, 1.0);

		const additionalReduction = (attackerDamage - defenderDamage) / attackerDamage;
		expect(additionalReduction).toBeCloseTo(0.125, 3); // 12.5% additional reduction
	});

	it('verifies damage scales linearly with unit count', () => {
		const defenderDefense = calculateArmyDefense(true);

		const damage5 = calculateDamageReceived(calculateEnemyStrength(5), defenderDefense, 1.0);
		const damage10 = calculateDamageReceived(calculateEnemyStrength(10), defenderDefense, 1.0);
		const damage20 = calculateDamageReceived(calculateEnemyStrength(20), defenderDefense, 1.0);

		expect(damage10).toBe(damage5 * 2);
		expect(damage20).toBe(damage5 * 4);
	});

	it('verifies randomness creates 20% variance in damage', () => {
		const strength = calculateEnemyStrength(10);
		const defense = calculateArmyDefense(false);

		const minDamage = calculateDamageReceived(strength, defense, 0.9);
		const maxDamage = calculateDamageReceived(strength, defense, 1.1);

		const variancePercentage = (maxDamage - minDamage) / maxDamage;
		expect(variancePercentage).toBeCloseTo(0.182, 2); // ~18.2% variance
	});
});

describe('Economy Constants', () => {
	it('has correct upkeep per unit', () => {
		expect(UPKEEP_PER_UNIT).toBe(0.1);
	});

	it('has correct upkeep per spy', () => {
		expect(UPKEEP_PER_SPY).toBe(0.2);
	});

	it('spies cost twice as much as military units', () => {
		expect(UPKEEP_PER_SPY).toBe(UPKEEP_PER_UNIT * 2);
	});
});

describe('calculateMilitaryUpkeep', () => {
	it('calculates upkeep for single unit', () => {
		const upkeep = calculateMilitaryUpkeep(1);
		expect(upkeep).toBe(0.1);
	});

	it('calculates upkeep for multiple units', () => {
		const upkeep = calculateMilitaryUpkeep(10);
		expect(upkeep).toBe(1.0);
	});

	it('calculates upkeep for large army', () => {
		const upkeep = calculateMilitaryUpkeep(100);
		expect(upkeep).toBe(10.0);
	});

	it('returns zero for no units', () => {
		const upkeep = calculateMilitaryUpkeep(0);
		expect(upkeep).toBe(0);
	});

	it('upkeep scales linearly with unit count', () => {
		const upkeep10 = calculateMilitaryUpkeep(10);
		const upkeep20 = calculateMilitaryUpkeep(20);
		expect(upkeep20).toBe(upkeep10 * 2);
	});

	it('calculates upkeep for typical mid-game army', () => {
		const upkeep = calculateMilitaryUpkeep(50);
		expect(upkeep).toBe(5.0);
	});

	it('calculates upkeep for fractional unit count', () => {
		const upkeep = calculateMilitaryUpkeep(5.5);
		expect(upkeep).toBeCloseTo(0.55, 10);
	});
});

describe('calculateSpyUpkeep', () => {
	it('calculates upkeep for single spy', () => {
		const upkeep = calculateSpyUpkeep(1);
		expect(upkeep).toBe(0.2);
	});

	it('calculates upkeep for multiple spies', () => {
		const upkeep = calculateSpyUpkeep(10);
		expect(upkeep).toBe(2.0);
	});

	it('calculates upkeep for large spy network', () => {
		const upkeep = calculateSpyUpkeep(50);
		expect(upkeep).toBe(10.0);
	});

	it('returns zero for no spies', () => {
		const upkeep = calculateSpyUpkeep(0);
		expect(upkeep).toBe(0);
	});

	it('upkeep scales linearly with spy count', () => {
		const upkeep5 = calculateSpyUpkeep(5);
		const upkeep10 = calculateSpyUpkeep(10);
		expect(upkeep10).toBe(upkeep5 * 2);
	});

	it('spy upkeep is double military upkeep', () => {
		const militaryUpkeep = calculateMilitaryUpkeep(10);
		const spyUpkeep = calculateSpyUpkeep(10);
		expect(spyUpkeep).toBe(militaryUpkeep * 2);
	});
});

describe('calculateTotalUpkeep', () => {
	it('combines military and spy upkeep', () => {
		const militaryUpkeep = 1.0;
		const spyUpkeep = 0.5;
		const totalUpkeep = calculateTotalUpkeep(militaryUpkeep, spyUpkeep);
		expect(totalUpkeep).toBe(1.5);
	});

	it('returns zero when no upkeep costs', () => {
		const totalUpkeep = calculateTotalUpkeep(0, 0);
		expect(totalUpkeep).toBe(0);
	});

	it('handles only military upkeep', () => {
		const totalUpkeep = calculateTotalUpkeep(5.0, 0);
		expect(totalUpkeep).toBe(5.0);
	});

	it('handles only spy upkeep', () => {
		const totalUpkeep = calculateTotalUpkeep(0, 3.0);
		expect(totalUpkeep).toBe(3.0);
	});

	it('calculates upkeep for mixed forces', () => {
		const militaryUpkeep = calculateMilitaryUpkeep(20);
		const spyUpkeep = calculateSpyUpkeep(5);
		const totalUpkeep = calculateTotalUpkeep(militaryUpkeep, spyUpkeep);
		expect(totalUpkeep).toBe(3.0); // 2.0 + 1.0
	});

	it('calculates upkeep for large mixed forces', () => {
		const militaryUpkeep = calculateMilitaryUpkeep(100);
		const spyUpkeep = calculateSpyUpkeep(50);
		const totalUpkeep = calculateTotalUpkeep(militaryUpkeep, spyUpkeep);
		expect(totalUpkeep).toBe(20.0); // 10.0 + 10.0
	});

	it('handles fractional upkeep values', () => {
		const militaryUpkeep = 1.5;
		const spyUpkeep = 2.3;
		const totalUpkeep = calculateTotalUpkeep(militaryUpkeep, spyUpkeep);
		expect(totalUpkeep).toBeCloseTo(3.8, 10);
	});
});

describe('calculateGoldPerTick', () => {
	it('calculates gold income with no upkeep', () => {
		const goldPerTick = calculateGoldPerTick(50, 0);
		expect(goldPerTick).toBe(10.0); // 50 / 5
	});

	it('calculates gold income with upkeep', () => {
		const goldPerTick = calculateGoldPerTick(50, 2.0);
		expect(goldPerTick).toBe(8.0); // 10.0 - 2.0
	});

	it('calculates net zero gold', () => {
		const goldPerTick = calculateGoldPerTick(50, 10.0);
		expect(goldPerTick).toBe(0);
	});

	it('calculates negative gold (bankruptcy)', () => {
		const goldPerTick = calculateGoldPerTick(50, 15.0);
		expect(goldPerTick).toBe(-5.0);
	});

	it('calculates gold for small labour force', () => {
		const goldPerTick = calculateGoldPerTick(5, 0);
		expect(goldPerTick).toBe(1.0);
	});

	it('calculates gold for large labour force', () => {
		const goldPerTick = calculateGoldPerTick(500, 0);
		expect(goldPerTick).toBe(100.0);
	});

	it('gold income scales linearly with labourers', () => {
		const gold50 = calculateGoldPerTick(50, 0);
		const gold100 = calculateGoldPerTick(100, 0);
		expect(gold100).toBe(gold50 * 2);
	});

	it('calculates gold for typical early game scenario', () => {
		// 25 labourers, 10 military units
		const labourers = 25;
		const militaryUpkeep = calculateMilitaryUpkeep(10);
		const goldPerTick = calculateGoldPerTick(labourers, militaryUpkeep);
		expect(goldPerTick).toBe(4.0); // (25 / 5) - 1.0
	});

	it('calculates gold for typical mid game scenario', () => {
		// 100 labourers, 30 military, 10 spies
		const labourers = 100;
		const militaryUpkeep = calculateMilitaryUpkeep(30);
		const spyUpkeep = calculateSpyUpkeep(10);
		const totalUpkeep = calculateTotalUpkeep(militaryUpkeep, spyUpkeep);
		const goldPerTick = calculateGoldPerTick(labourers, totalUpkeep);
		expect(goldPerTick).toBe(15.0); // (100 / 5) - 5.0
	});

	it('handles fractional labourer counts', () => {
		const goldPerTick = calculateGoldPerTick(27.5, 0);
		expect(goldPerTick).toBe(5.5);
	});

	it('handles fractional upkeep values', () => {
		const goldPerTick = calculateGoldPerTick(50, 3.7);
		expect(goldPerTick).toBeCloseTo(6.3, 10);
	});
});

describe('Economy Calculations Integration', () => {
	it('calculates complete economy tick for balanced player', () => {
		// 50 labourers, 20 military, 5 spies
		const labourers = 50;
		const militaryCount = 20;
		const spyCount = 5;

		const militaryUpkeep = calculateMilitaryUpkeep(militaryCount);
		expect(militaryUpkeep).toBe(2.0);

		const spyUpkeep = calculateSpyUpkeep(spyCount);
		expect(spyUpkeep).toBe(1.0);

		const totalUpkeep = calculateTotalUpkeep(militaryUpkeep, spyUpkeep);
		expect(totalUpkeep).toBe(3.0);

		const goldPerTick = calculateGoldPerTick(labourers, totalUpkeep);
		expect(goldPerTick).toBe(7.0); // (50 / 5) - 3.0
	});

	it('calculates complete economy tick for military-focused player', () => {
		// 30 labourers, 100 military, 0 spies
		const labourers = 30;
		const militaryCount = 100;
		const spyCount = 0;

		const militaryUpkeep = calculateMilitaryUpkeep(militaryCount);
		expect(militaryUpkeep).toBe(10.0);

		const spyUpkeep = calculateSpyUpkeep(spyCount);
		expect(spyUpkeep).toBe(0);

		const totalUpkeep = calculateTotalUpkeep(militaryUpkeep, spyUpkeep);
		expect(totalUpkeep).toBe(10.0);

		const goldPerTick = calculateGoldPerTick(labourers, totalUpkeep);
		expect(goldPerTick).toBe(-4.0); // (30 / 5) - 10.0 = bankruptcy
	});

	it('calculates complete economy tick for spy-focused player', () => {
		// 60 labourers, 10 military, 30 spies
		const labourers = 60;
		const militaryCount = 10;
		const spyCount = 30;

		const militaryUpkeep = calculateMilitaryUpkeep(militaryCount);
		expect(militaryUpkeep).toBe(1.0);

		const spyUpkeep = calculateSpyUpkeep(spyCount);
		expect(spyUpkeep).toBe(6.0);

		const totalUpkeep = calculateTotalUpkeep(militaryUpkeep, spyUpkeep);
		expect(totalUpkeep).toBe(7.0);

		const goldPerTick = calculateGoldPerTick(labourers, totalUpkeep);
		expect(goldPerTick).toBe(5.0); // (60 / 5) - 7.0
	});

	it('calculates complete economy tick for economy-focused player', () => {
		// 150 labourers, 5 military, 0 spies
		const labourers = 150;
		const militaryCount = 5;
		const spyCount = 0;

		const militaryUpkeep = calculateMilitaryUpkeep(militaryCount);
		expect(militaryUpkeep).toBe(0.5);

		const spyUpkeep = calculateSpyUpkeep(spyCount);
		expect(spyUpkeep).toBe(0);

		const totalUpkeep = calculateTotalUpkeep(militaryUpkeep, spyUpkeep);
		expect(totalUpkeep).toBe(0.5);

		const goldPerTick = calculateGoldPerTick(labourers, totalUpkeep);
		expect(goldPerTick).toBe(29.5); // (150 / 5) - 0.5
	});

	it('verifies upkeep prevents unlimited military growth', () => {
		// Player with 100 labourers (20 gold/tick income)
		const labourers = 100;
		const goldIncome = labourers / 5;
		expect(goldIncome).toBe(20);

		// Maximum sustainable military units
		const maxMilitary = goldIncome / UPKEEP_PER_UNIT;
		expect(maxMilitary).toBe(200);

		// Maximum sustainable spies
		const maxSpies = goldIncome / UPKEEP_PER_SPY;
		expect(maxSpies).toBe(100);

		// Verify break-even point
		const militaryUpkeep = calculateMilitaryUpkeep(maxMilitary);
		const goldPerTick = calculateGoldPerTick(labourers, militaryUpkeep);
		expect(goldPerTick).toBe(0);
	});

	it('calculates gold over multiple ticks with profit', () => {
		const labourers = 50;
		const totalUpkeep = 5.0;
		const goldPerTick = calculateGoldPerTick(labourers, totalUpkeep);

		let currentGold = 0;
		const ticks = 10;

		for (let i = 0; i < ticks; i++) {
			currentGold += goldPerTick;
		}

		expect(goldPerTick).toBe(5.0);
		expect(currentGold).toBe(50.0);
	});

	it('calculates gold over multiple ticks with loss', () => {
		const labourers = 20;
		const totalUpkeep = 10.0;
		const goldPerTick = calculateGoldPerTick(labourers, totalUpkeep);

		let currentGold = 100;
		const ticks = 10;

		for (let i = 0; i < ticks; i++) {
			currentGold += goldPerTick;
		}

		expect(goldPerTick).toBe(-6.0);
		expect(currentGold).toBe(40.0);
	});
});

describe('Economy Balance Verification', () => {
	it('verifies 5 labourers produce 1 gold per tick', () => {
		const goldPerTick = calculateGoldPerTick(5, 0);
		expect(goldPerTick).toBe(1.0);
	});

	it('verifies 1 military unit consumes 0.1 gold per tick', () => {
		const upkeep = calculateMilitaryUpkeep(1);
		expect(upkeep).toBe(0.1);
	});

	it('verifies 1 spy consumes 0.2 gold per tick', () => {
		const upkeep = calculateSpyUpkeep(1);
		expect(upkeep).toBe(0.2);
	});

	it('verifies 5 labourers can support 10 military units', () => {
		const labourers = 5;
		const militaryCount = 10;
		const upkeep = calculateMilitaryUpkeep(militaryCount);
		const goldPerTick = calculateGoldPerTick(labourers, upkeep);
		expect(goldPerTick).toBe(0); // Break-even
	});

	it('verifies 5 labourers can support 5 spies', () => {
		const labourers = 5;
		const spyCount = 5;
		const upkeep = calculateSpyUpkeep(spyCount);
		const goldPerTick = calculateGoldPerTick(labourers, upkeep);
		expect(goldPerTick).toBe(0); // Break-even
	});

	it('verifies spies cost twice as much to maintain as military', () => {
		const count = 10;
		const militaryUpkeep = calculateMilitaryUpkeep(count);
		const spyUpkeep = calculateSpyUpkeep(count);
		expect(spyUpkeep).toBe(militaryUpkeep * 2);
	});

	it('verifies labour-to-gold ratio is 5:1', () => {
		const ratios = [10, 25, 50, 100, 200];
		for (const labourers of ratios) {
			const goldPerTick = calculateGoldPerTick(labourers, 0);
			expect(goldPerTick).toBe(labourers / 5);
		}
	});

	it('verifies upkeep scales proportionally with force size', () => {
		const sizes = [10, 20, 50, 100];
		const baseUpkeep = calculateMilitaryUpkeep(sizes[0]);

		for (let i = 1; i < sizes.length; i++) {
			const upkeep = calculateMilitaryUpkeep(sizes[i]);
			const expectedUpkeep = baseUpkeep * (sizes[i] / sizes[0]);
			expect(upkeep).toBeCloseTo(expectedUpkeep, 10);
		}
	});
});

describe('Economy Edge Cases', () => {
	it('handles zero labourers', () => {
		const goldPerTick = calculateGoldPerTick(0, 0);
		expect(goldPerTick).toBe(0);
	});

	it('handles zero labourers with upkeep', () => {
		const goldPerTick = calculateGoldPerTick(0, 5.0);
		expect(goldPerTick).toBe(-5.0);
	});

	it('handles very large labour force', () => {
		const labourers = 10000;
		const goldPerTick = calculateGoldPerTick(labourers, 0);
		expect(goldPerTick).toBe(2000);
	});

	it('handles very large military', () => {
		const militaryCount = 10000;
		const upkeep = calculateMilitaryUpkeep(militaryCount);
		expect(upkeep).toBe(1000);
	});

	it('handles very large spy network', () => {
		const spyCount = 5000;
		const upkeep = calculateSpyUpkeep(spyCount);
		expect(upkeep).toBe(1000);
	});

	it('handles fractional labour calculations', () => {
		const labourers = 13.7;
		const goldPerTick = calculateGoldPerTick(labourers, 0);
		expect(goldPerTick).toBeCloseTo(2.74, 10);
	});

	it('calculates breakpoint where upkeep exceeds income', () => {
		const labourers = 50;
		const goldIncome = labourers / 5;

		// Find exact military count where upkeep exceeds income
		const breakpointMilitary = Math.floor(goldIncome / UPKEEP_PER_UNIT);
		const upkeepAtBreakpoint = calculateMilitaryUpkeep(breakpointMilitary);
		const goldAtBreakpoint = calculateGoldPerTick(labourers, upkeepAtBreakpoint);

		expect(goldAtBreakpoint).toBeGreaterThanOrEqual(0);

		const upkeepOver = calculateMilitaryUpkeep(breakpointMilitary + 1);
		const goldOver = calculateGoldPerTick(labourers, upkeepOver);
		expect(goldOver).toBeLessThan(0);
	});

	it('handles extreme bankruptcy scenario', () => {
		const labourers = 1;
		const militaryCount = 1000;
		const spyCount = 500;

		const militaryUpkeep = calculateMilitaryUpkeep(militaryCount);
		const spyUpkeep = calculateSpyUpkeep(spyCount);
		const totalUpkeep = calculateTotalUpkeep(militaryUpkeep, spyUpkeep);
		const goldPerTick = calculateGoldPerTick(labourers, totalUpkeep);

		expect(goldPerTick).toBe(-199.8); // 0.2 - 200.0
	});
});

describe('calculateLabourers', () => {
	it('calculates labourers with 100% labour ratio', () => {
		const labourers = calculateLabourers(100, 100);
		expect(labourers).toBe(100);
	});

	it('calculates labourers with 50% labour ratio', () => {
		const labourers = calculateLabourers(100, 50);
		expect(labourers).toBe(50);
	});

	it('calculates labourers with 0% labour ratio', () => {
		const labourers = calculateLabourers(100, 0);
		expect(labourers).toBe(0);
	});

	it('floors fractional labourer count', () => {
		const labourers = calculateLabourers(33, 50);
		expect(labourers).toBe(16); // Math.floor(33 * 0.5) = 16
	});

	it('calculates labourers for small population', () => {
		const labourers = calculateLabourers(20, 75);
		expect(labourers).toBe(15);
	});

	it('calculates labourers for large population', () => {
		const labourers = calculateLabourers(500, 60);
		expect(labourers).toBe(300);
	});

	it('handles zero population', () => {
		const labourers = calculateLabourers(0, 100);
		expect(labourers).toBe(0);
	});

	it('handles 1% labour ratio', () => {
		const labourers = calculateLabourers(100, 1);
		expect(labourers).toBe(1);
	});

	it('handles 99% labour ratio', () => {
		const labourers = calculateLabourers(100, 99);
		expect(labourers).toBe(99);
	});

	it('floors down when ratio produces fractional result', () => {
		const labourers = calculateLabourers(7, 50);
		expect(labourers).toBe(3); // Math.floor(7 * 0.5) = 3
	});
});

describe('calculateMilitaryFromRatio', () => {
	it('calculates military with 100% military ratio', () => {
		const military = calculateMilitaryFromRatio(100, 100);
		expect(military).toBe(100);
	});

	it('calculates military with 50% military ratio', () => {
		const military = calculateMilitaryFromRatio(100, 50);
		expect(military).toBe(50);
	});

	it('calculates military with 0% military ratio', () => {
		const military = calculateMilitaryFromRatio(100, 0);
		expect(military).toBe(0);
	});

	it('floors fractional military count', () => {
		const military = calculateMilitaryFromRatio(33, 50);
		expect(military).toBe(16); // Math.floor(33 * 0.5) = 16
	});

	it('calculates military for small population', () => {
		const military = calculateMilitaryFromRatio(20, 25);
		expect(military).toBe(5);
	});

	it('calculates military for large population', () => {
		const military = calculateMilitaryFromRatio(500, 40);
		expect(military).toBe(200);
	});

	it('handles zero population', () => {
		const military = calculateMilitaryFromRatio(0, 100);
		expect(military).toBe(0);
	});

	it('handles 10% military ratio', () => {
		const military = calculateMilitaryFromRatio(100, 10);
		expect(military).toBe(10);
	});

	it('handles 30% military ratio', () => {
		const military = calculateMilitaryFromRatio(100, 30);
		expect(military).toBe(30);
	});

	it('floors down when ratio produces fractional result', () => {
		const military = calculateMilitaryFromRatio(7, 25);
		expect(military).toBe(1); // Math.floor(7 * 0.25) = 1
	});
});

describe('calculateSpiesFromRatio', () => {
	it('calculates spies with 100% spy ratio', () => {
		const spies = calculateSpiesFromRatio(100, 100);
		expect(spies).toBe(100);
	});

	it('calculates spies with 50% spy ratio', () => {
		const spies = calculateSpiesFromRatio(100, 50);
		expect(spies).toBe(50);
	});

	it('calculates spies with 0% spy ratio', () => {
		const spies = calculateSpiesFromRatio(100, 0);
		expect(spies).toBe(0);
	});

	it('floors fractional spy count', () => {
		const spies = calculateSpiesFromRatio(33, 50);
		expect(spies).toBe(16); // Math.floor(33 * 0.5) = 16
	});

	it('calculates spies for small population', () => {
		const spies = calculateSpiesFromRatio(20, 15);
		expect(spies).toBe(3);
	});

	it('calculates spies for large population', () => {
		const spies = calculateSpiesFromRatio(500, 20);
		expect(spies).toBe(100);
	});

	it('handles zero population', () => {
		const spies = calculateSpiesFromRatio(0, 100);
		expect(spies).toBe(0);
	});

	it('handles 5% spy ratio', () => {
		const spies = calculateSpiesFromRatio(100, 5);
		expect(spies).toBe(5);
	});

	it('handles 10% spy ratio', () => {
		const spies = calculateSpiesFromRatio(100, 10);
		expect(spies).toBe(10);
	});

	it('floors down when ratio produces fractional result', () => {
		const spies = calculateSpiesFromRatio(7, 10);
		expect(spies).toBe(0); // Math.floor(7 * 0.1) = 0
	});
});

describe('calculatePopulationGrowthPerTick', () => {
	it('calculates growth with labourers only', () => {
		const growth = calculatePopulationGrowthPerTick(60, 0);
		expect(growth).toBeCloseTo(0.1, 10); // (60 / 10 + 0) / 60 = 0.1
	});

	it('calculates growth with cities only', () => {
		const growth = calculatePopulationGrowthPerTick(0, 2);
		expect(growth).toBeCloseTo(0.01667, 4); // (0 + 1.0) / 60 = 0.01667
	});

	it('calculates growth with both labourers and cities', () => {
		const growth = calculatePopulationGrowthPerTick(60, 2);
		expect(growth).toBeCloseTo(0.11667, 4); // (6 + 1.0) / 60 = 0.11667
	});

	it('calculates growth with zero labourers and zero cities', () => {
		const growth = calculatePopulationGrowthPerTick(0, 0);
		expect(growth).toBe(0);
	});

	it('calculates growth for small labour force', () => {
		const growth = calculatePopulationGrowthPerTick(10, 0);
		expect(growth).toBeCloseTo(0.01667, 4); // (10 / 10) / 60 = 0.01667
	});

	it('calculates growth for large labour force', () => {
		const growth = calculatePopulationGrowthPerTick(600, 0);
		expect(growth).toBe(1.0); // (600 / 10) / 60 = 1.0
	});

	it('calculates growth with single city', () => {
		const growth = calculatePopulationGrowthPerTick(30, 1);
		expect(growth).toBeCloseTo(0.05833, 4); // (3 + 0.5) / 60 = 0.05833
	});

	it('calculates growth with multiple cities', () => {
		const growth = calculatePopulationGrowthPerTick(100, 5);
		expect(growth).toBeCloseTo(0.20833, 4); // (10 + 2.5) / 60 = 0.20833
	});

	it('cities contribute 0.5 per city', () => {
		const growth1 = calculatePopulationGrowthPerTick(0, 1);
		const growth2 = calculatePopulationGrowthPerTick(0, 2);
		const growth3 = calculatePopulationGrowthPerTick(0, 3);

		expect(growth2).toBeCloseTo(growth1 * 2, 4);
		expect(growth3).toBeCloseTo(growth1 * 3, 4);
	});

	it('labourers contribute at 1/10 rate before time division', () => {
		const growth10 = calculatePopulationGrowthPerTick(10, 0);
		const growth20 = calculatePopulationGrowthPerTick(20, 0);

		expect(growth20).toBeCloseTo(growth10 * 2, 4);
	});

	it('handles fractional labourer contributions', () => {
		const growth = calculatePopulationGrowthPerTick(15, 0);
		expect(growth).toBeCloseTo(0.025, 4); // (15 / 10) / 60 = 0.025
	});
});

describe('Resource Generation with Ratio Integration', () => {
	it('calculates complete resource generation for balanced ratios', () => {
		// 100 population: 60% labour, 30% military, 10% spy
		const population = 100;
		const labourRatio = 60;
		const militaryRatio = 30;
		const spyRatio = 10;

		const labourers = calculateLabourers(population, labourRatio);
		expect(labourers).toBe(60);

		const military = calculateMilitaryFromRatio(population, militaryRatio);
		expect(military).toBe(30);

		const spies = calculateSpiesFromRatio(population, spyRatio);
		expect(spies).toBe(10);

		// Total should match population (but floor rounding may cause minor differences)
		const total = labourers + military + spies;
		expect(total).toBe(100);
	});

	it('calculates gold generation from ratio-based labourers', () => {
		const population = 100;
		const labourRatio = 50;

		const labourers = calculateLabourers(population, labourRatio);
		expect(labourers).toBe(50);

		const military = calculateMilitaryFromRatio(population, 30);
		const militaryUpkeep = calculateMilitaryUpkeep(military);

		const goldPerTick = calculateGoldPerTick(labourers, militaryUpkeep);
		expect(goldPerTick).toBe(7.0); // (50 / 5) - 3.0
	});

	it('calculates full economy tick with ratio-based allocation', () => {
		// 200 population: 50% labour, 40% military, 10% spy
		const population = 200;
		const labourers = calculateLabourers(population, 50);
		const military = calculateMilitaryFromRatio(population, 40);
		const spies = calculateSpiesFromRatio(population, 10);

		expect(labourers).toBe(100);
		expect(military).toBe(80);
		expect(spies).toBe(20);

		const militaryUpkeep = calculateMilitaryUpkeep(military);
		const spyUpkeep = calculateSpyUpkeep(spies);
		const totalUpkeep = calculateTotalUpkeep(militaryUpkeep, spyUpkeep);

		expect(totalUpkeep).toBe(12.0); // 8.0 + 4.0

		const goldPerTick = calculateGoldPerTick(labourers, totalUpkeep);
		expect(goldPerTick).toBe(8.0); // (100 / 5) - 12.0
	});

	it('calculates population growth from ratio-based labourers', () => {
		const population = 150;
		const labourRatio = 60;
		const cityCount = 3;

		const labourers = calculateLabourers(population, labourRatio);
		expect(labourers).toBe(90);

		const growth = calculatePopulationGrowthPerTick(labourers, cityCount);
		expect(growth).toBeCloseTo(0.175, 4); // (9 + 1.5) / 60
	});

	it('verifies higher labour ratio increases gold generation', () => {
		const population = 100;

		const labourers50 = calculateLabourers(population, 50);
		const gold50 = calculateGoldPerTick(labourers50, 0);

		const labourers75 = calculateLabourers(population, 75);
		const gold75 = calculateGoldPerTick(labourers75, 0);

		expect(gold75).toBeGreaterThan(gold50);
		expect(gold75).toBe(15.0); // 75 / 5
		expect(gold50).toBe(10.0); // 50 / 5
	});

	it('verifies higher labour ratio increases population growth', () => {
		const population = 100;
		const cityCount = 2;

		const labourers50 = calculateLabourers(population, 50);
		const growth50 = calculatePopulationGrowthPerTick(labourers50, cityCount);

		const labourers80 = calculateLabourers(population, 80);
		const growth80 = calculatePopulationGrowthPerTick(labourers80, cityCount);

		expect(growth80).toBeGreaterThan(growth50);
	});

	it('calculates resource allocation for economy-focused player', () => {
		// 90% labour, 5% military, 5% spy
		const population = 100;
		const labourers = calculateLabourers(population, 90);
		const military = calculateMilitaryFromRatio(population, 5);
		const spies = calculateSpiesFromRatio(population, 5);

		expect(labourers).toBe(90);
		expect(military).toBe(5);
		expect(spies).toBe(5);

		const militaryUpkeep = calculateMilitaryUpkeep(military);
		const spyUpkeep = calculateSpyUpkeep(spies);
		const totalUpkeep = calculateTotalUpkeep(militaryUpkeep, spyUpkeep);

		const goldPerTick = calculateGoldPerTick(labourers, totalUpkeep);
		expect(goldPerTick).toBe(16.5); // (90 / 5) - 1.5
	});

	it('calculates resource allocation for military-focused player', () => {
		// 40% labour, 55% military, 5% spy
		const population = 100;
		const labourers = calculateLabourers(population, 40);
		const military = calculateMilitaryFromRatio(population, 55);
		const spies = calculateSpiesFromRatio(population, 5);

		expect(labourers).toBe(40);
		expect(military).toBe(55);
		expect(spies).toBe(5);

		const militaryUpkeep = calculateMilitaryUpkeep(military);
		const spyUpkeep = calculateSpyUpkeep(spies);
		const totalUpkeep = calculateTotalUpkeep(militaryUpkeep, spyUpkeep);

		const goldPerTick = calculateGoldPerTick(labourers, totalUpkeep);
		expect(goldPerTick).toBe(1.5); // (40 / 5) - 6.5
	});

	it('calculates resource allocation for spy-focused player', () => {
		// 50% labour, 20% military, 30% spy
		const population = 100;
		const labourers = calculateLabourers(population, 50);
		const military = calculateMilitaryFromRatio(population, 20);
		const spies = calculateSpiesFromRatio(population, 30);

		expect(labourers).toBe(50);
		expect(military).toBe(20);
		expect(spies).toBe(30);

		const militaryUpkeep = calculateMilitaryUpkeep(military);
		const spyUpkeep = calculateSpyUpkeep(spies);
		const totalUpkeep = calculateTotalUpkeep(militaryUpkeep, spyUpkeep);

		const goldPerTick = calculateGoldPerTick(labourers, totalUpkeep);
		expect(goldPerTick).toBe(2.0); // (50 / 5) - 8.0
	});

	it('handles floor rounding with odd population numbers', () => {
		const population = 77;
		const labourers = calculateLabourers(population, 33);
		const military = calculateMilitaryFromRatio(population, 33);
		const spies = calculateSpiesFromRatio(population, 33);

		// Each ratio produces: 77 * 0.33 = 25.41, floored to 25
		expect(labourers).toBe(25);
		expect(military).toBe(25);
		expect(spies).toBe(25);

		// Total is 75, not 77 due to rounding
		const total = labourers + military + spies;
		expect(total).toBe(75);
	});

	it('verifies ratios totaling over 100% still work', () => {
		// Ratios might exceed 100% due to bugs, test handling
		const population = 100;

		// Each ratio independently calculates from full population
		const labourers = calculateLabourers(population, 60);
		const military = calculateMilitaryFromRatio(population, 60);

		expect(labourers).toBe(60);
		expect(military).toBe(60);
		// Total would be 120, exceeding population
	});

	it('calculates break-even point based on labour ratio', () => {
		const population = 100;
		const militaryCount = 50;
		const militaryUpkeep = calculateMilitaryUpkeep(militaryCount);

		// Need at least 5 * upkeep labourers to break even
		const requiredLabourers = militaryUpkeep * 5;
		expect(requiredLabourers).toBe(25);

		// Calculate required labour ratio
		const requiredRatio = (requiredLabourers / population) * 100;
		expect(requiredRatio).toBe(25);

		// Verify break-even
		const labourers = calculateLabourers(population, requiredRatio);
		const goldPerTick = calculateGoldPerTick(labourers, militaryUpkeep);
		expect(goldPerTick).toBe(0);
	});

	it('simulates ratio adjustment over time', () => {
		const population = 100;

		// Start with economy focus
		let labourRatio = 80;
		const labourers1 = calculateLabourers(population, labourRatio);
		const gold1 = calculateGoldPerTick(labourers1, 0);

		// Shift to military focus
		labourRatio = 40;
		const labourers2 = calculateLabourers(population, labourRatio);
		const military2 = calculateMilitaryFromRatio(population, 50);
		const upkeep2 = calculateMilitaryUpkeep(military2);
		const gold2 = calculateGoldPerTick(labourers2, upkeep2);

		expect(gold1).toBeGreaterThan(gold2);
		expect(gold1).toBe(16.0);
		expect(gold2).toBe(3.0);
	});
});

describe('Ratio Edge Cases', () => {
	it('handles very small population with ratios', () => {
		const population = 5;
		const labourers = calculateLabourers(population, 50);
		const military = calculateMilitaryFromRatio(population, 50);

		expect(labourers).toBe(2);
		expect(military).toBe(2);
	});

	it('handles single unit population', () => {
		const population = 1;
		const labourers = calculateLabourers(population, 100);
		const military = calculateMilitaryFromRatio(population, 100);

		expect(labourers).toBe(1);
		expect(military).toBe(1);
	});

	it('handles ratio that produces less than 1 unit', () => {
		const population = 5;
		const labourers = calculateLabourers(population, 10);

		expect(labourers).toBe(0); // Math.floor(5 * 0.1) = 0
	});

	it('handles very large population with ratios', () => {
		const population = 10000;
		const labourers = calculateLabourers(population, 60);
		const military = calculateMilitaryFromRatio(population, 30);
		const spies = calculateSpiesFromRatio(population, 10);

		expect(labourers).toBe(6000);
		expect(military).toBe(3000);
		expect(spies).toBe(1000);
	});

	it('handles zero ratio with population', () => {
		const population = 100;
		const labourers = calculateLabourers(population, 0);

		expect(labourers).toBe(0);

		const goldPerTick = calculateGoldPerTick(labourers, 0);
		expect(goldPerTick).toBe(0);
	});

	it('handles 100% single allocation', () => {
		const population = 100;
		const labourers = calculateLabourers(population, 100);
		const military = calculateMilitaryFromRatio(population, 0);
		const spies = calculateSpiesFromRatio(population, 0);

		expect(labourers).toBe(100);
		expect(military).toBe(0);
		expect(spies).toBe(0);
	});

	it('handles fractional ratio values', () => {
		const population = 100;
		const labourers = calculateLabourers(population, 33.33);

		expect(labourers).toBe(33); // Math.floor(100 * 0.3333) = 33
	});

	it('verifies rounding causes population "loss"', () => {
		const population = 100;
		const labourers = calculateLabourers(population, 33);
		const military = calculateMilitaryFromRatio(population, 33);
		const spies = calculateSpiesFromRatio(population, 33);

		const total = labourers + military + spies;
		expect(total).toBe(99); // Each floors to 33
		expect(total).toBeLessThan(population);
	});
});

describe('Spy Detection Constants', () => {
	it('has correct military detection rate', () => {
		expect(MILITARY_DETECTION_RATE).toBeCloseTo(0.01 / 60, 10);
	});

	it('has correct spy detection rate', () => {
		expect(SPY_DETECTION_RATE).toBeCloseTo(0.04 / 60, 10);
	});

	it('spy detection rate is 4x military detection rate', () => {
		expect(SPY_DETECTION_RATE).toBeCloseTo(MILITARY_DETECTION_RATE * 4, 10);
	});

	it('military detection is 1% per unit per minute', () => {
		// 1 unit has 1% chance per minute = 0.01 per minute
		// Per tick (1 second): 0.01 / 60
		expect(MILITARY_DETECTION_RATE).toBeCloseTo(0.01 / 60, 10);
	});

	it('spy detection is 4% per spy per minute', () => {
		// 1 spy has 4% chance per minute = 0.04 per minute
		// Per tick (1 second): 0.04 / 60
		expect(SPY_DETECTION_RATE).toBeCloseTo(0.04 / 60, 10);
	});
});

describe('calculateMilitaryDetectionChance', () => {
	it('returns zero when no enemy units present', () => {
		const chance = calculateMilitaryDetectionChance(0);
		expect(chance).toBe(0);
	});

	it('calculates detection chance for single military unit', () => {
		const chance = calculateMilitaryDetectionChance(1);
		expect(chance).toBeCloseTo(MILITARY_DETECTION_RATE, 10);
	});

	it('calculates detection chance for 10 military units', () => {
		const chance = calculateMilitaryDetectionChance(10);
		const expected = 1 - Math.pow(1 - MILITARY_DETECTION_RATE, 10);
		expect(chance).toBeCloseTo(expected, 10);
	});

	it('calculates detection chance for 60 military units (1% per minute)', () => {
		// 60 units * (0.01/60) per tick ≈ 1% chance per tick
		const chance = calculateMilitaryDetectionChance(60);
		expect(chance).toBeCloseTo(0.01, 3);
	});

	it('calculates detection chance for 100 military units', () => {
		const chance = calculateMilitaryDetectionChance(100);
		const expected = 1 - Math.pow(1 - MILITARY_DETECTION_RATE, 100);
		expect(chance).toBeCloseTo(expected, 10);
		expect(chance).toBeGreaterThan(0.01);
		expect(chance).toBeLessThan(0.02);
	});

	it('detection chance increases with more units', () => {
		const chance10 = calculateMilitaryDetectionChance(10);
		const chance20 = calculateMilitaryDetectionChance(20);
		const chance50 = calculateMilitaryDetectionChance(50);

		expect(chance20).toBeGreaterThan(chance10);
		expect(chance50).toBeGreaterThan(chance20);
	});

	it('detection chance is never greater than 1', () => {
		const chance = calculateMilitaryDetectionChance(10000);
		expect(chance).toBeLessThanOrEqual(1);
	});

	it('uses complement probability formula correctly', () => {
		// P(at least one detection) = 1 - P(no detections)
		// P(no detections) = (1 - p)^n
		const units = 25;
		const noDetectionChance = Math.pow(1 - MILITARY_DETECTION_RATE, units);
		const detectionChance = 1 - noDetectionChance;

		expect(calculateMilitaryDetectionChance(units)).toBeCloseTo(detectionChance, 10);
	});

	it('approximates linear growth for small numbers', () => {
		// For very small probabilities, (1 - p)^n ≈ 1 - np
		const units = 5;
		const chance = calculateMilitaryDetectionChance(units);
		const linearApprox = units * MILITARY_DETECTION_RATE;

		// Should be close for small n
		expect(chance).toBeCloseTo(linearApprox, 5);
	});
});

describe('calculateSpyDetectionChance', () => {
	it('returns zero when no enemy spies present', () => {
		const chance = calculateSpyDetectionChance(0);
		expect(chance).toBe(0);
	});

	it('calculates detection chance for single enemy spy', () => {
		const chance = calculateSpyDetectionChance(1);
		expect(chance).toBeCloseTo(SPY_DETECTION_RATE, 10);
	});

	it('calculates detection chance for 10 enemy spies', () => {
		const chance = calculateSpyDetectionChance(10);
		const expected = 1 - Math.pow(1 - SPY_DETECTION_RATE, 10);
		expect(chance).toBeCloseTo(expected, 10);
	});

	it('calculates detection chance for 15 enemy spies (1% per minute)', () => {
		// 15 spies * (0.04/60) per tick ≈ 1% chance per tick
		const chance = calculateSpyDetectionChance(15);
		expect(chance).toBeCloseTo(0.01, 3);
	});

	it('calculates detection chance for 25 enemy spies', () => {
		const chance = calculateSpyDetectionChance(25);
		const expected = 1 - Math.pow(1 - SPY_DETECTION_RATE, 25);
		expect(chance).toBeCloseTo(expected, 10);
		expect(chance).toBeGreaterThan(0.015);
	});

	it('detection chance increases with more spies', () => {
		const chance5 = calculateSpyDetectionChance(5);
		const chance10 = calculateSpyDetectionChance(10);
		const chance20 = calculateSpyDetectionChance(20);

		expect(chance10).toBeGreaterThan(chance5);
		expect(chance20).toBeGreaterThan(chance10);
	});

	it('detection chance is never greater than 1', () => {
		const chance = calculateSpyDetectionChance(10000);
		expect(chance).toBeLessThanOrEqual(1);
	});

	it('uses complement probability formula correctly', () => {
		// P(at least one detection) = 1 - P(no detections)
		const spies = 20;
		const noDetectionChance = Math.pow(1 - SPY_DETECTION_RATE, spies);
		const detectionChance = 1 - noDetectionChance;

		expect(calculateSpyDetectionChance(spies)).toBeCloseTo(detectionChance, 10);
	});

	it('spy detection is 4x more effective than military detection for same count', () => {
		const count = 10;
		const militaryChance = calculateMilitaryDetectionChance(count);
		const spyChance = calculateSpyDetectionChance(count);

		// Spy detection should be roughly 4x for small counts
		expect(spyChance).toBeGreaterThan(militaryChance * 3.9);
		expect(spyChance).toBeLessThan(militaryChance * 4.1);
	});
});

describe('Spy Detection Scenarios', () => {
	it('calculates detection for spy in lightly defended city', () => {
		// 5 military units, no counter-spies
		const militaryChance = calculateMilitaryDetectionChance(5);
		const spyChance = calculateSpyDetectionChance(0);

		expect(militaryChance).toBeCloseTo(5 * MILITARY_DETECTION_RATE, 5);
		expect(spyChance).toBe(0);
	});

	it('calculates detection for spy in heavily defended city', () => {
		// 50 military units, 10 counter-spies
		const militaryChance = calculateMilitaryDetectionChance(50);
		const spyChance = calculateSpyDetectionChance(10);

		expect(militaryChance).toBeGreaterThan(0.008);
		expect(spyChance).toBeGreaterThan(0.006);
		expect(militaryChance + spyChance).toBeLessThan(0.02);
	});

	it('calculates detection for spy in capital with military', () => {
		// Capital with 100 military units
		const militaryChance = calculateMilitaryDetectionChance(100);

		expect(militaryChance).toBeGreaterThan(0.016);
		expect(militaryChance).toBeLessThan(0.017);
	});

	it('calculates detection for spy in spy-heavy environment', () => {
		// 5 military, 20 enemy spies
		const militaryChance = calculateMilitaryDetectionChance(5);
		const spyChance = calculateSpyDetectionChance(20);

		// Spy detection should dominate
		expect(spyChance).toBeGreaterThan(militaryChance);
	});

	it('calculates survival probability for spy over time', () => {
		// Spy in city with 30 military units
		const militaryChance = calculateMilitaryDetectionChance(30);
		const survivalChancePerTick = 1 - militaryChance;

		// Survival over 60 ticks (1 minute)
		const survivalAfter60Ticks = Math.pow(survivalChancePerTick, 60);
		expect(survivalAfter60Ticks).toBeLessThan(1);
		expect(survivalAfter60Ticks).toBeGreaterThan(0.74); // ~74% survival over 60 seconds
		expect(survivalAfter60Ticks).toBeLessThan(0.75);
	});

	it('calculates expected time until detection', () => {
		// With 60 military units (1% per tick)
		const militaryChance = calculateMilitaryDetectionChance(60);

		// Expected time = 1 / probability
		const expectedTicks = 1 / militaryChance;
		expect(expectedTicks).toBeCloseTo(100, 0); // ~100 ticks = 100 seconds
	});

	it('compares military vs spy detection effectiveness', () => {
		// 60 military vs 15 spies (both ~1% per minute base rate)
		const militaryChance = calculateMilitaryDetectionChance(60);
		const spyChance = calculateSpyDetectionChance(15);

		// Should be roughly equal
		expect(militaryChance).toBeCloseTo(spyChance, 3);
	});

	it('calculates detection for balanced defense', () => {
		// Balanced defense: 30 military, 8 spies
		const militaryChance = calculateMilitaryDetectionChance(30);
		const spyChance = calculateSpyDetectionChance(8);

		expect(militaryChance).toBeGreaterThan(0.004);
		expect(spyChance).toBeGreaterThan(0.005);
	});

	it('verifies detection chances are independent', () => {
		// Detection checks happen separately in actual code
		const militaryChance = calculateMilitaryDetectionChance(20);
		const spyChance = calculateSpyDetectionChance(10);

		// Combined probability if both checked:
		// P(at least one) = 1 - P(neither) = 1 - (1-p1)(1-p2)
		const neitherDetect = (1 - militaryChance) * (1 - spyChance);
		const atLeastOne = 1 - neitherDetect;

		expect(atLeastOne).toBeGreaterThan(militaryChance);
		expect(atLeastOne).toBeGreaterThan(spyChance);
		expect(atLeastOne).toBeLessThan(militaryChance + spyChance);
	});

	it('calculates worst-case scenario for spy', () => {
		// Maximum realistic defense: 200 military, 50 spies
		const militaryChance = calculateMilitaryDetectionChance(200);
		const spyChance = calculateSpyDetectionChance(50);

		expect(militaryChance).toBeGreaterThan(0.03);
		expect(spyChance).toBeGreaterThan(0.03);

		// Very high detection chance
		const totalRisk = militaryChance + spyChance;
		expect(totalRisk).toBeGreaterThan(0.06);
	});

	it('calculates best-case scenario for spy', () => {
		// Minimal defense: 1 military, 0 spies
		const militaryChance = calculateMilitaryDetectionChance(1);
		const spyChance = calculateSpyDetectionChance(0);

		expect(militaryChance).toBeCloseTo(MILITARY_DETECTION_RATE, 10);
		expect(spyChance).toBe(0);

		// Very low detection chance
		expect(militaryChance).toBeLessThan(0.0002);
	});
});
