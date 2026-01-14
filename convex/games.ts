import { v } from 'convex/values';

import { internal } from './_generated/api';
import { internalMutation, mutation, query } from './_generated/server';
import { auth } from './auth';
import { getNextAvailableColor } from './lib/colors';

import type { Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';

// Helper to leave current game before joining/creating another
async function leaveCurrentGame(ctx: MutationCtx, userId: Id<'users'>) {
	const existingPlayer = await ctx.db
		.query('gamePlayers')
		.withIndex('by_userId', (q) => q.eq('userId', userId))
		.filter((q) => q.eq(q.field('eliminatedAt'), undefined))
		.first();

	if (!existingPlayer) {
		return;
	}

	const existingGame = await ctx.db.get(existingPlayer.gameId);
	if (!existingGame) {
		return;
	}

	if (existingGame.status === 'waiting') {
		// Leave waiting game
		await ctx.db.delete(existingPlayer._id);
		if (existingGame.hostId === userId) {
			const remainingPlayers = await ctx.db
				.query('gamePlayers')
				.withIndex('by_gameId', (q) => q.eq('gameId', existingPlayer.gameId))
				.collect();
			if (remainingPlayers.length === 0) {
				await ctx.db.delete(existingPlayer.gameId);
			} else {
				const newHost = remainingPlayers.sort((a, b) => a.joinedAt - b.joinedAt)[0];
				await ctx.db.patch(existingPlayer.gameId, { hostId: newHost.userId });
			}
		}
	} else if (existingGame.status === 'inProgress' && !existingPlayer.eliminatedAt) {
		// Forfeit in-progress game
		const activePlayers = await ctx.db
			.query('gamePlayers')
			.withIndex('by_gameId', (q) => q.eq('gameId', existingPlayer.gameId))
			.filter((q) => q.eq(q.field('eliminatedAt'), undefined))
			.collect();
		const finishPosition = activePlayers.length;

		await ctx.db.patch(existingPlayer._id, {
			eliminatedAt: Date.now(),
			eliminationReason: 'forfeit',
			finishPosition,
			statTimeLasted: existingGame.startedAt ? Date.now() - existingGame.startedAt : 0,
		});

		// End game if only 1 player left
		if (activePlayers.length === 2) {
			const winner = activePlayers.find((p) => p._id !== existingPlayer._id);
			if (winner) {
				await ctx.db.patch(winner._id, {
					finishPosition: 1,
					statTimeLasted: existingGame.startedAt ? Date.now() - existingGame.startedAt : 0,
				});
				const winnerUser = await ctx.db.get(winner.userId);
				if (winnerUser) {
					await ctx.db.patch(winner.userId, {
						statGamesPlayed: (winnerUser.statGamesPlayed ?? 0) + 1,
						statWins: (winnerUser.statWins ?? 0) + 1,
						statTimePlayed: (winnerUser.statTimePlayed ?? 0) + (existingGame.startedAt ? Date.now() - existingGame.startedAt : 0),
					});
				}
				const loserUser = await ctx.db.get(userId);
				if (loserUser) {
					await ctx.db.patch(userId, {
						statGamesPlayed: (loserUser.statGamesPlayed ?? 0) + 1,
						statTimePlayed: (loserUser.statTimePlayed ?? 0) + (existingGame.startedAt ? Date.now() - existingGame.startedAt : 0),
					});
				}
				await ctx.db.patch(existingPlayer.gameId, {
					status: 'finished',
					finishedAt: Date.now(),
				});
			}
		}
	}
}

async function getGameWithPlayers(ctx: QueryCtx, gameId: Id<'games'>) {
	const game = await ctx.db.get(gameId);
	if (!game) {
		return null;
	}

	const players = await ctx.db
		.query('gamePlayers')
		.withIndex('by_gameId', (q) => q.eq('gameId', gameId))
		.collect();

	const playersWithUsers = await Promise.all(
		players.map(async (player) => {
			const user = await ctx.db.get(player.userId);
			return {
				...player,
				username: user?.username ?? 'Unknown',
			};
		}),
	);

	const host = await ctx.db.get(game.hostId);

	return {
		...game,
		hostUsername: host?.username ?? 'Unknown',
		players: playersWithUsers.sort((a, b) => a.joinedAt - b.joinedAt),
	};
}

// Queries

export const list = query({
	args: {},
	handler: async (ctx) => {
		const games = await ctx.db
			.query('games')
			.withIndex('by_status', (q) => q.eq('status', 'waiting'))
			.collect();

		return Promise.all(
			games.map(async (game) => {
				const players = await ctx.db
					.query('gamePlayers')
					.withIndex('by_gameId', (q) => q.eq('gameId', game._id))
					.collect();
				const host = await ctx.db.get(game.hostId);
				return {
					...game,
					hostUsername: host?.username ?? 'Unknown',
					playerCount: players.length,
				};
			}),
		);
	},
});

export const get = query({
	args: { gameId: v.id('games') },
	handler: async (ctx, args) => {
		return getGameWithPlayers(ctx, args.gameId);
	},
});

export const getMyCurrentGame = query({
	args: {},
	handler: async (ctx) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) {
			return null;
		}

		// Find active game player entry
		const gamePlayer = await ctx.db
			.query('gamePlayers')
			.withIndex('by_userId', (q) => q.eq('userId', userId))
			.filter((q) => q.eq(q.field('eliminatedAt'), undefined))
			.first();

		if (!gamePlayer) {
			return null;
		}

		const game = await ctx.db.get(gamePlayer.gameId);
		if (!game || game.status === 'finished') {
			return null;
		}

		return { gameId: game._id, status: game.status };
	},
});

