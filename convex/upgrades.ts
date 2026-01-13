import { v } from 'convex/values';

import { mutation, query } from './_generated/server';
import { auth } from './auth';
import { getUpgradeModifiers, UPGRADE_DEFINITIONS, UPGRADE_MAP } from './lib/upgradeDefinitions';

import type { Doc, Id } from './_generated/dataModel';
import type { UpgradeEffects } from './lib/upgradeDefinitions';

// Re-export shared definitions for other server modules
export * from './lib/upgradeDefinitions';

// Query: Get player's purchased upgrades
export const getMyUpgrades = query({
	args: { gameId: v.id('games') },
	handler: async (ctx, { gameId }) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) {
			return { upgrades: [], modifiers: getUpgradeModifiers([]) };
		}

		const player = await ctx.db
			.query('gamePlayers')
			.withIndex('by_gameId', (q) => q.eq('gameId', gameId))
			.filter((q) => q.eq(q.field('userId'), userId))
			.first();

		if (!player) {
			return { upgrades: [], modifiers: getUpgradeModifiers([]) };
		}

		const purchasedUpgrades = await ctx.db
			.query('playerUpgrades')
			.withIndex('by_playerId', (q) => q.eq('playerId', player._id))
			.collect();

		const upgradeIds = purchasedUpgrades.map((u) => u.upgradeId);
		const modifiers = getUpgradeModifiers(upgradeIds);

		return {
			upgrades: purchasedUpgrades,
			modifiers,
		};
	},
});

// Query: Get all upgrade definitions (for UI)
export const getUpgradeDefinitions = query({
	args: {},
	handler: async () => {
		return UPGRADE_DEFINITIONS;
	},
});

// Mutation: Purchase an upgrade
export const purchaseUpgrade = mutation({
	args: {
		gameId: v.id('games'),
		upgradeId: v.string(),
	},
	handler: async (ctx, { gameId, upgradeId }) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) {
			throw new Error('Not authenticated');
		}

		const game = await ctx.db.get(gameId);
		if (!game || game.status !== 'inProgress') {
			throw new Error('Game not in progress');
		}

		const player = await ctx.db
			.query('gamePlayers')
			.withIndex('by_gameId', (q) => q.eq('gameId', gameId))
			.filter((q) => q.eq(q.field('userId'), userId))
			.first();

		if (!player) {
			throw new Error('Not in game');
		}

		if (player.eliminatedAt) {
			throw new Error('Player is eliminated');
		}

		// Block when capital is moving
		if (player.capitalMovingToTileId) {
			throw new Error('Cannot purchase upgrades while capital is relocating');
		}

		// Validate upgrade exists
		const upgrade = UPGRADE_MAP.get(upgradeId);
		if (!upgrade) {
			throw new Error('Invalid upgrade');
		}

		// Check if already purchased
		const existing = await ctx.db
			.query('playerUpgrades')
			.withIndex('by_playerId_upgradeId', (q) => q.eq('playerId', player._id).eq('upgradeId', upgradeId))
			.first();

		if (existing) {
			throw new Error('Upgrade already purchased');
		}

		// Get current purchased upgrades for prerequisite check
		const purchasedUpgrades = await ctx.db
			.query('playerUpgrades')
			.withIndex('by_playerId', (q) => q.eq('playerId', player._id))
			.collect();

		const purchasedIds = new Set(purchasedUpgrades.map((u) => u.upgradeId));

		// Check prerequisites
		for (const prereq of upgrade.prerequisites) {
			if (!purchasedIds.has(prereq)) {
				const prereqUpgrade = UPGRADE_MAP.get(prereq);
				throw new Error(`Requires: ${prereqUpgrade?.name ?? prereq}`);
			}
		}

		// Check population requirement (total units = pop + military)
		const armies = await ctx.db
			.query('armies')
			.withIndex('by_ownerId', (q) => q.eq('ownerId', player._id))
			.collect();

		const units = await ctx.db
			.query('units')
			.withIndex('by_gameId', (q) => q.eq('gameId', gameId))
			.collect();

		const unitsByArmy = new Map<string, number>();
		for (const unit of units) {
			unitsByArmy.set(unit.armyId, (unitsByArmy.get(unit.armyId) ?? 0) + 1);
		}

		const totalMilitary = armies.reduce((sum, a) => sum + (unitsByArmy.get(a._id) ?? 0), 0);
		const totalUnits = (player.population ?? 0) + totalMilitary;

		if (totalUnits < upgrade.populationRequired) {
			throw new Error(`Requires ${upgrade.populationRequired} population (have ${totalUnits})`);
		}

		// Check gold
		const currentGold = player.gold ?? 0;
		if (currentGold < upgrade.goldCost) {
			throw new Error(`Not enough gold (need ${upgrade.goldCost}, have ${Math.floor(currentGold)})`);
		}

		// Deduct gold and create upgrade record
		await ctx.db.patch(player._id, {
			gold: currentGold - upgrade.goldCost,
		});

		await ctx.db.insert('playerUpgrades', {
			gameId,
			playerId: player._id,
			upgradeId,
			purchasedAt: Date.now(),
		});

		return { success: true };
	},
});

