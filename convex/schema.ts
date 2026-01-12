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
		currentTick: v.optional(v.number()),
		lastTickAt: v.optional(v.number()),
	}).index('by_status', ['status']),

	tiles: defineTable({
		gameId: v.id('games'),
		q: v.number(),
		r: v.number(),
		ownerId: v.optional(v.id('gamePlayers')),
		type: v.union(v.literal('empty'), v.literal('city'), v.literal('capital')),
	})
		.index('by_gameId', ['gameId'])
		.index('by_gameId_coords', ['gameId', 'q', 'r']),

	gamePlayers: defineTable({
		gameId: v.id('games'),
		userId: v.id('users'),
		color: v.string(),
		startingPosition: v.optional(v.number()),
		isReady: v.boolean(),
		joinedAt: v.number(),
		pauseTimeUsed: v.number(),
		lastSeen: v.optional(v.number()),

		// Economy (set on game start)
		gold: v.optional(v.number()),
		population: v.optional(v.number()),
		populationAccumulator: v.optional(v.number()),
		labourRatio: v.optional(v.number()),
		militaryRatio: v.optional(v.number()),
		spyRatio: v.optional(v.number()),
		rallyPointTileId: v.optional(v.id('tiles')),
		militaryAccumulator: v.optional(v.number()),

		// Capital movement tracking
		capitalMovingToTileId: v.optional(v.id('tiles')),
		capitalMoveDepartureTime: v.optional(v.number()),
		capitalMoveArrivalTime: v.optional(v.number()),
		capitalMovePath: v.optional(v.array(v.object({ q: v.number(), r: v.number() }))),

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

	armies: defineTable({
		gameId: v.id('games'),
		ownerId: v.id('gamePlayers'),
		tileId: v.id('tiles'),
		// Legacy field - kept for migration, computed from units table
		count: v.optional(v.number()),
		// Movement (null = stationary)
		targetTileId: v.optional(v.id('tiles')),
		path: v.optional(v.array(v.object({ q: v.number(), r: v.number() }))),
		departureTime: v.optional(v.number()),
		arrivalTime: v.optional(v.number()),
	})
		.index('by_gameId', ['gameId'])
		.index('by_tileId', ['tileId'])
		.index('by_ownerId', ['ownerId']),

	units: defineTable({
		gameId: v.id('games'),
		armyId: v.id('armies'),
		hp: v.number(), // starts at 100, can be float
	})
		.index('by_gameId', ['gameId'])
		.index('by_armyId', ['armyId']),

	gameEvents: defineTable({
		gameId: v.id('games'),
		actorPlayerId: v.id('users'),
		targetPlayerId: v.optional(v.id('users')),
		type: v.string(),
		data: v.any(),
	}).index('by_gameId', ['gameId']),

	playerTileMemory: defineTable({
		gameId: v.id('games'),
		playerId: v.id('gamePlayers'),
		q: v.number(),
		r: v.number(),
		lastSeenOwnerId: v.optional(v.id('gamePlayers')),
		lastSeenType: v.union(v.literal('empty'), v.literal('city'), v.literal('capital')),
		lastSeenAt: v.number(),
	})
		.index('by_gameId_playerId', ['gameId', 'playerId'])
		.index('by_gameId_playerId_coords', ['gameId', 'playerId', 'q', 'r']),
});

export default schema;