// Mutations

export const create = mutation({
	args: {
		name: v.string(),
		maxPlayers: v.number(),
	},
	handler: async (ctx, args) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) {
			throw new Error('Not authenticated');
		}

		// Leave any existing game first
		await leaveCurrentGame(ctx, userId);

		const trimmedName = args.name.trim();
		if (trimmedName.length === 0) {
			throw new Error('Game name cannot be empty');
		}
		if (trimmedName.length > 50) {
			throw new Error('Game name too long (max 50 chars)');
		}
		if (args.maxPlayers < 2 || args.maxPlayers > 8) {
			throw new Error('Player count must be 2-8');
		}

		const gameId = await ctx.db.insert('games', {
			name: trimmedName,
			hostId: userId,
			maxPlayers: args.maxPlayers,
			status: 'waiting',
		});

		// Add host as first player
		await ctx.db.insert('gamePlayers', {
			gameId,
			userId,
			color: getNextAvailableColor([]),
			isReady: false,
			joinedAt: Date.now(),
			pauseTimeUsed: 0,
			lastSeen: Date.now(),
		});

		// Start lobby cleanup scheduler
		await ctx.scheduler.runAfter(CLEANUP_INTERVAL, internal.games.lobbyCleanupTick, { gameId });

		return gameId;
	},
});

export const join = mutation({
	args: { gameId: v.id('games') },
	handler: async (ctx, args) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) {
			throw new Error('Not authenticated');
		}

		// Check if already in this game - no-op
		const existingPlayer = await ctx.db
			.query('gamePlayers')
			.withIndex('by_userId', (q) => q.eq('userId', userId))
			.filter((q) => q.eq(q.field('eliminatedAt'), undefined))
			.first();
		if (existingPlayer?.gameId === args.gameId) {
			return;
		}

		// Leave any other game first
		await leaveCurrentGame(ctx, userId);

		const game = await ctx.db.get(args.gameId);
		if (!game) {
			throw new Error('Game not found');
		}
		if (game.status !== 'waiting') {
			throw new Error('Game already started');
		}

		const players = await ctx.db
			.query('gamePlayers')
			.withIndex('by_gameId', (q) => q.eq('gameId', args.gameId))
			.collect();

		if (players.length >= game.maxPlayers) {
			throw new Error('Game is full');
		}

		const takenColors = players.map((p) => p.color);

		await ctx.db.insert('gamePlayers', {
			gameId: args.gameId,
			userId,
			color: getNextAvailableColor(takenColors),
			isReady: false,
			joinedAt: Date.now(),
			pauseTimeUsed: 0,
			lastSeen: Date.now(),
		});
	},
});

