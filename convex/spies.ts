import { v } from 'convex/values';

import { mutation, query } from './_generated/server';
import { auth } from './auth';
import { coordKey, findPath } from './lib/hex';
import { TRAVEL_TIME_PER_HEX } from './lib/spyMovement';
import { CAPITAL_INTEL_TIER_TIME, CAPITAL_INTEL_MAX_TIER } from './lib/economy';

import type { Id } from './_generated/dataModel';

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

		const now = Date.now();
		const travelTime = path.length * TRAVEL_TIME_PER_HEX;

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

// Get capital intel for enemy capitals the player is spying on
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

		if (intelProgress.length === 0) {
			return [];
		}

		// Get all tiles to find capitals
		const allTiles = await ctx.db
			.query('tiles')
			.withIndex('by_gameId', (q) => q.eq('gameId', gameId))
			.collect();

		// Get player's spies
		const playerSpies = await ctx.db
			.query('spies')
			.withIndex('by_ownerId', (q) => q.eq('ownerId', player._id))
			.collect();

		const results = [];

		for (const progress of intelProgress) {
			// Find target player
			const targetPlayer = await ctx.db.get(progress.targetPlayerId);
			if (!targetPlayer) {
				continue;
			}

			// Find target player's capital
			const targetCapital = allTiles.find(
				(t) => t.type === 'capital' && t.ownerId === progress.targetPlayerId,
			);

			// Count active spies at the capital (stationary, not moving, not revealed)
			const spiesAtCapital = targetCapital
				? playerSpies.filter(
					(s) => s.tileId === targetCapital._id && !s.targetTileId && !s.isRevealed,
				)
				: [];

			const spyCount = spiesAtCapital.length;

			// Calculate current tier from accumulated time
			const currentTier = Math.min(
				Math.floor(progress.accumulatedTime / CAPITAL_INTEL_TIER_TIME),
				CAPITAL_INTEL_MAX_TIER,
			);

			// Only show intel if we have progress (tier > 0) or spies currently present
			if (currentTier === 0 && spyCount === 0) {
				continue;
			}

			// Calculate next tier time
			let nextTierTime: number | null = null;
			if (spyCount > 0 && currentTier < CAPITAL_INTEL_MAX_TIER) {
				const nextTierThreshold = (currentTier + 1) * CAPITAL_INTEL_TIER_TIME;
				const remainingTime = nextTierThreshold - progress.accumulatedTime;
				nextTierTime = remainingTime / spyCount; // ms until next tier
			}

			// Fetch data based on tier
			let gold: number | null = null;
			let population: number | null = null;
			let upgrades: string[] | null = null;

			if (currentTier >= 1) {
				gold = targetPlayer.gold ?? 0;
			}

			if (currentTier >= 2) {
				population = targetPlayer.population ?? 0;
			}

			if (currentTier >= 3) {
				const targetUpgrades = await ctx.db
					.query('playerUpgrades')
					.withIndex('by_playerId', (q) => q.eq('playerId', progress.targetPlayerId))
					.collect();
				upgrades = targetUpgrades.map((u) => u.upgradeId);
			}

			results.push({
				targetPlayerId: progress.targetPlayerId,
				targetColor: targetPlayer.color,
				currentTier,
				nextTierTime,
				gold,
				population,
				upgrades,
			});
		}

		return results;
	},
});

// Get allegiance data for a tile if player has spy there
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

		// Verify player has spy on tile
		const spyOnTile = await ctx.db
			.query('spies')
			.withIndex('by_ownerId', (q) => q.eq('ownerId', player._id))
			.filter((q) => q.eq(q.field('tileId'), tileId))
			.filter((q) => q.eq(q.field('targetTileId'), undefined))
			.first();

		if (!spyOnTile) {
			return null;
		}

		const tile = await ctx.db.get(tileId);
		if (!tile || tile.type !== 'city') {
			return null;
		}

		// Get allegiance records
		const allegiances = await ctx.db
			.query('cityAllegiance')
			.withIndex('by_tileId', (q) => q.eq('tileId', tileId))
			.collect();

		// Get player colors
		const allPlayers = await ctx.db
			.query('gamePlayers')
			.withIndex('by_gameId', (q) => q.eq('gameId', gameId))
			.collect();

		const playerMap = new Map(allPlayers.map((p) => [p._id, p]));

		const breakdown = allegiances.map((a) => {
			const teamPlayer = playerMap.get(a.teamId);
			return {
				teamId: a.teamId,
				score: a.score,
				color: teamPlayer?.color ?? '#888',
				isOwner: tile.ownerId === a.teamId,
				isMe: a.teamId === player._id,
			};
		});

		return {
			tileOwnerId: tile.ownerId,
			tileType: tile.type as 'city' | 'capital',
			breakdown,
		};
	},
});
