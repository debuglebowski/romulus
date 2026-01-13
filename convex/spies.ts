import { v } from 'convex/values';

import { mutation, query } from './_generated/server';
import { auth } from './auth';
import { coordKey, findPath } from './lib/hex';
import { getUpgradeModifiers } from './upgrades';

import type { Id } from './_generated/dataModel';

const TRAVEL_TIME_PER_HEX = 10000; // 10 seconds per hex (same as military)

export const getVisibleForPlayer = query({
	args: { gameId: v.id('games') },
	handler: async (ctx, { gameId }) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) {
			return null;
		}

		const player = await ctx.db
			.query('gamePlayers')
			.withIndex('by_gameId', (q) => q.eq('gameId', gameId))
			.filter((q) => q.eq(q.field('userId'), userId))
			.first();

		if (!player) {
			return null;
		}

		// Only return player's own spies (spies are invisible to enemies)
		const spies = await ctx.db
			.query('spies')
			.withIndex('by_ownerId', (q) => q.eq('ownerId', player._id))
			.collect();

		const allTiles = await ctx.db
			.query('tiles')
			.withIndex('by_gameId', (q) => q.eq('gameId', gameId))
			.collect();

		const tileMap = new Map(allTiles.map((t) => [t._id, t]));

		const now = Date.now();

		return spies.map((spy) => {
			const baseTile = tileMap.get(spy.tileId);
			if (!baseTile) {
				return null;
			}

			let currentQ = baseTile.q;
			let currentR = baseTile.r;

			// If moving, compute current position along path
			if (spy.targetTileId && spy.departureTime && spy.arrivalTime && spy.path && spy.path.length > 0) {
				const elapsed = now - spy.departureTime;
				const totalTime = spy.arrivalTime - spy.departureTime;
				const progress = Math.min(elapsed / totalTime, 1);

				// Which hex in the path are we at?
				const pathIndex = Math.min(Math.floor(progress * spy.path.length), spy.path.length - 1);
				const currentPathHex = spy.path[pathIndex];
				currentQ = currentPathHex.q;
				currentR = currentPathHex.r;
			}

			return {
				...spy,
				currentQ,
				currentR,
				isOwn: true,
			};
		}).filter((s) => s !== null);
	},
});

export const moveSpy = mutation({
	args: {
		spyId: v.id('spies'),
		targetTileId: v.id('tiles'),
	},
	handler: async (ctx, { spyId, targetTileId }) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) {
			throw new Error('Not authenticated');
		}

		const spy = await ctx.db.get(spyId);
		if (!spy) {
			throw new Error('Spy not found');
		}

		const player = await ctx.db.get(spy.ownerId);
		if (!player || player.userId !== userId) {
			throw new Error('Not your spy');
		}

		// Block when capital is moving (player is frozen)
		if (player.capitalMovingToTileId) {
			throw new Error('Cannot move spies while capital is relocating');
		}

		const currentTile = await ctx.db.get(spy.tileId);
		if (!currentTile) {
			throw new Error('Current tile not found');
		}

		const targetTile = await ctx.db.get(targetTileId);
		if (!targetTile) {
			throw new Error('Target tile not found');
		}

		if (spy.tileId === targetTileId) {
			throw new Error('Already at target');
		}

		// Get all tiles for pathfinding
		const allTiles = await ctx.db
			.query('tiles')
			.withIndex('by_gameId', (q) => q.eq('gameId', spy.gameId))
			.collect();

		const tileMap = new Map(allTiles.map((t) => [coordKey(t.q, t.r), t]));

		// Spies can traverse ANY territory (unlike military)
		const canTraverse = (coord: { q: number; r: number }) => {
			const tile = tileMap.get(coordKey(coord.q, coord.r));
			return tile !== undefined; // Just needs to exist
		};

		const path = findPath({ q: currentTile.q, r: currentTile.r }, { q: targetTile.q, r: targetTile.r }, canTraverse);

		if (!path) {
			throw new Error('No valid path to target');
		}

		// Fetch player's upgrades to apply spy speed bonus
		const playerUpgrades = await ctx.db
			.query('playerUpgrades')
			.withIndex('by_playerId', (q) => q.eq('playerId', spy.ownerId))
			.collect();

		const modifiers = getUpgradeModifiers(playerUpgrades.map((u) => u.upgradeId));
		const speedMultiplier = 1 - (modifiers.spySpeedBonus ?? 0); // Bonus reduces travel time

		const now = Date.now();
		const baseTravelTime = path.length * TRAVEL_TIME_PER_HEX;
		const travelTime = Math.round(baseTravelTime * speedMultiplier);

		await ctx.db.patch(spyId, {
			targetTileId,
			path,
			departureTime: now,
			arrivalTime: now + travelTime,
		});
	},
});

