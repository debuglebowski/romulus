import { IconCheck, IconCrown, IconDoorExit } from '@tabler/icons-react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery } from 'convex/react';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/ui/_shadcn/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/_shadcn/card';

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

	const [countdown, setCountdown] = useState<number | null>(null);

	const myPlayer = game?.players.find((p) => p.userId === user?._id);
	const isHost = game?.hostId === user?._id;
	const allReady = game?.players.every((p) => p.isReady) && (game?.players.length ?? 0) >= 2;

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
			<Card>
				<CardHeader>
					<div className='flex items-center justify-between'>
						<div>
							<CardTitle>{game.name}</CardTitle>
							<CardDescription>
								{game.players.length}/{game.maxPlayers} players
							</CardDescription>
						</div>
						{countdown !== null && (
							<div className='rounded-full bg-primary px-4 py-2 font-bold text-primary-foreground text-xl'>
								{countdown}
							</div>
						)}
					</div>
				</CardHeader>
				<CardContent className='space-y-4'>
					{/* Player list */}
					<div className='space-y-2'>
						{game.players.map((player) => (
							<div
								key={player._id}
								className='flex items-center justify-between rounded-lg border p-3'
							>
								<div className='flex items-center gap-3'>
									<div
										className='h-4 w-4 rounded-full'
										style={{ backgroundColor: player.color }}
									/>
									<span className='font-medium'>{player.username}</span>
									{player.userId === game.hostId && (
										<IconCrown className='h-4 w-4 text-yellow-500' />
									)}
								</div>
								{player.isReady && <IconCheck className='h-5 w-5 text-green-500' />}
							</div>
						))}

						{/* Empty slots */}
						{Array.from({ length: game.maxPlayers - game.players.length }).map((_, i) => (
							<div
								key={`empty-${i}`}
								className='flex items-center rounded-lg border border-dashed p-3 text-muted-foreground'
							>
								<span>Waiting for player...</span>
							</div>
						))}
					</div>

					{/* Actions */}
					<div className='flex gap-2'>
						<Button variant='outline' onClick={handleLeave} className='gap-2'>
							<IconDoorExit className='h-4 w-4' />
							Leave
						</Button>
						<Button
							onClick={handleToggleReady}
							variant={myPlayer?.isReady ? 'secondary' : 'default'}
							className='flex-1'
						>
							{myPlayer?.isReady ? 'Not Ready' : 'Ready'}
						</Button>
					</div>

					{allReady && (
						<p className='text-center text-muted-foreground text-sm'>
							Game starting in {countdown}...
						</p>
					)}
					{!allReady && game.players.length >= 2 && (
						<p className='text-center text-muted-foreground text-sm'>
							Waiting for all players to ready up
						</p>
					)}
					{game.players.length < 2 && (
						<p className='text-center text-muted-foreground text-sm'>Need at least 2 players</p>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
