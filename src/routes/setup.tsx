import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery } from 'convex/react';
import { useState } from 'react';

import { Button } from '@/ui/_shadcn/button';
import { Input } from '@/ui/_shadcn/input';

import { api } from '../../convex/_generated/api';

export const Route = createFileRoute('/setup')({
	component: SetupPage,
});

function SetupPage() {
	const navigate = useNavigate();
	const user = useQuery(api.users.currentUser);
	const setUsername = useMutation(api.users.setUsername);
	const [username, setUsernameValue] = useState('');
	const [error, setError] = useState('');
	const [isSubmitting, setIsSubmitting] = useState(false);

	// Redirect if already has username
	if (user?.username) {
		navigate({ to: '/lobbies' });
		return null;
	}

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError('');
		setIsSubmitting(true);

		try {
			await setUsername({ username });
			navigate({ to: '/lobbies' });
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to set username');
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div className='flex min-h-screen flex-col items-center justify-center gap-6 p-4'>
			<h1 className='text-2xl uppercase tracking-wider'>Choose Your Name</h1>

			<form onSubmit={handleSubmit} className='flex flex-col items-center gap-6'>
				<Input
					type='text'
					placeholder='MaximusPrime_'
					value={username}
					onChange={(e) => setUsernameValue(e.target.value)}
					maxLength={16}
					disabled={isSubmitting}
					autoFocus
					className='w-72 text-center'
				/>

				<div className='space-y-1 text-center text-sm text-muted-foreground'>
					<p>3-16 characters</p>
					<p>Letters, numbers, underscores</p>
				</div>

				{error && <p className='text-destructive text-sm'>{error}</p>}

				<Button type='submit' className='w-32' disabled={isSubmitting || !username.trim()}>
					{isSubmitting ? '...' : 'CONTINUE'}
				</Button>
			</form>
		</div>
	);
}
