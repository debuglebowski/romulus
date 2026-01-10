import { useAuthActions } from '@convex-dev/auth/react';
import { IconLoader2, IconLock, IconMail } from '@tabler/icons-react';
import { useState } from 'react';

import { Button } from '@/ui/_shadcn/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/_shadcn/card';
import { Checkbox } from '@/ui/_shadcn/checkbox';
import { Field, FieldError, FieldGroup, FieldLabel } from '@/ui/_shadcn/field';
import { Input } from '@/ui/_shadcn/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/ui/_shadcn/tabs';

export function AuthForm() {
	const { signIn } = useAuthActions();
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [activeTab, setActiveTab] = useState<'signIn' | 'signUp'>('signIn');

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setError(null);
		setIsLoading(true);

		const formData = new FormData(event.currentTarget);
		formData.set('flow', activeTab);

		try {
			await signIn('password', formData);
		} catch (err) {
			setError(
				activeTab === 'signIn'
					? 'Invalid email or password. Please try again.'
					: 'Could not create account. Email may already be in use.',
			);
		} finally {
			setIsLoading(false);
		}
	}

	return (
		<div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
			<Card className="w-full max-w-md">
				<CardHeader className="text-center">
					<CardTitle className="text-2xl">Welcome</CardTitle>
					<CardDescription>Sign in to your account or create a new one</CardDescription>
				</CardHeader>
				<CardContent>
					<Tabs
						value={activeTab}
						onValueChange={(value) => {
							setActiveTab(value as 'signIn' | 'signUp');
							setError(null);
						}}
					>
						<TabsList className="mb-4 w-full">
							<TabsTrigger value="signIn" className="flex-1">
								Sign In
							</TabsTrigger>
							<TabsTrigger value="signUp" className="flex-1">
								Sign Up
							</TabsTrigger>
						</TabsList>

						<TabsContent value="signIn">
							<form onSubmit={handleSubmit}>
								<FieldGroup>
									<Field>
										<FieldLabel htmlFor="signin-email">
											<IconMail className="size-4" />
											Email
										</FieldLabel>
										<Input
											id="signin-email"
											name="email"
											type="email"
											placeholder="you@example.com"
											required
											autoComplete="email"
											disabled={isLoading}
										/>
									</Field>
									<Field>
										<FieldLabel htmlFor="signin-password">
											<IconLock className="size-4" />
											Password
										</FieldLabel>
										<Input
											id="signin-password"
											name="password"
											type="password"
											placeholder="••••••••"
											required
											autoComplete="current-password"
											disabled={isLoading}
										/>
									</Field>
									{error && <FieldError>{error}</FieldError>}
									<Button type="submit" className="w-full" disabled={isLoading}>
										{isLoading ? (
											<>
												<IconLoader2 className="animate-spin" data-icon="inline-start" />
												Signing in...
											</>
										) : (
											'Sign In'
										)}
									</Button>
								</FieldGroup>
							</form>
						</TabsContent>

						<TabsContent value="signUp">
							<form onSubmit={handleSubmit}>
								<FieldGroup>
									<Field>
										<FieldLabel htmlFor="signup-email">
											<IconMail className="size-4" />
											Email
										</FieldLabel>
										<Input
											id="signup-email"
											name="email"
											type="email"
											placeholder="you@example.com"
											required
											autoComplete="email"
											disabled={isLoading}
										/>
									</Field>
									<Field>
										<FieldLabel htmlFor="signup-password">
											<IconLock className="size-4" />
											Password
										</FieldLabel>
										<Input
											id="signup-password"
											name="password"
											type="password"
											placeholder="••••••••"
											required
											autoComplete="new-password"
											minLength={8}
											disabled={isLoading}
										/>
									</Field>
									<Field orientation="horizontal">
										<Checkbox id="signup-terms" required disabled={isLoading} />
										<FieldLabel htmlFor="signup-terms" className="text-sm font-normal">
											I agree to the terms and conditions
										</FieldLabel>
									</Field>
									{error && <FieldError>{error}</FieldError>}
									<Button type="submit" className="w-full" disabled={isLoading}>
										{isLoading ? (
											<>
												<IconLoader2 className="animate-spin" data-icon="inline-start" />
												Creating account...
											</>
										) : (
											'Create Account'
										)}
									</Button>
								</FieldGroup>
							</form>
						</TabsContent>
					</Tabs>
				</CardContent>
			</Card>
		</div>
	);
}

