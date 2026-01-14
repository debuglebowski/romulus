import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery } from 'convex/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { useSound } from '@/hooks/use-sound';
import { Button } from '@/ui/_shadcn/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/ui/_shadcn/dialog';
import { AlliancePanel } from '@/ui/components/alliance-panel';
import { CapitalIntelPanel } from '@/ui/components/capital-intel-panel';
import { ContextPanel } from '@/ui/components/context-panel';
import { GameStatsBar } from '@/ui/components/game-stats-bar';
import { HexMap3D } from '@/ui/components/hex-map-3d';
import { PauseOverlay } from '@/ui/components/pause-overlay';
import { RatioSliders } from '@/ui/components/ratio-sliders';
import { UpgradesModal } from '@/ui/components/upgrades-modal';

import { api } from '../../../../convex/_generated/api';
import { computeHorizon, coordKey, findPath } from '../../../../convex/lib/hex';
import { z } from 'zod';

import type { ArmyData, SpyData, TileData } from '@/ui/components/hex-map';
import type { Id } from '../../../../convex/_generated/dataModel';

const gameSearchSchema = z.object({
	settings: z.enum(['open']).optional(),
});

export const Route = createFileRoute('/game/$gameId/')({
	component: GamePage,
	validateSearch: gameSearchSchema,
});

type SelectionMode = 'default' | 'move' | 'rally' | 'spy-move';

function formatTime(ms: number): string {
	if (ms <= 0) {
		return '0s';
	}
	const seconds = Math.ceil(ms / 1000);
	if (seconds < 60) {
		return `${seconds}s`;
	}
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;
	return `${minutes}m ${remainingSeconds}s`;
}

