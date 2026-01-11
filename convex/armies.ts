import { v } from 'convex/values';

import { mutation, query } from './_generated/server';
import { auth } from './auth';
import { computeVisibleCoords, coordKey, findPath } from './lib/hex';

import type { Id } from './_generated/dataModel';

const TRAVEL_TIME_PER_HEX = 10000; // 10 seconds per hex

export const getForGame = query({
	args: { gameId: v.id('games') },
	handler: async (ctx, { gameId }) => {
		return ctx.db
			.query('armies')
			.withIndex('by_gameId', (q) => q.eq('gameId', gameId))
			.collect();
	},
});

export const getForPlayer = query({
	args: { gamePlayerId: v.id('gamePlayers') },
	handler: async (ctx, { gamePlayerId }) => {
		return ctx.db
			.query('armies')
			.withIndex('by_ownerId', (q) => q.eq('ownerId', gamePlayerId))
			.collect();
	},
});

export const moveArmy = mutation({
	args: {
		armyId: v.id('armies'),
		targetTileId: v.id('tiles'),
		count: v.optional(v.number()),
	},
	handler: async (ctx, { armyId, targetTileId, count }) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) {
			throw new Error('Not authenticated');
		}

		const army = await ctx.db.get(armyId);
		if (!army) {
			throw new Error('Army not found');
		}

		const player = await ctx.db.get(army.ownerId);
		if (!player || player.userId !== userId) {
			throw new Error('Not your army');
		}

		const currentTile = await ctx.db.get(army.tileId);
		if (!currentTile) {
			throw new Error('Current tile not found');
		}

		const targetTile = await ctx.db.get(targetTileId);
		if (!targetTile) {
			throw new Error('Target tile not found');
		}

		if (army.tileId === targetTileId) {
			throw new Error('Already at target');
		}

		// Validate count
		const unitsToMove = count ?? army.count;
		if (unitsToMove < 1) {
			throw new Error('Must move at least 1 unit');
		}
		if (unitsToMove > army.count) {
			throw new Error('Not enough units');
		}

		// Get all tiles for pathfinding
		const allTiles = await ctx.db
			.query('tiles')
			.withIndex('by_gameId', (q) => q.eq('gameId', army.gameId))
			.collect();

		const tileMap = new Map(allTiles.map((t) => [coordKey(t.q, t.r), t]));

		// Can only traverse owned or neutral tiles (not enemy tiles except destination)
		const canTraverse = (coord: { q: number; r: number }) => {
			const tile = tileMap.get(coordKey(coord.q, coord.r));
			if (!tile) {
				return false;
			}
			// Can traverse if unowned or owned by self
			// Can also traverse to enemy tile if it's the destination
			if (coord.q === targetTile.q && coord.r === targetTile.r) {
				return true;
			}
			return tile.ownerId === undefined || tile.ownerId === army.ownerId;
		};

		const path = findPath({ q: currentTile.q, r: currentTile.r }, { q: targetTile.q, r: targetTile.r }, canTraverse);

		if (!path) {
			throw new Error('No valid path to target');
		}

		const now = Date.now();
		const travelTime = path.length * TRAVEL_TIME_PER_HEX;

		if (unitsToMove < army.count) {
			// Split the army: reduce original, create new moving army
			await ctx.db.patch(armyId, {
				count: army.count - unitsToMove,
			});

			await ctx.db.insert('armies', {
				gameId: army.gameId,
				ownerId: army.ownerId,
				tileId: army.tileId,
				count: unitsToMove,
				targetTileId,
				path,
				departureTime: now,
				arrivalTime: now + travelTime,
			});
		} else {
			// Move the entire army
			await ctx.db.patch(armyId, {
				targetTileId,
				path,
				departureTime: now,
				arrivalTime: now + travelTime,
			});
		}
	},
});