export const leave = mutation({
	args: { gameId: v.id('games') },
	handler: async (ctx, args) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) {
			throw new Error('Not authenticated');
		}

		const game = await ctx.db.get(args.gameId);
		if (!game) {
			return; // Already gone
		}
		if (game.status !== 'waiting') {
			throw new Error('Cannot leave started game');
		}

		const player = await ctx.db
			.query('gamePlayers')
			.withIndex('by_gameId', (q) => q.eq('gameId', args.gameId))
			.filter((q) => q.eq(q.field('userId'), userId))
			.first();

		if (!player) {
			return; // Already left
		}

		await ctx.db.delete(player._id);

		// Handle host leaving
		if (game.hostId === userId) {
			const remainingPlayers = await ctx.db
				.query('gamePlayers')
				.withIndex('by_gameId', (q) => q.eq('gameId', args.gameId))
				.collect();

			if (remainingPlayers.length === 0) {
				await ctx.db.delete(args.gameId);
			} else {
				// Transfer host to earliest joiner
				const newHost = remainingPlayers.sort((a, b) => a.joinedAt - b.joinedAt)[0];
				await ctx.db.patch(args.gameId, { hostId: newHost.userId });
			}
		}
	},
});

export const heartbeat = mutation({
	args: { gameId: v.id('games') },
	handler: async (ctx, args) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) {
			return;
		}

		const player = await ctx.db
			.query('gamePlayers')
			.withIndex('by_gameId', (q) => q.eq('gameId', args.gameId))
			.filter((q) => q.eq(q.field('userId'), userId))
			.first();

		if (player) {
			await ctx.db.patch(player._id, { lastSeen: Date.now() });
		}
	},
});

export const setReady = mutation({
	args: { gameId: v.id('games'), isReady: v.boolean() },
	handler: async (ctx, args) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) {
			throw new Error('Not authenticated');
		}

		const game = await ctx.db.get(args.gameId);
		if (!game) {
			throw new Error('Game not found');
		}
		if (game.status !== 'waiting') {
			throw new Error('Game already started');
		}

		const player = await ctx.db
			.query('gamePlayers')
			.withIndex('by_gameId', (q) => q.eq('gameId', args.gameId))
			.filter((q) => q.eq(q.field('userId'), userId))
			.first();

		if (!player) {
			throw new Error('Not in game');
		}

		await ctx.db.patch(player._id, { isReady: args.isReady });
	},
});

export const start = mutation({
	args: { gameId: v.id('games') },
	handler: async (ctx, args) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) {
			throw new Error('Not authenticated');
		}

		const game = await ctx.db.get(args.gameId);
		if (!game) {
			throw new Error('Game not found');
		}
		if (game.hostId !== userId) {
			throw new Error('Only host can start');
		}
		if (game.status !== 'waiting') {
			throw new Error('Game already started');
		}

		const players = await ctx.db
			.query('gamePlayers')
			.withIndex('by_gameId', (q) => q.eq('gameId', args.gameId))
			.collect();

		if (players.length < 2) {
			throw new Error('Need at least 2 players');
		}
		if (!players.every((p) => p.isReady)) {
			throw new Error('Not all players ready');
		}

		// Assign starting positions (shuffled)
		const positions = Array.from({ length: players.length }, (_, i) => i);
		for (let i = positions.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[positions[i], positions[j]] = [positions[j], positions[i]];
		}

		await Promise.all(players.map((player, index) => ctx.db.patch(player._id, { startingPosition: positions[index] })));

		await ctx.db.patch(args.gameId, {
			status: 'inProgress',
			startedAt: Date.now(),
		});

		// Generate map with player IDs in starting position order
		const sortedPlayers = [...players].sort((a, b) => (positions[players.indexOf(a)] ?? 0) - (positions[players.indexOf(b)] ?? 0));
		await ctx.runMutation(internal.tiles.generateMap, {
			gameId: args.gameId,
			playerIds: sortedPlayers.map((p) => p._id),
		});

		// Initialize player economy
		for (const player of players) {
			const capitalTile = await ctx.db
				.query('tiles')
				.withIndex('by_gameId', (q) => q.eq('gameId', args.gameId))
				.filter((q) => q.and(q.eq(q.field('ownerId'), player._id), q.eq(q.field('type'), 'capital')))
				.first();

			await ctx.db.patch(player._id, {
				gold: 0,
				population: 20,
				populationAccumulator: 0,
				labourRatio: 100,
				militaryRatio: 0,
				spyRatio: 0,
				rallyPointTileId: capitalTile?._id,
			});
		}

		// Start tick system
		await ctx.runMutation(internal.tick.startGameTick, { gameId: args.gameId });
	},
});

