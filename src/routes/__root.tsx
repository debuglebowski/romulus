import { useAuthActions } from '@convex-dev/auth/react';
import { IconLogout, IconMenu2, IconSettings, IconUser } from '@tabler/icons-react';
import { createRootRoute, Link, Outlet, useLocation, useNavigate } from '@tanstack/react-router';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { useCallback, useEffect, useState } from 'react';
import { z } from 'zod';

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/ui/_shadcn/dropdown-menu';
import { AuthForm } from '@/ui/components/auth-form';
import { ProfileModal } from '@/ui/components/profile-modal';
import { SettingsModal } from '@/ui/components/settings-modal';
import { TutorialOverlay } from '@/ui/components/tutorial/tutorial-overlay';

import { api } from '../../convex/_generated/api';

const rootSearchSchema = z.object({
	settings: z.enum(['open']).optional(),
	profile: z.enum(['open']).optional(),
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
	const profileOpen = searchParams.get('profile') === 'open';

	const setSettingsOpen = useCallback(
		(open: boolean) => {
			if (open) {
				navigate({
					search: (prev) => ({ ...prev, settings: 'open' as const }),
				} as Parameters<typeof navigate>[0]);
			} else {
				navigate({
					search: (prev) => {
						const { settings: _, ...rest } = prev;
						return rest;
					},
				} as Parameters<typeof navigate>[0]);
			}
		},
		[navigate],
	);

	const setProfileOpen = useCallback(
		(open: boolean) => {
			if (open) {
				navigate({
					search: (prev) => ({ ...prev, profile: 'open' as const }),
				} as Parameters<typeof navigate>[0]);
			} else {
				navigate({
					search: (prev) => {
						const { profile: _, ...rest } = prev;
						return rest;
					},
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
		if (isAuthenticated && user && user.settingSoundVolume !== undefined && !user.username && window.location.pathname !== '/setup') {
			navigate({ to: '/setup' });
		}
	}, [isAuthenticated, user, navigate]);

	// Show tutorial for first-time users after setup is complete
	useEffect(() => {
		if (isAuthenticated && user && user.username && user.tutorialCompleted !== true && user.tutorialSkipped !== true) {
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

	return (
		<div className='min-h-screen'>
			{/* Top menu bar (hidden on title screen and in active game) */}
			{!isTitle && !isInGame && (
				<header className='sticky top-0 z-50 border-b bg-background'>
					<div className='mx-auto flex max-w-7xl items-center justify-between px-4 py-3'>
						{/* Logo/Home link */}
						<Link to='/lobbies' className='text-xl font-semibold text-primary hover:text-primary/80'>
							Romulus
						</Link>

						{/* User menu */}
						<div className='flex items-center gap-3'>
							{/* User avatar dropdown */}
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<button
										type='button'
										className='flex h-8 w-8 items-center justify-center rounded-md border bg-background text-muted-foreground hover:bg-muted hover:text-foreground'
									>
										<IconMenu2 size={18} />
									</button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align='end' className='w-56'>
									<DropdownMenuGroup>
										<DropdownMenuItem onClick={() => setProfileOpen(true)}>
											<IconUser />
											Profile
										</DropdownMenuItem>
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
					</div>
				</header>
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

			<ProfileModal
				open={profileOpen}
				onOpenChange={setProfileOpen}
				onReplayTutorial={() => {
					setProfileOpen(false);
					setTutorialOpen(true);
				}}
				onSignOut={() => signOut()}
			/>

			{/* Tutorial overlay for first-time users */}
			<TutorialOverlay open={tutorialOpen} onOpenChange={setTutorialOpen} initialStep={user?.tutorialStep ?? 0} />
		</div>
	);
}
