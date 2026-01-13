import { v } from 'convex/values';

import { internal } from './_generated/api';
import { internalMutation } from './_generated/server';
import { coordKey, getNeighbors } from './lib/hex';
import { getUpgradeModifiers } from './upgrades';

import type { UpgradeEffects } from './upgrades';
import type { Id } from './_generated/dataModel';

const TICK_INTERVAL_MS = 1000; // 1 second per tick
const UPKEEP_PER_UNIT = 0.1; // gold/sec per military unit
const UPKEEP_PER_SPY = 0.2; // gold/sec per spy

// Spy detection constants (per tick = per second)
// Military detecting spies: 1% per unit per minute = 0.01/60 per unit per tick
const MILITARY_DETECTION_RATE = 0.01 / 60;
// Spies detecting spies: 4% per spy per minute = 0.04/60 per spy per tick
const SPY_DETECTION_RATE = 0.04 / 60;

// Combat constants
const UNIT_BASE_HP = 100;
const UNIT_STRENGTH = 20;
const UNIT_DEFENSE = 0.2; // 20%
const DEFENDER_BONUS = 0.1; // +10% defense for defender

// Capital intel tier thresholds (milliseconds)
// Tiers: 3min gold, 6min pop, 9min upgrades, 12min armies, 15min spies
const INTEL_TIER_DURATION_MS = 3 * 60 * 1000; // 3 minutes per tier
const INTEL_TIER_UPGRADES = 3; // Tier 3 (9 minutes) reveals upgrades

// Allegiance constants
const ALLEGIANCE_TICK_INTERVAL = 10; // Process allegiance every 10 ticks (10 seconds)
const ALLEGIANCE_NATURAL_DRIFT_OWNER = 1; // Owner gains +1 per 10 sec
const ALLEGIANCE_NATURAL_DRIFT_OTHERS = -1; // Others lose -1 per 10 sec
const ALLEGIANCE_SPY_INFLUENCE_OWNER = -2; // Owner loses -2 per spy per 10 sec
const ALLEGIANCE_SPY_INFLUENCE_TEAM = 1; // Spy's team gains +1 per spy per 10 sec