export const cancelMove = mutation({
	args: { armyId: v.id('armies') },
	handler: async (ctx, { armyId }) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) {
			throw new Error('Not authenticated');
		}

		const army = await ctx.db.get(armyId);
		if (!army) {
			throw new Error('Army not found');
		}

		const player = await ctx.db.get(army.ownerId);
		if (!player || player.userId !== userId) {
			throw new Error('Not your army');
		}

		if (!army.targetTileId || !army.departureTime || !army.arrivalTime || !army.path) {
			throw new Error('Army not moving');
		}

		const now = Date.now();
		const elapsed = now - army.departureTime;
		const totalTime = army.arrivalTime - army.departureTime;
		const progress = Math.min(elapsed / totalTime, 1);

		// Find which hex the army is currently at
		const pathIndex = Math.floor(progress * army.path.length);
		const currentPathHex = pathIndex === 0 ? null : army.path[pathIndex - 1];

		// Find the tile at the current path position
		let newTileId: Id<'tiles'> = army.tileId;
		if (currentPathHex) {
			const tile = await ctx.db
				.query('tiles')
				.withIndex('by_gameId_coords', (q) => q.eq('gameId', army.gameId).eq('q', currentPathHex.q).eq('r', currentPathHex.r))
				.first();
			if (tile) {
				newTileId = tile._id;
			}
		}

		await ctx.db.patch(armyId, {
			tileId: newTileId,
			targetTileId: undefined,
			path: undefined,
			departureTime: undefined,
			arrivalTime: undefined,
		});
	},
});

export const setRallyPoint = mutation({
	args: {
		gameId: v.id('games'),
		tileId: v.id('tiles'),
	},
	handler: async (ctx, { gameId, tileId }) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) {
			throw new Error('Not authenticated');
		}

		const player = await ctx.db
			.query('gamePlayers')
			.withIndex('by_gameId', (q) => q.eq('gameId', gameId))
			.filter((q) => q.eq(q.field('userId'), userId))
			.first();

		if (!player) {
			throw new Error('Not in game');
		}

		const tile = await ctx.db.get(tileId);
		if (!tile) {
			throw new Error('Tile not found');
		}
		if (tile.ownerId !== player._id) {
			throw new Error('Must set rally point on owned tile');
		}

		await ctx.db.patch(player._id, { rallyPointTileId: tileId });
	},
});

// Get armies with current position computed (for UI)
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

		const armies = await ctx.db
			.query('armies')
			.withIndex('by_gameId', (q) => q.eq('gameId', gameId))
			.collect();

		const allTiles = await ctx.db
			.query('tiles')
			.withIndex('by_gameId', (q) => q.eq('gameId', gameId))
			.collect();

		const tileMap = new Map(allTiles.map((t) => [t._id, t]));

		// Compute visible coordinates from player's owned tiles
		const ownedTiles = allTiles.filter((t) => t.ownerId === player._id);
		const visibleCoords = computeVisibleCoords(ownedTiles);

		const now = Date.now();

		return armies
			.map((army) => {
				const baseTile = tileMap.get(army.tileId);
				if (!baseTile) {
					return null;
				}

				let currentQ = baseTile.q;
				let currentR = baseTile.r;

				// If moving, compute current position along path
				if (army.targetTileId && army.departureTime && army.arrivalTime && army.path && army.path.length > 0) {
					const elapsed = now - army.departureTime;
					const totalTime = army.arrivalTime - army.departureTime;
					const progress = Math.min(elapsed / totalTime, 1);

					// Which hex in the path are we at?
					const pathIndex = Math.min(Math.floor(progress * army.path.length), army.path.length - 1);
					const currentPathHex = army.path[pathIndex];
					currentQ = currentPathHex.q;
					currentR = currentPathHex.r;
				}

				const isOwn = army.ownerId === player._id;

				// Hide enemy armies that aren't on visible tiles
				if (!isOwn && !visibleCoords.has(coordKey(currentQ, currentR))) {
					return null;
				}

				return {
					...army,
					currentQ,
					currentR,
					isOwn,
				};
			})
			.filter((a) => a !== null);
	},
});