export const abandon = mutation({
	args: { gameId: v.id('games') },
	handler: async (ctx, args) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) {
			throw new Error('Not authenticated');
		}

		const game = await ctx.db.get(args.gameId);
		if (!game) {
			throw new Error('Game not found');
		}
		if (game.status !== 'inProgress') {
			throw new Error('Game not in progress');
		}

		const player = await ctx.db
			.query('gamePlayers')
			.withIndex('by_gameId', (q) => q.eq('gameId', args.gameId))
			.filter((q) => q.eq(q.field('userId'), userId))
			.first();

		if (!player) {
			throw new Error('Not in game');
		}
		if (player.eliminatedAt) {
			throw new Error('Already eliminated');
		}

		// Count remaining players to determine finish position
		const activePlayers = await ctx.db
			.query('gamePlayers')
			.withIndex('by_gameId', (q) => q.eq('gameId', args.gameId))
			.filter((q) => q.eq(q.field('eliminatedAt'), undefined))
			.collect();

		const finishPosition = activePlayers.length;

		await ctx.db.patch(player._id, {
			eliminatedAt: Date.now(),
			eliminationReason: 'forfeit',
			finishPosition,
			statTimeLasted: game.startedAt ? Date.now() - game.startedAt : 0,
		});

		// Check if game should end (only 1 player left)
		if (activePlayers.length === 2) {
			const winner = activePlayers.find((p) => p._id !== player._id);
			if (winner) {
				await ctx.db.patch(winner._id, {
					finishPosition: 1,
					statTimeLasted: game.startedAt ? Date.now() - game.startedAt : 0,
				});

				// Update winner's lifetime stats
				const winnerUser = await ctx.db.get(winner.userId);
				if (winnerUser) {
					await ctx.db.patch(winner.userId, {
						statGamesPlayed: (winnerUser.statGamesPlayed ?? 0) + 1,
						statWins: (winnerUser.statWins ?? 0) + 1,
						statTimePlayed: (winnerUser.statTimePlayed ?? 0) + (game.startedAt ? Date.now() - game.startedAt : 0),
					});
				}

				// Update loser's lifetime stats
				const loserUser = await ctx.db.get(player.userId);
				if (loserUser) {
					await ctx.db.patch(player.userId, {
						statGamesPlayed: (loserUser.statGamesPlayed ?? 0) + 1,
						statTimePlayed: (loserUser.statTimePlayed ?? 0) + (game.startedAt ? Date.now() - game.startedAt : 0),
					});
				}

				await ctx.db.patch(args.gameId, {
					status: 'finished',
					finishedAt: Date.now(),
				});
			}
		}
	},
});

