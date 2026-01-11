import { v } from 'convex/values';
import { internalMutation, query } from './_generated/server';
import { coordKey, getNeighbors, getStartingPositions, hexesInRadius } from './lib/hex';

export const generateMap = internalMutation({
	args: {
		gameId: v.id('games'),
		playerIds: v.array(v.id('gamePlayers')),
	},
	handler: async (ctx, { gameId, playerIds }) => {
		const playerCount = playerIds.length;
		const radius = 3 + playerCount;

		// Generate all hexes
		const allHexes = hexesInRadius(radius);
		const startingPositions = getStartingPositions(playerCount, radius);

		// Track which hexes are owned
		const ownedHexes = new Set<string>();

		// Create capitals and adjacent territories for each player
		for (let i = 0; i < playerCount; i++) {
			const pos = startingPositions[i];
			const playerId = playerIds[i];

			// Capital tile
			await ctx.db.insert('tiles', {
				gameId,
				q: pos.q,
				r: pos.r,
				ownerId: playerId,
				type: 'capital',
			});
			ownedHexes.add(coordKey(pos.q, pos.r));

			// 6 adjacent tiles
			const neighbors = getNeighbors(pos.q, pos.r);
			for (const n of neighbors) {
				// Check if within map bounds
				if (allHexes.some((h) => h.q === n.q && h.r === n.r)) {
					await ctx.db.insert('tiles', {
						gameId,
						q: n.q,
						r: n.r,
						ownerId: playerId,
						type: 'empty',
					});
					ownedHexes.add(coordKey(n.q, n.r));
				}
			}
		}

		// Scatter NPC cities
		const npcCityCount = playerCount * 2;
		const unownedHexes = allHexes.filter((h) => !ownedHexes.has(coordKey(h.q, h.r)));

		// Shuffle and pick random positions for NPC cities
		const shuffled = [...unownedHexes].sort(() => Math.random() - 0.5);
		const npcPositions = shuffled.slice(0, Math.min(npcCityCount, shuffled.length));

		for (const pos of npcPositions) {
			await ctx.db.insert('tiles', {
				gameId,
				q: pos.q,
				r: pos.r,
				ownerId: undefined,
				type: 'city',
			});
			ownedHexes.add(coordKey(pos.q, pos.r));
		}

		// Fill remaining hexes as empty unowned tiles
		for (const hex of allHexes) {
			if (!ownedHexes.has(coordKey(hex.q, hex.r))) {
				await ctx.db.insert('tiles', {
					gameId,
					q: hex.q,
					r: hex.r,
					ownerId: undefined,
					type: 'empty',
				});
			}
		}
	},
});

export const getForGame = query({
	args: { gameId: v.id('games') },
	handler: async (ctx, { gameId }) => {
		return ctx.db
			.query('tiles')
			.withIndex('by_gameId', (q) => q.eq('gameId', gameId))
			.collect();
	},
});
