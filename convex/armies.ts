import { v } from 'convex/values';

import { mutation, query } from './_generated/server';
import { getAlliedPlayerIdsInternal } from './alliances';
import { auth } from './auth';
import { computeLineOfSight, coordKey, findPath, getNeighbors } from './lib/hex';
import { getUpgradeModifiers } from './upgrades';

import type { Id } from './_generated/dataModel';

const TRAVEL_TIME_PER_HEX = 10000; // 10 seconds per hex
const UNIT_BASE_HP = 100;

export const getForGame = query({
	args: { gameId: v.id('games') },
	handler: async (ctx, { gameId }) => {
		const armies = await ctx.db
			.query('armies')
			.withIndex('by_gameId', (q) => q.eq('gameId', gameId))
			.collect();

		const units = await ctx.db
			.query('units')
			.withIndex('by_gameId', (q) => q.eq('gameId', gameId))
			.collect();

		// Build unit counts per army
		const unitsByArmy = new Map<string, typeof units>();
		for (const unit of units) {
			const armyUnits = unitsByArmy.get(unit.armyId) ?? [];
			armyUnits.push(unit);
			unitsByArmy.set(unit.armyId, armyUnits);
		}

		return armies.map((army) => {
			const armyUnits = unitsByArmy.get(army._id) ?? [];
			const unitCount = armyUnits.length;
			const totalHp = armyUnits.reduce((sum, u) => sum + u.hp, 0);
			const averageHp = unitCount > 0 ? totalHp / unitCount : 0;

			return {
				...army,
				unitCount,
				totalHp,
				averageHp,
			};
		});
	},
});

export const getForPlayer = query({
	args: { gamePlayerId: v.id('gamePlayers') },
	handler: async (ctx, { gamePlayerId }) => {
		const armies = await ctx.db
			.query('armies')
			.withIndex('by_ownerId', (q) => q.eq('ownerId', gamePlayerId))
			.collect();

		if (armies.length === 0) {
			return [];
		}

		const gameId = armies[0].gameId;
		const units = await ctx.db
			.query('units')
			.withIndex('by_gameId', (q) => q.eq('gameId', gameId))
			.collect();

		// Build unit counts per army
		const unitsByArmy = new Map<string, typeof units>();
		for (const unit of units) {
			const armyUnits = unitsByArmy.get(unit.armyId) ?? [];
			armyUnits.push(unit);
			unitsByArmy.set(unit.armyId, armyUnits);
		}

		return armies.map((army) => {
			const armyUnits = unitsByArmy.get(army._id) ?? [];
			const unitCount = armyUnits.length;
			const totalHp = armyUnits.reduce((sum, u) => sum + u.hp, 0);
			const averageHp = unitCount > 0 ? totalHp / unitCount : 0;

			return {
				...army,
				unitCount,
				totalHp,
				averageHp,
			};
		});
	},
});

