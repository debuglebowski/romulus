import { v } from 'convex/values';

import { internalMutation, mutation, query } from './_generated/server';
import { auth } from './auth';
import { computeLineOfSight, coordKey, findPath, getNeighbors, getStartingPositions, hexesInRadius } from './lib/hex';

const CITY_BUILD_COST = 50;
const CAPITAL_TRAVEL_TIME_PER_HEX = 30000; // 30 seconds per hex

export const generateMap = internalMutation({
	args: {
		gameId: v.id('games'),
		playerIds: v.array(v.id('gamePlayers')),
	},
	handler: async (ctx, { gameId, playerIds }) => {
		const playerCount = playerIds.length;
		const radius = 20 + playerCount;

		// Generate all hexes
		const allHexes = hexesInRadius(radius);
		const startingPositions = getStartingPositions(playerCount, radius);

		// Track which hexes are owned
		const ownedHexes = new Set<string>();

		// Create capitals and adjacent territories for each player
		for (let i = 0; i < playerCount; i++) {
			const pos = startingPositions[i];
			const playerId = playerIds[i];

			// Capital tile
			await ctx.db.insert('tiles', {
				gameId,
				q: pos.q,
				r: pos.r,
				ownerId: playerId,
				type: 'capital',
			});
			ownedHexes.add(coordKey(pos.q, pos.r));

			// 6 adjacent tiles
			const neighbors = getNeighbors(pos.q, pos.r);
			for (const n of neighbors) {
				// Check if within map bounds
				if (allHexes.some((h) => h.q === n.q && h.r === n.r)) {
					await ctx.db.insert('tiles', {
						gameId,
						q: n.q,
						r: n.r,
						ownerId: playerId,
						type: 'empty',
					});
					ownedHexes.add(coordKey(n.q, n.r));
				}
			}
		}

		// Scatter NPC cities
		const npcCityCount = playerCount * 2;
		const unownedHexes = allHexes.filter((h) => !ownedHexes.has(coordKey(h.q, h.r)));

		// Shuffle and pick random positions for NPC cities
		const shuffled = [...unownedHexes].sort(() => Math.random() - 0.5);
		const npcPositions = shuffled.slice(0, Math.min(npcCityCount, shuffled.length));

		for (const pos of npcPositions) {
			await ctx.db.insert('tiles', {
				gameId,
				q: pos.q,
				r: pos.r,
				ownerId: undefined,
				type: 'city',
			});
			ownedHexes.add(coordKey(pos.q, pos.r));
		}

		// Fill remaining hexes as empty unowned tiles
		for (const hex of allHexes) {
			if (!ownedHexes.has(coordKey(hex.q, hex.r))) {
				await ctx.db.insert('tiles', {
					gameId,
					q: hex.q,
					r: hex.r,
					ownerId: undefined,
					type: 'empty',
				});
			}
		}

		// Initialize fog memory for each player's starting visibility
		const allTiles = await ctx.db
			.query('tiles')
			.withIndex('by_gameId', (q) => q.eq('gameId', gameId))
			.collect();

		const tileMap = new Map(allTiles.map((t) => [coordKey(t.q, t.r), t]));

		for (let i = 0; i < playerCount; i++) {
			const playerId = playerIds[i];
			const capitalPos = startingPositions[i];

			// Initialize memory for initial Line of Sight (owned tiles + neighbors)
			const ownedCoords = [capitalPos, ...getNeighbors(capitalPos.q, capitalPos.r)];
			const initialLOS = computeLineOfSight(ownedCoords);

			for (const key of initialLOS) {
				const tile = tileMap.get(key);
				if (tile) {
					await ctx.db.insert('playerTileMemory', {
						gameId,
						playerId,
						q: tile.q,
						r: tile.r,
						lastSeenOwnerId: tile.ownerId,
						lastSeenType: tile.type,
						lastSeenAt: 0,
					});
				}
			}
		}
	},
});

export const getForGame = query({
	args: { gameId: v.id('games') },
	handler: async (ctx, { gameId }) => {
		return ctx.db
			.query('tiles')
			.withIndex('by_gameId', (q) => q.eq('gameId', gameId))
			.collect();
	},
});

