import { useAuthActions } from '@convex-dev/auth/react';
import { IconLogout, IconSettings } from '@tabler/icons-react';
import { createRootRoute, Link, Outlet, useNavigate } from '@tanstack/react-router';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { useEffect } from 'react';

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

import { api } from '../../convex/_generated/api';

export const Route = createRootRoute({
	component: RootLayout,
});

function RootLayout() {
	const { isAuthenticated, isLoading } = useConvexAuth();
	const { signOut } = useAuthActions();
	const user = useQuery(api.users.currentUser);
	const getOrCreate = useMutation(api.users.getOrCreate);
	const navigate = useNavigate();

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

	if (isLoading) {
		return (
			<div className='flex min-h-screen items-center justify-center'>
				<div className='animate-pulse text-muted-foreground'>Loading...</div>
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
			<header className='border-b bg-card'>
				<div className='mx-auto flex max-w-7xl items-center justify-between px-4 py-3'>
					<Link to='/lobbies' className='font-semibold text-lg hover:opacity-80'>
						Romulus
					</Link>
					<DropdownMenu>
						<DropdownMenuTrigger className='cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring'>
							<Avatar>
								<AvatarFallback>{initials}</AvatarFallback>
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
								<DropdownMenuItem onClick={() => navigate({ to: '/settings' })}>
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
			</header>
			<main>
				<Outlet />
			</main>
		</div>
	);
}
