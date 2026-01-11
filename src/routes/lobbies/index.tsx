import { IconArrowLeft, IconRefresh } from '@tabler/icons-react';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery } from 'convex/react';

import { Button } from '@/ui/_shadcn/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/ui/_shadcn/table';

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
				<Link to='/' className='flex items-center gap-1 text-muted-foreground hover:text-foreground'>
					<IconArrowLeft size={18} />
					Back
				</Link>
				<h1 className='text-xl uppercase tracking-wider'>Find a Game</h1>
				<div className='w-16' />
			</div>

			{games === undefined ? (
				<div className='py-8 text-center text-muted-foreground'>Loading...</div>
			) : games.length === 0 ? (
				<div className='border py-8 text-center text-muted-foreground'>No games available. Create one to get started!</div>
			) : (
				<div className='border'>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className='uppercase tracking-wide'>Game Name</TableHead>
								<TableHead className='uppercase tracking-wide'>Host</TableHead>
								<TableHead className='uppercase tracking-wide'>Players</TableHead>
								<TableHead className='uppercase tracking-wide'>Status</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{games.map((game) => {
								const isFull = game.playerCount >= game.maxPlayers;
								return (
									<TableRow
										key={game._id}
										onClick={isFull ? undefined : () => handleJoin(game._id)}
										className={isFull ? 'opacity-50' : 'cursor-pointer hover:bg-primary/10'}
									>
										<TableCell>{game.name}</TableCell>
										<TableCell>{game.hostUsername}</TableCell>
										<TableCell>
											{game.playerCount}/{game.maxPlayers}
										</TableCell>
										<TableCell>{isFull ? 'Full' : 'Waiting'}</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				</div>
			)}

			<div className='mt-8 flex justify-center'>
				<Link to='/lobbies/new'>
					<Button className='w-32'>CREATE GAME</Button>
				</Link>
			</div>

			<div className='mt-6 flex justify-center'>
				<Button
					variant='ghost'
					size='sm'
					onClick={() => {
						/* Convex auto-refreshes, but this is for UX */
					}}
					className='text-muted-foreground'
				>
					<IconRefresh size={16} className='mr-1' />
					Refresh
				</Button>
			</div>
		</div>
	);
}