export const eliminate = mutation({
	args: {
		gameId: v.id('games'),
		playerId: v.id('users'),
		reason: v.union(v.literal('capitalCaptured'), v.literal('debt'), v.literal('forfeit')),
	},
	handler: async (ctx, args) => {
		const game = await ctx.db.get(args.gameId);
		if (!game) {
			throw new Error('Game not found');
		}
		if (game.status !== 'inProgress') {
			throw new Error('Game not in progress');
		}

		const player = await ctx.db
			.query('gamePlayers')
			.withIndex('by_gameId', (q) => q.eq('gameId', args.gameId))
			.filter((q) => q.eq(q.field('userId'), args.playerId))
			.first();

		if (!player) {
			throw new Error('Player not in game');
		}
		if (player.eliminatedAt) {
			throw new Error('Already eliminated');
		}

		const activePlayers = await ctx.db
			.query('gamePlayers')
			.withIndex('by_gameId', (q) => q.eq('gameId', args.gameId))
			.filter((q) => q.eq(q.field('eliminatedAt'), undefined))
			.collect();

		const finishPosition = activePlayers.length;

		await ctx.db.patch(player._id, {
			eliminatedAt: Date.now(),
			eliminationReason: args.reason,
			finishPosition,
			statTimeLasted: game.startedAt ? Date.now() - game.startedAt : 0,
		});

		// Update player's lifetime stats
		const user = await ctx.db.get(args.playerId);
		if (user) {
			await ctx.db.patch(args.playerId, {
				statGamesPlayed: (user.statGamesPlayed ?? 0) + 1,
				statTimePlayed: (user.statTimePlayed ?? 0) + (game.startedAt ? Date.now() - game.startedAt : 0),
			});
		}

		// Check if only one player remains
		if (activePlayers.length === 2) {
			const winner = activePlayers.find((p) => p._id !== player._id);
			if (winner) {
				await ctx.db.patch(winner._id, {
					finishPosition: 1,
					statTimeLasted: game.startedAt ? Date.now() - game.startedAt : 0,
				});

				const winnerUser = await ctx.db.get(winner.userId);
				if (winnerUser) {
					await ctx.db.patch(winner.userId, {
						statGamesPlayed: (winnerUser.statGamesPlayed ?? 0) + 1,
						statWins: (winnerUser.statWins ?? 0) + 1,
						statTimePlayed: (winnerUser.statTimePlayed ?? 0) + (game.startedAt ? Date.now() - game.startedAt : 0),
					});
				}

				await ctx.db.patch(args.gameId, {
					status: 'finished',
					finishedAt: Date.now(),
				});
			}
		}
	},
});

