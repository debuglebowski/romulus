import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery } from 'convex/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/ui/_shadcn/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/ui/_shadcn/dialog';
import { ContextPanel } from '@/ui/components/context-panel';
import { GameStatsBar } from '@/ui/components/game-stats-bar';
import { HexMap, type ArmyData, type TileData } from '@/ui/components/hex-map';
import { RatioSliders } from '@/ui/components/ratio-sliders';

import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';
import { coordKey, findPath } from '../../../../convex/lib/hex';

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
	const setRatiosMutation = useMutation(api.games.setRatios);
	const moveArmyMutation = useMutation(api.armies.moveArmy);
	const cancelMoveMutation = useMutation(api.armies.cancelMove);
	const setRallyPointMutation = useMutation(api.armies.setRallyPoint);
	const abandonMutation = useMutation(api.games.abandon);

	// Selection state
	const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
	const [selectedArmyId, setSelectedArmyId] = useState<string | null>(null);
	const [mode, setMode] = useState<SelectionMode>('default');
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
			if (debounceRef.current) clearTimeout(debounceRef.current);
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
		if (!visibilityData) return [];

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
		if (!armiesData) return [];
		return armiesData.map((a) => ({
			_id: a._id,
			ownerId: a.ownerId,
			tileId: a.tileId,
			count: a.count,
			currentQ: a.currentQ,
			currentR: a.currentR,
			isOwn: a.isOwn,
			path: a.path ?? undefined,
			targetTileId: a.targetTileId ?? undefined,
		}));
	}, [armiesData]);

	// Get selected objects
	const selectedTile = tilesWithVisibility.find((t) => t._id === selectedTileId);
	const selectedArmy = armies.find((a) => a._id === selectedArmyId);
	const isOwnTile = selectedTile?.ownerId === myPlayer?._id;

	// Compute movement path preview
	const movementPath = useMemo(() => {
		if (mode !== 'move' || !selectedArmyId || !selectedTileId) return undefined;

		const army = armies.find((a) => a._id === selectedArmyId);
		const targetTile = tilesWithVisibility.find((t) => t._id === selectedTileId);
		if (!army || !targetTile) return undefined;

		// Build tile map for pathfinding
		const tileMap = new Map(tilesWithVisibility.map((t) => [coordKey(t.q, t.r), t]));

		const canTraverse = (coord: { q: number; r: number }) => {
			const tile = tileMap.get(coordKey(coord.q, coord.r));
			if (!tile || tile.visibility !== 'visible') return false;
			// Allow destination even if enemy
			if (coord.q === targetTile.q && coord.r === targetTile.r) return true;
			return tile.ownerId === undefined || tile.ownerId === myPlayer?._id;
		};

		const path = findPath({ q: army.currentQ, r: army.currentR }, { q: targetTile.q, r: targetTile.r }, canTraverse);
		return path ?? undefined;
	}, [mode, selectedArmyId, selectedTileId, armies, tilesWithVisibility, myPlayer?._id]);

	// Tile click handler
	const handleTileClick = useCallback(
		async (tileId: string, _q: number, _r: number) => {
			if (mode === 'move' && selectedArmyId) {
				// Execute move
				if (movementPath && movementPath.length > 0) {
					try {
						await moveArmyMutation({
							armyId: selectedArmyId as Id<'armies'>,
							targetTileId: tileId as Id<'tiles'>,
						});
					} catch (e) {
						console.error('Failed to move army:', e);
					}
				}
				setMode('default');
				setSelectedArmyId(null);
				setSelectedTileId(null);
			} else if (mode === 'rally') {
				// Set rally point handled by context panel button
				setSelectedTileId(tileId);
			} else {
				// Default selection
				setSelectedTileId(tileId);
				setSelectedArmyId(null);
			}
		},
		[mode, selectedArmyId, movementPath, moveArmyMutation],
	);

	// Army click handler
	const handleArmyClick = useCallback((armyId: string) => {
		setSelectedArmyId(armyId);
		setSelectedTileId(null);
		setMode('default');
	}, []);

	// Context panel handlers
	const handleSetMoveMode = useCallback(() => {
		setMode('move');
	}, []);

	const handleSetRallyMode = useCallback(() => {
		setMode('rally');
	}, []);

	const handleCancelMove = useCallback(async () => {
		if (!selectedArmyId) return;
		try {
			await cancelMoveMutation({ armyId: selectedArmyId as Id<'armies'> });
		} catch (e) {
			console.error('Failed to cancel move:', e);
		}
	}, [selectedArmyId, cancelMoveMutation]);

	const handleSetRallyPoint = useCallback(async () => {
		if (!selectedTileId) return;
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
	}, []);

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
							selectedTileId={selectedTileId ?? undefined}
							selectedArmyId={selectedArmyId ?? undefined}
							rallyPointTileId={myPlayer?.rallyPointTileId ?? undefined}
							movementPath={movementPath}
							onTileClick={handleTileClick}
							onArmyClick={handleArmyClick}
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
						isOwnTile={isOwnTile}
						mode={mode}
						onSetRallyPoint={handleSetRallyPoint}
						onCancelMove={handleCancelMove}
						onCancelSelection={handleCancelSelection}
						onSetMoveMode={handleSetMoveMode}
						onSetRallyMode={handleSetRallyMode}
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
						<DialogDescription>
							Leaving will count as a forfeit. You will be eliminated from the game.
						</DialogDescription>
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
