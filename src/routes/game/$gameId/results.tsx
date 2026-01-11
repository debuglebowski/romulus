import { IconClock, IconTrophy } from '@tabler/icons-react';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useQuery } from 'convex/react';
import { useEffect } from 'react';

import { buttonVariants } from '@/ui/_shadcn/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/_shadcn/card';

import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';

export const Route = createFileRoute('/game/$gameId/results')({
	component: ResultsPage,
});

function formatDuration(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);

	if (hours > 0) {
		return `${hours}h ${minutes % 60}m`;
	}
	if (minutes > 0) {
		return `${minutes}m ${seconds % 60}s`;
	}
	return `${seconds}s`;
}

function ResultsPage() {
	const { gameId } = Route.useParams();
	const navigate = useNavigate();
	const game = useQuery(api.games.get, { gameId: gameId as Id<'games'> });
	const user = useQuery(api.users.currentUser);

	// Validate user participated
	const participated = game?.players.some((p) => p.userId === user?._id);

	useEffect(() => {
		if (game && user && !participated) {
			navigate({ to: '/lobbies' });
		}
	}, [game, user, participated, navigate]);

	if (!game || !user) {
		return (
			<div className='flex min-h-[calc(100vh-64px)] items-center justify-center'>
				<div className='animate-pulse text-muted-foreground'>Loading...</div>
			</div>
		);
	}

	if (game.status !== 'finished') {
		navigate({ to: '/game/$gameId', params: { gameId } });
		return null;
	}

	// Sort by finish position (1 = winner)
	const sortedPlayers = [...game.players].sort(
		(a, b) => (a.finishPosition ?? 999) - (b.finishPosition ?? 999),
	);
	const winner = sortedPlayers[0];
	const gameDuration = game.finishedAt && game.startedAt ? game.finishedAt - game.startedAt : 0;

	return (
		<div className='mx-auto max-w-2xl p-4'>
			<Card>
				<CardHeader className='text-center'>
					<CardTitle className='text-2xl'>Game Results</CardTitle>
					<p className='text-muted-foreground'>{game.name}</p>
				</CardHeader>
				<CardContent className='space-y-6'>
					{/* Winner highlight */}
					{winner && (
						<div className='rounded-lg bg-gradient-to-r from-yellow-500/10 to-yellow-600/10 p-6 text-center'>
							<IconTrophy className='mx-auto h-12 w-12 text-yellow-500' />
							<h2 className='mt-2 font-bold text-2xl'>{winner.username}</h2>
							<p className='text-muted-foreground'>Winner</p>
						</div>
					)}

					{/* Game stats */}
					<div className='flex justify-center gap-4 text-center'>
						<div>
							<div className='flex items-center justify-center gap-1 text-muted-foreground'>
								<IconClock className='h-4 w-4' />
								<span className='text-sm'>Duration</span>
							</div>
							<p className='font-semibold'>{formatDuration(gameDuration)}</p>
						</div>
					</div>

					{/* Standings */}
					<div className='space-y-2'>
						<h3 className='font-semibold'>Final Standings</h3>
						{sortedPlayers.map((player) => (
							<div
								key={player._id}
								className={`flex items-center justify-between rounded-lg border p-3 ${
									player.finishPosition === 1 ? 'border-yellow-500/50 bg-yellow-500/5' : ''
								}`}
							>
								<div className='flex items-center gap-3'>
									<span className='w-6 font-bold text-muted-foreground'>
										#{player.finishPosition}
									</span>
									<div
										className='h-4 w-4 rounded-full'
										style={{ backgroundColor: player.color }}
									/>
									<span className='font-medium'>
										{player.username}
										{player.userId === user._id && ' (You)'}
									</span>
								</div>
								<div className='text-muted-foreground text-sm'>
									{player.eliminationReason === 'forfeit' && 'Forfeit'}
									{player.eliminationReason === 'capitalCaptured' && 'Capital Captured'}
									{player.eliminationReason === 'debt' && 'Debt'}
									{player.finishPosition === 1 && 'Winner'}
								</div>
							</div>
						))}
					</div>

					<Link to='/lobbies' className={buttonVariants({ className: 'w-full' })}>
						Return to Menu
					</Link>
				</CardContent>
			</Card>
		</div>
	);
}
