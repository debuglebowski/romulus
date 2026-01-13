import { v } from 'convex/values';

import { internalMutation, mutation, query } from './_generated/server';
import { auth } from './auth';
import { computeLineOfSight } from './lib/hex';

import type { Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';

// Sharing types that can be toggled
const SHARING_TYPES = ['vision', 'gold', 'upgrades', 'armyPositions', 'spyIntel'] as const;
type SharingType = (typeof SHARING_TYPES)[number];

// Helper to get player from user
async function getPlayerFromUser(ctx: QueryCtx | MutationCtx, gameId: Id<'games'>, userId: Id<'users'>) {
	return ctx.db
		.query('gamePlayers')
		.withIndex('by_gameId', (q) => q.eq('gameId', gameId))
		.filter((q) => q.eq(q.field('userId'), userId))
		.first();
}

// Helper to get the other player in an alliance
function getOtherPlayerId(
	alliance: { player1Id: Id<'gamePlayers'>; player2Id: Id<'gamePlayers'> },
	myPlayerId: Id<'gamePlayers'>,
): Id<'gamePlayers'> {
	return alliance.player1Id === myPlayerId ? alliance.player2Id : alliance.player1Id;
}

// Helper to check if a player is part of an alliance
function isPlayerInAlliance(
	alliance: { player1Id: Id<'gamePlayers'>; player2Id: Id<'gamePlayers'> },
	playerId: Id<'gamePlayers'>,
): boolean {
	return alliance.player1Id === playerId || alliance.player2Id === playerId;
}

// Helper to create sharing records for both players (all disabled by default)
async function createSharingRecords(ctx: MutationCtx, allianceId: Id<'alliances'>, player1Id: Id<'gamePlayers'>, player2Id: Id<'gamePlayers'>) {
	for (const playerId of [player1Id, player2Id]) {
		for (const sharingType of SHARING_TYPES) {
			await ctx.db.insert('allianceSharing', {
				allianceId,
				playerId,
				sharingType,
				enabled: false,
			});
		}
	}
}

// Helper to delete all sharing records for an alliance
async function deleteSharingRecords(ctx: MutationCtx, allianceId: Id<'alliances'>) {
	const sharingRecords = await ctx.db
		.query('allianceSharing')
		.withIndex('by_allianceId', (q) => q.eq('allianceId', allianceId))
		.collect();

	for (const record of sharingRecords) {
		await ctx.db.delete(record._id);
	}
}

// ============================================
// MUTATIONS
// ============================================

export const sendInvitation = mutation({
	args: {
		gameId: v.id('games'),
		targetPlayerId: v.id('gamePlayers'),
	},
	handler: async (ctx, { gameId, targetPlayerId }) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) {
			throw new Error('Not authenticated');
		}

		const player = await getPlayerFromUser(ctx, gameId, userId);
		if (!player) {
			throw new Error('Not in game');
		}

		if (player.eliminatedAt) {
			throw new Error('Cannot send alliance invitation while eliminated');
		}

		// Block when capital is moving (player is frozen)
		if (player.capitalMovingToTileId) {
			throw new Error('Cannot send alliance invitation while capital is relocating');
		}

		// Can't invite yourself
		if (player._id === targetPlayerId) {
			throw new Error('Cannot ally with yourself');
		}

		// Check target player exists and is not eliminated
		const targetPlayer = await ctx.db.get(targetPlayerId);
		if (!targetPlayer) {
			throw new Error('Target player not found');
		}
		if (targetPlayer.gameId !== gameId) {
			throw new Error('Target player not in same game');
		}
		if (targetPlayer.eliminatedAt) {
			throw new Error('Cannot ally with eliminated player');
		}

		// Check if alliance already exists (pending or active) between these players
		const existingAlliance1 = await ctx.db
			.query('alliances')
			.withIndex('by_player1Id', (q) => q.eq('player1Id', player._id))
			.filter((q) => q.eq(q.field('player2Id'), targetPlayerId))
			.first();

		const existingAlliance2 = await ctx.db
			.query('alliances')
			.withIndex('by_player2Id', (q) => q.eq('player2Id', player._id))
			.filter((q) => q.eq(q.field('player1Id'), targetPlayerId))
			.first();

		if (existingAlliance1 || existingAlliance2) {
			throw new Error('Alliance already exists or pending with this player');
		}

		// Create pending alliance
		const allianceId = await ctx.db.insert('alliances', {
			gameId,
			player1Id: player._id,
			player2Id: targetPlayerId,
			status: 'pending',
			createdAt: Date.now(),
		});

		// Create sharing records for both players (all disabled by default)
		await createSharingRecords(ctx, allianceId, player._id, targetPlayerId);

		return allianceId;
	},
});

