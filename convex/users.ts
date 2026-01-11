import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import { auth } from './auth';

export const currentUser = query({
	args: {},
	handler: async (ctx) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) {
			return null;
		}
		return await ctx.db.get(userId);
	},
});

export const getOrCreate = mutation({
	args: {},
	handler: async (ctx) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) {
			throw new Error('Not authenticated');
		}

		const user = await ctx.db.get(userId);
		if (!user) {
			throw new Error('User not found');
		}

		// Initialize defaults if not set
		if (user.settingSoundVolume === undefined) {
			await ctx.db.patch(userId, {
				settingSoundVolume: 100,
				settingMusicVolume: 100,
				settingShowToastAlerts: true,
				settingPlaySoundOnAttack: true,
				statGamesPlayed: 0,
				statWins: 0,
				statTimePlayed: 0,
			});
		}

		return await ctx.db.get(userId);
	},
});

export const setUsername = mutation({
	args: { username: v.string() },
	handler: async (ctx, args) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) {
			throw new Error('Not authenticated');
		}

		const trimmed = args.username.trim();
		if (trimmed.length === 0) {
			throw new Error('Username cannot be empty');
		}
		if (trimmed.length > 20) {
			throw new Error('Username too long (max 20 chars)');
		}

		// Check uniqueness
		const existing = await ctx.db
			.query('users')
			.withIndex('by_username', (q) => q.eq('username', trimmed))
			.first();
		if (existing && existing._id !== userId) {
			throw new Error('Username already taken');
		}

		await ctx.db.patch(userId, { username: trimmed });
	},
});

export const updateSettings = mutation({
	args: {
		settingSoundVolume: v.optional(v.number()),
		settingMusicVolume: v.optional(v.number()),
		settingShowToastAlerts: v.optional(v.boolean()),
		settingPlaySoundOnAttack: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) {
			throw new Error('Not authenticated');
		}

		const updates: Record<string, number | boolean> = {};
		if (args.settingSoundVolume !== undefined) {
			updates.settingSoundVolume = Math.max(0, Math.min(100, args.settingSoundVolume));
		}
		if (args.settingMusicVolume !== undefined) {
			updates.settingMusicVolume = Math.max(0, Math.min(100, args.settingMusicVolume));
		}
		if (args.settingShowToastAlerts !== undefined) {
			updates.settingShowToastAlerts = args.settingShowToastAlerts;
		}
		if (args.settingPlaySoundOnAttack !== undefined) {
			updates.settingPlaySoundOnAttack = args.settingPlaySoundOnAttack;
		}

		if (Object.keys(updates).length > 0) {
			await ctx.db.patch(userId, updates);
		}
	},
});

export const getStats = query({
	args: { userId: v.optional(v.id('users')) },
	handler: async (ctx, args) => {
		let userId = args.userId;
		if (!userId) {
			const authUserId = await auth.getUserId(ctx);
			if (!authUserId) {
				return null;
			}
			userId = authUserId;
		}

		const user = await ctx.db.get(userId);
		if (!user) {
			return null;
		}

		return {
			gamesPlayed: user.statGamesPlayed ?? 0,
			wins: user.statWins ?? 0,
			timePlayed: user.statTimePlayed ?? 0,
		};
	},
});