export const cancelMove = mutation({
	args: { spyId: v.id('spies') },
	handler: async (ctx, { spyId }) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) {
			throw new Error('Not authenticated');
		}

		const spy = await ctx.db.get(spyId);
		if (!spy) {
			throw new Error('Spy not found');
		}

		const player = await ctx.db.get(spy.ownerId);
		if (!player || player.userId !== userId) {
			throw new Error('Not your spy');
		}

		if (!spy.targetTileId || !spy.departureTime || !spy.arrivalTime || !spy.path) {
			throw new Error('Spy not moving');
		}

		const now = Date.now();
		const elapsed = now - spy.departureTime;
		const totalTime = spy.arrivalTime - spy.departureTime;
		const progress = Math.min(elapsed / totalTime, 1);

		// Find which hex the spy is currently at
		const pathIndex = Math.floor(progress * spy.path.length);
		const currentPathHex = pathIndex === 0 ? null : spy.path[pathIndex - 1];

		// Find the tile at the current path position
		let newTileId: Id<'tiles'> = spy.tileId;
		if (currentPathHex) {
			const tile = await ctx.db
				.query('tiles')
				.withIndex('by_gameId_coords', (q) => q.eq('gameId', spy.gameId).eq('q', currentPathHex.q).eq('r', currentPathHex.r))
				.first();
			if (tile) {
				newTileId = tile._id;
			}
		}

		await ctx.db.patch(spyId, {
			tileId: newTileId,
			targetTileId: undefined,
			path: undefined,
			departureTime: undefined,
			arrivalTime: undefined,
		});
	},
});

// Get intel for a tile if player has a spy there
export const getIntelForTile = query({
	args: {
		gameId: v.id('games'),
		tileId: v.id('tiles'),
	},
	handler: async (ctx, { gameId, tileId }) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) {
			return null;
		}

		const player = await ctx.db
			.query('gamePlayers')
			.withIndex('by_gameId', (q) => q.eq('gameId', gameId))
			.filter((q) => q.eq(q.field('userId'), userId))
			.first();

		if (!player) {
			return null;
		}

		// Check if player has a stationary spy on this tile
		const playerSpies = await ctx.db
			.query('spies')
			.withIndex('by_ownerId', (q) => q.eq('ownerId', player._id))
			.collect();

		const spyOnTile = playerSpies.find((s) => s.tileId === tileId && !s.targetTileId);
		if (!spyOnTile) {
			return null;
		}

		// Get tile info
		const tile = await ctx.db.get(tileId);
		if (!tile) {
			return null;
		}

		// If it's our own tile, no need for intel
		if (tile.ownerId === player._id) {
			return null;
		}

		// Get armies on this tile
		const armies = await ctx.db
			.query('armies')
			.withIndex('by_tileId', (q) => q.eq('tileId', tileId))
			.collect();

		// Filter to only stationary armies (not passing through)
		const stationaryArmies = armies.filter((a) => !a.targetTileId);

		// Get unit counts
		const units = await ctx.db
			.query('units')
			.withIndex('by_gameId', (q) => q.eq('gameId', gameId))
			.collect();

		const unitsByArmy = new Map<string, number>();
		for (const unit of units) {
			unitsByArmy.set(unit.armyId, (unitsByArmy.get(unit.armyId) ?? 0) + 1);
		}

		let totalArmies = 0;
		let totalUnits = 0;

		for (const army of stationaryArmies) {
			totalArmies++;
			totalUnits += unitsByArmy.get(army._id) ?? 0;
		}

		return {
			armyCount: totalArmies,
			unitCount: totalUnits,
			tileOwnerId: tile.ownerId,
		};
	},
});

