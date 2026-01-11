import { authTables } from '@convex-dev/auth/server';
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

const schema = defineSchema({
	...authTables,

	users: defineTable({
		// Auth fields (managed by @convex-dev/auth)
		name: v.optional(v.string()),
		image: v.optional(v.string()),
		email: v.optional(v.string()),
		emailVerificationTime: v.optional(v.float64()),
		phone: v.optional(v.string()),
		phoneVerificationTime: v.optional(v.float64()),
		isAnonymous: v.optional(v.boolean()),

		// Profile
		username: v.optional(v.string()),

		// Settings
		settingSoundVolume: v.optional(v.number()),
		settingMusicVolume: v.optional(v.number()),
		settingShowToastAlerts: v.optional(v.boolean()),
		settingPlaySoundOnAttack: v.optional(v.boolean()),

		// Lifetime stats
		statGamesPlayed: v.optional(v.number()),
		statWins: v.optional(v.number()),
		statTimePlayed: v.optional(v.number()),
	}).index('by_username', ['username']),

	games: defineTable({
		name: v.string(),
		hostId: v.id('users'),
		maxPlayers: v.number(),
		status: v.union(
			v.literal('waiting'),
			v.literal('starting'),
			v.literal('inProgress'),
			v.literal('finished'),
		),
		startedAt: v.optional(v.number()),
		finishedAt: v.optional(v.number()),
	}).index('by_status', ['status']),

	gamePlayers: defineTable({
		gameId: v.id('games'),
		userId: v.id('users'),
		color: v.string(),
		startingPosition: v.optional(v.number()),
		isReady: v.boolean(),
		joinedAt: v.number(),
		pauseTimeUsed: v.number(),
		eliminatedAt: v.optional(v.number()),
		eliminationReason: v.optional(
			v.union(v.literal('capitalCaptured'), v.literal('debt'), v.literal('forfeit')),
		),
		finishPosition: v.optional(v.number()),
		statTimeLasted: v.optional(v.number()),
		statPeakCities: v.optional(v.number()),
		statCitiesFlippedBySpies: v.optional(v.number()),
		statBattlesWon: v.optional(v.number()),
		statEnemiesEliminated: v.optional(v.number()),
	})
		.index('by_gameId', ['gameId'])
		.index('by_userId', ['userId']),

	gameEvents: defineTable({
		gameId: v.id('games'),
		actorPlayerId: v.id('users'),
		targetPlayerId: v.optional(v.id('users')),
		type: v.string(),
		data: v.any(),
	}).index('by_gameId', ['gameId']),
});

export default schema;