export const setRatios = mutation({
	args: {
		gameId: v.id('games'),
		labourRatio: v.number(),
		militaryRatio: v.number(),
		spyRatio: v.number(),
	},
	handler: async (ctx, args) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) {
			throw new Error('Not authenticated');
		}

		// Validate sum <= 100 (remainder is "unassigned" population)
		const sum = args.labourRatio + args.militaryRatio + args.spyRatio;
		if (sum > 100.01) {
			throw new Error('Ratios cannot exceed 100');
		}

		// Validate range 0-100
		if (
			args.labourRatio < 0 ||
			args.labourRatio > 100 ||
			args.militaryRatio < 0 ||
			args.militaryRatio > 100 ||
			args.spyRatio < 0 ||
			args.spyRatio > 100
		) {
			throw new Error('Ratios must be 0-100');
		}

		const player = await ctx.db
			.query('gamePlayers')
			.withIndex('by_gameId', (q) => q.eq('gameId', args.gameId))
			.filter((q) => q.eq(q.field('userId'), userId))
			.first();

		if (!player) {
			throw new Error('Not in game');
		}

		// Block when capital is moving (player is frozen)
		if (player.capitalMovingToTileId) {
			throw new Error('Cannot change ratios while capital is relocating');
		}

		// Get current military units
		const armies = await ctx.db
			.query('armies')
			.withIndex('by_ownerId', (q) => q.eq('ownerId', player._id))
			.collect();
		const currentMilitary = armies.reduce((sum, a) => {
			const count = a.count ?? 0;
			return sum + (Number.isFinite(count) ? count : 0);
		}, 0);

		// Get player's tiles for capital lookup
		const tiles = await ctx.db
			.query('tiles')
			.withIndex('by_gameId', (q) => q.eq('gameId', args.gameId))
			.filter((q) => q.eq(q.field('ownerId'), player._id))
			.collect();

		const capitalTile = tiles.find((t) => t.type === 'capital');

		// Calculate total units and target military
		const totalUnits = (player.population ?? 0) + currentMilitary;
		const targetMilitary = Math.floor(totalUnits * (args.militaryRatio / 100));

		let newPopulation = player.population ?? 0;

		if (targetMilitary > currentMilitary) {
			// CONSCRIPT: civilians → army (spawn at rally point)
			const toConscript = Math.min(targetMilitary - currentMilitary, newPopulation);

			if (toConscript > 0 && player.rallyPointTileId) {
				newPopulation -= toConscript;

				// Find or create army at rally point
				const existingRallyArmy = armies.find((a) => a.tileId === player.rallyPointTileId && !a.targetTileId);

				if (existingRallyArmy) {
					const existingCount = existingRallyArmy.count ?? 0;
					await ctx.db.patch(existingRallyArmy._id, {
						count: existingCount + toConscript,
					});
				} else {
					await ctx.db.insert('armies', {
						gameId: args.gameId,
						ownerId: player._id,
						tileId: player.rallyPointTileId,
						count: toConscript,
					});
				}
			}
		} else if (targetMilitary < currentMilitary) {
			// DEMOBILIZE: army at capital → civilians (only from capital)
			const capitalArmy = armies.find((a) => a.tileId === capitalTile?._id && !a.targetTileId);

			if (capitalArmy) {
				const capitalCount = capitalArmy.count ?? 0;
				const toDemobilize = Math.min(currentMilitary - targetMilitary, capitalCount);
				newPopulation += toDemobilize;

				if (toDemobilize >= capitalCount) {
					await ctx.db.delete(capitalArmy._id);
				} else {
					await ctx.db.patch(capitalArmy._id, {
						count: capitalCount - toDemobilize,
					});
				}
			}
		}

		// Guard against NaN before saving (defensive)
		const safePop = Number.isFinite(newPopulation) ? newPopulation : 20;

		await ctx.db.patch(player._id, {
			population: safePop,
			labourRatio: args.labourRatio,
			militaryRatio: args.militaryRatio,
			spyRatio: args.spyRatio,
		});
	},
});

export const getMyEconomy = query({
	args: { gameId: v.id('games') },
	handler: async (ctx, { gameId }) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) {
			return null;
		}

		const game = await ctx.db.get(gameId);
		if (!game) {
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

		// Calculate derived values with NaN guards
		const safePop = Number.isFinite(player.population) ? (player.population ?? 0) : 0;
		const safeGold = Number.isFinite(player.gold) ? (player.gold ?? 0) : 0;
		const safeLabourRatio = Number.isFinite(player.labourRatio) ? (player.labourRatio ?? 100) : 100;

		const labourers = Math.floor(safePop * (safeLabourRatio / 100));

		const tiles = await ctx.db
			.query('tiles')
			.withIndex('by_gameId', (q) => q.eq('gameId', gameId))
			.filter((q) => q.eq(q.field('ownerId'), player._id))
			.collect();

		const cityCount = tiles.filter((t) => t.type === 'city').length;
		const hasCapital = tiles.some((t) => t.type === 'capital');
		const popCap = (hasCapital ? 50 : 0) + cityCount * 20;

		// Get total military units from units table (not legacy armies.count)
		const armies = await ctx.db
			.query('armies')
			.withIndex('by_ownerId', (q) => q.eq('ownerId', player._id))
			.collect();
		const armyIdSet = new Set(armies.map((a) => a._id));

		const units = await ctx.db
			.query('units')
			.withIndex('by_gameId', (q) => q.eq('gameId', gameId))
			.collect();
		const totalMilitary = units.filter((u) => armyIdSet.has(u.armyId)).length;

		// Get spy count for upkeep
		const spies = await ctx.db
			.query('spies')
			.withIndex('by_ownerId', (q) => q.eq('ownerId', player._id))
			.collect();

		// Calculate net gold rate (matching tick.ts constants)
		const UPKEEP_PER_UNIT = 0.1;
		const UPKEEP_PER_SPY = 0.2;
		const upkeepCost = totalMilitary * UPKEEP_PER_UNIT + spies.length * UPKEEP_PER_SPY;
		const goldRate = labourers / 5 - upkeepCost;

		return {
			gold: safeGold,
			goldRate,
			population: safePop,
			totalMilitary,
			totalUnits: safePop + totalMilitary + spies.length,
			popCap,
			labourRatio: safeLabourRatio,
			militaryRatio: Number.isFinite(player.militaryRatio) ? (player.militaryRatio ?? 0) : 0,
			spyRatio: Number.isFinite(player.spyRatio) ? (player.spyRatio ?? 0) : 0,
			startedAt: game.startedAt ?? Date.now(),
			// Capital movement state
			capitalMovingToTileId: player.capitalMovingToTileId,
			capitalMoveDepartureTime: player.capitalMoveDepartureTime,
			capitalMoveArrivalTime: player.capitalMoveArrivalTime,
		};
	},
});

