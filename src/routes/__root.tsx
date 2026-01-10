import { useAuthActions } from '@convex-dev/auth/react';
import { IconLogout } from '@tabler/icons-react';
import { createRootRoute, Outlet } from '@tanstack/react-router';
import { useConvexAuth, useQuery } from 'convex/react';

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

	const email = user?.email ?? '';
	const initials = email.slice(0, 2).toUpperCase();

	return (
		<div className='min-h-screen'>
			<header className='border-b bg-card'>
				<div className='mx-auto flex max-w-7xl items-center justify-between px-4 py-3'>
					<h1 className='font-semibold text-lg'>Somehow</h1>
					<DropdownMenu>
						<DropdownMenuTrigger className='cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring'>
							<Avatar>
								<AvatarFallback>{initials}</AvatarFallback>
							</Avatar>
						</DropdownMenuTrigger>
						<DropdownMenuContent align='end' className='w-56'>
							<DropdownMenuGroup>
								<DropdownMenuLabel className='font-normal'>
									<span className='block truncate text-sm font-medium'>{email}</span>
								</DropdownMenuLabel>
							</DropdownMenuGroup>
							<DropdownMenuSeparator />
							<DropdownMenuGroup>
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
