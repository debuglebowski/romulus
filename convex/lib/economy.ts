// Economy calculation functions extracted for testability

export const UPKEEP_PER_UNIT = 0.1; // gold/sec per military unit
export const UPKEEP_PER_SPY = 0.2; // gold/sec per spy

export function calculateMilitaryUpkeep(totalMilitary: number): number {
	return totalMilitary * UPKEEP_PER_UNIT;
}

export function calculateSpyUpkeep(spyCount: number): number {
	return spyCount * UPKEEP_PER_SPY;
}

export function calculateTotalUpkeep(militaryUpkeep: number, spyUpkeep: number): number {
	return militaryUpkeep + spyUpkeep;
}

export function calculateGoldPerTick(labourers: number, upkeepCost: number): number {
	return labourers / 5 - upkeepCost;
}

export function calculateLabourers(population: number, labourRatio: number): number {
	return Math.floor(population * (labourRatio / 100));
}

export function calculateMilitaryFromRatio(population: number, militaryRatio: number): number {
	return Math.floor(population * (militaryRatio / 100));
}

export function calculateSpiesFromRatio(population: number, spyRatio: number): number {
	return Math.floor(population * (spyRatio / 100));
}

export function calculatePopulationGrowthPerTick(labourers: number, cityCount: number): number {
	return (labourers / 10 + cityCount * 0.5) / 45; // 1.33x speed (was / 60)
}

// Spy detection
export const MILITARY_DETECTION_RATE = 0.01 / 60; // 1% per unit per minute
export const SPY_DETECTION_RATE = 0.04 / 60; // 4% per spy per minute

// Capital intel
export const CAPITAL_INTEL_TIER_TIME = 180000; // 3 min per tier
export const CAPITAL_INTEL_MAX_TIER = 5;

// Allegiance system (Phase 6)
export const ALLEGIANCE_UPDATE_INTERVAL = 7500; // 7.5 seconds (1.33x speed)
export const ALLEGIANCE_NATURAL_DRIFT_OWNER = 1; // owner +1 per 10s
export const ALLEGIANCE_NATURAL_DRIFT_OTHER = -1; // others -1 per 10s
export const ALLEGIANCE_SPY_INFLUENCE_OWNER = -2; // owner -2 per spy per 10s
export const ALLEGIANCE_SPY_INFLUENCE_SPY_TEAM = 1; // spy team +1 per spy per 10s
export const ALLEGIANCE_FLIP_THRESHOLD = 20; // minimum score to flip city

export function calculateMilitaryDetectionChance(enemyUnitCount: number): number {
	return 1 - Math.pow(1 - MILITARY_DETECTION_RATE, enemyUnitCount);
}

export function calculateSpyDetectionChance(enemySpyCount: number): number {
	return 1 - Math.pow(1 - SPY_DETECTION_RATE, enemySpyCount);
}
