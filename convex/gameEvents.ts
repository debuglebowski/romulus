import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { auth } from './auth';

export const create = mutation({
	args: {
		gameId: v.id('games'),
		actorPlayerId: v.id('users'),
		targetPlayerId: v.optional(v.id('users')),
		type: v.string(),
		data: v.any(),
	},
	handler: async (ctx, args) => {
		const game = await ctx.db.get(args.gameId);
		if (!game) throw new Error('Game not found');

		// Verify actor is in game
		const actor = await ctx.db
			.query('gamePlayers')
			.withIndex('by_gameId', (q) => q.eq('gameId', args.gameId))
			.filter((q) => q.eq(q.field('userId'), args.actorPlayerId))
			.first();

		if (!actor) throw new Error('Actor not in game');

		return ctx.db.insert('gameEvents', {
			gameId: args.gameId,
			actorPlayerId: args.actorPlayerId,
			targetPlayerId: args.targetPlayerId,
			type: args.type,
			data: args.data,
		});
	},
});

export const listForGame = query({
	args: { gameId: v.id('games') },
	handler: async (ctx, args) => {
		const game = await ctx.db.get(args.gameId);
		if (!game) throw new Error('Game not found');

		const events = await ctx.db
			.query('gameEvents')
			.withIndex('by_gameId', (q) => q.eq('gameId', args.gameId))
			.collect();

		return Promise.all(
			events.map(async (event) => {
				const actor = await ctx.db.get(event.actorPlayerId);
				const target = event.targetPlayerId ? await ctx.db.get(event.targetPlayerId) : null;
				return {
					...event,
					actorUsername: actor?.username ?? 'Unknown',
					targetUsername: target?.username ?? null,
				};
			}),
		);
	},
});

export const listRecent = query({
	args: {
		gameId: v.id('games'),
		since: v.number(),
	},
	handler: async (ctx, args) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) return [];

		// Verify user is in game
		const player = await ctx.db
			.query('gamePlayers')
			.withIndex('by_gameId', (q) => q.eq('gameId', args.gameId))
			.filter((q) => q.eq(q.field('userId'), userId))
			.first();

		if (!player) return [];

		const events = await ctx.db
			.query('gameEvents')
			.withIndex('by_gameId', (q) => q.eq('gameId', args.gameId))
			.filter((q) => q.gt(q.field('_creationTime'), args.since))
			.collect();

		return Promise.all(
			events.map(async (event) => {
				const actor = await ctx.db.get(event.actorPlayerId);
				const target = event.targetPlayerId ? await ctx.db.get(event.targetPlayerId) : null;
				return {
					...event,
					actorUsername: actor?.username ?? 'Unknown',
					targetUsername: target?.username ?? null,
				};
			}),
		);
	},
});
