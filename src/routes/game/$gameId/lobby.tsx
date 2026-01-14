import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery } from 'convex/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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

	const [now, setNow] = useState(() => Date.now());

	// Ref to track current game status for cleanup without triggering effect re-runs
	const gameStatusRef = useRef(game?.status);
	gameStatusRef.current = game?.status;

	const myPlayer = game?.players.find((p) => p.userId === user?._id);
	const myPlayerId = myPlayer?._id;
	const isHost = game?.hostId === user?._id;
	const allReady = game?.players.every((p) => p.isReady) && (game?.players.length ?? 0) >= 2;

	const countdownSeconds = useMemo(() => {
		if (game?.status !== 'starting') {
			return null;
		}
		if (!game.startCountdownEndsAt) {
			return null;
		}
		const remainingMs = game.startCountdownEndsAt - now;
		return Math.max(0, Math.ceil(remainingMs / 1000));
	}, [game?.status, game?.startCountdownEndsAt, now]);

	// Heartbeat - update lastSeen every 2 minutes
	// Use myPlayerId (stable string) instead of myPlayer (unstable object reference)
	// to prevent cascade effect where heartbeat updates trigger re-renders that trigger more heartbeats
	useEffect(() => {
		if (!myPlayerId) {
			return;
		}

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

	useEffect(() => {
		if (game?.status !== 'starting') {
			return;
		}
		const interval = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(interval);
	}, [game?.status]);

	// Redirect on status change
	useEffect(() => {
		if (game?.status === 'inProgress') {
			navigate({ to: '/game/$gameId', params: { gameId } });
		}
	}, [game?.status, gameId, navigate]);

	const handleToggleReady = useCallback(async () => {
		if (!myPlayer) {
			return;
		}
		await setReady({ gameId: gameId as Id<'games'>, isReady: !myPlayer.isReady });
	}, [gameId, myPlayer, setReady]);

	const handleStartGame = useCallback(() => {
		if (!isHost) {
			return;
		}
		if (!allReady) {
			return;
		}
		if (game?.status !== 'waiting') {
			return;
		}
		start({ gameId: gameId as Id<'games'> });
	}, [allReady, isHost, game?.status, gameId, start]);

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

	if (game.status !== 'waiting' && game.status !== 'starting') {
		return null;
	}

	return (
		<div className='mx-auto max-w-2xl p-8'>
			{/* Countdown overlay */}
			{countdownSeconds !== null && (
				<div className='fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/95'>
					<p className='mb-8 text-xl uppercase tracking-wider'>All Players Ready</p>
					<div className='flex h-24 w-24 items-center justify-center border-2 border-primary text-5xl font-bold'>
						{countdownSeconds}
					</div>
					<p className='mt-8 text-muted-foreground'>GAME STARTING...</p>
				</div>
			)}

			{/* Game title */}
			<div className='mb-8 text-center'>
				<h1 className='mb-2 text-2xl uppercase tracking-wider'>{game.name}</h1>
				<div className='mx-auto mb-4 h-px w-24 bg-primary' />
			</div>

			{/* Player list */}
			<div className='mb-8 border'>
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

			{/* Action buttons */}
			<div className='mb-6 flex justify-center gap-4'>
				<Button onClick={handleToggleReady} className='w-32'>
					{myPlayer?.isReady ? 'NOT READY' : 'READY'}
				</Button>
				{isHost && (
					<Button
						onClick={handleStartGame}
						className='w-32'
						disabled={!allReady || game.status !== 'waiting'}
						variant={allReady ? 'default' : 'secondary'}
					>
						START
					</Button>
				)}
				<Button variant='outline' onClick={handleLeave} className='w-32'>
					LEAVE
				</Button>
			</div>

			<p className='text-center text-muted-foreground text-sm'>
				{game.status === 'starting'
					? 'Game starting...'
					: game.players.length < 2
						? 'Need at least 2 players'
						: isHost
							? allReady
								? 'All players ready. Start when you’re ready.'
								: 'Start is enabled when all players are ready.'
							: 'Waiting for host to start once everyone is ready.'}
			</p>
		</div>
	);
}
