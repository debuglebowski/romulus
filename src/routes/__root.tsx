import { useAuthActions } from '@convex-dev/auth/react';
import { IconHome, IconLogout, IconSettings } from '@tabler/icons-react';
import { createRootRoute, Link, Outlet, useLocation, useNavigate } from '@tanstack/react-router';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { useCallback, useEffect, useState } from 'react';

import { Avatar, AvatarFallback } from '@/ui/_shadcn/avatar';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/ui/_shadcn/dropdown-menu';
import { AuthForm } from '@/ui/components/auth-form';
import { SettingsModal } from '@/ui/components/settings-modal';
import { TutorialOverlay } from '@/ui/components/tutorial/tutorial-overlay';

import { api } from '../../convex/_generated/api';
import { z } from 'zod';

const rootSearchSchema = z.object({
	settings: z.enum(['open']).optional(),
});

export const Route = createRootRoute({
	component: RootLayout,
	validateSearch: rootSearchSchema,
});

function RootLayout() {
	const { isAuthenticated, isLoading } = useConvexAuth();
	const { signOut } = useAuthActions();
	const user = useQuery(api.users.currentUser);
	const getOrCreate = useMutation(api.users.getOrCreate);
	const navigate = useNavigate();
	const location = useLocation();
	const isTitle = location.pathname === '/';

	// Settings modal controlled by ?settings search param
	const searchParams = new URLSearchParams(location.search);
	const settingsOpen = searchParams.get('settings') === 'open';

	const setSettingsOpen = useCallback(
		(open: boolean) => {
			if (open) {
				navigate({ 
					search: (prev) => ({ ...prev, settings: 'open' as const })
				} as Parameters<typeof navigate>[0]);
			} else {
				navigate({ 
					search: (prev) => {
						const { settings: _, ...rest } = prev;
						return rest;
					}
				} as Parameters<typeof navigate>[0]);
			}
		},
		[navigate],
	);

	// Tutorial overlay state
	const [tutorialOpen, setTutorialOpen] = useState(false);

	// Check if we're in an active game (not lobby or results)
	const isInGame = /^\/game\/[^/]+\/?$/.test(location.pathname);

	// Initialize user on first visit
	useEffect(() => {
		if (isAuthenticated && user && user.settingSoundVolume === undefined) {
			getOrCreate();
		}
	}, [isAuthenticated, user, getOrCreate]);

	// Redirect to setup if no username
	useEffect(() => {
		if (
			isAuthenticated &&
			user &&
			user.settingSoundVolume !== undefined &&
			!user.username &&
			window.location.pathname !== '/setup'
		) {
			navigate({ to: '/setup' });
		}
	}, [isAuthenticated, user, navigate]);

	// Show tutorial for first-time users after setup is complete
	useEffect(() => {
		if (
			isAuthenticated &&
			user &&
			user.username &&
			user.tutorialCompleted !== true &&
			user.tutorialSkipped !== true
		) {
			setTutorialOpen(true);
		}
	}, [isAuthenticated, user]);

	if (isLoading) {
		return (
			<div className='flex min-h-screen items-center justify-center'>
				<div className='text-muted-foreground'>Loading...</div>
			</div>
		);
	}

	if (!isAuthenticated) {
		return <AuthForm />;
	}

	const displayName = user?.username ?? user?.email ?? '';
	const initials = displayName.slice(0, 2).toUpperCase();

	return (
		<div className='min-h-screen'>
			{/* HUD corner (hidden when in active game - game has its own hamburger menu) */}
			{!isTitle && !isInGame && (
				<div className='fixed right-4 top-4 z-50 flex items-center gap-3'>
					{/* Home button */}
					<Link
						to='/lobbies'
						className='flex h-8 w-8 items-center justify-center border-2 border-primary bg-background text-primary hover:bg-primary hover:text-primary-foreground'
					>
						<IconHome size={16} />
					</Link>

					{/* User coin */}
					<DropdownMenu>
						<DropdownMenuTrigger className='cursor-pointer outline-none'>
							<Avatar className='h-8 w-8 border-2 border-primary hover:border-[color:var(--accent-hover)]'>
								<AvatarFallback className='bg-background text-primary font-semibold uppercase tracking-wider'>
									{initials}
								</AvatarFallback>
							</Avatar>
						</DropdownMenuTrigger>
						<DropdownMenuContent align='end' className='w-56'>
							<DropdownMenuGroup>
								<DropdownMenuLabel className='font-normal'>
									<span className='block truncate text-sm font-medium'>{displayName}</span>
								</DropdownMenuLabel>
							</DropdownMenuGroup>
							<DropdownMenuSeparator />
							<DropdownMenuGroup>
							<DropdownMenuItem onClick={() => setSettingsOpen(true)}>
								<IconSettings />
								Settings
							</DropdownMenuItem>
								<DropdownMenuItem onClick={() => signOut()}>
									<IconLogout />
									Sign out
								</DropdownMenuItem>
							</DropdownMenuGroup>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			)}

			<main>
				<Outlet />
			</main>

			<SettingsModal
				open={settingsOpen}
				onOpenChange={setSettingsOpen}
				onReplayTutorial={() => {
					setSettingsOpen(false);
					setTutorialOpen(true);
				}}
			/>

			{/* Tutorial overlay for first-time users */}
			<TutorialOverlay
				open={tutorialOpen}
				onOpenChange={setTutorialOpen}
				initialStep={user?.tutorialStep ?? 0}
			/>
		</div>
	);
}
