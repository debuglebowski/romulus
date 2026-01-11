import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import type { QueryCtx } from './_generated/server';
import { auth } from './auth';
import { getNextAvailableColor } from './lib/colors';

async function getGameWithPlayers(ctx: QueryCtx, gameId: Id<'games'>) {
	const game = await ctx.db.get(gameId);
	if (!game) return null;

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
		if (!userId) return null;

		// Find active game player entry
		const gamePlayer = await ctx.db
			.query('gamePlayers')
			.withIndex('by_userId', (q) => q.eq('userId', userId))
			.filter((q) => q.eq(q.field('eliminatedAt'), undefined))
			.first();

		if (!gamePlayer) return null;

		const game = await ctx.db.get(gamePlayer.gameId);
		if (!game || game.status === 'finished') return null;

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
		if (!userId) throw new Error('Not authenticated');

		const trimmedName = args.name.trim();
		if (trimmedName.length === 0) throw new Error('Game name cannot be empty');
		if (trimmedName.length > 50) throw new Error('Game name too long (max 50 chars)');
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
		});

		return gameId;
	},
});

export const join = mutation({
	args: { gameId: v.id('games') },
	handler: async (ctx, args) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) throw new Error('Not authenticated');

		const game = await ctx.db.get(args.gameId);
		if (!game) throw new Error('Game not found');
		if (game.status !== 'waiting') throw new Error('Game already started');

		const players = await ctx.db
			.query('gamePlayers')
			.withIndex('by_gameId', (q) => q.eq('gameId', args.gameId))
			.collect();

		if (players.length >= game.maxPlayers) throw new Error('Game is full');
		if (players.some((p) => p.userId === userId)) throw new Error('Already in game');

		const takenColors = players.map((p) => p.color);

		await ctx.db.insert('gamePlayers', {
			gameId: args.gameId,
			userId,
			color: getNextAvailableColor(takenColors),
			isReady: false,
			joinedAt: Date.now(),
			pauseTimeUsed: 0,
		});
	},
});

export const leave = mutation({
	args: { gameId: v.id('games') },
	handler: async (ctx, args) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) throw new Error('Not authenticated');

		const game = await ctx.db.get(args.gameId);
		if (!game) throw new Error('Game not found');
		if (game.status !== 'waiting') throw new Error('Cannot leave started game');

		const player = await ctx.db
			.query('gamePlayers')
			.withIndex('by_gameId', (q) => q.eq('gameId', args.gameId))
			.filter((q) => q.eq(q.field('userId'), userId))
			.first();

		if (!player) throw new Error('Not in game');

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

export const setReady = mutation({
	args: { gameId: v.id('games'), isReady: v.boolean() },
	handler: async (ctx, args) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) throw new Error('Not authenticated');

		const game = await ctx.db.get(args.gameId);
		if (!game) throw new Error('Game not found');
		if (game.status !== 'waiting') throw new Error('Game already started');

		const player = await ctx.db
			.query('gamePlayers')
			.withIndex('by_gameId', (q) => q.eq('gameId', args.gameId))
			.filter((q) => q.eq(q.field('userId'), userId))
			.first();

		if (!player) throw new Error('Not in game');

		await ctx.db.patch(player._id, { isReady: args.isReady });
	},
});

export const start = mutation({
	args: { gameId: v.id('games') },
	handler: async (ctx, args) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) throw new Error('Not authenticated');

		const game = await ctx.db.get(args.gameId);
		if (!game) throw new Error('Game not found');
		if (game.hostId !== userId) throw new Error('Only host can start');
		if (game.status !== 'waiting') throw new Error('Game already started');

		const players = await ctx.db
			.query('gamePlayers')
			.withIndex('by_gameId', (q) => q.eq('gameId', args.gameId))
			.collect();

		if (players.length < 2) throw new Error('Need at least 2 players');
		if (!players.every((p) => p.isReady)) throw new Error('Not all players ready');

		// Assign starting positions (shuffled)
		const positions = Array.from({ length: players.length }, (_, i) => i);
		for (let i = positions.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[positions[i], positions[j]] = [positions[j], positions[i]];
		}

		await Promise.all(
			players.map((player, index) => ctx.db.patch(player._id, { startingPosition: positions[index] })),
		);

		await ctx.db.patch(args.gameId, {
			status: 'inProgress',
			startedAt: Date.now(),
		});

		// Generate map with player IDs in starting position order
		const sortedPlayers = [...players].sort(
			(a, b) => (positions[players.indexOf(a)] ?? 0) - (positions[players.indexOf(b)] ?? 0),
		);
		await ctx.runMutation(internal.tiles.generateMap, {
			gameId: args.gameId,
			playerIds: sortedPlayers.map((p) => p._id),
		});

		// Start tick system
		await ctx.runMutation(internal.tick.startGameTick, { gameId: args.gameId });
	},
});

export const abandon = mutation({
	args: { gameId: v.id('games') },
	handler: async (ctx, args) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) throw new Error('Not authenticated');

		const game = await ctx.db.get(args.gameId);
		if (!game) throw new Error('Game not found');
		if (game.status !== 'inProgress') throw new Error('Game not in progress');

		const player = await ctx.db
			.query('gamePlayers')
			.withIndex('by_gameId', (q) => q.eq('gameId', args.gameId))
			.filter((q) => q.eq(q.field('userId'), userId))
			.first();

		if (!player) throw new Error('Not in game');
		if (player.eliminatedAt) throw new Error('Already eliminated');

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
		if (!game) throw new Error('Game not found');
		if (game.status !== 'inProgress') throw new Error('Game not in progress');

		const player = await ctx.db
			.query('gamePlayers')
			.withIndex('by_gameId', (q) => q.eq('gameId', args.gameId))
			.filter((q) => q.eq(q.field('userId'), args.playerId))
			.first();

		if (!player) throw new Error('Player not in game');
		if (player.eliminatedAt) throw new Error('Already eliminated');

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
