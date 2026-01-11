import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery } from 'convex/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/ui/_shadcn/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/ui/_shadcn/dialog';
import { ContextPanel } from '@/ui/components/context-panel';
import { GameStatsBar } from '@/ui/components/game-stats-bar';
import { type ArmyData, HexMap, type TileData } from '@/ui/components/hex-map';
import { RatioSliders } from '@/ui/components/ratio-sliders';

import { api } from '../../../../convex/_generated/api';
import { coordKey, findPath } from '../../../../convex/lib/hex';

import type { Id } from '../../../../convex/_generated/dataModel';

export const Route = createFileRoute('/game/$gameId/')({
	component: GamePage,
});

type SelectionMode = 'default' | 'move' | 'rally';

function GamePage() {
	const { gameId } = Route.useParams();
	const navigate = useNavigate();
	const game = useQuery(api.games.get, { gameId: gameId as Id<'games'> });
	const visibilityData = useQuery(api.tiles.getVisibleForPlayer, { gameId: gameId as Id<'games'> });
	const armiesData = useQuery(api.armies.getVisibleForPlayer, { gameId: gameId as Id<'games'> });
	const economy = useQuery(api.games.getMyEconomy, { gameId: gameId as Id<'games'> });
	const user = useQuery(api.users.currentUser);
	const combatTileIds = useQuery(api.armies.getTilesWithCombat, { gameId: gameId as Id<'games'> });
	const setRatiosMutation = useMutation(api.games.setRatios);
	const moveArmyMutation = useMutation(api.armies.moveArmy);
	const cancelMoveMutation = useMutation(api.armies.cancelMove);
	const setRallyPointMutation = useMutation(api.armies.setRallyPoint);
	const retreatArmyMutation = useMutation(api.armies.retreatArmy);
	const buildCityMutation = useMutation(api.tiles.buildCity);
	const abandonMutation = useMutation(api.games.abandon);

	// Selection state
	const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
	const [selectedArmyId, setSelectedArmyId] = useState<string | null>(null);
	const [mode, setMode] = useState<SelectionMode>('default');
	const [moveUnitCount, setMoveUnitCount] = useState<number>(0);
	const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);

	// Local ratio state for optimistic UI
	const [localRatios, setLocalRatios] = useState<{
		labour: number;
		military: number;
		spy: number;
	} | null>(null);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

	// Transform visibility data to TileData format
	const tilesWithVisibility = useMemo((): TileData[] => {
		if (!visibilityData) {
			return [];
		}

		const result: TileData[] = [];

		for (const tile of visibilityData.visible) {
			result.push({
				_id: tile._id,
				q: tile.q,
				r: tile.r,
				ownerId: tile.ownerId ?? undefined,
				type: tile.type,
				visibility: 'visible',
			});
		}

		for (const tile of visibilityData.fogged) {
			result.push({
				_id: `fogged-${tile.q}-${tile.r}`,
				q: tile.q,
				r: tile.r,
				ownerId: tile.lastSeenOwnerId ?? undefined,
				type: tile.lastSeenType,
				visibility: 'fogged',
			});
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

	// Get selected objects
	const selectedTile = tilesWithVisibility.find((t) => t._id === selectedTileId);
	const selectedArmy = armies.find((a) => a._id === selectedArmyId);
	const isOwnTile = selectedTile?.ownerId === myPlayer?._id;

	// Find stationary armies on the selected tile (for tile-based army selection)
	const stationaryArmiesOnTile = useMemo(() => {
		if (!selectedTile) {
			return [];
		}
		return armies.filter((a) => a.currentQ === selectedTile.q && a.currentR === selectedTile.r && !a.targetTileId);
	}, [selectedTile, armies]);

	// Compute movement path preview
	const movementPath = useMemo(() => {
		if (mode !== 'move' || !selectedArmyId || !selectedTileId) {
			return undefined;
		}

		const army = armies.find((a) => a._id === selectedArmyId);
		const targetTile = tilesWithVisibility.find((t) => t._id === selectedTileId);
		if (!army || !targetTile) {
			return undefined;
		}

		// Build tile map for pathfinding
		const tileMap = new Map(tilesWithVisibility.map((t) => [coordKey(t.q, t.r), t]));

		const canTraverse = (coord: { q: number; r: number }) => {
			const tile = tileMap.get(coordKey(coord.q, coord.r));
			if (!tile || tile.visibility !== 'visible') {
				return false;
			}
			// Allow destination even if enemy
			if (coord.q === targetTile.q && coord.r === targetTile.r) {
				return true;
			}
			return tile.ownerId === undefined || tile.ownerId === myPlayer?._id;
		};

		const path = findPath({ q: army.currentQ, r: army.currentR }, { q: targetTile.q, r: targetTile.r }, canTraverse);
		return path ?? undefined;
	}, [mode, selectedArmyId, selectedTileId, armies, tilesWithVisibility, myPlayer?._id]);

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
						// Allow destination even if enemy
						if (coord.q === q && coord.r === r) {
							return true;
						}
						return tile.ownerId === undefined || tile.ownerId === myPlayer?._id;
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
			} else if (mode === 'rally') {
				// Set rally point handled by context panel button
				setSelectedTileId(tileId);
			} else {
				// Default selection
				setSelectedTileId(tileId);
				setSelectedArmyId(null);
			}
		},
		[mode, selectedArmyId, armies, tilesWithVisibility, myPlayer?._id, moveArmyMutation, moveUnitCount],
	);

	// Army click handler
	const handleArmyClick = useCallback((armyId: string) => {
		setSelectedArmyId(armyId);
		setSelectedTileId(null);
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
		} catch (e) {
			console.error('Failed to build city:', e);
		}
	}, [selectedTileId, buildCityMutation]);

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

	// Menu handlers
	const handleOpenLeaveDialog = useCallback(() => {
		setLeaveDialogOpen(true);
	}, []);

	const handleLeaveGame = useCallback(async () => {
		await abandonMutation({ gameId: gameId as Id<'games'> });
		setLeaveDialogOpen(false);
		navigate({ to: '/lobbies' });
	}, [gameId, abandonMutation, navigate]);

	const handleOpenSettings = useCallback(() => {
		navigate({ search: { settings: 'open' } });
	}, [navigate]);

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

	if (game.status !== 'inProgress' && game.status !== 'starting') {
		return null;
	}

	const activePlayers = game.players.filter((p) => !p.eliminatedAt);
	const isEliminated = !!myPlayer?.eliminatedAt;

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
					population={economy.population}
					popCap={economy.popCap}
					startedAt={economy.startedAt}
					players={game.players}
					activePlayers={activePlayers.length}
					onLeaveGame={handleOpenLeaveDialog}
					onOpenSettings={handleOpenSettings}
				/>
			)}

			{/* Main map area */}
			<div className='relative flex-1 overflow-hidden bg-gray-900'>
				{tilesWithVisibility.length > 0 ? (
					<div className='absolute inset-0'>
						<HexMap
							tiles={tilesWithVisibility}
							players={game.players}
							currentPlayerId={myPlayer?._id ?? ''}
							armies={armies}
							combatTileIds={combatTileIds ?? []}
							selectedTileId={selectedTileId ?? undefined}
							selectedArmyId={selectedArmyId ?? undefined}
							rallyPointTileId={myPlayer?.rallyPointTileId ?? undefined}
							movementPath={movementPath}
							onTileClick={handleTileClick}
							onArmyClick={handleArmyClick}
							onBackgroundClick={handleCancelSelection}
						/>
					</div>
				) : (
					<div className='flex h-full items-center justify-center'>
						<p className='text-muted-foreground'>Loading map...</p>
					</div>
				)}

				{/* Context panel overlay */}
				<div className='absolute bottom-4 right-4 w-64'>
					<ContextPanel
						selectedTile={selectedTile}
						selectedArmy={selectedArmy}
						stationaryArmiesOnTile={stationaryArmiesOnTile}
						isOwnTile={isOwnTile}
						mode={mode}
						moveUnitCount={moveUnitCount}
						playerGold={economy?.gold ?? 0}
						onMoveUnitCountChange={setMoveUnitCount}
						onSetRallyPoint={handleSetRallyPoint}
						onCancelMove={handleCancelMove}
						onCancelSelection={handleCancelSelection}
						onSetMoveMode={handleSetMoveMode}
						onSetRallyMode={handleSetRallyMode}
						onCallHome={handleCallHome}
						onBuildCity={handleBuildCity}
						onRetreat={handleRetreat}
					/>
				</div>
			</div>

			{/* Ratio sliders (only show if not eliminated) */}
			{!isEliminated && (
				<RatioSliders
					labourRatio={displayRatios.labour}
					militaryRatio={displayRatios.military}
					spyRatio={displayRatios.spy}
					population={economy?.population ?? 0}
					onRatioChange={handleRatioChange}
				/>
			)}

			{/* Leave Game Dialog */}
			<Dialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Leave Game?</DialogTitle>
						<DialogDescription>Leaving will count as a forfeit. You will be eliminated from the game.</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant='outline' onClick={() => setLeaveDialogOpen(false)}>
							Cancel
						</Button>
						<Button variant='destructive' onClick={handleLeaveGame}>
							Leave Game
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