// Lobby cleanup - removes stale players who disconnected without leaving

const STALE_TIMEOUT = 6 * 60 * 1000; // 6 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

export const lobbyCleanupTick = internalMutation({
	args: { gameId: v.id('games') },
	handler: async (ctx, { gameId }) => {
		const game = await ctx.db.get(gameId);
		if (!game || game.status !== 'waiting') {
			return; // Stop if game started/deleted
		}

		const cutoff = Date.now() - STALE_TIMEOUT;
		const players = await ctx.db
			.query('gamePlayers')
			.withIndex('by_gameId', (q) => q.eq('gameId', gameId))
			.collect();

		for (const player of players) {
			if (player.lastSeen && player.lastSeen < cutoff) {
				await ctx.db.delete(player._id);

				// Handle host transfer
				if (game.hostId === player.userId) {
					const remaining = players.filter((p) => p._id !== player._id && (!p.lastSeen || p.lastSeen >= cutoff));
					if (remaining.length === 0) {
						await ctx.db.delete(gameId);
						return; // Game deleted, no need to reschedule
					}
					const newHost = remaining.sort((a, b) => a.joinedAt - b.joinedAt)[0];
					await ctx.db.patch(gameId, { hostId: newHost.userId });
				}
			}
		}

		// Reschedule
		await ctx.scheduler.runAfter(CLEANUP_INTERVAL, internal.games.lobbyCleanupTick, { gameId });
	},
});

// Pause system constants
const PAUSE_BUDGET_MS = 30 * 1000; // 30 seconds per player per game
const DISCONNECT_THRESHOLD_MS = 5 * 1000; // 5 seconds of no heartbeat = disconnect

export const pauseGame = mutation({
	args: { gameId: v.id('games') },
	handler: async (ctx, { gameId }) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) {
			throw new Error('Not authenticated');
		}

		const game = await ctx.db.get(gameId);
		if (!game) {
			throw new Error('Game not found');
		}
		if (game.status !== 'inProgress') {
			throw new Error('Game not in progress');
		}
		if (game.isPaused) {
			throw new Error('Game already paused');
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
			throw new Error('Eliminated players cannot pause');
		}

		// Check if player has pause budget remaining
		const timeUsed = player.pauseTimeUsed ?? 0;
		if (timeUsed >= PAUSE_BUDGET_MS) {
			throw new Error('Pause budget exhausted');
		}

		await ctx.db.patch(gameId, {
			isPaused: true,
			pausedByPlayerId: player._id,
			pausedAt: Date.now(),
		});
	},
});