export const buildCity = mutation({
	args: { tileId: v.id('tiles') },
	handler: async (ctx, { tileId }) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) {
			throw new Error('Not authenticated');
		}

		const tile = await ctx.db.get(tileId);
		if (!tile) {
			throw new Error('Tile not found');
		}

		const player = await ctx.db
			.query('gamePlayers')
			.withIndex('by_gameId', (q) => q.eq('gameId', tile.gameId))
			.filter((q) => q.eq(q.field('userId'), userId))
			.first();

		if (!player) {
			throw new Error('Not in game');
		}

		// Block when capital is moving (player is frozen)
		if (player.capitalMovingToTileId) {
			throw new Error('Cannot build city while capital is relocating');
		}

		if (tile.ownerId !== player._id) {
			throw new Error('Must own the tile to build a city');
		}

		if (tile.type !== 'empty') {
			throw new Error('Can only build city on empty tiles');
		}

		const currentGold = player.gold ?? 0;
		if (currentGold < CITY_BUILD_COST) {
			throw new Error(`Not enough gold (need ${CITY_BUILD_COST}, have ${Math.floor(currentGold)})`);
		}

		// Deduct gold and build city
		await ctx.db.patch(player._id, {
			gold: currentGold - CITY_BUILD_COST,
		});

		await ctx.db.patch(tileId, {
			type: 'city',
		});
	},
});

export const getVisibleForPlayer = query({
	args: { gameId: v.id('games') },
	handler: async (ctx, { gameId }) => {
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

		const allTiles = await ctx.db
			.query('tiles')
			.withIndex('by_gameId', (q) => q.eq('gameId', gameId))
			.collect();

		const ownedTiles = allTiles.filter((t) => t.ownerId === player._id);
		const losCoords = computeLineOfSight(ownedTiles);

		const visible = [];
		const notVisibleTiles = [];

		for (const tile of allTiles) {
			if (losCoords.has(coordKey(tile.q, tile.r))) {
				visible.push(tile);
			} else {
				notVisibleTiles.push(tile);
			}
		}

		const memories = await ctx.db
			.query('playerTileMemory')
			.withIndex('by_gameId_playerId', (q) => q.eq('gameId', gameId).eq('playerId', player._id))
			.collect();

		const memoryMap = new Map(memories.map((m) => [coordKey(m.q, m.r), m]));

		const fogged = notVisibleTiles
			.map((tile) => {
				const memory = memoryMap.get(coordKey(tile.q, tile.r));
				if (!memory) {
					return null;
				}
				return {
					q: tile.q,
					r: tile.r,
					lastSeenOwnerId: memory.lastSeenOwnerId,
					lastSeenType: memory.lastSeenType,
					lastSeenAt: memory.lastSeenAt,
				};
			})
			.filter((t) => t !== null);

		// Unexplored tiles: exist in game but player has never seen them
		const unexplored = notVisibleTiles
			.filter((tile) => !memoryMap.has(coordKey(tile.q, tile.r)))
			.map((tile) => ({ q: tile.q, r: tile.r, type: tile.type }));

		return { visible, fogged, unexplored, playerId: player._id };
	},
});

export const updatePlayerMemory = internalMutation({
	args: {
		gameId: v.id('games'),
		playerId: v.id('gamePlayers'),
		visibleTiles: v.array(
			v.object({
				q: v.number(),
				r: v.number(),
				ownerId: v.optional(v.id('gamePlayers')),
				type: v.union(v.literal('empty'), v.literal('city'), v.literal('capital')),
			}),
		),
		currentTick: v.number(),
	},
	handler: async (ctx, { gameId, playerId, visibleTiles, currentTick }) => {
		for (const tile of visibleTiles) {
			const existing = await ctx.db
				.query('playerTileMemory')
				.withIndex('by_gameId_playerId_coords', (q) => q.eq('gameId', gameId).eq('playerId', playerId).eq('q', tile.q).eq('r', tile.r))
				.first();

			if (existing) {
				await ctx.db.patch(existing._id, {
					lastSeenOwnerId: tile.ownerId,
					lastSeenType: tile.type,
					lastSeenAt: currentTick,
				});
			} else {
				await ctx.db.insert('playerTileMemory', {
					gameId,
					playerId,
					q: tile.q,
					r: tile.r,
					lastSeenOwnerId: tile.ownerId,
					lastSeenType: tile.type,
					lastSeenAt: currentTick,
				});
			}
		}
	},
});

