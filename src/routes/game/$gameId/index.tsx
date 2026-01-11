import { IconDoorExit, IconSkull, IconTrophy } from '@tabler/icons-react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery } from 'convex/react';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/ui/_shadcn/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/ui/_shadcn/card';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from '@/ui/_shadcn/dialog';

import { api } from '../../../../convex/_generated/api';
import type { Id } from '../../../../convex/_generated/dataModel';

export const Route = createFileRoute('/game/$gameId/')({
	component: GamePage,
});

function GamePage() {
	const { gameId } = Route.useParams();
	const navigate = useNavigate();
	const game = useQuery(api.games.get, { gameId: gameId as Id<'games'> });
	const user = useQuery(api.users.currentUser);
	const abandon = useMutation(api.games.abandon);
	const [dialogOpen, setDialogOpen] = useState(false);

	const myPlayer = game?.players.find((p) => p.userId === user?._id);

	// Redirect guards
	useEffect(() => {
		if (game?.status === 'waiting') {
			navigate({ to: '/game/$gameId/lobby', params: { gameId } });
		} else if (game?.status === 'finished') {
			navigate({ to: '/game/$gameId/results', params: { gameId } });
		}
	}, [game?.status, gameId, navigate]);

	const handleAbandon = useCallback(async () => {
		await abandon({ gameId: gameId as Id<'games'> });
		navigate({ to: '/lobbies' });
	}, [gameId, abandon, navigate]);

	if (!game || !user) {
		return (
			<div className='flex min-h-[calc(100vh-64px)] items-center justify-center'>
				<div className='animate-pulse text-muted-foreground'>Loading...</div>
			</div>
		);
	}

	if (game.status !== 'inProgress' && game.status !== 'starting') {
		return null;
	}

	const activePlayers = game.players.filter((p) => !p.eliminatedAt);
	const eliminatedPlayers = game.players.filter((p) => p.eliminatedAt);
	const isEliminated = !!myPlayer?.eliminatedAt;

	return (
		<div className='mx-auto max-w-4xl p-4'>
			<Card>
				<CardHeader>
					<div className='flex items-center justify-between'>
						<CardTitle>{game.name}</CardTitle>
						<div className='flex items-center gap-2'>
							{isEliminated ? (
								<Button variant='outline' onClick={() => navigate({ to: '/lobbies' })}>
									<IconDoorExit className='mr-2 h-4 w-4' />
									Return to Lobbies
								</Button>
							) : (
								<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
									<DialogTrigger>
										<Button variant='destructive'>
											<IconDoorExit className='mr-2 h-4 w-4' />
											Leave Game
										</Button>
									</DialogTrigger>
									<DialogContent>
										<DialogHeader>
											<DialogTitle>Leave Game?</DialogTitle>
											<DialogDescription>
												Leaving will count as a forfeit. You will be eliminated from the game.
											</DialogDescription>
										</DialogHeader>
										<DialogFooter>
											<Button variant='outline' onClick={() => setDialogOpen(false)}>
												Cancel
											</Button>
											<Button variant='destructive' onClick={handleAbandon}>
												Leave Game
											</Button>
										</DialogFooter>
									</DialogContent>
								</Dialog>
							)}
						</div>
					</div>
				</CardHeader>
				<CardContent className='space-y-6'>
					{/* Placeholder game area */}
					<div className='flex h-64 items-center justify-center rounded-lg border-2 border-dashed'>
						<p className='text-muted-foreground'>Game in progress - gameplay coming soon</p>
					</div>

					{/* Player status */}
					<div className='space-y-4'>
						<h3 className='font-semibold'>Players</h3>

						{/* Active players */}
						<div className='space-y-2'>
							{activePlayers.map((player) => (
								<div
									key={player._id}
									className='flex items-center justify-between rounded-lg border p-3'
								>
									<div className='flex items-center gap-3'>
										<div
											className='h-4 w-4 rounded-full'
											style={{ backgroundColor: player.color }}
										/>
										<span className='font-medium'>
											{player.username}
											{player.userId === user._id && ' (You)'}
										</span>
									</div>
									<IconTrophy className='h-4 w-4 text-muted-foreground' />
								</div>
							))}
						</div>

						{/* Eliminated players */}
						{eliminatedPlayers.length > 0 && (
							<div className='space-y-2'>
								<h4 className='text-muted-foreground text-sm'>Eliminated</h4>
								{eliminatedPlayers.map((player) => (
									<div
										key={player._id}
										className='flex items-center justify-between rounded-lg border border-dashed p-3 opacity-60'
									>
										<div className='flex items-center gap-3'>
											<div
												className='h-4 w-4 rounded-full'
												style={{ backgroundColor: player.color }}
											/>
											<span className='font-medium line-through'>
												{player.username}
												{player.userId === user._id && ' (You)'}
											</span>
										</div>
										<div className='flex items-center gap-2 text-muted-foreground text-sm'>
											<IconSkull className='h-4 w-4' />
											<span>#{player.finishPosition}</span>
										</div>
									</div>
								))}
							</div>
						)}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