export const moveArmy = mutation({
	args: {
		armyId: v.id('armies'),
		targetTileId: v.id('tiles'),
		unitCount: v.optional(v.number()),
	},
	handler: async (ctx, { armyId, targetTileId, unitCount: requestedCount }) => {
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

		// Block when capital is moving (player is frozen)
		if (player.capitalMovingToTileId) {
			throw new Error('Cannot move armies while capital is relocating');
		}

		// Get army's units
		const armyUnits = await ctx.db
			.query('units')
			.withIndex('by_armyId', (q) => q.eq('armyId', armyId))
			.collect();

		const totalUnits = armyUnits.length;
		if (totalUnits === 0) {
			throw new Error('Army has no units');
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
		const unitsToMove = requestedCount ?? totalUnits;
		if (unitsToMove < 1) {
			throw new Error('Must move at least 1 unit');
		}
		if (unitsToMove > totalUnits) {
			throw new Error('Not enough units');
		}

		// Get all tiles for pathfinding
		const allTiles = await ctx.db
			.query('tiles')
			.withIndex('by_gameId', (q) => q.eq('gameId', army.gameId))
			.collect();

		const tileMap = new Map(allTiles.map((t) => [coordKey(t.q, t.r), t]));

		// Get allied player IDs for pathfinding through allied territory
		const alliedPlayerIds = await getAlliedPlayerIdsInternal(ctx, army.ownerId);

		// Can only traverse owned, neutral, or allied tiles (not enemy tiles except destination)
		// Non-existent tiles (outside playable map) are blocked by the !tile check
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
			// Allow traversal through own, neutral, or allied territory
			return tile.ownerId === undefined || tile.ownerId === army.ownerId || alliedPlayerIds.has(tile.ownerId);
		};

		const path = findPath({ q: currentTile.q, r: currentTile.r }, { q: targetTile.q, r: targetTile.r }, canTraverse);

		if (!path) {
			throw new Error('No valid path to target');
		}

		// Fetch player's upgrades to apply army speed bonus
		const playerUpgrades = await ctx.db
			.query('playerUpgrades')
			.withIndex('by_playerId', (q) => q.eq('playerId', army.ownerId))
			.collect();

		const modifiers = getUpgradeModifiers(playerUpgrades.map((u) => u.upgradeId));
		const speedMultiplier = 1 - (modifiers.armySpeedBonus ?? 0); // Bonus reduces travel time

		const now = Date.now();
		const baseTravelTime = path.length * TRAVEL_TIME_PER_HEX;
		const travelTime = Math.round(baseTravelTime * speedMultiplier);

		if (unitsToMove < totalUnits) {
			// Split the army: create new moving army and transfer some units
			const newArmyId = await ctx.db.insert('armies', {
				gameId: army.gameId,
				ownerId: army.ownerId,
				tileId: army.tileId,
				targetTileId,
				path,
				departureTime: now,
				arrivalTime: now + travelTime,
			});

			// Transfer units to new army (take first N units)
			for (let i = 0; i < unitsToMove; i++) {
				await ctx.db.patch(armyUnits[i]._id, { armyId: newArmyId });
			}
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

export const retreatArmy = mutation({
	args: {
		armyId: v.id('armies'),
		targetTileId: v.id('tiles'),
	},
	handler: async (ctx, { armyId, targetTileId }) => {
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

		// Army must not be moving
		if (army.targetTileId) {
			throw new Error('Cannot retreat while moving - cancel move first');
		}

		const currentTile = await ctx.db.get(army.tileId);
		if (!currentTile) {
			throw new Error('Current tile not found');
		}

		const targetTile = await ctx.db.get(targetTileId);
		if (!targetTile) {
			throw new Error('Target tile not found');
		}

		// Target must be adjacent
		const neighbors = getNeighbors(currentTile.q, currentTile.r);
		const isAdjacent = neighbors.some((n) => n.q === targetTile.q && n.r === targetTile.r);
		if (!isAdjacent) {
			throw new Error('Can only retreat to adjacent tile');
		}

		// Check if army is in combat (same tile as enemy)
		const allArmiesOnTile = await ctx.db
			.query('armies')
			.withIndex('by_tileId', (q) => q.eq('tileId', army.tileId))
			.collect();

		const enemyArmies = allArmiesOnTile.filter((a) => a.ownerId !== army.ownerId);
		if (enemyArmies.length === 0) {
			throw new Error('Can only retreat when in combat');
		}

		// Instant teleport to target tile
		await ctx.db.patch(armyId, {
			tileId: targetTileId,
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

		// Block when capital is moving (player is frozen)
		if (player.capitalMovingToTileId) {
			throw new Error('Cannot set rally point while capital is relocating');
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

		const units = await ctx.db
			.query('units')
			.withIndex('by_gameId', (q) => q.eq('gameId', gameId))
			.collect();

		const allTiles = await ctx.db
			.query('tiles')
			.withIndex('by_gameId', (q) => q.eq('gameId', gameId))
			.collect();

		// Build unit data per army
		const unitsByArmy = new Map<string, typeof units>();
		for (const unit of units) {
			const armyUnits = unitsByArmy.get(unit.armyId) ?? [];
			armyUnits.push(unit);
			unitsByArmy.set(unit.armyId, armyUnits);
		}

		const tileMap = new Map(allTiles.map((t) => [t._id, t]));
		const _tileByCoord = new Map(allTiles.map((t) => [coordKey(t.q, t.r), t]));

		// Compute Line of Sight from player's owned tiles
		const ownedTiles = allTiles.filter((t) => t.ownerId === player._id);
		const losCoords = computeLineOfSight(ownedTiles);

		// Build armies by tile for combat detection
		const armiesByTile = new Map<string, typeof armies>();
		for (const army of armies) {
			const tileArmies = armiesByTile.get(army.tileId) ?? [];
			tileArmies.push(army);
			armiesByTile.set(army.tileId, tileArmies);
		}

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
				if (!isOwn && !losCoords.has(coordKey(currentQ, currentR))) {
					return null;
				}

				// Compute unit stats
				const armyUnits = unitsByArmy.get(army._id) ?? [];
				const unitCount = armyUnits.length;
				const totalHp = armyUnits.reduce((sum, u) => sum + u.hp, 0);
				const averageHp = unitCount > 0 ? totalHp / unitCount : 0;
				const averageHpPercent = unitCount > 0 ? (averageHp / UNIT_BASE_HP) * 100 : 0;

				// Check if in combat (stationary and enemy on same tile)
				const tileArmies = armiesByTile.get(army.tileId) ?? [];
				const enemiesOnTile = tileArmies.filter((a) => a.ownerId !== army.ownerId);
				const isInCombat = !army.targetTileId && enemiesOnTile.length > 0;

				return {
					...army,
					currentQ,
					currentR,
					isOwn,
					unitCount,
					totalHp,
					averageHp,
					averageHpPercent,
					isInCombat,
				};
			})
			.filter((a) => a !== null);
	},
});

// Get tiles that have combat (for UI indicators)
export const getTilesWithCombat = query({
	args: { gameId: v.id('games') },
	handler: async (ctx, { gameId }) => {
		const armies = await ctx.db
			.query('armies')
			.withIndex('by_gameId', (q) => q.eq('gameId', gameId))
			.collect();

		// Build armies by tile
		const armiesByTile = new Map<string, typeof armies>();
		for (const army of armies) {
			// Only count stationary armies for combat
			if (army.targetTileId) {
				continue;
			}
			const tileArmies = armiesByTile.get(army.tileId) ?? [];
			tileArmies.push(army);
			armiesByTile.set(army.tileId, tileArmies);
		}

		// Find tiles with multiple owners
		const combatTileIds: string[] = [];
		for (const [tileId, tileArmies] of armiesByTile) {
			const ownerIds = [...new Set(tileArmies.map((a) => a.ownerId))];
			if (ownerIds.length >= 2) {
				combatTileIds.push(tileId);
			}
		}

		return combatTileIds;
	},
});
