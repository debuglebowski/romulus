import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery } from 'convex/react';
import { useState } from 'react';

import { Button } from '@/ui/_shadcn/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/_shadcn/card';
import { Input } from '@/ui/_shadcn/input';
import { Label } from '@/ui/_shadcn/label';

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
		<div className='flex min-h-[calc(100vh-64px)] items-center justify-center p-4'>
			<Card className='w-full max-w-md'>
				<CardHeader>
					<CardTitle>Welcome to Romulus</CardTitle>
					<CardDescription>Choose a username to get started</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleSubmit} className='space-y-4'>
						<div className='space-y-2'>
							<Label htmlFor='username'>Username</Label>
							<Input
								id='username'
								type='text'
								placeholder='Enter username'
								value={username}
								onChange={(e) => setUsernameValue(e.target.value)}
								maxLength={20}
								disabled={isSubmitting}
								autoFocus
							/>
							{error && <p className='text-destructive text-sm'>{error}</p>}
						</div>
						<Button type='submit' className='w-full' disabled={isSubmitting || !username.trim()}>
							{isSubmitting ? 'Setting up...' : 'Continue'}
						</Button>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