export const acceptInvitation = mutation({
	args: {
		allianceId: v.id('alliances'),
	},
	handler: async (ctx, { allianceId }) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) {
			throw new Error('Not authenticated');
		}

		const alliance = await ctx.db.get(allianceId);
		if (!alliance) {
			throw new Error('Alliance not found');
		}

		const player = await getPlayerFromUser(ctx, alliance.gameId, userId);
		if (!player) {
			throw new Error('Not in game');
		}

		// Only the invited player (player2) can accept
		if (alliance.player2Id !== player._id) {
			throw new Error('Only the invited player can accept');
		}

		if (alliance.status !== 'pending') {
			throw new Error('Alliance is not pending');
		}

		if (player.eliminatedAt) {
			throw new Error('Cannot accept alliance while eliminated');
		}

		// Block when capital is moving (player is frozen)
		if (player.capitalMovingToTileId) {
			throw new Error('Cannot accept alliance while capital is relocating');
		}

		await ctx.db.patch(allianceId, { status: 'active' });
	},
});

export const rejectInvitation = mutation({
	args: {
		allianceId: v.id('alliances'),
	},
	handler: async (ctx, { allianceId }) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) {
			throw new Error('Not authenticated');
		}

		const alliance = await ctx.db.get(allianceId);
		if (!alliance) {
			throw new Error('Alliance not found');
		}

		const player = await getPlayerFromUser(ctx, alliance.gameId, userId);
		if (!player) {
			throw new Error('Not in game');
		}

		// Only the invited player (player2) can reject
		if (alliance.player2Id !== player._id) {
			throw new Error('Only the invited player can reject');
		}

		if (alliance.status !== 'pending') {
			throw new Error('Alliance is not pending');
		}

		// Delete sharing records and alliance
		await deleteSharingRecords(ctx, allianceId);
		await ctx.db.delete(allianceId);
	},
});

export const cancelInvitation = mutation({
	args: {
		allianceId: v.id('alliances'),
	},
	handler: async (ctx, { allianceId }) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) {
			throw new Error('Not authenticated');
		}

		const alliance = await ctx.db.get(allianceId);
		if (!alliance) {
			throw new Error('Alliance not found');
		}

		const player = await getPlayerFromUser(ctx, alliance.gameId, userId);
		if (!player) {
			throw new Error('Not in game');
		}

		// Only the sender (player1) can cancel
		if (alliance.player1Id !== player._id) {
			throw new Error('Only the sender can cancel');
		}

		if (alliance.status !== 'pending') {
			throw new Error('Alliance is not pending');
		}

		// Delete sharing records and alliance
		await deleteSharingRecords(ctx, allianceId);
		await ctx.db.delete(allianceId);
	},
});

export const breakAlliance = mutation({
	args: {
		allianceId: v.id('alliances'),
	},
	handler: async (ctx, { allianceId }) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) {
			throw new Error('Not authenticated');
		}

		const alliance = await ctx.db.get(allianceId);
		if (!alliance) {
			throw new Error('Alliance not found');
		}

		const player = await getPlayerFromUser(ctx, alliance.gameId, userId);
		if (!player) {
			throw new Error('Not in game');
		}

		// Either player can break the alliance
		if (!isPlayerInAlliance(alliance, player._id)) {
			throw new Error('Not part of this alliance');
		}

		if (alliance.status !== 'active') {
			throw new Error('Alliance is not active');
		}

		// Delete sharing records and alliance
		await deleteSharingRecords(ctx, allianceId);
		await ctx.db.delete(allianceId);
	},
});