export const moveCapital = mutation({
	args: { targetTileId: v.id('tiles') },
	handler: async (ctx, { targetTileId }) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) {
			throw new Error('Not authenticated');
		}

		const targetTile = await ctx.db.get(targetTileId);
		if (!targetTile) {
			throw new Error('Target tile not found');
		}

		const player = await ctx.db
			.query('gamePlayers')
			.withIndex('by_gameId', (q) => q.eq('gameId', targetTile.gameId))
			.filter((q) => q.eq(q.field('userId'), userId))
			.first();

		if (!player) {
			throw new Error('Not in game');
		}

		if (player.eliminatedAt) {
			throw new Error('Cannot move capital while eliminated');
		}

		// Check if already moving capital
		if (player.capitalMovingToTileId) {
			throw new Error('Capital is already moving');
		}

		// Target must be an owned city (not capital, not empty)
		if (targetTile.ownerId !== player._id) {
			throw new Error('Must own the target city');
		}
		if (targetTile.type !== 'city') {
			throw new Error('Can only move capital to a city');
		}

		// Find current capital
		const allTiles = await ctx.db
			.query('tiles')
			.withIndex('by_gameId', (q) => q.eq('gameId', targetTile.gameId))
			.collect();

		const capitalTile = allTiles.find((t) => t.ownerId === player._id && t.type === 'capital');
		if (!capitalTile) {
			throw new Error('No capital found');
		}

		// Build tile map for pathfinding
		const tileMap = new Map(allTiles.map((t) => [coordKey(t.q, t.r), t]));

		// Can only traverse owned tiles for capital movement
		const canTraverse = (coord: { q: number; r: number }) => {
			const tile = tileMap.get(coordKey(coord.q, coord.r));
			if (!tile) {
				return false;
			}
			return tile.ownerId === player._id;
		};

		const path = findPath({ q: capitalTile.q, r: capitalTile.r }, { q: targetTile.q, r: targetTile.r }, canTraverse);
		if (!path || path.length === 0) {
			throw new Error('No valid path to target city');
		}

		const now = Date.now();
		const travelTime = path.length * CAPITAL_TRAVEL_TIME_PER_HEX;

		await ctx.db.patch(player._id, {
			capitalMovingToTileId: targetTileId,
			capitalMoveDepartureTime: now,
			capitalMoveArrivalTime: now + travelTime,
			capitalMovePath: path,
		});
	},
});

export const cancelCapitalMove = mutation({
	args: { gameId: v.id('games') },
	handler: async (ctx, { gameId }) => {
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

		if (!player.capitalMovingToTileId || !player.capitalMoveDepartureTime || !player.capitalMoveArrivalTime || !player.capitalMovePath) {
			throw new Error('Capital is not moving');
		}

		const now = Date.now();
		const elapsed = now - player.capitalMoveDepartureTime;
		const totalTime = player.capitalMoveArrivalTime - player.capitalMoveDepartureTime;
		const progress = Math.min(elapsed / totalTime, 1);

		// Find which hex the capital is currently at
		const pathIndex = Math.floor(progress * player.capitalMovePath.length);
		const passedCoords = player.capitalMovePath.slice(0, pathIndex);

		// Get all tiles to find cities along the route
		const allTiles = await ctx.db
			.query('tiles')
			.withIndex('by_gameId', (q) => q.eq('gameId', gameId))
			.collect();

		const tileByCoord = new Map(allTiles.map((t) => [coordKey(t.q, t.r), t]));

		// Find current capital tile
		const capitalTile = allTiles.find((t) => t.ownerId === player._id && t.type === 'capital');
		if (!capitalTile) {
			throw new Error('No capital found');
		}

		// Find the nearest city along the passed route (iterate backwards from current position)
		let targetCityTile = null;
		for (let i = passedCoords.length - 1; i >= 0; i--) {
			const coord = passedCoords[i];
			const tile = tileByCoord.get(coordKey(coord.q, coord.r));
			if (tile && tile.type === 'city' && tile.ownerId === player._id) {
				targetCityTile = tile;
				break;
			}
		}

		if (targetCityTile) {
			// Move capital to the nearest city along the route
			// Old capital becomes a city
			await ctx.db.patch(capitalTile._id, { type: 'city' });
			// Target city becomes capital
			await ctx.db.patch(targetCityTile._id, { type: 'capital' });
		}
		// If no city was passed, capital stays where it is (original capital)

		// Clear movement fields
		await ctx.db.patch(player._id, {
			capitalMovingToTileId: undefined,
			capitalMoveDepartureTime: undefined,
			capitalMoveArrivalTime: undefined,
			capitalMovePath: undefined,
		});
	},
});
