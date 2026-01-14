import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation } from 'convex/react';
import { useState } from 'react';

import { Button } from '@/ui/_shadcn/button';
import { Card, CardContent } from '@/ui/_shadcn/card';
import { Input } from '@/ui/_shadcn/input';
import { Label } from '@/ui/_shadcn/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/_shadcn/select';

import { api } from '../../../convex/_generated/api';

export const Route = createFileRoute('/lobbies/new')({
	component: NewGamePage,
});

function NewGamePage() {
	const navigate = useNavigate();
	const create = useMutation(api.games.create);
	const [name, setName] = useState('');
	const [maxPlayers, setMaxPlayers] = useState(6);
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
		<div className='flex min-h-screen items-center justify-center p-4'>
			<Card className='w-full max-w-md rounded-lg'>
				<div className='px-4 pt-4 text-center'>
					<h1 className='mb-2 text-2xl uppercase tracking-wider'>Create Game</h1>
					<div className='mx-auto h-px w-24 bg-primary' />
				</div>

				<CardContent>
					<form onSubmit={handleSubmit} className='space-y-6'>
						<div className='space-y-2'>
							<Label htmlFor='name'>Game Name</Label>
							<Input
								id='name'
								type='text'
								placeholder='My Epic Battle'
								value={name}
								onChange={(e) => setName(e.target.value)}
								maxLength={50}
								disabled={isSubmitting}
								autoFocus
							/>
						</div>

						<div className='space-y-2'>
							<Label>Max Players</Label>
							<Select value={maxPlayers} onValueChange={(val) => setMaxPlayers(val as number)}>
								<SelectTrigger className='w-full'>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{[2, 3, 4, 5, 6].map((n) => (
										<SelectItem key={n} value={n}>
											{n}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<p className='text-muted-foreground text-sm'>2-6 players</p>
						</div>

						{error && <p className='text-destructive text-sm'>{error}</p>}

						<Button type='submit' className='w-full' disabled={isSubmitting || !name.trim()}>
							{isSubmitting ? '...' : 'Create'}
						</Button>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