export const updateSharing = mutation({
	args: {
		allianceId: v.id('alliances'),
		sharingType: v.union(
			v.literal('vision'),
			v.literal('gold'),
			v.literal('upgrades'),
			v.literal('armyPositions'),
			v.literal('spyIntel'),
		),
		enabled: v.boolean(),
	},
	handler: async (ctx, { allianceId, sharingType, enabled }) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) {
			throw new Error('Not authenticated');
		}

		const alliance = await ctx.db.get(allianceId);
		if (!alliance) {
			throw new Error('Alliance not found');
		}

		const player = await getPlayerFromUser(ctx, alliance.gameId, userId);
		if (!player) {
			throw new Error('Not in game');
		}

		if (!isPlayerInAlliance(alliance, player._id)) {
			throw new Error('Not part of this alliance');
		}

		if (alliance.status !== 'active') {
			throw new Error('Can only update sharing for active alliances');
		}

		// Find the sharing record for this player and type
		const sharingRecords = await ctx.db
			.query('allianceSharing')
			.withIndex('by_allianceId', (q) => q.eq('allianceId', allianceId))
			.collect();

		const record = sharingRecords.find((r) => r.playerId === player._id && r.sharingType === sharingType);

		if (record) {
			await ctx.db.patch(record._id, { enabled });
		}
	},
});

// Internal mutation for auto-breaking alliances on combat (called from tick.ts)
export const breakAllianceIfExists = internalMutation({
	args: {
		player1Id: v.id('gamePlayers'),
		player2Id: v.id('gamePlayers'),
	},
	handler: async (ctx, { player1Id, player2Id }) => {
		// Find active alliance between these players
		const alliance1 = await ctx.db
			.query('alliances')
			.withIndex('by_player1Id', (q) => q.eq('player1Id', player1Id))
			.filter((q) => q.and(q.eq(q.field('player2Id'), player2Id), q.eq(q.field('status'), 'active')))
			.first();

		const alliance2 = await ctx.db
			.query('alliances')
			.withIndex('by_player1Id', (q) => q.eq('player1Id', player2Id))
			.filter((q) => q.and(q.eq(q.field('player2Id'), player1Id), q.eq(q.field('status'), 'active')))
			.first();

		const alliance = alliance1 || alliance2;
		if (alliance) {
			await deleteSharingRecords(ctx, alliance._id);
			await ctx.db.delete(alliance._id);
		}
	},
});

// ============================================
// QUERIES
// ============================================

export const getAlliances = query({
	args: { gameId: v.id('games') },
	handler: async (ctx, { gameId }) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) {
			return null;
		}

		const player = await getPlayerFromUser(ctx, gameId, userId);
		if (!player) {
			return null;
		}

		// Get all alliances where this player is involved
		const alliances1 = await ctx.db
			.query('alliances')
			.withIndex('by_player1Id', (q) => q.eq('player1Id', player._id))
			.collect();

		const alliances2 = await ctx.db
			.query('alliances')
			.withIndex('by_player2Id', (q) => q.eq('player2Id', player._id))
			.collect();

		const allAlliances = [...alliances1, ...alliances2];

		// Get all players for username lookup
		const allPlayers = await ctx.db
			.query('gamePlayers')
			.withIndex('by_gameId', (q) => q.eq('gameId', gameId))
			.collect();

		const playerMap = new Map(allPlayers.map((p) => [p._id, p]));

		// Get all users for usernames
		const userIds = allPlayers.map((p) => p.userId);
		const users = await Promise.all(userIds.map((id) => ctx.db.get(id)));
		const userMap = new Map(users.filter((u) => u !== null).map((u) => [u._id, u]));

		// Get sharing records for all alliances
		const allianceIds = allAlliances.map((a) => a._id);
		const allSharing = await Promise.all(
			allianceIds.map((id) =>
				ctx.db
					.query('allianceSharing')
					.withIndex('by_allianceId', (q) => q.eq('allianceId', id))
					.collect(),
			),
		);

		const sharingByAlliance = new Map(allianceIds.map((id, i) => [id, allSharing[i]]));

		// Build result
		const result = allAlliances.map((alliance) => {
			const otherPlayerId = getOtherPlayerId(alliance, player._id);
			const otherPlayer = playerMap.get(otherPlayerId);
			const otherUser = otherPlayer ? userMap.get(otherPlayer.userId) : null;

			const sharing = sharingByAlliance.get(alliance._id) ?? [];
			const mySharing = sharing.filter((s) => s.playerId === player._id);
			const theirSharing = sharing.filter((s) => s.playerId === otherPlayerId);

			return {
				_id: alliance._id,
				status: alliance.status,
				createdAt: alliance.createdAt,
				isSender: alliance.player1Id === player._id,
				otherPlayer: {
					_id: otherPlayerId,
					username: otherUser?.username ?? 'Unknown',
					color: otherPlayer?.color ?? '#888888',
					eliminatedAt: otherPlayer?.eliminatedAt,
				},
				mySharing: Object.fromEntries(mySharing.map((s) => [s.sharingType, s.enabled])) as Record<SharingType, boolean>,
				theirSharing: Object.fromEntries(theirSharing.map((s) => [s.sharingType, s.enabled])) as Record<SharingType, boolean>,
			};
		});

		return {
			playerId: player._id,
			active: result.filter((a) => a.status === 'active'),
			pendingSent: result.filter((a) => a.status === 'pending' && a.isSender),
			pendingReceived: result.filter((a) => a.status === 'pending' && !a.isSender),
		};
	},
});