export const unpauseGame = mutation({
	args: { gameId: v.id('games') },
	handler: async (ctx, { gameId }) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) {
			throw new Error('Not authenticated');
		}

		const game = await ctx.db.get(gameId);
		if (!game) {
			throw new Error('Game not found');
		}
		if (!game.isPaused) {
			throw new Error('Game not paused');
		}

		const player = await ctx.db
			.query('gamePlayers')
			.withIndex('by_gameId', (q) => q.eq('gameId', gameId))
			.filter((q) => q.eq(q.field('userId'), userId))
			.first();

		if (!player) {
			throw new Error('Not in game');
		}

		// Only the player who paused can unpause
		if (game.pausedByPlayerId !== player._id) {
			throw new Error('Only the player who paused can unpause');
		}

		// Calculate time spent paused and deduct from budget
		const pauseDuration = Date.now() - (game.pausedAt ?? Date.now());
		const newTimeUsed = (player.pauseTimeUsed ?? 0) + pauseDuration;

		await ctx.db.patch(player._id, {
			pauseTimeUsed: newTimeUsed,
		});

		await ctx.db.patch(gameId, {
			isPaused: false,
			pausedByPlayerId: undefined,
			pausedAt: undefined,
		});
	},
});

export const getPauseState = query({
	args: { gameId: v.id('games') },
	handler: async (ctx, { gameId }) => {
		const game = await ctx.db.get(gameId);
		if (!game) {
			return null;
		}

		if (!game.isPaused || !game.pausedByPlayerId) {
			return { isPaused: false };
		}

		const pausingPlayer = await ctx.db.get(game.pausedByPlayerId);
		if (!pausingPlayer) {
			return { isPaused: false };
		}

		const pausingUser = await ctx.db.get(pausingPlayer.userId);
		const timeUsed = pausingPlayer.pauseTimeUsed ?? 0;
		const timeRemaining = Math.max(0, PAUSE_BUDGET_MS - timeUsed - (Date.now() - (game.pausedAt ?? Date.now())));

		return {
			isPaused: true,
			pausedByPlayerId: game.pausedByPlayerId,
			pausedByUsername: pausingUser?.username ?? 'Unknown',
			pausedAt: game.pausedAt,
			timeRemaining,
			budgetTotal: PAUSE_BUDGET_MS,
		};
	},
});

// Internal mutation to force unpause (called by tick when budget exhausted)
export const forceUnpause = internalMutation({
	args: { gameId: v.id('games') },
	handler: async (ctx, { gameId }) => {
		const game = await ctx.db.get(gameId);
		if (!game || !game.isPaused) {
			return;
		}

		// Deduct remaining time from the pausing player's budget
		if (game.pausedByPlayerId && game.pausedAt) {
			const pausingPlayer = await ctx.db.get(game.pausedByPlayerId);
			if (pausingPlayer) {
				const pauseDuration = Date.now() - game.pausedAt;
				const newTimeUsed = (pausingPlayer.pauseTimeUsed ?? 0) + pauseDuration;
				await ctx.db.patch(game.pausedByPlayerId, {
					pauseTimeUsed: newTimeUsed,
				});
			}
		}

		await ctx.db.patch(gameId, {
			isPaused: false,
			pausedByPlayerId: undefined,
			pausedAt: undefined,
		});
	},
});

// Internal mutation to auto-pause on disconnect
export const autoPauseOnDisconnect = internalMutation({
	args: { gameId: v.id('games'), playerId: v.id('gamePlayers') },
	handler: async (ctx, { gameId, playerId }) => {
		const game = await ctx.db.get(gameId);
		if (!game || game.status !== 'inProgress' || game.isPaused) {
			return;
		}

		const player = await ctx.db.get(playerId);
		if (!player || player.eliminatedAt) {
			return;
		}

		// Check if player has pause budget remaining
		const timeUsed = player.pauseTimeUsed ?? 0;
		if (timeUsed >= PAUSE_BUDGET_MS) {
			return; // No budget, can't auto-pause
		}

		await ctx.db.patch(gameId, {
			isPaused: true,
			pausedByPlayerId: playerId,
			pausedAt: Date.now(),
		});
	},
});

export { DISCONNECT_THRESHOLD_MS, PAUSE_BUDGET_MS };
