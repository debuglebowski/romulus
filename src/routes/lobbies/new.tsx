import { IconArrowLeft } from '@tabler/icons-react';
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation } from 'convex/react';
import { useState } from 'react';

import { Button } from '@/ui/_shadcn/button';
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
		<div className='mx-auto max-w-md p-4'>
			<div className='mb-6 flex items-center justify-between'>
				<Link to='/lobbies' className='flex items-center gap-1 text-muted-foreground hover:text-foreground'>
					<IconArrowLeft size={18} />
					Back
				</Link>
				<h1 className='text-xl uppercase tracking-wider'>Create Game</h1>
				<div className='w-16' />
			</div>

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
						<SelectTrigger className='w-20'>
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

				<div className='space-y-2'>
					<Label>Map</Label>
					<Select value='mediterranean' disabled>
						<SelectTrigger className='w-full'>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value='mediterranean'>Mediterranean</SelectItem>
						</SelectContent>
					</Select>
				</div>

				{error && <p className='text-destructive text-sm'>{error}</p>}

				<div className='flex justify-center'>
					<Button type='submit' className='w-32' disabled={isSubmitting || !name.trim()}>
						{isSubmitting ? '...' : 'CREATE'}
					</Button>
				</div>
			</form>
		</div>
	);
}
