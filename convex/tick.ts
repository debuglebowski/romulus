import { v } from 'convex/values';
import { internal } from './_generated/api';
import { internalMutation } from './_generated/server';

const UPKEEP_PER_UNIT = 0.1; // gold/sec per military unit

export const processTick = internalMutation({
	args: { gameId: v.id('games') },
	handler: async (ctx, { gameId }) => {
		const game = await ctx.db.get(gameId);
		if (!game || game.status !== 'inProgress') return;

		const currentTick = (game.currentTick ?? 0) + 1;
		await ctx.db.patch(gameId, {
			currentTick,
			lastTickAt: Date.now(),
		});

		// Get all tiles and armies for this game
		const allTiles = await ctx.db
			.query('tiles')
			.withIndex('by_gameId', (q) => q.eq('gameId', gameId))
			.collect();

		const allArmies = await ctx.db
			.query('armies')
			.withIndex('by_gameId', (q) => q.eq('gameId', gameId))
			.collect();

		const tileMap = new Map(allTiles.map((t) => [t._id, t]));

		// Process each active player
		const players = await ctx.db
			.query('gamePlayers')
			.withIndex('by_gameId', (q) => q.eq('gameId', gameId))
			.filter((q) => q.eq(q.field('eliminatedAt'), undefined))
			.collect();

		const now = Date.now();
		const eliminatedPlayerIds: string[] = [];

		for (const player of players) {
			if (player.population === undefined || player.labourRatio === undefined) continue;

			const labourers = Math.floor(player.population * (player.labourRatio / 100));
			const military = Math.floor(player.population * ((player.militaryRatio ?? 0) / 100));

			// Get player's tiles
			const playerTiles = allTiles.filter((t) => t.ownerId === player._id);
			const cityCount = playerTiles.filter((t) => t.type === 'city').length;
			const hasCapital = playerTiles.some((t) => t.type === 'capital');
			const popCap = (hasCapital ? 50 : 0) + cityCount * 20;

			// Count total military units for upkeep
			const playerArmies = allArmies.filter((a) => a.ownerId === player._id);
			const totalUnits = playerArmies.reduce((sum, a) => sum + a.count, 0);
			const upkeepCost = totalUnits * UPKEEP_PER_UNIT;

			// Gold: 1 gold/sec per 5 labourers - upkeep
			const goldPerTick = labourers / 5 - upkeepCost;
			let newGold = (player.gold ?? 0) + goldPerTick;

			// Population growth (only if below cap)
			let newPopulation = player.population;
			let newPopAccumulator = player.populationAccumulator ?? 0;

			if (player.population < popCap) {
				const popGrowthPerTick = (labourers / 10 + cityCount * 0.5) / 60;
				newPopAccumulator += popGrowthPerTick;

				if (newPopAccumulator >= 1) {
					const spawn = Math.floor(newPopAccumulator);
					newPopAccumulator -= spawn;
					newPopulation = Math.min(popCap, player.population + spawn);
				}
			} else {
				newPopAccumulator = 0;
			}

			// Military spawning
			let newMilAccumulator = player.militaryAccumulator ?? 0;
			if (military > 0 && player.rallyPointTileId) {
				// Spawn rate: 1 unit per 60 seconds per military pop assigned
				const spawnRate = military / 60;
				newMilAccumulator += spawnRate;

				if (newMilAccumulator >= 1) {
					const unitsToSpawn = Math.floor(newMilAccumulator);
					newMilAccumulator -= unitsToSpawn;

					// Find or create army at rally point
					const existingArmy = playerArmies.find(
						(a) => a.tileId === player.rallyPointTileId && !a.targetTileId,
					);

					if (existingArmy) {
						await ctx.db.patch(existingArmy._id, { count: existingArmy.count + unitsToSpawn });
					} else {
						await ctx.db.insert('armies', {
							gameId,
							ownerId: player._id,
							tileId: player.rallyPointTileId,
							count: unitsToSpawn,
						});
					}
				}
			}

			await ctx.db.patch(player._id, {
				gold: newGold,
				population: newPopulation,
				populationAccumulator: newPopAccumulator,
				militaryAccumulator: newMilAccumulator,
			});
		}

		// Process army movement and captures
		for (const army of allArmies) {
			if (!army.targetTileId || !army.arrivalTime || !army.path) continue;

			if (now >= army.arrivalTime) {
				const targetTile = tileMap.get(army.targetTileId);
				if (!targetTile) continue;

				const previousOwnerId = targetTile.ownerId;

				// Capture tile if not owned by army owner
				if (targetTile.ownerId !== army.ownerId) {
					await ctx.db.patch(targetTile._id, { ownerId: army.ownerId });

					// Check if capital was captured
					if (targetTile.type === 'capital' && previousOwnerId) {
						eliminatedPlayerIds.push(previousOwnerId);
					}
				}

				// Check for existing friendly army to merge with
				const existingArmy = allArmies.find(
					(a) =>
						a._id !== army._id &&
						a.ownerId === army.ownerId &&
						a.tileId === army.targetTileId &&
						!a.targetTileId,
				);

				if (existingArmy) {
					await ctx.db.patch(existingArmy._id, { count: existingArmy.count + army.count });
					await ctx.db.delete(army._id);
				} else {
					await ctx.db.patch(army._id, {
						tileId: army.targetTileId,
						targetTileId: undefined,
						path: undefined,
						departureTime: undefined,
						arrivalTime: undefined,
					});
				}
			}
		}

		// Process eliminations
		for (const eliminatedId of eliminatedPlayerIds) {
			const eliminated = players.find((p) => p._id === eliminatedId);
			if (!eliminated || eliminated.eliminatedAt) continue;

			const activePlayers = players.filter((p) => !p.eliminatedAt && !eliminatedPlayerIds.includes(p._id));
			const finishPosition = activePlayers.length + eliminatedPlayerIds.length;

			await ctx.db.patch(eliminated._id, {
				eliminatedAt: now,
				eliminationReason: 'capitalCaptured',
				finishPosition,
				statTimeLasted: game.startedAt ? now - game.startedAt : 0,
			});

			// Update lifetime stats
			const user = await ctx.db.get(eliminated.userId);
			if (user) {
				await ctx.db.patch(eliminated.userId, {
					statGamesPlayed: (user.statGamesPlayed ?? 0) + 1,
					statTimePlayed: (user.statTimePlayed ?? 0) + (game.startedAt ? now - game.startedAt : 0),
				});
			}

			// Delete eliminated player's armies
			const eliminatedArmies = allArmies.filter((a) => a.ownerId === eliminatedId);
			for (const army of eliminatedArmies) {
				await ctx.db.delete(army._id);
			}
		}

		// Check for winner
		const remainingPlayers = players.filter(
			(p) => !p.eliminatedAt && !eliminatedPlayerIds.includes(p._id),
		);

		if (remainingPlayers.length === 1) {
			const winner = remainingPlayers[0];

			await ctx.db.patch(winner._id, {
				finishPosition: 1,
				statTimeLasted: game.startedAt ? now - game.startedAt : 0,
			});

			const winnerUser = await ctx.db.get(winner.userId);
			if (winnerUser) {
				await ctx.db.patch(winner.userId, {
					statGamesPlayed: (winnerUser.statGamesPlayed ?? 0) + 1,
					statWins: (winnerUser.statWins ?? 0) + 1,
					statTimePlayed: (winnerUser.statTimePlayed ?? 0) + (game.startedAt ? now - game.startedAt : 0),
				});
			}

			await ctx.db.patch(gameId, {
				status: 'finished',
				finishedAt: now,
			});

			return; // Don't schedule next tick
		}

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
