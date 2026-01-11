import { v } from 'convex/values';
import { internal } from './_generated/api';
import { internalMutation } from './_generated/server';

export const processTick = internalMutation({
	args: { gameId: v.id('games') },
	handler: async (ctx, { gameId }) => {
		const game = await ctx.db.get(gameId);
		if (!game || game.status !== 'inProgress') return;

		await ctx.db.patch(gameId, {
			currentTick: (game.currentTick ?? 0) + 1,
			lastTickAt: Date.now(),
		});

		// Schedule next tick in 1 second
		await ctx.scheduler.runAfter(1000, internal.tick.processTick, { gameId });
	},
});

export const startGameTick = internalMutation({
	args: { gameId: v.id('games') },
	handler: async (ctx, { gameId }) => {
		await ctx.db.patch(gameId, {
			currentTick: 0,
			lastTickAt: Date.now(),
		});

		// Schedule first tick
		await ctx.scheduler.runAfter(1000, internal.tick.processTick, { gameId });
	},
});
