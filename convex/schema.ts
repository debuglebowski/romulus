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
		status: v.union(v.literal('waiting'), v.literal('starting'), v.literal('inProgress'), v.literal('finished')),
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
		spyAccumulator: v.optional(v.number()),

		// Capital movement tracking
		capitalMovingToTileId: v.optional(v.id('tiles')),
		capitalMoveDepartureTime: v.optional(v.number()),
		capitalMoveArrivalTime: v.optional(v.number()),
		capitalMovePath: v.optional(v.array(v.object({ q: v.number(), r: v.number() }))),

		eliminatedAt: v.optional(v.number()),
		eliminationReason: v.optional(v.union(v.literal('capitalCaptured'), v.literal('debt'), v.literal('forfeit'))),
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

	spies: defineTable({
		gameId: v.id('games'),
		ownerId: v.id('gamePlayers'),
		tileId: v.id('tiles'),
		// Movement (null = stationary)
		targetTileId: v.optional(v.id('tiles')),
		path: v.optional(v.array(v.object({ q: v.number(), r: v.number() }))),
		departureTime: v.optional(v.number()),
		arrivalTime: v.optional(v.number()),
		// Detection
		isRevealed: v.boolean(), // permanent once revealed
	})
		.index('by_gameId', ['gameId'])
		.index('by_tileId', ['tileId'])
		.index('by_ownerId', ['ownerId']),

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

	playerUpgrades: defineTable({
		gameId: v.id('games'),
		playerId: v.id('gamePlayers'),
		upgradeId: v.string(),
		purchasedAt: v.number(),
	})
		.index('by_gameId', ['gameId'])
		.index('by_playerId', ['playerId'])
		.index('by_playerId_upgradeId', ['playerId', 'upgradeId']),

	// Capital intel progress - tracks how long a spy has been at an enemy capital
	// Intel tiers: 3min gold, 6min pop, 9min upgrades, 12min armies, 15min spies
	capitalIntelProgress: defineTable({
		gameId: v.id('games'),
		spyOwnerId: v.id('gamePlayers'), // The player gathering intel
		targetPlayerId: v.id('gamePlayers'), // The capital owner being spied on
		startedAt: v.number(), // When spy first arrived at capital
		currentTier: v.number(), // 0-5, which intel tier has been reached
	})
		.index('by_gameId', ['gameId'])
		.index('by_spyOwnerId', ['spyOwnerId'])
		.index('by_spyOwnerId_targetPlayerId', ['spyOwnerId', 'targetPlayerId']),

	// Known enemy upgrades - tracks which enemy upgrades a player has discovered
	// Revealed through: capital intel (9min tier) or combat
	knownEnemyUpgrades: defineTable({
		gameId: v.id('games'),
		playerId: v.id('gamePlayers'), // The player who knows the intel
		enemyPlayerId: v.id('gamePlayers'), // The enemy whose upgrade was revealed
		upgradeId: v.string(), // The upgrade that was revealed
		revealedAt: v.number(),
		revealSource: v.union(v.literal('capitalIntel'), v.literal('combat')),
	})
		.index('by_gameId', ['gameId'])
		.index('by_playerId', ['playerId'])
		.index('by_playerId_enemyPlayerId', ['playerId', 'enemyPlayerId']),

	// City allegiance - tracks loyalty scores per team for each city
	// Used for spy-based city flipping mechanic
	cityAllegiance: defineTable({
		gameId: v.id('games'),
		tileId: v.id('tiles'), // The city tile
		teamId: v.id('gamePlayers'), // The team/player this score belongs to
		score: v.number(), // 0-100, owner starts at 100
	})
		.index('by_gameId', ['gameId'])
		.index('by_tileId', ['tileId'])
		.index('by_gameId_tileId', ['gameId', 'tileId']),

	// Alliances - tracks diplomatic relationships between players
	alliances: defineTable({
		gameId: v.id('games'),
		player1Id: v.id('gamePlayers'), // The player who sent the invite
		player2Id: v.id('gamePlayers'), // The player who received the invite
		status: v.union(v.literal('pending'), v.literal('active')),
		createdAt: v.number(),
	})
		.index('by_gameId', ['gameId'])
		.index('by_player1Id', ['player1Id'])
		.index('by_player2Id', ['player2Id'])
		.index('by_gameId_status', ['gameId', 'status']),

	// Alliance sharing - tracks what each player shares with their ally
	// Asymmetric: each player controls their own sharing toggles independently
	allianceSharing: defineTable({
		allianceId: v.id('alliances'),
		playerId: v.id('gamePlayers'), // The player granting this sharing
		sharingType: v.union(v.literal('vision'), v.literal('gold'), v.literal('upgrades'), v.literal('armyPositions'), v.literal('spyIntel')),
		enabled: v.boolean(),
	})
		.index('by_allianceId', ['allianceId'])
		.index('by_playerId', ['playerId']),
});

export default schema;
