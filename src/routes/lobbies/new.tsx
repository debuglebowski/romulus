import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation } from 'convex/react';
import { useState } from 'react';

import { Button } from '@/ui/_shadcn/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/_shadcn/card';
import { Input } from '@/ui/_shadcn/input';
import { Label } from '@/ui/_shadcn/label';

import { api } from '../../../convex/_generated/api';

export const Route = createFileRoute('/lobbies/new')({
	component: NewGamePage,
});

const PLAYER_COUNTS = [2, 3, 4, 5, 6, 7, 8] as const;

function NewGamePage() {
	const navigate = useNavigate();
	const create = useMutation(api.games.create);
	const [name, setName] = useState('');
	const [maxPlayers, setMaxPlayers] = useState(4);
	const [error, setError] = useState('');
	const [isSubmitting, setIsSubmitting] = useState(false);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError('');
		setIsSubmitting(true);

		try {
			const gameId = await create({ name, maxPlayers });
			navigate({ to: '/game/$gameId/lobby', params: { gameId } });
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to create game');
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div className='mx-auto max-w-md p-4'>
			<Card>
				<CardHeader>
					<CardTitle>Create Game</CardTitle>
					<CardDescription>Set up a new game lobby</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleSubmit} className='space-y-4'>
						<div className='space-y-2'>
							<Label htmlFor='name'>Game Name</Label>
							<Input
								id='name'
								type='text'
								placeholder='Enter game name'
								value={name}
								onChange={(e) => setName(e.target.value)}
								maxLength={50}
								disabled={isSubmitting}
								autoFocus
							/>
						</div>

						<div className='space-y-2'>
							<Label>Max Players</Label>
							<div className='flex flex-wrap gap-2'>
								{PLAYER_COUNTS.map((count) => (
									<Button
										key={count}
										type='button'
										variant={maxPlayers === count ? 'default' : 'outline'}
										size='sm'
										onClick={() => setMaxPlayers(count)}
										disabled={isSubmitting}
									>
										{count}
									</Button>
								))}
							</div>
						</div>

						{error && <p className='text-destructive text-sm'>{error}</p>}

						<div className='flex gap-2'>
							<Button
								type='button'
								variant='outline'
								className='flex-1'
								onClick={() => navigate({ to: '/lobbies' })}
								disabled={isSubmitting}
							>
								Cancel
							</Button>
							<Button type='submit' className='flex-1' disabled={isSubmitting || !name.trim()}>
								{isSubmitting ? 'Creating...' : 'Create Game'}
							</Button>
						</div>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
