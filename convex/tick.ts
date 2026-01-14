import { v } from 'convex/values';

import { internal } from './_generated/api';
import { internalMutation } from './_generated/server';
// Import combat constants and functions
import { DEFENDER_BONUS, UNIT_BASE_HP, UNIT_DEFENSE, UNIT_STRENGTH } from './lib/combat';
// Import economy constants and functions
import {
	ALLEGIANCE_FLIP_THRESHOLD,
	ALLEGIANCE_NATURAL_DRIFT_OTHER,
	ALLEGIANCE_NATURAL_DRIFT_OWNER,
	ALLEGIANCE_SPY_INFLUENCE_OWNER,
	ALLEGIANCE_SPY_INFLUENCE_SPY_TEAM,
	ALLEGIANCE_UPDATE_INTERVAL,
	CAPITAL_INTEL_MAX_TIER,
	CAPITAL_INTEL_TIER_TIME,
	MILITARY_DETECTION_RATE,
	SPY_DETECTION_RATE,
	UPKEEP_PER_SPY,
	UPKEEP_PER_UNIT,
} from './lib/economy';
// Import upgrade functions
import { getUpgradeModifiers } from './upgrades';

import type { Id } from './_generated/dataModel';

const TICK_INTERVAL_MS = 750; // 0.75 seconds per tick (1.33x speed)

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

		const allSpies = await ctx.db
			.query('spies')
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
		const players = await ctx.db
			.query('gamePlayers')
			.withIndex('by_gameId', (q) => q.eq('gameId', gameId))
			.filter((q) => q.eq(q.field('eliminatedAt'), undefined))
			.collect();

		// Load all player upgrades once for the entire tick
		const allPlayerUpgrades = await ctx.db
			.query('playerUpgrades')
			.withIndex('by_gameId', (q) => q.eq('gameId', gameId))
			.collect();

		// Build a map of playerId -> upgrade modifiers
		const upgradeModifiersByPlayer = new Map();
		for (const player of players) {
			const playerUpgrades = allPlayerUpgrades.filter((u) => u.playerId === player._id);
			const upgradeIds = playerUpgrades.map((u) => u.upgradeId);
			upgradeModifiersByPlayer.set(player._id, getUpgradeModifiers(upgradeIds));
		}

		const now = Date.now();
		const eliminatedPlayerIds: string[] = [];

		for (const player of players) {
			// Auto-repair any corrupted numeric fields (NaN values)
			const needsRepair = !Number.isFinite(player.population) || !Number.isFinite(player.gold) || !Number.isFinite(player.labourRatio);

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

			// Get upgrade modifiers for this player
			const modifiers = upgradeModifiersByPlayer.get(player._id) ?? {
				strengthBonus: 0,
				defenseBonus: 0,
				spyEvasionBonus: 0,
				spyDetectionBonus: 0,
				labourEfficiencyBonus: 0,
				popGrowthBonus: 0,
				armySpeedBonus: 0,
				spySpeedBonus: 0,
			};

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

			// Gold: 1 gold/sec per 5 labourers - upkeep
			const upkeepCost = militaryUpkeep + spyUpkeep;
			const goldPerTick = (labourers / 5 - upkeepCost) * (1 + (modifiers.labourEfficiencyBonus ?? 0));
			const newGold = (player.gold ?? 0) + goldPerTick;

			// Population growth (only if total units below combined cap)
			let newPopulation = player.population;
			let newPopAccumulator = player.populationAccumulator ?? 0;
			const totalUnits = player.population + totalMilitary + playerSpies.length;

			if (totalUnits < popCap) {
				const popGrowthPerTick = ((labourers / 10 + cityCount * 0.5) / 45) * (1 + (modifiers.popGrowthBonus ?? 0));
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

				// Proportional reduction across civilians, military, and spies
				const civilianRatio = newPopulation / totalUnits;
				let civilianReduction = Math.round(excess * civilianRatio);
				const militaryRatio = totalMilitary / totalUnits;

				let militaryReduction = Math.round(excess * militaryRatio);
				let spyReduction = excess - civilianReduction - militaryReduction; // remainder

				// Cap reductions to available amounts
				civilianReduction = Math.min(civilianReduction, newPopulation);
				militaryReduction = Math.min(militaryReduction, totalMilitary);
				spyReduction = Math.min(spyReduction, playerSpies.length);

				newPopulation -= civilianReduction;
				// Batch delete units, armies, and spies from cap reduction
				const unitsToDelete: Id<'units'>[] = [];
				const armiesToDelete: Id<'armies'>[] = [];
				const spiesToDelete: Id<'spies'>[] = [];

				// Delete military units from capital first
				if (militaryReduction > 0) {
					const capitalTile = playerTiles.find((t) => t.type === 'capital');
					const capitalArmy = capitalTile ? playerArmies.find((a) => a.tileId === capitalTile._id && !a.targetTileId) : null;

					if (capitalArmy) {
						const capitalUnits = unitsByArmy.get(capitalArmy._id) ?? [];
						const toDelete = Math.min(militaryReduction, capitalUnits.length);
						for (let i = 0; i < toDelete; i++) {
							unitsToDelete.push(capitalUnits[i]._id);
						}
						militaryReduction -= toDelete;

						// Delete army if empty
						if (toDelete >= capitalUnits.length) {
							armiesToDelete.push(capitalArmy._id);
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
								unitsToDelete.push(armyUnits[i]._id);
							}
							militaryReduction -= toDelete;
							if (toDelete >= armyUnits.length) {
								armiesToDelete.push(army._id);
							}
						}
					}
				}

				// Collect spy deletes
				if (spyReduction > 0) {
					for (let i = 0; i < spyReduction; i++) {
						spiesToDelete.push(playerSpies[i]._id);
					}
				}

				// Execute all deletes in parallel
				await Promise.all([
					...unitsToDelete.map((id) => ctx.db.delete(id)),
					...armiesToDelete.map((id) => ctx.db.delete(id)),
					...spiesToDelete.map((id) => ctx.db.delete(id)),
				]);
			}

			// Military spawning
			let newMilAccumulator = player.militaryAccumulator ?? 0;
			if (military > 0 && player.rallyPointTileId) {
				// Spawn rate: 1 unit per 45 seconds per military pop assigned (1.33x speed)
				const spawnRate = military / 45;
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

			// Spy spawning
			const spyPopulation = Math.floor(player.population * ((player.spyRatio ?? 0) / 100));
			let newSpyAccumulator = player.spyAccumulator ?? 0;
			if (spyPopulation > 0 && player.rallyPointTileId) {
				// Spawn rate: 1 spy per 45 seconds per spy pop assigned (1.33x speed)
				const spawnRate = spyPopulation / 45;
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

		// Process capital intel tracking and advancement

		// Build map of capital tiles
		const capitalTiles = new Map<string, Id<'tiles'>>();
		for (const tile of allTiles) {
			if (tile.type === 'capital' && tile.ownerId) {
				capitalTiles.set(tile.ownerId, tile._id);
			}
		}

		// Track which spy owners have spies at which enemy capitals
		const spiesAtCapitals = new Map<string, Map<string, number>>(); // spyOwnerId -> targetPlayerId -> count

		for (const spy of allSpies) {
			// Only count stationary, non-revealed spies
			if (spy.targetTileId || spy.isRevealed) {
				continue;
			}

			const tile = tileMap.get(spy.tileId);
			if (!tile || tile.type !== 'capital' || !tile.ownerId) {
				continue;
			}

			// Skip if it's the spy's own capital
			if (tile.ownerId === spy.ownerId) {
				continue;
			}

			// Track this spy at enemy capital
			if (!spiesAtCapitals.has(spy.ownerId)) {
				spiesAtCapitals.set(spy.ownerId, new Map());
			}
			const targetMap = spiesAtCapitals.get(spy.ownerId)!;
			targetMap.set(tile.ownerId, (targetMap.get(tile.ownerId) ?? 0) + 1);
		}

		// Create new capitalIntelProgress records for newly detected spy operations
		for (const [spyOwnerId, targetMap] of spiesAtCapitals) {
			for (const [targetPlayerId, _count] of targetMap) {
				// Check if progress record exists
				const existing = await ctx.db
					.query('capitalIntelProgress')
					.withIndex('by_spyOwnerId', (q) => q.eq('spyOwnerId', spyOwnerId as Id<'gamePlayers'>))
					.filter((q) => q.eq(q.field('targetPlayerId'), targetPlayerId as Id<'gamePlayers'>))
					.first();

				if (!existing) {
					await ctx.db.insert('capitalIntelProgress', {
						spyOwnerId: spyOwnerId as Id<'gamePlayers'>,
						targetPlayerId: targetPlayerId as Id<'gamePlayers'>,
						startedAt: now,
						currentTier: 0,
						lastUpdateTime: now,
						accumulatedTime: 0,
					});
				}
			}
		}

		// Advance intel progress for all existing records
		const allIntelProgress = await ctx.db.query('capitalIntelProgress').collect();

		for (const progress of allIntelProgress) {
			// Find target player's current capital
			const targetCapitalId = capitalTiles.get(progress.targetPlayerId);

			// Count active spies at the target capital
			let spyCount = 0;
			if (targetCapitalId) {
				spyCount = allSpies.filter(
					(s) => s.ownerId === progress.spyOwnerId && s.tileId === targetCapitalId && !s.targetTileId && !s.isRevealed,
				).length;
			}

			// Calculate time delta
			const timeDelta = now - progress.lastUpdateTime;

			// Update accumulated time if spies present
			let newAccumulatedTime = progress.accumulatedTime;
			if (spyCount > 0) {
				newAccumulatedTime += timeDelta * spyCount;
			}

			// Calculate new tier
			const newTier = Math.min(Math.floor(newAccumulatedTime / CAPITAL_INTEL_TIER_TIME), CAPITAL_INTEL_MAX_TIER);

			// Update progress record
			await ctx.db.patch(progress._id, {
				accumulatedTime: newAccumulatedTime,
				currentTier: newTier,
				lastUpdateTime: now,
			});
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

			// Apply damage to units (batch all operations)
			const combatUnitsToDelete: Id<'units'>[] = [];
			const combatUnitPatches: Array<{ id: Id<'units'>; hp: number }> = [];
			const combatArmiesToDelete: Id<'armies'>[] = [];

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

				// Collect unit updates/deletes
				for (const unit of armyUnits) {
					const newHp = unit.hp - damagePerUnit;
					if (newHp <= 0) {
						combatUnitsToDelete.push(unit._id);
					} else {
						combatUnitPatches.push({ id: unit._id, hp: newHp });
					}
				}

				// Check if army is eliminated (all units dead)
				const remainingUnits = armyUnits.filter((u) => u.hp - damagePerUnit > 0);
				if (remainingUnits.length === 0) {
					combatArmiesToDelete.push(army._id);
					armiesDeleted.add(army._id);
				}
			}

			// Execute all combat operations in parallel
			await Promise.all([
				...combatUnitsToDelete.map((id) => ctx.db.delete(id)),
				...combatUnitPatches.map((p) => ctx.db.patch(p.id, { hp: p.hp })),
				...combatArmiesToDelete.map((id) => ctx.db.delete(id)),
			]);

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

			// Calculate detection chances
			// Military detection: 1% per unit per minute = kills spy
			const militaryDetectionChance = 1 - (1 - MILITARY_DETECTION_RATE) ** enemyUnitCount;
			// Spy detection: 4% per spy per minute = reveals spy
			const spyDetectionChance = 1 - (1 - SPY_DETECTION_RATE) ** enemySpyCount;

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
			}
		}

		// Process city allegiance drift and spy influence
		const cityTiles = allTiles.filter((t) => t.type === 'city');

		for (const cityTile of cityTiles) {
			// Get allegiance records
			const allegiances = await ctx.db
				.query('cityAllegiance')
				.withIndex('by_tileId', (q) => q.eq('tileId', cityTile._id))
				.collect();

			if (allegiances.length === 0) {
				continue;
			}

			// Count enemy spies (stationary, non-revealed, not deleted)
			const spiesOnCity = spiesByTile.get(cityTile._id) ?? [];
			const enemySpies = spiesOnCity.filter((s) => s.ownerId !== cityTile.ownerId && !s.isRevealed && !spiesDeleted.has(s._id));

			// Group by owner
			const spiesByOwner = new Map<string, number>();
			for (const spy of enemySpies) {
				spiesByOwner.set(spy.ownerId, (spiesByOwner.get(spy.ownerId) ?? 0) + 1);
			}

			// Update allegiance scores
			for (const allegiance of allegiances) {
				// Initialize lastUpdateTime if missing (migration)
				if (allegiance.lastUpdateTime === undefined) {
					await ctx.db.patch(allegiance._id, {
						lastUpdateTime: now,
					});
					continue;
				}

				const timeSinceLastUpdate = now - allegiance.lastUpdateTime;

				// Only update every 7.5 seconds (ALLEGIANCE_UPDATE_INTERVAL)
				if (timeSinceLastUpdate < ALLEGIANCE_UPDATE_INTERVAL) {
					continue;
				}

				const updateCount = Math.floor(timeSinceLastUpdate / ALLEGIANCE_UPDATE_INTERVAL);
				let scoreChange = 0;

				// Natural drift
				if (allegiance.teamId === cityTile.ownerId) {
					scoreChange += ALLEGIANCE_NATURAL_DRIFT_OWNER * updateCount;
				} else {
					scoreChange += ALLEGIANCE_NATURAL_DRIFT_OTHER * updateCount;
				}

				// Spy influence
				const spyCount = spiesByOwner.get(allegiance.teamId) ?? 0;
				if (spyCount > 0) {
					if (allegiance.teamId === cityTile.ownerId) {
						scoreChange += ALLEGIANCE_SPY_INFLUENCE_OWNER * updateCount * spyCount;
					} else {
						scoreChange += ALLEGIANCE_SPY_INFLUENCE_SPY_TEAM * updateCount * spyCount;
					}
				}

				// Clamp to 0-100
				const newScore = Math.max(0, Math.min(100, allegiance.score + scoreChange));

				await ctx.db.patch(allegiance._id, {
					score: newScore,
					lastUpdateTime: allegiance.lastUpdateTime + updateCount * ALLEGIANCE_UPDATE_INTERVAL,
				});
			}

			// Check for city flip
			const updatedAllegiances = await ctx.db
				.query('cityAllegiance')
				.withIndex('by_tileId', (q) => q.eq('tileId', cityTile._id))
				.collect();

			if (!cityTile.ownerId) {
				continue; // NPC city, skip flip logic
			}

			const ownerAllegiance = updatedAllegiances.find((a) => a.teamId === cityTile.ownerId);
			if (!ownerAllegiance || ownerAllegiance.score > 0) {
				continue; // Owner still has allegiance
			}

			// Owner allegiance reached 0 - city flips!
			const sortedAllegiances = updatedAllegiances.filter((a) => a.teamId !== cityTile.ownerId).sort((a, b) => b.score - a.score);

			if (sortedAllegiances.length > 0 && sortedAllegiances[0].score >= ALLEGIANCE_FLIP_THRESHOLD) {
				// Flip to highest scoring team
				const newOwnerId = sortedAllegiances[0].teamId;
				await ctx.db.patch(cityTile._id, { ownerId: newOwnerId });

				// Update stat
				const newOwner = players.find((p) => p._id === newOwnerId);
				if (newOwner) {
					await ctx.db.patch(newOwnerId, {
						statCitiesFlippedBySpies: (newOwner.statCitiesFlippedBySpies ?? 0) + 1,
					});
				}
			} else {
				// No team has enough allegiance - becomes NPC city
				await ctx.db.patch(cityTile._id, { ownerId: undefined });
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