export const getAlliedPlayerIds = query({
	args: { gameId: v.id('games') },
	handler: async (ctx, { gameId }) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) {
			return [];
		}

		const player = await getPlayerFromUser(ctx, gameId, userId);
		if (!player) {
			return [];
		}

		// Get all active alliances
		const alliances1 = await ctx.db
			.query('alliances')
			.withIndex('by_player1Id', (q) => q.eq('player1Id', player._id))
			.filter((q) => q.eq(q.field('status'), 'active'))
			.collect();

		const alliances2 = await ctx.db
			.query('alliances')
			.withIndex('by_player2Id', (q) => q.eq('player2Id', player._id))
			.filter((q) => q.eq(q.field('status'), 'active'))
			.collect();

		const alliedIds = [
			...alliances1.map((a) => a.player2Id),
			...alliances2.map((a) => a.player1Id),
		];

		return alliedIds;
	},
});

export const getSharedVision = query({
	args: { gameId: v.id('games') },
	handler: async (ctx, { gameId }) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) {
			return [];
		}

		const player = await getPlayerFromUser(ctx, gameId, userId);
		if (!player) {
			return [];
		}

		// Get all active alliances
		const alliances1 = await ctx.db
			.query('alliances')
			.withIndex('by_player1Id', (q) => q.eq('player1Id', player._id))
			.filter((q) => q.eq(q.field('status'), 'active'))
			.collect();

		const alliances2 = await ctx.db
			.query('alliances')
			.withIndex('by_player2Id', (q) => q.eq('player2Id', player._id))
			.filter((q) => q.eq(q.field('status'), 'active'))
			.collect();

		const allAlliances = [...alliances1, ...alliances2];
		if (allAlliances.length === 0) {
			return [];
		}

		// Check which allies share vision with us
		const allyVisionTiles: Array<{ q: number; r: number; allyId: string; allyColor: string }> = [];

		for (const alliance of allAlliances) {
			const allyId = getOtherPlayerId(alliance, player._id);

			// Check if ally shares vision with us
			const allySharing = await ctx.db
				.query('allianceSharing')
				.withIndex('by_allianceId', (q) => q.eq('allianceId', alliance._id))
				.filter((q) => q.and(q.eq(q.field('playerId'), allyId), q.eq(q.field('sharingType'), 'vision')))
				.first();

			if (!allySharing?.enabled) {
				continue;
			}

			// Get ally's owned tiles
			const allyPlayer = await ctx.db.get(allyId);
			if (!allyPlayer || allyPlayer.eliminatedAt) {
				continue;
			}

			const allyTiles = await ctx.db
				.query('tiles')
				.withIndex('by_gameId', (q) => q.eq('gameId', gameId))
				.filter((q) => q.eq(q.field('ownerId'), allyId))
				.collect();

			// Compute ally's line of sight
			const allyLos = computeLineOfSight(allyTiles);

			// Add tiles visible to ally
			for (const key of allyLos) {
				const [q, r] = key.split(',').map(Number);
				allyVisionTiles.push({
					q,
					r,
					allyId,
					allyColor: allyPlayer.color,
				});
			}
		}

		return allyVisionTiles;
	},
});