// Helper function to get upgrade modifiers for a player (used by other modules)
export async function getPlayerUpgradeModifiers(
	ctx: {
		db: {
			query: (table: 'playerUpgrades') => {
				withIndex: (
					name: 'by_playerId',
					fn: (q: { eq: (field: 'playerId', value: Id<'gamePlayers'>) => unknown }) => unknown,
				) => { collect: () => Promise<Doc<'playerUpgrades'>[]> };
			};
		};
	},
	playerId: Id<'gamePlayers'>,
): Promise<UpgradeEffects> {
	const purchasedUpgrades = await ctx.db
		.query('playerUpgrades')
		.withIndex('by_playerId', (q) => q.eq('playerId', playerId))
		.collect();

	return getUpgradeModifiers(purchasedUpgrades.map((u) => u.upgradeId));
}

// Query: Get known enemy upgrades (revealed through combat or capital intel)
export const getKnownEnemyUpgrades = query({
	args: { gameId: v.id('games') },
	handler: async (ctx, { gameId }) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) {
			return [];
		}

		const player = await ctx.db
			.query('gamePlayers')
			.withIndex('by_gameId', (q) => q.eq('gameId', gameId))
			.filter((q) => q.eq(q.field('userId'), userId))
			.first();

		if (!player) {
			return [];
		}

		const knownUpgrades = await ctx.db
			.query('knownEnemyUpgrades')
			.withIndex('by_playerId', (q) => q.eq('playerId', player._id))
			.collect();

		// Group by enemy player
		const byEnemy = new Map<string, { upgradeId: string; revealSource: string; revealedAt: number }[]>();
		for (const known of knownUpgrades) {
			const list = byEnemy.get(known.enemyPlayerId) ?? [];
			list.push({
				upgradeId: known.upgradeId,
				revealSource: known.revealSource,
				revealedAt: known.revealedAt,
			});
			byEnemy.set(known.enemyPlayerId, list);
		}

		// Convert to array format
		return Array.from(byEnemy.entries()).map(([enemyPlayerId, upgrades]) => ({
			enemyPlayerId,
			upgrades,
		}));
	},
});

// Query: Get capital intel progress for the current player
export const getCapitalIntelProgress = query({
	args: { gameId: v.id('games') },
	handler: async (ctx, { gameId }) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) {
			return [];
		}

		const player = await ctx.db
			.query('gamePlayers')
			.withIndex('by_gameId', (q) => q.eq('gameId', gameId))
			.filter((q) => q.eq(q.field('userId'), userId))
			.first();

		if (!player) {
			return [];
		}

		const intelProgress = await ctx.db
			.query('capitalIntelProgress')
			.withIndex('by_spyOwnerId', (q) => q.eq('spyOwnerId', player._id))
			.collect();

		return intelProgress.map((progress) => ({
			targetPlayerId: progress.targetPlayerId,
			startedAt: progress.startedAt,
			currentTier: progress.currentTier,
		}));
	},
});