function GamePage() {
	const { gameId } = Route.useParams();
	const navigate = useNavigate();
	const game = useQuery(api.games.get, { gameId: gameId as Id<'games'> });
	const visibilityData = useQuery(api.tiles.getVisibleForPlayer, { gameId: gameId as Id<'games'> });
	const armiesData = useQuery(api.armies.getVisibleForPlayer, { gameId: gameId as Id<'games'> });
	const economy = useQuery(api.games.getMyEconomy, { gameId: gameId as Id<'games'> });
	const user = useQuery(api.users.currentUser);
	const combatTileIds = useQuery(api.armies.getTilesWithCombat, { gameId: gameId as Id<'games'> });
	const spiesData = useQuery(api.spies.getVisibleForPlayer, { gameId: gameId as Id<'games'> });
	const setRatiosMutation = useMutation(api.games.setRatios);
	const moveArmyMutation = useMutation(api.armies.moveArmy);
	const cancelMoveMutation = useMutation(api.armies.cancelMove);
	const setRallyPointMutation = useMutation(api.armies.setRallyPoint);
	const retreatArmyMutation = useMutation(api.armies.retreatArmy);
	const buildCityMutation = useMutation(api.tiles.buildCity);
	const moveCapitalMutation = useMutation(api.tiles.moveCapital);
	const cancelCapitalMoveMutation = useMutation(api.tiles.cancelCapitalMove);
	const abandonMutation = useMutation(api.games.abandon);
	const moveSpyMutation = useMutation(api.spies.moveSpy);
	const cancelSpyMoveMutation = useMutation(api.spies.cancelMove);
	const pauseGameMutation = useMutation(api.games.pauseGame);
	const unpauseGameMutation = useMutation(api.games.unpauseGame);
	const pauseState = useQuery(api.games.getPauseState, { gameId: gameId as Id<'games'> });

	// Alliance queries
	const allianceData = useQuery(api.alliances.getAlliances, { gameId: gameId as Id<'games'> });
	const alliedPlayerIds = useQuery(api.alliances.getAlliedPlayerIds, { gameId: gameId as Id<'games'> });

	// Sound effects
	const { playSound, showToastAlerts } = useSound();

	// Game events notification tracking
	const [lastEventCheckTime, setLastEventCheckTime] = useState(() => Date.now());
	const recentEvents = useQuery(api.gameEvents.listRecent, {
		gameId: gameId as Id<'games'>,
		since: lastEventCheckTime - 30000, // Look back 30 seconds
	});

	// Selection state
	const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
	const [selectedArmyId, setSelectedArmyId] = useState<string | null>(null);
	const [selectedSpyId, setSelectedSpyId] = useState<string | null>(null);
	const [mode, setMode] = useState<SelectionMode>('default');
	const [moveUnitCount, setMoveUnitCount] = useState<number>(0);
	const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
	const [showUpgrades, setShowUpgrades] = useState(false);
	const [showAlliances, setShowAlliances] = useState(false);

	// Elimination modal state
	const [showEliminatedModal, setShowEliminatedModal] = useState(false);
	const prevEliminatedRef = useRef<number | undefined>(undefined);

	// Local ratio state for optimistic UI
	const [localRatios, setLocalRatios] = useState<{
		labour: number;
		military: number;
		spy: number;
	} | null>(null);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Time state for frozen overlay
	const [now, setNow] = useState(Date.now());

	// Sync local ratios with server when economy data loads
	useEffect(() => {
		if (economy && localRatios === null) {
			setLocalRatios({
				labour: economy.labourRatio,
				military: economy.militaryRatio,
				spy: economy.spyRatio,
			});
		}
	}, [economy, localRatios]);

	const handleRatioChange = useCallback(
		(labour: number, military: number, spy: number) => {
			// Guard against NaN/undefined values
			if (!Number.isFinite(labour) || !Number.isFinite(military) || !Number.isFinite(spy)) {
				return;
			}

			setLocalRatios({ labour, military, spy });

			// Debounce the mutation
			if (debounceRef.current) {
				clearTimeout(debounceRef.current);
			}
			debounceRef.current = setTimeout(() => {
				setRatiosMutation({
					gameId: gameId as Id<'games'>,
					labourRatio: labour,
					militaryRatio: military,
					spyRatio: spy,
				});
			}, 200);
		},
		[gameId, setRatiosMutation],
	);

	const myPlayer = game?.players.find((p) => p.userId === user?._id);

	// Detect elimination and show modal
	useEffect(() => {
		if (myPlayer?.eliminatedAt && !prevEliminatedRef.current) {
			setShowEliminatedModal(true);
		}
		prevEliminatedRef.current = myPlayer?.eliminatedAt;
	}, [myPlayer?.eliminatedAt]);

	// Show toast notifications for game events (city flips, etc.)
	const processedEventIds = useRef(new Set<string>());
	useEffect(() => {
		if (!recentEvents || !user || !myPlayer) {
			return;
		}

		for (const event of recentEvents) {
			// Skip already processed events
			if (processedEventIds.current.has(event._id)) {
				continue;
			}
			processedEventIds.current.add(event._id);

			// Skip events older than our check time (initial load)
			if (event._creationTime < lastEventCheckTime) {
				continue;
			}

			// Handle city flip events
			if (event.type === 'cityFlipped') {
				const data = event.data as { tileType?: string; q?: number; r?: number } | undefined;
				const isCapital = data?.tileType === 'capital';
				const isMyCityFlipped = event.targetPlayerId === user._id;
				const didIFlipCity = event.actorPlayerId === user._id;

				if (isMyCityFlipped) {
					// My city was flipped by enemy spy
					playSound('capture');
					if (showToastAlerts) {
						toast.error(
							isCapital ? `Your capital was turned by ${event.actorUsername}!` : `Your city was turned by ${event.actorUsername}'s spies!`,
						);
					}
				} else if (didIFlipCity) {
					// I flipped an enemy city
					playSound('capture');
					if (showToastAlerts) {
						toast.success(isCapital ? `You turned ${event.targetUsername}'s capital!` : `Your spies turned ${event.targetUsername}'s city!`);
					}
				}
			}

			// Handle city under attack events
			if (event.type === 'cityUnderAttack') {
				const data = event.data as { tileType?: string; q?: number; r?: number } | undefined;
				const isCapital = data?.tileType === 'capital';
				const isMyCityAttacked = event.targetPlayerId === user._id;

				if (isMyCityAttacked) {
					playSound('cityUnderAttack');
					if (showToastAlerts) {
						toast.error(
							isCapital
								? `Your capital is under attack by ${event.actorUsername}!`
								: `Your city is under attack by ${event.actorUsername}!`,
						);
					}
				}
			}

			// Handle spy detected events
			if (event.type === 'spyDetected') {
				const isMySpyDetected = event.targetPlayerId === user._id;

				if (isMySpyDetected) {
					playSound('spyDetected');
					if (showToastAlerts) {
						toast.warning('One of your spies has been detected!');
					}
				}
			}

			// Handle border contact events
			if (event.type === 'borderContact') {
				const isMyBorder = event.targetPlayerId === user._id;

				if (isMyBorder) {
					playSound('borderContact');
					if (showToastAlerts) {
						toast.warning(`${event.actorUsername} captured a tile at your border!`);
					}
				}
			}
		}

		// Update check time periodically to avoid re-processing old events
		const timer = setTimeout(() => {
			setLastEventCheckTime(Date.now());
		}, 5000);

		return () => clearTimeout(timer);
	}, [recentEvents, user, myPlayer, lastEventCheckTime, playSound, showToastAlerts]);

	// Transform visibility data to TileData format
	const tilesWithVisibility = useMemo((): TileData[] => {
		if (!visibilityData) {
			return [];
		}

		const result: TileData[] = [];
		const tileCoords = new Set<string>();

		// Get owned tiles and capital for horizon calculation
		const ownedTiles = visibilityData.visible.filter((t) => t.ownerId === visibilityData.playerId).map((t) => ({ q: t.q, r: t.r }));
		const capitalTile = visibilityData.visible.find((t) => t.type === 'capital');

		// Include ally visible tiles in horizon calculation
		const allyTiles = (visibilityData.allyVisible ?? []).map((t) => ({ q: t.q, r: t.r }));
		const allKnownTiles = [...ownedTiles, ...allyTiles];

		// Compute horizon: 5 from capital + owned tiles + neighbors + 1
		const horizon = capitalTile ? computeHorizon({ q: capitalTile.q, r: capitalTile.r }, allKnownTiles) : new Set<string>();

		// Add visible tiles (always shown)
		for (const tile of visibilityData.visible) {
			const key = coordKey(tile.q, tile.r);
			tileCoords.add(key);
			result.push({
				_id: tile._id,
				q: tile.q,
				r: tile.r,
				ownerId: tile.ownerId ?? undefined,
				type: tile.type,
				visibility: 'visible',
			});
		}

		// Add ally-shared visible tiles (visible through ally vision sharing)
		for (const tile of visibilityData.allyVisible ?? []) {
			const key = coordKey(tile.q, tile.r);
			if (tileCoords.has(key)) {
				continue; // Already have this tile from our own vision
			}
			tileCoords.add(key);
			result.push({
				_id: tile._id,
				q: tile.q,
				r: tile.r,
				ownerId: tile.ownerId ?? undefined,
				type: tile.type,
				visibility: 'visible', // Ally vision shows as visible (real-time)
			});
		}

		// Add fogged tiles (only within horizon)
		for (const tile of visibilityData.fogged) {
			const key = coordKey(tile.q, tile.r);
			if (!horizon.has(key)) {
				continue;
			}
			if (tileCoords.has(key)) {
				continue; // Already visible through ally vision
			}
			tileCoords.add(key);
			result.push({
				_id: `fogged-${tile.q}-${tile.r}`,
				q: tile.q,
				r: tile.r,
				ownerId: tile.lastSeenOwnerId ?? undefined,
				type: tile.lastSeenType,
				visibility: 'fogged',
			});
		}

		// Add unexplored tiles (only within horizon)
		for (const tile of visibilityData.unexplored ?? []) {
			const key = coordKey(tile.q, tile.r);
			if (!horizon.has(key)) {
				continue;
			}
			if (tileCoords.has(key)) {
				continue; // Already visible through ally vision
			}
			tileCoords.add(key);
			result.push({
				_id: `unexplored-${tile.q}-${tile.r}`,
				q: tile.q,
				r: tile.r,
				ownerId: undefined,
				type: tile.type,
				visibility: 'unexplored',
			});
		}

		// Add mountains for horizon coords not in DB (map boundary)
		for (const key of horizon) {
			if (!tileCoords.has(key)) {
				const [q, r] = key.split(',').map(Number);
				result.push({
					_id: `mountain-${q}-${r}`,
					q,
					r,
					ownerId: undefined,
					type: 'mountain',
					visibility: 'visible',
				});
			}
		}

		return result;
	}, [visibilityData]);

	// Transform armies data
	const armies = useMemo((): ArmyData[] => {
		if (!armiesData) {
			return [];
		}
		return armiesData.map((a) => ({
			_id: a._id,
			ownerId: a.ownerId,
			tileId: a.tileId,
			currentQ: a.currentQ,
			currentR: a.currentR,
			isOwn: a.isOwn,
			path: a.path ?? undefined,
			targetTileId: a.targetTileId ?? undefined,
			departureTime: a.departureTime ?? undefined,
			arrivalTime: a.arrivalTime ?? undefined,
			unitCount: a.unitCount,
			totalHp: a.totalHp,
			averageHp: a.averageHp,
			averageHpPercent: a.averageHpPercent,
			isInCombat: a.isInCombat,
		}));
	}, [armiesData]);

	// Transform spies data
	const spies = useMemo((): SpyData[] => {
		if (!spiesData) {
			return [];
		}
		return spiesData.map((s) => ({
			_id: s._id,
			ownerId: s.ownerId,
			tileId: s.tileId,
			currentQ: s.currentQ,
			currentR: s.currentR,
			isOwn: s.isOwn,
			isRevealed: s.isRevealed,
			path: s.path ?? undefined,
			targetTileId: s.targetTileId ?? undefined,
			departureTime: s.departureTime ?? undefined,
			arrivalTime: s.arrivalTime ?? undefined,
		}));
	}, [spiesData]);

	// Get selected objects
	const selectedTile = tilesWithVisibility.find((t) => t._id === selectedTileId);
	const selectedArmy = armies.find((a) => a._id === selectedArmyId);
	const selectedSpy = spies.find((s) => s._id === selectedSpyId);
	const isOwnTile = selectedTile?.ownerId === myPlayer?._id;

	// Find stationary armies on the selected tile (for tile-based army selection)
	const stationaryArmiesOnTile = useMemo(() => {
		if (!selectedTile) {
			return [];
		}
		return armies.filter((a) => a.currentQ === selectedTile.q && a.currentR === selectedTile.r && !a.targetTileId);
	}, [selectedTile, armies]);

	// Find spies on the selected tile (own spies only)
	const spiesOnTile = useMemo(() => {
		if (!selectedTile) {
			return [];
		}
		return spies
			.filter((s) => s.currentQ === selectedTile.q && s.currentR === selectedTile.r && !s.targetTileId)
			.map((s) => ({ _id: s._id, isRevealed: s.isRevealed }));
	}, [selectedTile, spies]);

	// Get spy intel for selected tile (if player has spy there)
	const spyIntelQuery = useQuery(
		api.spies.getIntelForTile,
		selectedTile && !isOwnTile && spiesOnTile.length > 0 ? { gameId: gameId as Id<'games'>, tileId: selectedTile._id as Id<'tiles'> } : 'skip',
	);
	const spyIntel = spyIntelQuery ?? null;

	// Get allegiance data for selected tile (if player has spy there and it's a city/capital)
	const allegianceQuery = useQuery(
		api.spies.getAllegianceForTile,
		selectedTile && spiesOnTile.length > 0 && (selectedTile.type === 'city' || selectedTile.type === 'capital')
			? { gameId: gameId as Id<'games'>, tileId: selectedTile._id as Id<'tiles'> }
			: 'skip',
	);
	const allegianceData = allegianceQuery ?? null;

	// Build set of allied player IDs for pathfinding (as strings for comparison with tile.ownerId)
	const alliedSet = useMemo(() => new Set<string>(alliedPlayerIds ?? []), [alliedPlayerIds]);

	// Compute movement path preview (for army or spy)
	const movementPath = useMemo(() => {
		if (!selectedTileId) {
			return undefined;
		}

		const targetTile = tilesWithVisibility.find((t) => t._id === selectedTileId);
		if (!targetTile) {
			return undefined;
		}

		// Build tile map for pathfinding
		const tileMap = new Map(tilesWithVisibility.map((t) => [coordKey(t.q, t.r), t]));

		if (mode === 'move' && selectedArmyId) {
			const army = armies.find((a) => a._id === selectedArmyId);
			if (!army) {
				return undefined;
			}

			const canTraverse = (coord: { q: number; r: number }) => {
				const tile = tileMap.get(coordKey(coord.q, coord.r));
				if (!tile || tile.visibility !== 'visible') {
					return false;
				}
				// Mountains are impassable
				if (tile.type === 'mountain') {
					return false;
				}
				// Allow destination even if enemy
				if (coord.q === targetTile.q && coord.r === targetTile.r) {
					return true;
				}
				// Allow traversal through own, neutral, or allied territory
				return tile.ownerId === undefined || tile.ownerId === myPlayer?._id || (tile.ownerId !== undefined && alliedSet.has(tile.ownerId));
			};

			const path = findPath({ q: army.currentQ, r: army.currentR }, { q: targetTile.q, r: targetTile.r }, canTraverse);
			return path ?? undefined;
		}

		if (mode === 'spy-move' && selectedSpyId) {
			const spy = spies.find((s) => s._id === selectedSpyId);
			if (!spy) {
				return undefined;
			}

			// Spies can traverse any tile
			const canTraverse = (coord: { q: number; r: number }) => {
				const tile = tileMap.get(coordKey(coord.q, coord.r));
				return tile !== undefined && tile.visibility === 'visible';
			};

			const path = findPath({ q: spy.currentQ, r: spy.currentR }, { q: targetTile.q, r: targetTile.r }, canTraverse);
			return path ?? undefined;
		}

		return undefined;
	}, [mode, selectedArmyId, selectedSpyId, selectedTileId, armies, spies, tilesWithVisibility, myPlayer?._id, alliedSet]);

	// Tile click handler
	const handleTileClick = useCallback(
		async (tileId: string, q: number, r: number) => {
			if (mode === 'move' && selectedArmyId) {
				// Compute path inline using clicked tile coordinates
				const army = armies.find((a) => a._id === selectedArmyId);
				if (army) {
					const tileMap = new Map(tilesWithVisibility.map((t) => [coordKey(t.q, t.r), t]));
					const canTraverse = (coord: { q: number; r: number }) => {
						const tile = tileMap.get(coordKey(coord.q, coord.r));
						if (!tile || tile.visibility !== 'visible') {
							return false;
						}
						// Mountains are impassable
						if (tile.type === 'mountain') {
							return false;
						}
						// Allow destination even if enemy
						if (coord.q === q && coord.r === r) {
							return true;
						}
						// Allow traversal through own, neutral, or allied territory
						return (
							tile.ownerId === undefined ||
							tile.ownerId === myPlayer?._id ||
							(tile.ownerId !== undefined && alliedSet.has(tile.ownerId))
						);
					};
					const path = findPath({ q: army.currentQ, r: army.currentR }, { q, r }, canTraverse);

					if (path && path.length > 0) {
						try {
							await moveArmyMutation({
								armyId: selectedArmyId as Id<'armies'>,
								targetTileId: tileId as Id<'tiles'>,
								unitCount: moveUnitCount,
							});
							// Keep army selected after initiating move so user can track progress
						} catch (e) {
							console.error('Failed to move army:', e);
						}
					}
				}
				setMode('default');
				setMoveUnitCount(0);
				// Don't clear selection - keep army selected to show movement progress
			} else if (mode === 'spy-move' && selectedSpyId) {
				// Move spy to clicked tile
				const spy = spies.find((s) => s._id === selectedSpyId);
				if (spy) {
					const tileMap = new Map(tilesWithVisibility.map((t) => [coordKey(t.q, t.r), t]));
					const canTraverse = (coord: { q: number; r: number }) => {
						const tile = tileMap.get(coordKey(coord.q, coord.r));
						return tile !== undefined && tile.visibility === 'visible';
					};
					const path = findPath({ q: spy.currentQ, r: spy.currentR }, { q, r }, canTraverse);

					if (path && path.length > 0) {
						try {
							await moveSpyMutation({
								spyId: selectedSpyId as Id<'spies'>,
								targetTileId: tileId as Id<'tiles'>,
							});
							// Keep spy selected after initiating move
						} catch (e) {
							console.error('Failed to move spy:', e);
						}
					}
				}
				setMode('default');
			} else if (mode === 'rally') {
				// Set rally point handled by context panel button
				setSelectedTileId(tileId);
			} else {
				// Default selection
				setSelectedTileId(tileId);
				setSelectedArmyId(null);
				setSelectedSpyId(null);
			}
		},
		[
			mode,
			selectedArmyId,
			selectedSpyId,
			armies,
			spies,
			tilesWithVisibility,
			myPlayer?._id,
			moveArmyMutation,
			moveSpyMutation,
			moveUnitCount,
			alliedSet,
		],
	);

	// Army click handler
	const handleArmyClick = useCallback((armyId: string) => {
		setSelectedArmyId(armyId);
		setSelectedTileId(null);
		setSelectedSpyId(null);
		setMode('default');
	}, []);

	// Spy click handler
	const handleSpyClick = useCallback((spyId: string) => {
		setSelectedSpyId(spyId);
		setSelectedTileId(null);
		setSelectedArmyId(null);
		setMode('default');
	}, []);

	// Context panel handlers
	const handleSetMoveMode = useCallback(
		(armyId: string) => {
			const army = armies.find((a) => a._id === armyId);
			if (army) {
				setSelectedArmyId(armyId);
				setMoveUnitCount(army.unitCount);
				setMode('move');
			}
		},
		[armies],
	);

	const handleSetRallyMode = useCallback(() => {
		setMode('rally');
	}, []);

	// Spy move mode handler
	const handleSetSpyMoveMode = useCallback((spyId: string) => {
		setSelectedSpyId(spyId);
		setMode('spy-move');
	}, []);

	const handleCancelMove = useCallback(async () => {
		if (!selectedArmyId) {
			return;
		}
		try {
			await cancelMoveMutation({ armyId: selectedArmyId as Id<'armies'> });
		} catch (e) {
			console.error('Failed to cancel move:', e);
		}
	}, [selectedArmyId, cancelMoveMutation]);

	// Cancel spy move handler
	const handleCancelSpyMove = useCallback(async () => {
		if (!selectedSpyId) {
			return;
		}
		try {
			await cancelSpyMoveMutation({ spyId: selectedSpyId as Id<'spies'> });
		} catch (e) {
			console.error('Failed to cancel spy move:', e);
		}
	}, [selectedSpyId, cancelSpyMoveMutation]);

	const handleSetRallyPoint = useCallback(async () => {
		if (!selectedTileId) {
			return;
		}
		try {
			await setRallyPointMutation({
				gameId: gameId as Id<'games'>,
				tileId: selectedTileId as Id<'tiles'>,
			});
			setMode('default');
		} catch (e) {
			console.error('Failed to set rally point:', e);
		}
	}, [selectedTileId, gameId, setRallyPointMutation]);

	const handleCancelSelection = useCallback(() => {
		setSelectedTileId(null);
		setSelectedArmyId(null);
		setSelectedSpyId(null);
		setMode('default');
		setMoveUnitCount(0);
	}, []);

	// Call home handler - move army to player's capital
	const handleCallHome = useCallback(
		async (armyId: string) => {
			const army = armies.find((a) => a._id === armyId);
			if (!army || !myPlayer?._id) {
				return;
			}

			// Find player's capital tile
			const capitalTile = tilesWithVisibility.find((t) => t.type === 'capital' && t.ownerId === myPlayer._id);
			if (!capitalTile) {
				console.error('No capital found');
				return;
			}

			// Don't move if already at capital
			if (army.currentQ === capitalTile.q && army.currentR === capitalTile.r) {
				return;
			}

			try {
				await moveArmyMutation({
					armyId: armyId as Id<'armies'>,
					targetTileId: capitalTile._id as Id<'tiles'>,
				});
				setSelectedArmyId(armyId);
			} catch (e) {
				console.error('Failed to call army home:', e);
			}
		},
		[armies, tilesWithVisibility, myPlayer?._id, moveArmyMutation],
	);

	// Build city handler
	const handleBuildCity = useCallback(async () => {
		if (!selectedTileId) {
			return;
		}
		try {
			await buildCityMutation({ tileId: selectedTileId as Id<'tiles'> });
			playSound('buildCity');
		} catch (e) {
			console.error('Failed to build city:', e);
		}
	}, [selectedTileId, buildCityMutation, playSound]);

	// Retreat handler
	const handleRetreat = useCallback(
		async (armyId: string) => {
			const army = armies.find((a) => a._id === armyId);
			if (!army) {
				return;
			}

			// Find an adjacent tile to retreat to (prefer owned, then neutral, then enemy)
			const tileMap = new Map(tilesWithVisibility.map((t) => [coordKey(t.q, t.r), t]));
			const neighbors = [
				{ q: army.currentQ + 1, r: army.currentR },
				{ q: army.currentQ + 1, r: army.currentR - 1 },
				{ q: army.currentQ, r: army.currentR - 1 },
				{ q: army.currentQ - 1, r: army.currentR },
				{ q: army.currentQ - 1, r: army.currentR + 1 },
				{ q: army.currentQ, r: army.currentR + 1 },
			];

			// Sort by preference: owned > neutral > enemy
			const sortedNeighbors = neighbors
				.map((n) => {
					const tile = tileMap.get(coordKey(n.q, n.r));
					if (!tile || tile.visibility !== 'visible') {
						return null;
					}
					const priority = tile.ownerId === myPlayer?._id ? 0 : tile.ownerId === undefined ? 1 : 2;
					return { tile, priority };
				})
				.filter((n) => n !== null)
				.sort((a, b) => a.priority - b.priority);

			if (sortedNeighbors.length === 0) {
				console.error('No adjacent tile to retreat to');
				return;
			}

			try {
				await retreatArmyMutation({
					armyId: armyId as Id<'armies'>,
					targetTileId: sortedNeighbors[0].tile._id as Id<'tiles'>,
				});
			} catch (e) {
				console.error('Failed to retreat:', e);
			}
		},
		[armies, tilesWithVisibility, myPlayer?._id, retreatArmyMutation],
	);

	// Move capital handler
	const handleMoveCapitalHere = useCallback(async () => {
		if (!selectedTileId) {
			return;
		}
		try {
			await moveCapitalMutation({ targetTileId: selectedTileId as Id<'tiles'> });
			handleCancelSelection();
		} catch (e) {
			console.error('Failed to move capital:', e);
		}
	}, [selectedTileId, moveCapitalMutation, handleCancelSelection]);

	// Cancel capital move handler
	const handleCancelCapitalMove = useCallback(async () => {
		try {
			await cancelCapitalMoveMutation({ gameId: gameId as Id<'games'> });
		} catch (e) {
			console.error('Failed to cancel capital move:', e);
		}
	}, [gameId, cancelCapitalMoveMutation]);

	// Update time every second when capital is moving
	useEffect(() => {
		if (!economy?.capitalMovingToTileId) {
			return;
		}
		const interval = setInterval(() => {
			setNow(Date.now());
		}, 1000);
		return () => clearInterval(interval);
	}, [economy?.capitalMovingToTileId]);

	// Menu handlers
	const handleOpenLeaveDialog = useCallback(() => {
		setLeaveDialogOpen(true);
	}, []);

	const isEliminated = !!myPlayer?.eliminatedAt;

	const handleLeaveGame = useCallback(async () => {
		if (!isEliminated) {
			await abandonMutation({ gameId: gameId as Id<'games'> });
		}
		setLeaveDialogOpen(false);
		navigate({ to: '/lobbies' });
	}, [gameId, abandonMutation, navigate, isEliminated]);

	const handleOpenSettings = useCallback(() => {
		navigate({ 
			search: (prev) => ({ ...prev, settings: 'open' as const })
		} as Parameters<typeof navigate>[0]);
	}, [navigate]);

	const handleOpenAlliances = useCallback(() => {
		setShowAlliances(true);
	}, []);

	// Pause handlers
	const handlePauseGame = useCallback(async () => {
		try {
			await pauseGameMutation({ gameId: gameId as Id<'games'> });
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed to pause game');
		}
	}, [gameId, pauseGameMutation]);

	const handleUnpauseGame = useCallback(async () => {
		try {
			await unpauseGameMutation({ gameId: gameId as Id<'games'> });
		} catch (e) {
			toast.error(e instanceof Error ? e.message : 'Failed to unpause game');
		}
	}, [gameId, unpauseGameMutation]);

	// Update time every second for pause countdown
	useEffect(() => {
		if (!pauseState?.isPaused) {
			return;
		}
		const interval = setInterval(() => {
			setNow(Date.now());
		}, 1000);
		return () => clearInterval(interval);
	}, [pauseState?.isPaused]);

	// Redirect guards
	useEffect(() => {
		if (game?.status === 'waiting') {
			navigate({ to: '/game/$gameId/lobby', params: { gameId } });
		} else if (game?.status === 'finished') {
			navigate({ to: '/game/$gameId/results', params: { gameId } });
		}
	}, [game?.status, gameId, navigate]);

	if (!game || !user) {
		return (
			<div className='flex h-screen items-center justify-center'>
				<div className='animate-pulse text-muted-foreground'>Loading...</div>
			</div>
		);
	}

	// Allow rendering for finished games (e.g., for eliminated players viewing results)
	if (game.status !== 'inProgress' && game.status !== 'starting' && game.status !== 'finished') {
		return null;
	}

	const activePlayers = game.players.filter((p) => !p.eliminatedAt);

	// Get elimination reason text
	const getEliminationReasonText = () => {
		switch (myPlayer?.eliminationReason) {
			case 'capitalCaptured':
				return 'Your capital was captured by an enemy.';
			case 'debt':
				return 'You went bankrupt (debt exceeded -50 gold).';
			case 'forfeit':
				return 'You forfeited the game.';
			default:
				return 'You have been eliminated from the game.';
		}
	};

	// Use local ratios for display, fall back to economy data
	const displayRatios = localRatios ?? {
		labour: economy?.labourRatio ?? 100,
		military: economy?.militaryRatio ?? 0,
		spy: economy?.spyRatio ?? 0,
	};

	return (
		<div className='flex h-screen flex-col'>
			{/* Stats bar */}
			{economy && (
				<GameStatsBar
					gold={economy.gold}
					goldRate={economy.goldRate}
					population={economy.totalUnits ?? economy.population}
					popCap={economy.popCap}
					startedAt={economy.startedAt}
					players={game.players}
					activePlayers={activePlayers.length}
					alliedPlayerIds={alliedPlayerIds ?? []}
					pendingAllianceCount={(allianceData?.pendingReceived.length ?? 0) + (allianceData?.pendingSent.length ?? 0)}
					isPaused={pauseState?.isPaused ?? false}
					onLeaveGame={handleOpenLeaveDialog}
					onOpenSettings={handleOpenSettings}
					onOpenAlliances={handleOpenAlliances}
					onPauseGame={!isEliminated ? handlePauseGame : undefined}
				/>
			)}

			{/* Main map area */}
			<div className='relative flex-1 overflow-hidden bg-gray-900'>
				{tilesWithVisibility.length > 0 ? (
					<div className='absolute inset-0'>
						<HexMap3D
							tiles={tilesWithVisibility}
							players={game.players}
							currentPlayerId={myPlayer?._id ?? ''}
							armies={armies}
							spies={spies}
							combatTileIds={combatTileIds ?? []}
							selectedTileId={selectedTileId ?? undefined}
							selectedArmyId={selectedArmyId ?? undefined}
							selectedSpyId={selectedSpyId ?? undefined}
							rallyPointTileId={myPlayer?.rallyPointTileId ?? undefined}
							movementPath={movementPath}
							onTileClick={handleTileClick}
							onArmyClick={handleArmyClick}
							onSpyClick={handleSpyClick}
							onBackgroundClick={handleCancelSelection}
						/>
					</div>
				) : (
					<div className='flex h-full items-center justify-center'>
						<p className='text-muted-foreground'>Loading map...</p>
					</div>
				)}

				{/* Eliminated overlay */}
				{isEliminated && !showEliminatedModal && (
					<div className='pointer-events-none absolute inset-0 flex items-center justify-center'>
						<div className='rounded-lg bg-black/60 px-8 py-4'>
							<p className='text-4xl font-bold tracking-widest text-red-500'>ELIMINATED</p>
						</div>
					</div>
				)}

				{/* Pause overlay */}
				{pauseState?.isPaused && pauseState.pausedByUsername && (
					<PauseOverlay
						pausedByUsername={pauseState.pausedByUsername}
						timeRemaining={pauseState.timeRemaining ?? 0}
						budgetTotal={pauseState.budgetTotal ?? 30000}
						isOwnPause={pauseState.pausedByPlayerId === myPlayer?._id}
						onUnpause={handleUnpauseGame}
					/>
				)}

				{/* Capital moving (frozen) overlay */}
				{economy?.capitalMovingToTileId && economy.capitalMoveDepartureTime && economy.capitalMoveArrivalTime && (
					<div className='absolute inset-0 bg-black/50 flex items-center justify-center z-10'>
						<div className='bg-zinc-900 border border-zinc-800 rounded-lg p-6 text-center max-w-sm'>
							<h2 className='text-xl font-bold text-white mb-2'>Capital Relocating</h2>
							<p className='text-zinc-400 text-sm mb-4'>Your capital is moving. All actions are frozen until arrival.</p>
							{(() => {
								const timeRemaining = Math.max(0, economy.capitalMoveArrivalTime - now);
								const totalTime = economy.capitalMoveArrivalTime - economy.capitalMoveDepartureTime;
								const progress = totalTime > 0 ? Math.min(100, ((totalTime - timeRemaining) / totalTime) * 100) : 0;
								return (
									<>
										<p className='text-2xl font-medium text-amber-400 mb-4'>{formatTime(timeRemaining)}</p>
										<div className='w-full h-2 bg-zinc-700 rounded overflow-hidden mb-4'>
											<div className='h-full bg-purple-500 transition-all' style={{ width: `${progress}%` }} />
										</div>
									</>
								);
							})()}
							<Button variant='outline' onClick={handleCancelCapitalMove} className='w-full'>
								Cancel Move
							</Button>
						</div>
					</div>
				)}

				{/* Upgrades modal */}
				{!isEliminated && (
					<UpgradesModal
						gameId={gameId}
						playerGold={economy?.gold ?? 0}
						totalPopulation={economy?.totalUnits ?? economy?.population ?? 0}
						isCapitalMoving={!!economy?.capitalMovingToTileId}
						open={showUpgrades}
						onOpenChange={setShowUpgrades}
						players={game.players}
					/>
				)}

				{/* Alliance panel */}
				{!isEliminated && (
					<AlliancePanel
						gameId={gameId}
						isCapitalMoving={!!economy?.capitalMovingToTileId}
						open={showAlliances}
						onOpenChange={setShowAlliances}
						players={game.players}
					/>
				)}

				{/* Right panel overlay */}
				<div className='absolute bottom-4 right-4 flex w-64 flex-col gap-4'>
					{/* Capital Intel panel */}
					{!isEliminated && <CapitalIntelPanel gameId={gameId} />}

					{/* Upgrades toggle button */}
					{!isEliminated && (
						<button
							onClick={() => setShowUpgrades(true)}
							className='rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors'
						>
							Upgrades
						</button>
					)}

					{/* Ratio sliders */}
					{!isEliminated && (
						<RatioSliders
							labourRatio={displayRatios.labour}
							militaryRatio={displayRatios.military}
							spyRatio={displayRatios.spy}
							population={economy?.population ?? 0}
							onRatioChange={handleRatioChange}
						/>
					)}

					{/* Tile card below */}
					<ContextPanel
						selectedTile={selectedTile}
						selectedArmy={selectedArmy}
						selectedSpy={selectedSpy}
						stationaryArmiesOnTile={stationaryArmiesOnTile}
						spiesOnTile={spiesOnTile}
						spyIntel={spyIntel}
						allegianceData={allegianceData}
						isOwnTile={isOwnTile}
						mode={mode}
						moveUnitCount={moveUnitCount}
						playerGold={economy?.gold ?? 0}
						isCapitalMoving={!!economy?.capitalMovingToTileId}
						onMoveUnitCountChange={setMoveUnitCount}
						onSetRallyPoint={handleSetRallyPoint}
						onCancelMove={handleCancelMove}
						onCancelSpyMove={handleCancelSpyMove}
						onCancelSelection={handleCancelSelection}
						onSetMoveMode={handleSetMoveMode}
						onSetSpyMoveMode={handleSetSpyMoveMode}
						onSetRallyMode={handleSetRallyMode}
						onCallHome={handleCallHome}
						onBuildCity={handleBuildCity}
						onRetreat={handleRetreat}
						onMoveCapitalHere={handleMoveCapitalHere}
					/>
				</div>
			</div>

			{/* Leave Game Dialog */}
			<Dialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>{isEliminated ? 'Return to Lobby?' : 'Leave Game?'}</DialogTitle>
						<DialogDescription>
							{isEliminated
								? 'You have been eliminated. Return to the lobby to join another game.'
								: 'Leaving will count as a forfeit. You will be eliminated from the game.'}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant='outline' onClick={() => setLeaveDialogOpen(false)}>
							Cancel
						</Button>
						<Button variant={isEliminated ? 'default' : 'destructive'} onClick={handleLeaveGame}>
							{isEliminated ? 'Return to Lobby' : 'Leave Game'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Elimination Modal */}
			<Dialog open={showEliminatedModal} onOpenChange={setShowEliminatedModal}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle className='text-center text-2xl text-red-500'>Defeated</DialogTitle>
						<DialogDescription className='text-center text-base'>{getEliminationReasonText()}</DialogDescription>
					</DialogHeader>
					<DialogFooter className='flex-col gap-2 sm:flex-col'>
						{game.status === 'finished' ? (
							<Button className='w-full' onClick={() => navigate({ to: '/game/$gameId/results', params: { gameId } })}>
								View Results
							</Button>
						) : (
							<Button className='w-full' variant='outline' onClick={() => setShowEliminatedModal(false)}>
								Spectate
							</Button>
						)}
						<Button className='w-full' variant='ghost' onClick={handleLeaveGame}>
							Return to Lobby
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