// Get count of spies on a specific tile for the player
export const getSpiesOnTile = query({
	args: {
		gameId: v.id('games'),
		tileId: v.id('tiles'),
	},
	handler: async (ctx, { gameId, tileId }) => {
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

		const playerSpies = await ctx.db
			.query('spies')
			.withIndex('by_ownerId', (q) => q.eq('ownerId', player._id))
			.collect();

		// Return spies that are stationary on this tile
		return playerSpies
			.filter((s) => s.tileId === tileId && !s.targetTileId)
			.map((s) => ({
				_id: s._id,
				isRevealed: s.isRevealed,
			}));
	},
});

// Get allegiance breakdown for a tile if player has a spy there
export const getAllegianceForTile = query({
	args: {
		gameId: v.id('games'),
		tileId: v.id('tiles'),
	},
	handler: async (ctx, { gameId, tileId }) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) {
			return null;
		}

		const player = await ctx.db
			.query('gamePlayers')
			.withIndex('by_gameId', (q) => q.eq('gameId', gameId))
			.filter((q) => q.eq(q.field('userId'), userId))
			.first();

		if (!player) {
			return null;
		}

		// Check if player has a stationary spy on this tile
		const playerSpies = await ctx.db
			.query('spies')
			.withIndex('by_ownerId', (q) => q.eq('ownerId', player._id))
			.collect();

		const spyOnTile = playerSpies.find((s) => s.tileId === tileId && !s.targetTileId);
		if (!spyOnTile) {
			return null;
		}

		// Get tile info
		const tile = await ctx.db.get(tileId);
		if (!tile || (tile.type !== 'city' && tile.type !== 'capital')) {
			return null;
		}

		// If it's our own tile, show allegiance anyway (for monitoring loyalty)
		// Get all allegiance records for this tile
		const allegianceRecords = await ctx.db
			.query('cityAllegiance')
			.withIndex('by_tileId', (q) => q.eq('tileId', tileId))
			.collect();

		// Get all players to map IDs to colors
		const allPlayers = await ctx.db
			.query('gamePlayers')
			.withIndex('by_gameId', (q) => q.eq('gameId', gameId))
			.collect();

		const playerMap = new Map(allPlayers.map((p) => [p._id, p]));

		// Build allegiance breakdown
		const breakdown = allegianceRecords.map((a) => {
			const teamPlayer = playerMap.get(a.teamId);
			return {
				teamId: a.teamId,
				score: a.score,
				color: teamPlayer?.color ?? '#888888',
				isOwner: a.teamId === tile.ownerId,
				isMe: a.teamId === player._id,
			};
		}).sort((a, b) => b.score - a.score);

		return {
			tileOwnerId: tile.ownerId,
			tileType: tile.type,
			breakdown,
		};
	},
});

// Get capital intel progress for all enemy players
export const getCapitalIntel = query({
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

		// Get all intel progress for this player
		const intelProgress = await ctx.db
			.query('capitalIntelProgress')
			.withIndex('by_spyOwnerId', (q) => q.eq('spyOwnerId', player._id))
			.collect();

		// Get all players to get their economy data for intel display
		const allPlayers = await ctx.db
			.query('gamePlayers')
			.withIndex('by_gameId', (q) => q.eq('gameId', gameId))
			.collect();

		const playerMap = new Map(allPlayers.map((p) => [p._id, p]));

		// Get known enemy upgrades for this player
		const knownUpgrades = await ctx.db
			.query('knownEnemyUpgrades')
			.withIndex('by_playerId', (q) => q.eq('playerId', player._id))
			.collect();

		// Build intel map: enemyPlayerId -> Set<upgradeId>
		const knownUpgradesByEnemy = new Map<string, Set<string>>();
		for (const known of knownUpgrades) {
			const upgradeSet = knownUpgradesByEnemy.get(known.enemyPlayerId) ?? new Set();
			upgradeSet.add(known.upgradeId);
			knownUpgradesByEnemy.set(known.enemyPlayerId, upgradeSet);
		}

		const now = Date.now();
		const INTEL_TIER_DURATION_MS = 3 * 60 * 1000; // 3 minutes per tier

		// Build intel results
		return intelProgress.map((progress) => {
			const targetPlayer = playerMap.get(progress.targetPlayerId);
			if (!targetPlayer) {
				return null;
			}

			// Calculate current tier based on time elapsed
			const timeElapsed = now - progress.startedAt;
			const currentTier = Math.min(5, Math.floor(timeElapsed / INTEL_TIER_DURATION_MS));
			const nextTierTime = (currentTier + 1) * INTEL_TIER_DURATION_MS - timeElapsed;

			// Intel tiers: 0=nothing, 1=gold, 2=pop, 3=upgrades, 4=armies, 5=spies
			const knownUpgradeIds = [...(knownUpgradesByEnemy.get(progress.targetPlayerId) ?? [])];

			return {
				targetPlayerId: progress.targetPlayerId,
				targetColor: targetPlayer.color,
				currentTier,
				nextTierTime: currentTier < 5 ? nextTierTime : null,
				// Tier 1+: Gold
				gold: currentTier >= 1 ? targetPlayer.gold ?? 0 : null,
				// Tier 2+: Population
				population: currentTier >= 2 ? targetPlayer.population ?? 0 : null,
				// Tier 3+: Upgrades (revealed via knownEnemyUpgrades)
				upgrades: currentTier >= 3 ? knownUpgradeIds : null,
				// Tier 4+: Army counts (need to query)
				// Tier 5+: Spy counts (need to query)
				// We'll compute these if needed
			};
		}).filter((r) => r !== null);
	},
});