// Pause system constants (match games.ts)
const PAUSE_BUDGET_MS = 30 * 1000; // 30 seconds per player per game
const DISCONNECT_THRESHOLD_MS = 5 * 1000; // 5 seconds of no heartbeat = disconnect

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

		const now = Date.now();

		// Handle pause state
		if (game.isPaused && game.pausedByPlayerId && game.pausedAt) {
			const pausingPlayer = await ctx.db.get(game.pausedByPlayerId);
			if (pausingPlayer) {
				const timeUsed = pausingPlayer.pauseTimeUsed ?? 0;
				const pauseDuration = now - game.pausedAt;
				const totalTimeUsed = timeUsed + pauseDuration;

				// Check if pause budget exhausted
				if (totalTimeUsed >= PAUSE_BUDGET_MS) {
					// Force unpause
					await ctx.db.patch(game.pausedByPlayerId, {
						pauseTimeUsed: PAUSE_BUDGET_MS, // Cap at max
					});
					await ctx.db.patch(gameId, {
						isPaused: false,
						pausedByPlayerId: undefined,
						pausedAt: undefined,
					});
					// Continue with tick processing
				} else {
					// Still paused, reschedule tick and skip processing
					await ctx.scheduler.runAfter(TICK_INTERVAL_MS, internal.tick.processTick, { gameId });
					return;
				}
			} else {
				// Pausing player not found, force unpause
				await ctx.db.patch(gameId, {
					isPaused: false,
					pausedByPlayerId: undefined,
					pausedAt: undefined,
				});
			}
		}

		// Check for disconnected players and auto-pause
		const allPlayers = await ctx.db
			.query('gamePlayers')
			.withIndex('by_gameId', (q) => q.eq('gameId', gameId))
			.filter((q) => q.eq(q.field('eliminatedAt'), undefined))
			.collect();

		for (const player of allPlayers) {
			if (player.lastSeen && now - player.lastSeen > DISCONNECT_THRESHOLD_MS) {
				// Player disconnected - check if they have pause budget
				const timeUsed = player.pauseTimeUsed ?? 0;
				if (timeUsed < PAUSE_BUDGET_MS && !game.isPaused) {
					// Auto-pause the game
					await ctx.db.patch(gameId, {
						isPaused: true,
						pausedByPlayerId: player._id,
						pausedAt: now,
					});
					// Reschedule tick (pause will be handled next tick)
					await ctx.scheduler.runAfter(TICK_INTERVAL_MS, internal.tick.processTick, { gameId });
					return;
				}
			}
		}

		const currentTick = (game.currentTick ?? 0) + 1;
		await ctx.db.patch(gameId, {
			currentTick,
			lastTickAt: now,
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

		const allSpies = await ctx.db
			.query('spies')
			.withIndex('by_gameId', (q) => q.eq('gameId', gameId))
			.collect();

		// Fetch all player upgrades for modifier calculations
		const allUpgrades = await ctx.db
			.query('playerUpgrades')
			.withIndex('by_gameId', (q) => q.eq('gameId', gameId))
			.collect();

		// Build map of playerId -> upgrade modifiers
		const upgradesByPlayer = new Map<string, string[]>();
		for (const upgrade of allUpgrades) {
			const playerUpgrades = upgradesByPlayer.get(upgrade.playerId) ?? [];
			playerUpgrades.push(upgrade.upgradeId);
			upgradesByPlayer.set(upgrade.playerId, playerUpgrades);
		}

		const playerModifiers = new Map<string, UpgradeEffects>();
		for (const [playerId, upgradeIds] of upgradesByPlayer) {
			playerModifiers.set(playerId, getUpgradeModifiers(upgradeIds));
		}

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

		const eliminatedPlayerIds: string[] = [];

		for (const player of players) {
			// Auto-repair any corrupted numeric fields (NaN values)
			const needsRepair =
				!Number.isFinite(player.population) ||
				!Number.isFinite(player.gold) ||
				!Number.isFinite(player.labourRatio);

			if (needsRepair) {
				await ctx.db.patch(player._id, {
					population: Number.isFinite(player.population) ? player.population : 20,
					gold: Number.isFinite(player.gold) ? player.gold : 0,
					populationAccumulator: 0,
					militaryAccumulator: 0,
					spyAccumulator: 0,
					labourRatio: Number.isFinite(player.labourRatio) ? player.labourRatio : 100,
					militaryRatio: Number.isFinite(player.militaryRatio) ? player.militaryRatio : 0,
					spyRatio: Number.isFinite(player.spyRatio) ? player.spyRatio : 0,
				});
				continue; // Skip this tick to let repair take effect
			}

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
			const militaryUpkeep = totalMilitary * UPKEEP_PER_UNIT;

			// Count spies for upkeep
			const playerSpies = allSpies.filter((s) => s.ownerId === player._id);
			const spyUpkeep = playerSpies.length * UPKEEP_PER_SPY;

			// Get player's upgrade modifiers
			const modifiers = playerModifiers.get(player._id) ?? {};

			// Gold: 1 gold/sec per 5 labourers - upkeep, modified by labour efficiency bonus
			const upkeepCost = militaryUpkeep + spyUpkeep;
			const baseGoldRate = labourers / 5;
			const labourEfficiencyMultiplier = 1 + (modifiers.labourEfficiencyBonus ?? 0);
			const goldPerTick = baseGoldRate * labourEfficiencyMultiplier - upkeepCost;
			const newGold = (player.gold ?? 0) + goldPerTick;

			// Population growth (only if total units below combined cap)
			let newPopulation = player.population;
			let newPopAccumulator = player.populationAccumulator ?? 0;
			const totalUnits = player.population + totalMilitary;

			if (totalUnits < popCap) {
				// Apply population growth bonus from upgrades
				const popGrowthMultiplier = 1 + (modifiers.popGrowthBonus ?? 0);
				const popGrowthPerTick = ((labourers / 10 + cityCount * 0.5) / 60) * popGrowthMultiplier;
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

			// Recalculate totalUnits with newPopulation for accurate cap check
			const updatedTotalUnits = newPopulation + totalMilitary;

			// Enforce hard cap - reduce if over
			if (updatedTotalUnits > popCap) {
				const excess = updatedTotalUnits - popCap;

				// Proportional reduction
				const civilianRatio = newPopulation / updatedTotalUnits;
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

			// Calculate remaining capacity for spawning (after all cap adjustments)
			// Note: totalMilitary may be stale if units were deleted by hard cap, but that's safe
			// (it would be higher than actual, making remainingCapacity lower/conservative)
			const remainingCapacity = Math.max(0, popCap - (newPopulation + totalMilitary));

			// Military spawning
			let newMilAccumulator = player.militaryAccumulator ?? 0;
			if (military > 0 && player.rallyPointTileId) {
				// Spawn rate: 1 unit per 60 seconds per military pop assigned
				const spawnRate = military / 60;
				newMilAccumulator += spawnRate;

				if (newMilAccumulator >= 1) {
					const potentialSpawn = Math.floor(newMilAccumulator);
					const unitsToSpawn = Math.min(potentialSpawn, remainingCapacity);
					newMilAccumulator -= potentialSpawn; // Reset full amount to prevent accumulator buildup

					if (unitsToSpawn > 0) {
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
			}

			// Spy spawning
			const spyPopulation = Math.floor(player.population * ((player.spyRatio ?? 0) / 100));
			let newSpyAccumulator = player.spyAccumulator ?? 0;
			if (spyPopulation > 0 && player.rallyPointTileId) {
				// Spawn rate: 1 spy per 60 seconds per spy pop assigned
				const spawnRate = spyPopulation / 60;
				newSpyAccumulator += spawnRate;

				if (newSpyAccumulator >= 1) {
					const spiesToSpawn = Math.floor(newSpyAccumulator);
					newSpyAccumulator -= spiesToSpawn;

					// Create spies at rally point
					for (let i = 0; i < spiesToSpawn; i++) {
						await ctx.db.insert('spies', {
							gameId,
							ownerId: player._id,
							tileId: player.rallyPointTileId,
							isRevealed: false,
						});
					}
				}
			}

			// Guard against NaN before saving (defensive)
			const safeGold = Number.isFinite(newGold) ? newGold : 0;
			const safePop = Number.isFinite(newPopulation) ? newPopulation : 20;
			const safePopAcc = Number.isFinite(newPopAccumulator) ? newPopAccumulator : 0;
			const safeMilAcc = Number.isFinite(newMilAccumulator) ? newMilAccumulator : 0;
			const safeSpyAcc = Number.isFinite(newSpyAccumulator) ? newSpyAccumulator : 0;

			await ctx.db.patch(player._id, {
				gold: safeGold,
				population: safePop,
				populationAccumulator: safePopAcc,
				militaryAccumulator: safeMilAcc,
				spyAccumulator: safeSpyAcc,
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

				// Create cityUnderAttack event if army enters enemy city/capital
				if (
					(targetTile.type === 'city' || targetTile.type === 'capital') &&
					targetTile.ownerId &&
					targetTile.ownerId !== army.ownerId
				) {
					const attackerPlayer = players.find((p) => p._id === army.ownerId);
					const defenderPlayer = players.find((p) => p._id === targetTile.ownerId);
					if (attackerPlayer && defenderPlayer) {
						await ctx.db.insert('gameEvents', {
							gameId,
							actorPlayerId: attackerPlayer.userId,
							targetPlayerId: defenderPlayer.userId,
							type: 'cityUnderAttack',
							data: {
								tileId: targetTile._id,
								tileType: targetTile.type,
								q: targetTile.q,
								r: targetTile.r,
							},
						});
					}
				}

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

		// Process spy movement arrivals
		for (const spy of allSpies) {
			if (!spy.targetTileId || !spy.arrivalTime || !spy.path) {
				continue;
			}

			if (now >= spy.arrivalTime) {
				const targetTile = tileMap.get(spy.targetTileId);
				if (!targetTile) {
					continue;
				}

				// Move spy to target tile
				await ctx.db.patch(spy._id, {
					tileId: spy.targetTileId,
					targetTileId: undefined,
					path: undefined,
					departureTime: undefined,
					arrivalTime: undefined,
				});

				// Update our local reference
				spy.tileId = spy.targetTileId;
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

			// Auto-break alliances between combatants
			// When armies from allied players enter combat, their alliance is broken
			for (let i = 0; i < ownerIds.length; i++) {
				for (let j = i + 1; j < ownerIds.length; j++) {
					await ctx.runMutation(internal.alliances.breakAllianceIfExists, {
						player1Id: ownerIds[i],
						player2Id: ownerIds[j],
					});
				}
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

				// Get this army owner's defense modifiers
				const armyModifiers = playerModifiers.get(army.ownerId) ?? {};

				// Calculate total enemy strength attacking this army (with attacker strength bonuses)
				const enemyArmies = tileArmies.filter((a) => a.ownerId !== army.ownerId);
				const enemyStrength = enemyArmies.reduce((sum, a) => {
					const units = freshUnitsByArmy.get(a._id) ?? [];
					const attackerModifiers = playerModifiers.get(a.ownerId) ?? {};
					const strengthMultiplier = 1 + (attackerModifiers.strengthBonus ?? 0);
					return sum + units.length * UNIT_STRENGTH * strengthMultiplier;
				}, 0);

				if (enemyStrength === 0) {
					continue;
				}

				// Calculate damage this army receives (with defense bonus from upgrades)
				const isDefender = army.ownerId === defenderOwnerId;
				const baseDefense = isDefender ? UNIT_DEFENSE + DEFENDER_BONUS : UNIT_DEFENSE;
				const defenseBonus = armyModifiers.defenseBonus ?? 0;
				const armyDefense = Math.min(baseDefense + defenseBonus, 0.9); // Cap at 90% reduction
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

			// Reveal enemy upgrades through combat
			// All participants in combat learn about each other's upgrades
			for (const ownerId of ownerIds) {
				const myUpgrades = upgradesByPlayer.get(ownerId) ?? [];
				for (const enemyOwnerId of ownerIds) {
					if (ownerId === enemyOwnerId) {
						continue;
					}
					const enemyUpgrades = upgradesByPlayer.get(enemyOwnerId) ?? [];

					// Reveal all of enemy's upgrades to me
					for (const upgradeId of enemyUpgrades) {
						// Check if already known
						const alreadyKnown = await ctx.db
							.query('knownEnemyUpgrades')
							.withIndex('by_playerId_enemyPlayerId', (q) =>
								q.eq('playerId', ownerId as Id<'gamePlayers'>).eq('enemyPlayerId', enemyOwnerId as Id<'gamePlayers'>),
							)
							.filter((q) => q.eq(q.field('upgradeId'), upgradeId))
							.first();

						if (!alreadyKnown) {
							await ctx.db.insert('knownEnemyUpgrades', {
								gameId,
								playerId: ownerId as Id<'gamePlayers'>,
								enemyPlayerId: enemyOwnerId as Id<'gamePlayers'>,
								upgradeId,
								revealedAt: now,
								revealSource: 'combat',
							});
						}
					}

					// Also reveal my upgrades to the enemy
					for (const upgradeId of myUpgrades) {
						const alreadyKnown = await ctx.db
							.query('knownEnemyUpgrades')
							.withIndex('by_playerId_enemyPlayerId', (q) =>
								q.eq('playerId', enemyOwnerId as Id<'gamePlayers'>).eq('enemyPlayerId', ownerId as Id<'gamePlayers'>),
							)
							.filter((q) => q.eq(q.field('upgradeId'), upgradeId))
							.first();

						if (!alreadyKnown) {
							await ctx.db.insert('knownEnemyUpgrades', {
								gameId,
								playerId: enemyOwnerId as Id<'gamePlayers'>,
								enemyPlayerId: ownerId as Id<'gamePlayers'>,
								upgradeId,
								revealedAt: now,
								revealSource: 'combat',
							});
						}
					}
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

				// Create borderContact events for players whose tiles are adjacent to the captured tile
				const neighbors = getNeighbors(tile.q, tile.r);
				const notifiedPlayers = new Set<string>();
				const capturerPlayer = players.find((p) => p._id === army.ownerId);

				for (const neighbor of neighbors) {
					const neighborKey = coordKey(neighbor.q, neighbor.r);
					const neighborTile = allTiles.find((t) => coordKey(t.q, t.r) === neighborKey);

					if (
						neighborTile?.ownerId &&
						neighborTile.ownerId !== army.ownerId &&
						neighborTile.ownerId !== previousOwnerId &&
						!notifiedPlayers.has(neighborTile.ownerId)
					) {
						notifiedPlayers.add(neighborTile.ownerId);
						const affectedPlayer = players.find((p) => p._id === neighborTile.ownerId);

						if (capturerPlayer && affectedPlayer) {
							await ctx.db.insert('gameEvents', {
								gameId,
								actorPlayerId: capturerPlayer.userId,
								targetPlayerId: affectedPlayer.userId,
								type: 'borderContact',
								data: {
									capturedTileId: tile._id,
									q: tile.q,
									r: tile.r,
								},
							});
						}
					}
				}

				// Update allegiance when city/capital is captured by military
				if (tile.type === 'city' || tile.type === 'capital') {
					// Get existing allegiance records for this tile
					const allegianceRecords = await ctx.db
						.query('cityAllegiance')
						.withIndex('by_tileId', (q) => q.eq('tileId', tile._id))
						.collect();

					// Update or create allegiance for the new owner (set to 100)
					const newOwnerAllegiance = allegianceRecords.find((a) => a.teamId === army.ownerId);
					if (newOwnerAllegiance) {
						await ctx.db.patch(newOwnerAllegiance._id, { score: 100 });
					} else {
						await ctx.db.insert('cityAllegiance', {
							gameId,
							tileId: tile._id,
							teamId: army.ownerId,
							score: 100,
						});
					}

					// Set previous owner allegiance to 0 (if they existed)
					if (previousOwnerId) {
						const previousOwnerAllegiance = allegianceRecords.find((a) => a.teamId === previousOwnerId);
						if (previousOwnerAllegiance) {
							await ctx.db.patch(previousOwnerAllegiance._id, { score: 0 });
						}
					}
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

		// Reload spies after movement
		const spiesAfterMove = await ctx.db
			.query('spies')
			.withIndex('by_gameId', (q) => q.eq('gameId', gameId))
			.collect();

		// Build map of tiles -> spies on that tile (stationary only)
		const spiesByTile = new Map<string, typeof spiesAfterMove>();
		for (const spy of spiesAfterMove) {
			if (spy.targetTileId) {
				continue; // Moving spies can't be detected or detect
			}
			const tileSpies = spiesByTile.get(spy.tileId) ?? [];
			tileSpies.push(spy);
			spiesByTile.set(spy.tileId, tileSpies);
		}

		// Process spy detection
		const spiesDeleted = new Set<string>();

		for (const spy of spiesAfterMove) {
			if (spy.targetTileId) {
				continue; // Moving spies can't be detected
			}
			if (spiesDeleted.has(spy._id)) {
				continue;
			}

			// Get armies on this tile (stationary only)
			const tileArmies = armiesByTile.get(spy.tileId) ?? [];
			const stationaryArmies = tileArmies.filter((a) => !a.targetTileId && !armiesDeleted.has(a._id));

			// Get enemy spies on this tile
			const tileSpies = spiesByTile.get(spy.tileId) ?? [];

			// Count enemy military units on this tile
			let enemyUnitCount = 0;
			for (const army of stationaryArmies) {
				if (army.ownerId !== spy.ownerId) {
					const armyUnits = freshUnitsByArmy.get(army._id) ?? [];
					enemyUnitCount += armyUnits.length;
				}
			}

			// Count enemy spies on this tile
			let enemySpyCount = 0;
			for (const otherSpy of tileSpies) {
				if (otherSpy.ownerId !== spy.ownerId && !spiesDeleted.has(otherSpy._id)) {
					enemySpyCount++;
				}
			}

			// Get spy owner's evasion modifier
			const spyOwnerModifiers = playerModifiers.get(spy.ownerId) ?? {};
			const evasionBonus = spyOwnerModifiers.spyEvasionBonus ?? 0;

			// Get detection bonus from enemy players who have spies on this tile
			let maxEnemyDetectionBonus = 0;
			for (const otherSpy of tileSpies) {
				if (otherSpy.ownerId !== spy.ownerId && !spiesDeleted.has(otherSpy._id)) {
					const enemyModifiers = playerModifiers.get(otherSpy.ownerId) ?? {};
					maxEnemyDetectionBonus = Math.max(maxEnemyDetectionBonus, enemyModifiers.spyDetectionBonus ?? 0);
				}
			}

			// Calculate detection chances with upgrades applied
			// Military detection: 1% per unit per minute = kills spy, reduced by spy evasion
			const adjustedMilitaryRate = MILITARY_DETECTION_RATE * (1 - evasionBonus);
			const militaryDetectionChance = 1 - Math.pow(1 - adjustedMilitaryRate, enemyUnitCount);
			// Spy detection: 4% per spy per minute = reveals spy, increased by enemy detection bonus, reduced by evasion
			const adjustedSpyRate = SPY_DETECTION_RATE * (1 + maxEnemyDetectionBonus) * (1 - evasionBonus);
			const spyDetectionChance = 1 - Math.pow(1 - adjustedSpyRate, enemySpyCount);

			// Check if detected by military (killed)
			if (enemyUnitCount > 0 && Math.random() < militaryDetectionChance) {
				await ctx.db.delete(spy._id);
				spiesDeleted.add(spy._id);
				continue;
			}

			// Check if revealed spy is on tile with enemy military (killed)
			if (spy.isRevealed && enemyUnitCount > 0) {
				await ctx.db.delete(spy._id);
				spiesDeleted.add(spy._id);
				continue;
			}

			// Check if detected by enemy spy (revealed)
			if (!spy.isRevealed && enemySpyCount > 0 && Math.random() < spyDetectionChance) {
				await ctx.db.patch(spy._id, { isRevealed: true });

				// Create spyDetected event for the spy owner
				const spyOwnerPlayer = players.find((p) => p._id === spy.ownerId);
				if (spyOwnerPlayer) {
					const tile = tileMap.get(spy.tileId);
					await ctx.db.insert('gameEvents', {
						gameId,
						actorPlayerId: spyOwnerPlayer.userId,
						targetPlayerId: spyOwnerPlayer.userId,
						type: 'spyDetected',
						data: {
							tileId: spy.tileId,
							q: tile?.q,
							r: tile?.r,
						},
					});
				}
			}
		}

		// Process city allegiance (every 10 ticks = 10 seconds)
		if (currentTick % ALLEGIANCE_TICK_INTERVAL === 0) {
			// Get all cities (city and capital types)
			const cityTiles = allTiles.filter((t) => t.type === 'city' || t.type === 'capital');

			// Get all allegiance records
			const allAllegiance = await ctx.db
				.query('cityAllegiance')
				.withIndex('by_gameId', (q) => q.eq('gameId', gameId))
				.collect();

			// Build map of tileId -> allegiance records
			const allegianceByTile = new Map<string, typeof allAllegiance>();
			for (const allegiance of allAllegiance) {
				const tileRecords = allegianceByTile.get(allegiance.tileId) ?? [];
				tileRecords.push(allegiance);
				allegianceByTile.set(allegiance.tileId, tileRecords);
			}

			// Build map of tileId -> stationary spies by owner
			const spiesOnCityByOwner = new Map<string, Map<string, number>>(); // tileId -> (spyOwnerId -> count)
			for (const spy of spiesAfterMove) {
				if (spy.targetTileId || spiesDeleted.has(spy._id)) {
					continue; // Skip moving or deleted spies
				}
				const tile = tileMap.get(spy.tileId);
				if (!tile || (tile.type !== 'city' && tile.type !== 'capital')) {
					continue;
				}
				// Only count spies on enemy tiles
				if (tile.ownerId === spy.ownerId) {
					continue;
				}

				let ownerMap = spiesOnCityByOwner.get(spy.tileId);
				if (!ownerMap) {
					ownerMap = new Map();
					spiesOnCityByOwner.set(spy.tileId, ownerMap);
				}
				const currentCount = ownerMap.get(spy.ownerId) ?? 0;
				ownerMap.set(spy.ownerId, currentCount + 1);
			}

			// Process each city
			for (const cityTile of cityTiles) {
				const allegianceRecords = allegianceByTile.get(cityTile._id) ?? [];
				const spyOwners = spiesOnCityByOwner.get(cityTile._id);

				// Process allegiance drift and spy influence for each player
				for (const allegiance of allegianceRecords) {
					let newScore = allegiance.score;

					if (cityTile.ownerId) {
						// City has an owner - apply natural drift
						if (allegiance.teamId === cityTile.ownerId) {
							// Owner's allegiance drifts up (regenerates toward 100)
							newScore = Math.min(100, newScore + ALLEGIANCE_NATURAL_DRIFT_OWNER);
						} else {
							// Other teams' allegiance drifts down (decays toward 0)
							newScore = Math.max(0, newScore + ALLEGIANCE_NATURAL_DRIFT_OTHERS);
						}

						// Apply spy influence
						if (spyOwners) {
							for (const [spyOwnerId, spyCount] of spyOwners) {
								if (allegiance.teamId === cityTile.ownerId) {
									// Owner loses allegiance from enemy spies
									newScore = Math.max(0, newScore + ALLEGIANCE_SPY_INFLUENCE_OWNER * spyCount);
								} else if (allegiance.teamId === spyOwnerId) {
									// Spy's team gains allegiance
									newScore = Math.min(100, newScore + ALLEGIANCE_SPY_INFLUENCE_TEAM * spyCount);
								}
							}
						}
					} else {
						// NPC city - no natural drift, only spy influence
						if (spyOwners) {
							for (const [spyOwnerId, spyCount] of spyOwners) {
								if (allegiance.teamId === spyOwnerId) {
									// Spy's team gains allegiance on NPC city
									newScore = Math.min(100, newScore + ALLEGIANCE_SPY_INFLUENCE_TEAM * spyCount);
								}
							}
						} else {
							// No spies on NPC city - allegiance decays
							newScore = Math.max(0, newScore + ALLEGIANCE_NATURAL_DRIFT_OTHERS);
						}
					}

					// Update if changed
					if (newScore !== allegiance.score) {
						await ctx.db.patch(allegiance._id, { score: newScore });
					}
				}

				// Check for city flip (owner allegiance reached 0)
				if (cityTile.ownerId) {
					// Re-fetch allegiance after updates
					const updatedAllegiance = await ctx.db
						.query('cityAllegiance')
						.withIndex('by_tileId', (q) => q.eq('tileId', cityTile._id))
						.collect();

					const ownerAllegiance = updatedAllegiance.find((a) => a.teamId === cityTile.ownerId);

					if (ownerAllegiance && ownerAllegiance.score <= 0) {
						// City is flipping! Determine new owner
						// Find team with highest allegiance (excluding current owner)
						const otherTeams = updatedAllegiance
							.filter((a) => a.teamId !== cityTile.ownerId)
							.sort((a, b) => b.score - a.score);

						const topTeam = otherTeams[0];
						let newOwnerId: Id<'gamePlayers'> | undefined = undefined;

						if (topTeam && topTeam.score > 50) {
							// Team >50 allegiance: flips to that team
							newOwnerId = topTeam.teamId;
						} else if (topTeam && topTeam.score >= 20) {
							// Team 20-50 allegiance: flips to that team
							newOwnerId = topTeam.teamId;
						}
						// Otherwise: becomes NPC (newOwnerId stays undefined)

						const previousOwnerId = cityTile.ownerId;

						// Update tile ownership
						await ctx.db.patch(cityTile._id, { ownerId: newOwnerId });

						// If new owner exists, set their allegiance to 100 and update stats
						if (newOwnerId) {
							const newOwnerAllegiance = updatedAllegiance.find((a) => a.teamId === newOwnerId);
							if (newOwnerAllegiance) {
								await ctx.db.patch(newOwnerAllegiance._id, { score: 100 });
							}

							// Update statCitiesFlippedBySpies for the new owner
							const newOwnerPlayer = players.find((p) => p._id === newOwnerId);
							if (newOwnerPlayer) {
								await ctx.db.patch(newOwnerId, {
									statCitiesFlippedBySpies: (newOwnerPlayer.statCitiesFlippedBySpies ?? 0) + 1,
								});
							}
						}

						// Check if this was a capital being flipped (eliminates the player!)
						if (cityTile.type === 'capital' && previousOwnerId) {
							eliminatedPlayerIds.push(previousOwnerId);
						}

						// Create game event for city flip (for notifications)
						if (newOwnerId) {
							const newOwnerPlayer = players.find((p) => p._id === newOwnerId);
							const previousOwnerPlayer = players.find((p) => p._id === previousOwnerId);
							if (newOwnerPlayer && previousOwnerPlayer) {
								await ctx.db.insert('gameEvents', {
									gameId,
									actorPlayerId: newOwnerPlayer.userId,
									targetPlayerId: previousOwnerPlayer.userId,
									type: 'cityFlipped',
									data: {
										tileId: cityTile._id,
										tileType: cityTile.type,
										q: cityTile.q,
										r: cityTile.r,
									},
								});
							}
						}
					}
				}
			}
		}

		// Process capital intel gathering
		// Build map of capital tiles by owner
		const capitalsByOwner = new Map<string, typeof allTiles[0]>();
		for (const tile of allTiles) {
			if (tile.type === 'capital' && tile.ownerId) {
				capitalsByOwner.set(tile.ownerId, tile);
			}
		}

		// Get existing intel progress records
		const allIntelProgress = await ctx.db
			.query('capitalIntelProgress')
			.withIndex('by_gameId', (q) => q.eq('gameId', gameId))
			.collect();

		// Build map of spyOwnerId -> targetPlayerId -> progress
		const intelProgressMap = new Map<string, Map<string, typeof allIntelProgress[0]>>();
		for (const progress of allIntelProgress) {
			let ownerMap = intelProgressMap.get(progress.spyOwnerId);
			if (!ownerMap) {
				ownerMap = new Map();
				intelProgressMap.set(progress.spyOwnerId, ownerMap);
			}
			ownerMap.set(progress.targetPlayerId, progress);
		}

		// Track which spy owners have spies at which enemy capitals
		const spiesAtCapitals = new Map<string, Set<string>>(); // spyOwnerId -> Set<targetPlayerId>

		for (const spy of spiesAfterMove) {
			if (spy.targetTileId || spiesDeleted.has(spy._id)) {
				continue; // Skip moving or deleted spies
			}

			const tile = tileMap.get(spy.tileId);
			if (!tile || tile.type !== 'capital' || !tile.ownerId) {
				continue;
			}

			// Check if this is an enemy capital (not own capital)
			if (tile.ownerId === spy.ownerId) {
				continue;
			}

			// Track this spy at the enemy capital
			let targetSet = spiesAtCapitals.get(spy.ownerId);
			if (!targetSet) {
				targetSet = new Set();
				spiesAtCapitals.set(spy.ownerId, targetSet);
			}
			targetSet.add(tile.ownerId);
		}

		// Update intel progress for players with spies at enemy capitals
		for (const [spyOwnerId, targetPlayerIds] of spiesAtCapitals) {
			for (const targetPlayerId of targetPlayerIds) {
				const ownerMap = intelProgressMap.get(spyOwnerId);
				const existingProgress = ownerMap?.get(targetPlayerId);

				if (existingProgress) {
					// Calculate new tier based on time elapsed
					const timeElapsed = now - existingProgress.startedAt;
					const newTier = Math.min(5, Math.floor(timeElapsed / INTEL_TIER_DURATION_MS));

					if (newTier > existingProgress.currentTier) {
						await ctx.db.patch(existingProgress._id, { currentTier: newTier });

						// If we just reached tier 3 (upgrades), reveal all enemy upgrades
						if (newTier >= INTEL_TIER_UPGRADES && existingProgress.currentTier < INTEL_TIER_UPGRADES) {
							const enemyUpgrades = upgradesByPlayer.get(targetPlayerId) ?? [];
							for (const upgradeId of enemyUpgrades) {
								// Check if already known
								const alreadyKnown = await ctx.db
									.query('knownEnemyUpgrades')
									.withIndex('by_playerId_enemyPlayerId', (q) =>
										q.eq('playerId', spyOwnerId as Id<'gamePlayers'>).eq('enemyPlayerId', targetPlayerId as Id<'gamePlayers'>),
									)
									.filter((q) => q.eq(q.field('upgradeId'), upgradeId))
									.first();

								if (!alreadyKnown) {
									await ctx.db.insert('knownEnemyUpgrades', {
										gameId,
										playerId: spyOwnerId as Id<'gamePlayers'>,
										enemyPlayerId: targetPlayerId as Id<'gamePlayers'>,
										upgradeId,
										revealedAt: now,
										revealSource: 'capitalIntel',
									});
								}
							}
						}
					}
				} else {
					// Create new intel progress
					await ctx.db.insert('capitalIntelProgress', {
						gameId,
						spyOwnerId: spyOwnerId as Id<'gamePlayers'>,
						targetPlayerId: targetPlayerId as Id<'gamePlayers'>,
						startedAt: now,
						currentTier: 0,
					});
				}
			}
		}

		// Clean up intel progress for players who no longer have spies at those capitals
		for (const progress of allIntelProgress) {
			const targetSet = spiesAtCapitals.get(progress.spyOwnerId);
			if (!targetSet || !targetSet.has(progress.targetPlayerId)) {
				// No spy at this capital anymore - delete progress (intel lost)
				await ctx.db.delete(progress._id);
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

			// Delete eliminated player's spies
			const eliminatedSpies = spiesAfterMove.filter((s) => s.ownerId === eliminatedId);
			for (const spy of eliminatedSpies) {
				await ctx.db.delete(spy._id);
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

				// Delete player's spies
				const playerSpiesDebt = spiesAfterMove.filter((s) => s.ownerId === player._id);
				for (const spy of playerSpiesDebt) {
					await ctx.db.delete(spy._id);
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