export const getSharedEconomy = query({
	args: { gameId: v.id('games') },
	handler: async (ctx, { gameId }) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) {
			return [];
		}

		const player = await getPlayerFromUser(ctx, gameId, userId);
		if (!player) {
			return [];
		}

		// Get all active alliances
		const alliances1 = await ctx.db
			.query('alliances')
			.withIndex('by_player1Id', (q) => q.eq('player1Id', player._id))
			.filter((q) => q.eq(q.field('status'), 'active'))
			.collect();

		const alliances2 = await ctx.db
			.query('alliances')
			.withIndex('by_player2Id', (q) => q.eq('player2Id', player._id))
			.filter((q) => q.eq(q.field('status'), 'active'))
			.collect();

		const allAlliances = [...alliances1, ...alliances2];
		const result: Array<{ allyId: string; gold: number; population: number }> = [];

		for (const alliance of allAlliances) {
			const allyId = getOtherPlayerId(alliance, player._id);

			// Check if ally shares gold with us
			const allySharing = await ctx.db
				.query('allianceSharing')
				.withIndex('by_allianceId', (q) => q.eq('allianceId', alliance._id))
				.filter((q) => q.and(q.eq(q.field('playerId'), allyId), q.eq(q.field('sharingType'), 'gold')))
				.first();

			if (!allySharing?.enabled) {
				continue;
			}

			const allyPlayer = await ctx.db.get(allyId);
			if (!allyPlayer || allyPlayer.eliminatedAt) {
				continue;
			}

			result.push({
				allyId,
				gold: allyPlayer.gold ?? 0,
				population: allyPlayer.population ?? 0,
			});
		}

		return result;
	},
});

export const getSharedArmyPositions = query({
	args: { gameId: v.id('games') },
	handler: async (ctx, { gameId }) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) {
			return [];
		}

		const player = await getPlayerFromUser(ctx, gameId, userId);
		if (!player) {
			return [];
		}

		// Get all active alliances
		const alliances1 = await ctx.db
			.query('alliances')
			.withIndex('by_player1Id', (q) => q.eq('player1Id', player._id))
			.filter((q) => q.eq(q.field('status'), 'active'))
			.collect();

		const alliances2 = await ctx.db
			.query('alliances')
			.withIndex('by_player2Id', (q) => q.eq('player2Id', player._id))
			.filter((q) => q.eq(q.field('status'), 'active'))
			.collect();

		const allAlliances = [...alliances1, ...alliances2];
		const allyArmies: Array<{
			_id: string;
			ownerId: string;
			tileId: string;
			currentQ: number;
			currentR: number;
			unitCount: number;
			isMoving: boolean;
		}> = [];

		const allTiles = await ctx.db
			.query('tiles')
			.withIndex('by_gameId', (q) => q.eq('gameId', gameId))
			.collect();
		const tileMap = new Map(allTiles.map((t) => [t._id, t]));

		const allUnits = await ctx.db
			.query('units')
			.withIndex('by_gameId', (q) => q.eq('gameId', gameId))
			.collect();

		const unitsByArmy = new Map<string, number>();
		for (const unit of allUnits) {
			unitsByArmy.set(unit.armyId, (unitsByArmy.get(unit.armyId) ?? 0) + 1);
		}

		const now = Date.now();

		for (const alliance of allAlliances) {
			const allyId = getOtherPlayerId(alliance, player._id);

			// Check if ally shares army positions with us
			const allySharing = await ctx.db
				.query('allianceSharing')
				.withIndex('by_allianceId', (q) => q.eq('allianceId', alliance._id))
				.filter((q) => q.and(q.eq(q.field('playerId'), allyId), q.eq(q.field('sharingType'), 'armyPositions')))
				.first();

			if (!allySharing?.enabled) {
				continue;
			}

			const allyPlayer = await ctx.db.get(allyId);
			if (!allyPlayer || allyPlayer.eliminatedAt) {
				continue;
			}

			// Get ally's armies
			const armies = await ctx.db
				.query('armies')
				.withIndex('by_ownerId', (q) => q.eq('ownerId', allyId))
				.collect();

			for (const army of armies) {
				const baseTile = tileMap.get(army.tileId);
				if (!baseTile) {
					continue;
				}

				let currentQ = baseTile.q;
				let currentR = baseTile.r;

				// If moving, compute current position
				if (army.targetTileId && army.departureTime && army.arrivalTime && army.path && army.path.length > 0) {
					const elapsed = now - army.departureTime;
					const totalTime = army.arrivalTime - army.departureTime;
					const progress = Math.min(elapsed / totalTime, 1);
					const pathIndex = Math.min(Math.floor(progress * army.path.length), army.path.length - 1);
					const currentPathHex = army.path[pathIndex];
					currentQ = currentPathHex.q;
					currentR = currentPathHex.r;
				}

				allyArmies.push({
					_id: army._id,
					ownerId: allyId,
					tileId: army.tileId,
					currentQ,
					currentR,
					unitCount: unitsByArmy.get(army._id) ?? 0,
					isMoving: !!army.targetTileId,
				});
			}
		}

		return allyArmies;
	},
});

