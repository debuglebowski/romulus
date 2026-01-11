import { IconArrowLeft } from '@tabler/icons-react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery } from 'convex/react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/ui/_shadcn/button';

import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';

export const Route = createFileRoute('/game/$gameId/lobby')({
	component: GameLobbyPage,
});

function GameLobbyPage() {
	const { gameId } = Route.useParams();
	const navigate = useNavigate();
	const game = useQuery(api.games.get, { gameId: gameId as Id<'games'> });
	const user = useQuery(api.users.currentUser);
	const setReady = useMutation(api.games.setReady);
	const leave = useMutation(api.games.leave);
	const start = useMutation(api.games.start);
	const heartbeat = useMutation(api.games.heartbeat);

	const [countdown, setCountdown] = useState<number | null>(null);

	// Ref to track current game status for cleanup without triggering effect re-runs
	const gameStatusRef = useRef(game?.status);
	gameStatusRef.current = game?.status;

	const myPlayer = game?.players.find((p) => p.userId === user?._id);
	const myPlayerId = myPlayer?._id;
	const isHost = game?.hostId === user?._id;
	const allReady = game?.players.every((p) => p.isReady) && (game?.players.length ?? 0) >= 2;

	// Heartbeat - update lastSeen every 2 minutes
	// Use myPlayerId (stable string) instead of myPlayer (unstable object reference)
	// to prevent cascade effect where heartbeat updates trigger re-renders that trigger more heartbeats
	useEffect(() => {
		if (!myPlayerId) return;

		// Initial heartbeat
		heartbeat({ gameId: gameId as Id<'games'> });

		const interval = setInterval(
			() => {
				heartbeat({ gameId: gameId as Id<'games'> });
			},
			2 * 60 * 1000,
		);

		return () => clearInterval(interval);
	}, [gameId, myPlayerId, heartbeat]);

	// Cleanup on unmount only (not on dependency changes)
	// Uses ref to access current game status without causing effect re-runs
	useEffect(() => {
		const handleBeforeUnload = () => {
			// Fire-and-forget leave on tab close
			leave({ gameId: gameId as Id<'games'> });
		};

		window.addEventListener('beforeunload', handleBeforeUnload);

		return () => {
			window.removeEventListener('beforeunload', handleBeforeUnload);
			// Only leave if game is still waiting (not starting/started)
			// Use ref to get current status, not stale closure value
			if (gameStatusRef.current === 'waiting') {
				leave({ gameId: gameId as Id<'games'> });
			}
		};
	}, [gameId, leave]); // Only re-run if gameId changes (different game)

	// Countdown logic
	useEffect(() => {
		if (allReady && countdown === null) {
			setCountdown(3);
		} else if (!allReady && countdown !== null) {
			setCountdown(null);
		}
	}, [allReady, countdown]);

	useEffect(() => {
		if (countdown === null) return;

		if (countdown === 0) {
			if (isHost) {
				start({ gameId: gameId as Id<'games'> });
			}
			return;
		}

		const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
		return () => clearTimeout(timer);
	}, [countdown, isHost, gameId, start]);

	// Redirect on status change
	useEffect(() => {
		if (game?.status === 'inProgress' || game?.status === 'starting') {
			navigate({ to: '/game/$gameId', params: { gameId } });
		}
	}, [game?.status, gameId, navigate]);

	const handleToggleReady = useCallback(async () => {
		if (!myPlayer) return;
		await setReady({ gameId: gameId as Id<'games'>, isReady: !myPlayer.isReady });
	}, [gameId, myPlayer, setReady]);

	const handleLeave = useCallback(async () => {
		await leave({ gameId: gameId as Id<'games'> });
		navigate({ to: '/lobbies' });
	}, [gameId, leave, navigate]);

	if (!game || !user) {
		return (
			<div className='flex min-h-[calc(100vh-64px)] items-center justify-center'>
				<div className='animate-pulse text-muted-foreground'>Loading...</div>
			</div>
		);
	}

	if (game.status !== 'waiting') {
		return null;
	}

	return (
		<div className='mx-auto max-w-2xl p-4'>
			{/* Countdown overlay */}
			{countdown !== null && (
				<div className='fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/95'>
					<p className='mb-8 text-xl uppercase tracking-wider'>All Players Ready</p>
					<div className='flex h-24 w-24 items-center justify-center border-2 border-primary text-5xl font-bold'>
						{countdown}
					</div>
					<p className='mt-8 text-muted-foreground'>GAME STARTING...</p>
				</div>
			)}

			<div className='mb-6 flex items-center justify-between'>
				<button
					type='button'
					onClick={handleLeave}
					className='flex items-center gap-1 text-muted-foreground hover:text-foreground'
				>
					<IconArrowLeft size={18} />
					Leave
				</button>
				<h1 className='text-xl uppercase tracking-wider'>{game.name}</h1>
				<div className='w-16' />
			</div>

			<div className='border'>
				<div className='border-b p-3 text-center uppercase tracking-wider'>Players</div>

				{/* Player list */}
				{game.players.map((player) => (
					<div key={player._id} className='flex items-center justify-between border-b p-3'>
						<div className='flex items-center gap-2'>
							{player.userId === game.hostId && <span className='text-primary'>★</span>}
							<span>{player.username}</span>
							{player.userId === game.hostId && (
								<span className='text-muted-foreground'>(Host)</span>
							)}
						</div>
						<span className={player.isReady ? 'text-green-500' : 'text-muted-foreground'}>
							{player.isReady ? 'READY ●' : 'NOT READY ○'}
						</span>
					</div>
				))}

				{/* Empty slots */}
				{Array.from({ length: game.maxPlayers - game.players.length }).map((_, i) => (
					<div
						key={`empty-${i}`}
						className='border-b border-dashed p-3 text-center text-muted-foreground'
					>
						┄┄┄ Waiting for players ┄┄┄
					</div>
				))}
			</div>

			<p className='mt-6 text-center text-muted-foreground'>
				{game.players.length} / {game.maxPlayers} Players
			</p>

			<div className='mt-6 flex justify-center'>
				<Button onClick={handleToggleReady} className='w-32'>
					{myPlayer?.isReady ? 'NOT READY' : 'READY'}
				</Button>
			</div>

			<p className='mt-6 text-center text-muted-foreground text-sm'>
				{game.players.length < 2
					? 'Need at least 2 players'
					: 'Game starts when all players ready'}
			</p>
		</div>
	);
}