// Get full capital intel details for a specific enemy player
export const getCapitalIntelDetails = query({
	args: {
		gameId: v.id('games'),
		targetPlayerId: v.id('gamePlayers'),
	},
	handler: async (ctx, { gameId, targetPlayerId }) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) {
			return null;
		}

		const player = await ctx.db
			.query('gamePlayers')
			.withIndex('by_gameId', (q) => q.eq('gameId', gameId))
			.filter((q) => q.eq(q.field('userId'), userId))
			.first();

		if (!player) {
			return null;
		}

		// Get intel progress for this specific target
		const progress = await ctx.db
			.query('capitalIntelProgress')
			.withIndex('by_spyOwnerId_targetPlayerId', (q) => q.eq('spyOwnerId', player._id).eq('targetPlayerId', targetPlayerId))
			.first();

		if (!progress) {
			return null;
		}

		const targetPlayer = await ctx.db.get(targetPlayerId);
		if (!targetPlayer) {
			return null;
		}

		const now = Date.now();
		const INTEL_TIER_DURATION_MS = 3 * 60 * 1000;
		const timeElapsed = now - progress.startedAt;
		const currentTier = Math.min(5, Math.floor(timeElapsed / INTEL_TIER_DURATION_MS));

		// Get known upgrades
		const knownUpgrades = await ctx.db
			.query('knownEnemyUpgrades')
			.withIndex('by_playerId_enemyPlayerId', (q) => q.eq('playerId', player._id).eq('enemyPlayerId', targetPlayerId))
			.collect();

		// For tier 4+: Get army count
		let armyCount = null;
		let totalUnits = null;
		if (currentTier >= 4) {
			const armies = await ctx.db
				.query('armies')
				.withIndex('by_ownerId', (q) => q.eq('ownerId', targetPlayerId))
				.collect();

			armyCount = armies.length;

			const units = await ctx.db
				.query('units')
				.withIndex('by_gameId', (q) => q.eq('gameId', gameId))
				.collect();

			const armyIds = new Set(armies.map((a) => a._id));
			totalUnits = units.filter((u) => armyIds.has(u.armyId)).length;
		}

		// For tier 5: Get spy count
		let spyCount = null;
		if (currentTier >= 5) {
			const spies = await ctx.db
				.query('spies')
				.withIndex('by_ownerId', (q) => q.eq('ownerId', targetPlayerId))
				.collect();

			spyCount = spies.length;
		}

		return {
			targetPlayerId,
			targetColor: targetPlayer.color,
			currentTier,
			startedAt: progress.startedAt,
			gold: currentTier >= 1 ? targetPlayer.gold ?? 0 : null,
			population: currentTier >= 2 ? targetPlayer.population ?? 0 : null,
			upgrades: currentTier >= 3 ? knownUpgrades.map((u) => u.upgradeId) : null,
			armyCount,
			totalUnits,
			spyCount,
		};
	},
});