export const getSharedUpgrades = query({
	args: { gameId: v.id('games') },
	handler: async (ctx, { gameId }) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) {
			return [];
		}

		const player = await getPlayerFromUser(ctx, gameId, userId);
		if (!player) {
			return [];
		}

		// Get all active alliances
		const alliances1 = await ctx.db
			.query('alliances')
			.withIndex('by_player1Id', (q) => q.eq('player1Id', player._id))
			.filter((q) => q.eq(q.field('status'), 'active'))
			.collect();

		const alliances2 = await ctx.db
			.query('alliances')
			.withIndex('by_player2Id', (q) => q.eq('player2Id', player._id))
			.filter((q) => q.eq(q.field('status'), 'active'))
			.collect();

		const allAlliances = [...alliances1, ...alliances2];
		const result: Array<{ allyId: string; allyColor: string; upgrades: string[] }> = [];

		for (const alliance of allAlliances) {
			const allyId = getOtherPlayerId(alliance, player._id);

			// Check if ally shares upgrades with us
			const allySharing = await ctx.db
				.query('allianceSharing')
				.withIndex('by_allianceId', (q) => q.eq('allianceId', alliance._id))
				.filter((q) => q.and(q.eq(q.field('playerId'), allyId), q.eq(q.field('sharingType'), 'upgrades')))
				.first();

			if (!allySharing?.enabled) {
				continue;
			}

			const allyPlayer = await ctx.db.get(allyId);
			if (!allyPlayer || allyPlayer.eliminatedAt) {
				continue;
			}

			// Get ally's upgrades
			const upgrades = await ctx.db
				.query('playerUpgrades')
				.withIndex('by_playerId', (q) => q.eq('playerId', allyId))
				.collect();

			result.push({
				allyId,
				allyColor: allyPlayer.color,
				upgrades: upgrades.map((u) => u.upgradeId),
			});
		}

		return result;
	},
});

// Get other players in the game that are not allied or pending
export const getOtherPlayers = query({
	args: { gameId: v.id('games') },
	handler: async (ctx, { gameId }) => {
		const userId = await auth.getUserId(ctx);
		if (!userId) {
			return [];
		}

		const player = await getPlayerFromUser(ctx, gameId, userId);
		if (!player) {
			return [];
		}

		// Get all alliances for this player
		const alliances1 = await ctx.db
			.query('alliances')
			.withIndex('by_player1Id', (q) => q.eq('player1Id', player._id))
			.collect();

		const alliances2 = await ctx.db
			.query('alliances')
			.withIndex('by_player2Id', (q) => q.eq('player2Id', player._id))
			.collect();

		const alliedOrPendingIds = new Set([
			...alliances1.map((a) => a.player2Id),
			...alliances2.map((a) => a.player1Id),
		]);

		// Get all players in the game
		const allPlayers = await ctx.db
			.query('gamePlayers')
			.withIndex('by_gameId', (q) => q.eq('gameId', gameId))
			.collect();

		// Get user info
		const userIds = allPlayers.map((p) => p.userId);
		const users = await Promise.all(userIds.map((id) => ctx.db.get(id)));
		const userMap = new Map(users.filter((u) => u !== null).map((u) => [u._id, u]));

		// Filter to players not allied/pending and not self
		return allPlayers
			.filter((p) => p._id !== player._id && !alliedOrPendingIds.has(p._id) && !p.eliminatedAt)
			.map((p) => {
				const user = userMap.get(p.userId);
				return {
					_id: p._id,
					username: user?.username ?? 'Unknown',
					color: p.color,
				};
			});
	},
});

// Internal helper for checking allies (used by armies.ts)
export const getAlliedPlayerIdsInternal = async (ctx: QueryCtx, playerId: Id<'gamePlayers'>): Promise<Set<Id<'gamePlayers'>>> => {
	// Get all active alliances
	const alliances1 = await ctx.db
		.query('alliances')
		.withIndex('by_player1Id', (q) => q.eq('player1Id', playerId))
		.filter((q) => q.eq(q.field('status'), 'active'))
		.collect();

	const alliances2 = await ctx.db
		.query('alliances')
		.withIndex('by_player2Id', (q) => q.eq('player2Id', playerId))
		.filter((q) => q.eq(q.field('status'), 'active'))
		.collect();

	return new Set([
		...alliances1.map((a) => a.player2Id),
		...alliances2.map((a) => a.player1Id),
	]);
};
