import { IconPlus, IconUsers } from '@tabler/icons-react';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery } from 'convex/react';

import { Button, buttonVariants } from '@/ui/_shadcn/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/_shadcn/card';

import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';

export const Route = createFileRoute('/lobbies/')({
	component: LobbiesPage,
});

function LobbiesPage() {
	const games = useQuery(api.games.list);
	const currentGame = useQuery(api.games.getMyCurrentGame);
	const join = useMutation(api.games.join);
	const navigate = useNavigate();

	// Redirect if in active game
	if (currentGame) {
		if (currentGame.status === 'waiting') {
			navigate({ to: '/game/$gameId/lobby', params: { gameId: currentGame.gameId } });
		} else if (currentGame.status === 'inProgress' || currentGame.status === 'starting') {
			navigate({ to: '/game/$gameId', params: { gameId: currentGame.gameId } });
		}
		return null;
	}

	const handleJoin = async (gameId: Id<'games'>) => {
		await join({ gameId });
		navigate({ to: '/game/$gameId/lobby', params: { gameId } });
	};

	return (
		<div className='mx-auto max-w-4xl p-4'>
			<div className='mb-6 flex items-center justify-between'>
				<h2 className='font-semibold text-2xl'>Game Lobbies</h2>
				<Link to='/lobbies/new' className={buttonVariants()}>
					<IconPlus className='mr-2 h-4 w-4' />
					Create Game
				</Link>
			</div>

			{games === undefined ? (
				<div className='py-8 text-center text-muted-foreground'>Loading...</div>
			) : games.length === 0 ? (
				<Card>
					<CardContent className='py-8 text-center text-muted-foreground'>
						No games available. Create one to get started!
					</CardContent>
				</Card>
			) : (
				<div className='grid gap-4 sm:grid-cols-2'>
					{games.map((game) => (
						<Card key={game._id} className='transition-shadow hover:shadow-md'>
							<CardHeader className='pb-2'>
								<CardTitle className='text-lg'>{game.name}</CardTitle>
								<CardDescription>Hosted by {game.hostUsername}</CardDescription>
							</CardHeader>
							<CardContent>
								<div className='flex items-center justify-between'>
									<div className='flex items-center gap-1 text-muted-foreground text-sm'>
										<IconUsers className='h-4 w-4' />
										<span>
											{game.playerCount}/{game.maxPlayers}
										</span>
									</div>
									<Button
										size='sm'
										onClick={() => handleJoin(game._id)}
										disabled={game.playerCount >= game.maxPlayers}
									>
										{game.playerCount >= game.maxPlayers ? 'Full' : 'Join'}
									</Button>
								</div>
							</CardContent>
						</Card>
					))}
				</div>
			)}
		</div>
	);
}
