import { v } from 'convex/values';

import { internal } from './_generated/api';
import { internalMutation } from './_generated/server';

import type { Id } from './_generated/dataModel';

const TICK_INTERVAL_MS = 1000; // 1 second per tick
const UPKEEP_PER_UNIT = 0.1; // gold/sec per military unit

// Combat constants
const UNIT_BASE_HP = 100;
const UNIT_STRENGTH = 20;
const UNIT_DEFENSE = 0.2; // 20%
const DEFENDER_BONUS = 0.1; // +10% defense for defender

function randomRange(min: number, max: number): number {
	return Math.random() * (max - min) + min;
}

export const processTick = internalMutation({
	args: { gameId: v.id('games') },
	handler: async (ctx, { gameId }) => {
		const game = await ctx.db.get(gameId);
		if (!game || game.status !== 'inProgress') {
			return;
		}

		const currentTick = (game.currentTick ?? 0) + 1;
		await ctx.db.patch(gameId, {
			currentTick,
			lastTickAt: Date.now(),
		});

		// Get all game data
		const allTiles = await ctx.db
			.query('tiles')
			.withIndex('by_gameId', (q) => q.eq('gameId', gameId))
			.collect();

		const allArmies = await ctx.db
			.query('armies')
			.withIndex('by_gameId', (q) => q.eq('gameId', gameId))
			.collect();

		const allUnits = await ctx.db
			.query('units')
			.withIndex('by_gameId', (q) => q.eq('gameId', gameId))
			.collect();

		const tileMap = new Map(allTiles.map((t) => [t._id, t]));

		// Build unit counts per army
		const unitsByArmy = new Map<string, typeof allUnits>();
		for (const unit of allUnits) {
			const armyUnits = unitsByArmy.get(unit.armyId) ?? [];
			armyUnits.push(unit);
			unitsByArmy.set(unit.armyId, armyUnits);
		}

		// Process each active player
		const players = await ctx.db
			.query('gamePlayers')
			.withIndex('by_gameId', (q) => q.eq('gameId', gameId))
			.filter((q) => q.eq(q.field('eliminatedAt'), undefined))
			.collect();

		const now = Date.now();
		const eliminatedPlayerIds: string[] = [];

		for (const player of players) {
			if (player.population === undefined || player.labourRatio === undefined) {
				continue;
			}

			const labourers = Math.floor(player.population * (player.labourRatio / 100));
			const military = Math.floor(player.population * ((player.militaryRatio ?? 0) / 100));

			// Get player's tiles
			const playerTiles = allTiles.filter((t) => t.ownerId === player._id);
			const cityCount = playerTiles.filter((t) => t.type === 'city').length;
			const hasCapital = playerTiles.some((t) => t.type === 'capital');
			const popCap = (hasCapital ? 50 : 0) + cityCount * 20;

			// Count total military units for upkeep
			const playerArmies = allArmies.filter((a) => a.ownerId === player._id);
			const totalMilitary = playerArmies.reduce((sum, a) => {
				const armyUnits = unitsByArmy.get(a._id) ?? [];
				return sum + armyUnits.length;
			}, 0);
			const upkeepCost = totalMilitary * UPKEEP_PER_UNIT;

			// Gold: 1 gold/sec per 5 labourers - upkeep
			const goldPerTick = labourers / 5 - upkeepCost;
			const newGold = (player.gold ?? 0) + goldPerTick;

			// Population growth (only if total units below combined cap)
			let newPopulation = player.population;
			let newPopAccumulator = player.populationAccumulator ?? 0;
			const totalUnits = player.population + totalMilitary;

			if (totalUnits < popCap) {
				const popGrowthPerTick = (labourers / 10 + cityCount * 0.5) / 60;
				newPopAccumulator += popGrowthPerTick;

				if (newPopAccumulator >= 1) {
					const spawn = Math.floor(newPopAccumulator);
					newPopAccumulator -= spawn;
					const maxGrowth = popCap - totalUnits;
					newPopulation = player.population + Math.min(spawn, maxGrowth);
				}
			} else {
				newPopAccumulator = 0;
			}

			// Enforce hard cap - reduce if over
			if (totalUnits > popCap) {
				const excess = totalUnits - popCap;

				// Proportional reduction
				const civilianRatio = newPopulation / totalUnits;
				let civilianReduction = Math.round(excess * civilianRatio);
				let militaryReduction = excess - civilianReduction;

				// Cap reductions to available amounts
				civilianReduction = Math.min(civilianReduction, newPopulation);
				militaryReduction = excess - civilianReduction; // Military takes remainder

				newPopulation -= civilianReduction;

				// Delete military units from capital first
				if (militaryReduction > 0) {
					const capitalTile = playerTiles.find((t) => t.type === 'capital');
					const capitalArmy = capitalTile ? playerArmies.find((a) => a.tileId === capitalTile._id && !a.targetTileId) : null;

					if (capitalArmy) {
						const capitalUnits = unitsByArmy.get(capitalArmy._id) ?? [];
						const toDelete = Math.min(militaryReduction, capitalUnits.length);
						for (let i = 0; i < toDelete; i++) {
							await ctx.db.delete(capitalUnits[i]._id);
						}
						militaryReduction -= toDelete;

						// Delete army if empty
						if (toDelete >= capitalUnits.length) {
							await ctx.db.delete(capitalArmy._id);
						}
					}

					// If still over, delete from other armies
					if (militaryReduction > 0) {
						for (const army of playerArmies) {
							if (militaryReduction <= 0) {
								break;
							}
							const armyUnits = unitsByArmy.get(army._id) ?? [];
							const toDelete = Math.min(militaryReduction, armyUnits.length);
							for (let i = 0; i < toDelete; i++) {
								await ctx.db.delete(armyUnits[i]._id);
							}
							militaryReduction -= toDelete;
							if (toDelete >= armyUnits.length) {
								await ctx.db.delete(army._id);
							}
						}
					}
				}
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
					const existingArmy = playerArmies.find((a) => a.tileId === player.rallyPointTileId && !a.targetTileId);

					let targetArmyId: Id<'armies'>;
					if (existingArmy) {
						targetArmyId = existingArmy._id;
					} else {
						targetArmyId = await ctx.db.insert('armies', {
							gameId,
							ownerId: player._id,
							tileId: player.rallyPointTileId,
						});
					}

					// Create individual units
					for (let i = 0; i < unitsToSpawn; i++) {
						await ctx.db.insert('units', {
							gameId,
							armyId: targetArmyId,
							hp: UNIT_BASE_HP,
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

			// Process capital movement completion
			if (player.capitalMovingToTileId && player.capitalMoveArrivalTime && now >= player.capitalMoveArrivalTime) {
				const targetTile = tileMap.get(player.capitalMovingToTileId);
				const capitalTile = playerTiles.find((t) => t.type === 'capital');

				if (targetTile && capitalTile) {
					// Change old capital to city
					await ctx.db.patch(capitalTile._id, { type: 'city' });
					// Change destination city to capital
					await ctx.db.patch(targetTile._id, { type: 'capital' });
				}

				// Clear movement fields
				await ctx.db.patch(player._id, {
					capitalMovingToTileId: undefined,
					capitalMoveDepartureTime: undefined,
					capitalMoveArrivalTime: undefined,
					capitalMovePath: undefined,
				});
			}
		}

		// Process army movement and arrivals
		// Track which armies arrived this tick for combat defender determination
		const arrivedArmyIds = new Set<string>();

		for (const army of allArmies) {
			if (!army.targetTileId || !army.arrivalTime || !army.path) {
				continue;
			}

			if (now >= army.arrivalTime) {
				const targetTile = tileMap.get(army.targetTileId);
				if (!targetTile) {
					continue;
				}

				arrivedArmyIds.add(army._id);

				// Move army to target tile (capture handled after combat)
				await ctx.db.patch(army._id, {
					tileId: army.targetTileId,
					targetTileId: undefined,
					path: undefined,
					departureTime: undefined,
					arrivalTime: undefined,
				});

				// Update our local reference
				army.tileId = army.targetTileId;
			}
		}

		// Reload armies after movement to get updated positions
		const armiesAfterMove = await ctx.db
			.query('armies')
			.withIndex('by_gameId', (q) => q.eq('gameId', gameId))
			.collect();

		// Reload units as well (in case any were added during spawning)
		const unitsAfterSpawn = await ctx.db
			.query('units')
			.withIndex('by_gameId', (q) => q.eq('gameId', gameId))
			.collect();

		// Rebuild unit map
		const freshUnitsByArmy = new Map<string, typeof unitsAfterSpawn>();
		for (const unit of unitsAfterSpawn) {
			const armyUnits = freshUnitsByArmy.get(unit.armyId) ?? [];
			armyUnits.push(unit);
			freshUnitsByArmy.set(unit.armyId, armyUnits);
		}

		// Build map of tiles -> armies on that tile
		const armiesByTile = new Map<string, typeof armiesAfterMove>();
		for (const army of armiesAfterMove) {
			const tileArmies = armiesByTile.get(army.tileId) ?? [];
			tileArmies.push(army);
			armiesByTile.set(army.tileId, tileArmies);
		}

		// Process combat on contested tiles
		const armiesDeleted = new Set<string>();

		for (const [_tileId, tileArmies] of armiesByTile) {
			// Get unique owners on this tile
			const ownerIds = [...new Set(tileArmies.map((a) => a.ownerId))];
			if (ownerIds.length < 2) {
				continue; // No combat if single owner
			}

			// Process one round of combat (free-for-all)
			// Determine defender: stationary army or first arrival
			const stationaryArmies = tileArmies.filter((a) => !arrivedArmyIds.has(a._id));
			const defenderOwnerId = stationaryArmies.length > 0 ? stationaryArmies[0].ownerId : tileArmies[0].ownerId;

			// Calculate damage for each army
			const damagePerArmy = new Map<string, number>();

			for (const army of tileArmies) {
				const armyUnits = freshUnitsByArmy.get(army._id) ?? [];
				if (armyUnits.length === 0) {
					continue;
				}

				// Calculate total enemy strength attacking this army
				const enemyArmies = tileArmies.filter((a) => a.ownerId !== army.ownerId);
				const enemyStrength = enemyArmies.reduce((sum, a) => {
					const units = freshUnitsByArmy.get(a._id) ?? [];
					return sum + units.length * UNIT_STRENGTH;
				}, 0);

				if (enemyStrength === 0) {
					continue;
				}

				// Calculate damage this army receives
				const isDefender = army.ownerId === defenderOwnerId;
				const armyDefense = isDefender ? UNIT_DEFENSE + DEFENDER_BONUS : UNIT_DEFENSE;
				const damageReceived = (enemyStrength / 10) * (1 - armyDefense) * randomRange(0.9, 1.1);

				damagePerArmy.set(army._id, damageReceived);
			}

			// Apply damage to units
			for (const army of tileArmies) {
				const damage = damagePerArmy.get(army._id);
				if (!damage) {
					continue;
				}

				const armyUnits = freshUnitsByArmy.get(army._id) ?? [];
				if (armyUnits.length === 0) {
					continue;
				}

				const damagePerUnit = damage / armyUnits.length;

				// Apply damage to each unit
				for (const unit of armyUnits) {
					const newHp = unit.hp - damagePerUnit;
					if (newHp <= 0) {
						await ctx.db.delete(unit._id);
					} else {
						await ctx.db.patch(unit._id, { hp: newHp });
					}
				}

				// Check if army is eliminated (all units dead)
				const remainingUnits = armyUnits.filter((u) => u.hp - damagePerUnit > 0);
				if (remainingUnits.length === 0) {
					await ctx.db.delete(army._id);
					armiesDeleted.add(army._id);
				}
			}

			// Check for battle winner and update stats
			const remainingOwners = tileArmies.filter((a) => !armiesDeleted.has(a._id)).map((a) => a.ownerId);
			const uniqueRemainingOwners = [...new Set(remainingOwners)];

			if (uniqueRemainingOwners.length === 1) {
				// Single owner remaining = battle won
				const winnerId = uniqueRemainingOwners[0];
				const winner = players.find((p) => p._id === winnerId);
				if (winner) {
					await ctx.db.patch(winnerId, {
						statBattlesWon: (winner.statBattlesWon ?? 0) + 1,
					});
				}
			}
		}

		// Process tile captures (only if no enemy army present)
		for (const army of armiesAfterMove) {
			if (armiesDeleted.has(army._id)) {
				continue;
			}
			if (!arrivedArmyIds.has(army._id)) {
				continue;
			}

			const tile = tileMap.get(army.tileId);
			if (!tile) {
				continue;
			}

			// Check if any enemy army on this tile
			const tileArmies = armiesByTile.get(army.tileId) ?? [];
			const enemyArmies = tileArmies.filter((a) => a.ownerId !== army.ownerId && !armiesDeleted.has(a._id));

			if (enemyArmies.length > 0) {
				continue; // Can't capture while contested
			}

			const previousOwnerId = tile.ownerId;
			if (tile.ownerId !== army.ownerId) {
				await ctx.db.patch(tile._id, { ownerId: army.ownerId });

				// Check if capital was captured
				if (tile.type === 'capital' && previousOwnerId) {
					eliminatedPlayerIds.push(previousOwnerId);
				}
			}

			// Merge with existing friendly army
			const existingArmy = tileArmies.find(
				(a) => a._id !== army._id && a.ownerId === army.ownerId && !a.targetTileId && !armiesDeleted.has(a._id),
			);

			if (existingArmy) {
				// Transfer all units to existing army
				const arrivingUnits = freshUnitsByArmy.get(army._id) ?? [];
				for (const unit of arrivingUnits) {
					await ctx.db.patch(unit._id, { armyId: existingArmy._id });
				}
				await ctx.db.delete(army._id);
				armiesDeleted.add(army._id);
			}
		}

		// Process eliminations (capital captured)
		for (const eliminatedId of eliminatedPlayerIds) {
			const eliminated = players.find((p) => p._id === eliminatedId);
			if (!eliminated || eliminated.eliminatedAt) {
				continue;
			}

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

			// Delete eliminated player's armies and units
			const eliminatedArmies = armiesAfterMove.filter((a) => a.ownerId === eliminatedId);
			for (const army of eliminatedArmies) {
				const armyUnits = freshUnitsByArmy.get(army._id) ?? [];
				for (const unit of armyUnits) {
					await ctx.db.delete(unit._id);
				}
				await ctx.db.delete(army._id);
			}
		}

		// Check for debt elimination (gold <= -50)
		for (const player of players) {
			if (eliminatedPlayerIds.includes(player._id)) {
				continue;
			}
			if (player.eliminatedAt) {
				continue;
			}

			const currentGold = player.gold ?? 0;
			if (currentGold <= -50) {
				const activePlayers = players.filter((p) => !p.eliminatedAt && !eliminatedPlayerIds.includes(p._id) && p._id !== player._id);
				const finishPosition = activePlayers.length + 1;

				await ctx.db.patch(player._id, {
					eliminatedAt: now,
					eliminationReason: 'debt',
					finishPosition,
					statTimeLasted: game.startedAt ? now - game.startedAt : 0,
				});

				eliminatedPlayerIds.push(player._id);

				// Update lifetime stats
				const user = await ctx.db.get(player.userId);
				if (user) {
					await ctx.db.patch(player.userId, {
						statGamesPlayed: (user.statGamesPlayed ?? 0) + 1,
						statTimePlayed: (user.statTimePlayed ?? 0) + (game.startedAt ? now - game.startedAt : 0),
					});
				}

				// Delete player's armies and units
				const playerArmies = armiesAfterMove.filter((a) => a.ownerId === player._id);
				for (const army of playerArmies) {
					const armyUnits = freshUnitsByArmy.get(army._id) ?? [];
					for (const unit of armyUnits) {
						await ctx.db.delete(unit._id);
					}
					await ctx.db.delete(army._id);
				}
			}
		}

		// Check for winner
		const remainingPlayers = players.filter((p) => !p.eliminatedAt && !eliminatedPlayerIds.includes(p._id));

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

		// Schedule next tick
		await ctx.scheduler.runAfter(TICK_INTERVAL_MS, internal.tick.processTick, { gameId });
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
		await ctx.scheduler.runAfter(TICK_INTERVAL_MS, internal.tick.processTick, { gameId });
	},
});
