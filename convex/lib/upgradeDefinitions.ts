// Upgrade category types
export type UpgradeCategory = 'military' | 'spy' | 'economy' | 'movement';

// Upgrade effect types
export interface UpgradeEffects {
	strengthBonus?: number; // +% to unit strength
	defenseBonus?: number; // +% to unit defense
	spyEvasionBonus?: number; // -% to detection chance
	spyDetectionBonus?: number; // +% to detecting enemy spies
	labourEfficiencyBonus?: number; // +% to gold production
	popGrowthBonus?: number; // +% to population growth
	armySpeedBonus?: number; // -% to army travel time
	spySpeedBonus?: number; // -% to spy travel time
}

export interface UpgradeDefinition {
	id: string;
	name: string;
	description: string;
	category: UpgradeCategory;
	goldCost: number;
	populationRequired: number;
	prerequisites: string[];
	effects: UpgradeEffects;
}

// All upgrade definitions
export const UPGRADE_DEFINITIONS: UpgradeDefinition[] = [
	// Military - Strength branch
	{
		id: 'military_strength_1',
		name: 'Sharpened Blades',
		description: '+10% unit attack strength',
		category: 'military',
		goldCost: 50,
		populationRequired: 20,
		prerequisites: [],
		effects: { strengthBonus: 0.1 },
	},
	{
		id: 'military_strength_2',
		name: 'Forged Steel',
		description: '+20% unit attack strength',
		category: 'military',
		goldCost: 100,
		populationRequired: 40,
		prerequisites: ['military_strength_1'],
		effects: { strengthBonus: 0.2 },
	},
	// Military - Defense branch
	{
		id: 'military_defense_1',
		name: 'Reinforced Armor',
		description: '+10% unit defense',
		category: 'military',
		goldCost: 50,
		populationRequired: 20,
		prerequisites: [],
		effects: { defenseBonus: 0.1 },
	},
	{
		id: 'military_defense_2',
		name: 'Tower Shields',
		description: '+20% unit defense',
		category: 'military',
		goldCost: 100,
		populationRequired: 40,
		prerequisites: ['military_defense_1'],
		effects: { defenseBonus: 0.2 },
	},
	// Spy - Evasion branch
	{
		id: 'spy_evasion_1',
		name: 'Shadow Training',
		description: '-25% spy detection chance',
		category: 'spy',
		goldCost: 40,
		populationRequired: 15,
		prerequisites: [],
		effects: { spyEvasionBonus: 0.25 },
	},
	{
		id: 'spy_evasion_2',
		name: 'Master of Disguise',
		description: '-50% spy detection chance',
		category: 'spy',
		goldCost: 80,
		populationRequired: 30,
		prerequisites: ['spy_evasion_1'],
		effects: { spyEvasionBonus: 0.5 },
	},
	// Spy - Detection branch
	{
		id: 'spy_detection_1',
		name: 'Counter-Intelligence',
		description: '+50% enemy spy detection',
		category: 'spy',
		goldCost: 40,
		populationRequired: 15,
		prerequisites: [],
		effects: { spyDetectionBonus: 0.5 },
	},
	// Economy - Labour efficiency branch
	{
		id: 'labour_efficiency_1',
		name: 'Efficient Tools',
		description: '+20% gold production',
		category: 'economy',
		goldCost: 40,
		populationRequired: 15,
		prerequisites: [],
		effects: { labourEfficiencyBonus: 0.2 },
	},
	{
		id: 'labour_efficiency_2',
		name: 'Advanced Workshops',
		description: '+40% gold production',
		category: 'economy',
		goldCost: 80,
		populationRequired: 30,
		prerequisites: ['labour_efficiency_1'],
		effects: { labourEfficiencyBonus: 0.4 },
	},
	// Economy - Population growth branch
	{
		id: 'pop_growth_1',
		name: 'Fertile Lands',
		description: '+25% population growth',
		category: 'economy',
		goldCost: 30,
		populationRequired: 10,
		prerequisites: [],
		effects: { popGrowthBonus: 0.25 },
	},
	{
		id: 'pop_growth_2',
		name: 'Bountiful Harvests',
		description: '+50% population growth',
		category: 'economy',
		goldCost: 60,
		populationRequired: 25,
		prerequisites: ['pop_growth_1'],
		effects: { popGrowthBonus: 0.5 },
	},
	// Movement - Army speed branch
	{
		id: 'army_speed_1',
		name: 'Forced March',
		description: '-20% army travel time',
		category: 'movement',
		goldCost: 40,
		populationRequired: 20,
		prerequisites: [],
		effects: { armySpeedBonus: 0.2 },
	},
	{
		id: 'army_speed_2',
		name: 'Swift Legions',
		description: '-40% army travel time',
		category: 'movement',
		goldCost: 80,
		populationRequired: 40,
		prerequisites: ['army_speed_1'],
		effects: { armySpeedBonus: 0.4 },
	},
	// Movement - Spy speed
	{
		id: 'spy_speed_1',
		name: 'Secret Passages',
		description: '-20% spy travel time',
		category: 'movement',
		goldCost: 30,
		populationRequired: 15,
		prerequisites: [],
		effects: { spySpeedBonus: 0.2 },
	},
];

// Map for quick lookup
export const UPGRADE_MAP = new Map(UPGRADE_DEFINITIONS.map((u) => [u.id, u]));

// Helper to compute aggregate modifiers from a list of purchased upgrades
export function getUpgradeModifiers(purchasedUpgradeIds: string[]): UpgradeEffects {
	const modifiers: UpgradeEffects = {
		strengthBonus: 0,
		defenseBonus: 0,
		spyEvasionBonus: 0,
		spyDetectionBonus: 0,
		labourEfficiencyBonus: 0,
		popGrowthBonus: 0,
		armySpeedBonus: 0,
		spySpeedBonus: 0,
	};

	for (const upgradeId of purchasedUpgradeIds) {
		const upgrade = UPGRADE_MAP.get(upgradeId);
		if (!upgrade) {
			continue;
		}

		for (const [key, value] of Object.entries(upgrade.effects)) {
			if (value !== undefined) {
				modifiers[key as keyof UpgradeEffects] = (modifiers[key as keyof UpgradeEffects] ?? 0) + value;
			}
		}
	}

	return modifiers;
}
