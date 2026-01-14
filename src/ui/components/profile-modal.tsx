import { IconBook, IconLogout, IconUser } from '@tabler/icons-react';
import { useQuery } from 'convex/react';

import { Button } from '@/ui/_shadcn/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/ui/_shadcn/dialog';
import { Label } from '@/ui/_shadcn/label';

import { api } from '../../../convex/_generated/api';

type ProfileModalProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onReplayTutorial: () => void;
	onSignOut: () => void;
};

export function ProfileModal({ open, onOpenChange, onReplayTutorial, onSignOut }: ProfileModalProps) {
	const user = useQuery(api.users.currentUser);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className='sm:max-w-md'>
				<DialogHeader>
					<DialogTitle className='text-center'>Profile</DialogTitle>
				</DialogHeader>

				{!user ? (
					<div className='flex items-center justify-center py-8'>
						<div className='animate-pulse text-muted-foreground'>Loading...</div>
					</div>
				) : (
					<div className='space-y-6'>
						<div className='space-y-4'>
							<div>
								<h2 className='text-sm font-medium'>Username</h2>
								<div className='mt-1 border-b' />
							</div>

							<div className='flex items-center justify-between gap-4'>
								<Label className='flex items-center gap-2'>
									<IconUser size={16} />
									In-game name
								</Label>
								<div className='font-mono text-sm text-muted-foreground'>{user.username ?? '—'}</div>
							</div>
						</div>

						<div className='space-y-4'>
							<div>
								<h2 className='text-sm font-medium'>Tutorial</h2>
								<div className='mt-1 border-b' />
							</div>

							<div className='flex items-center justify-between gap-4'>
								<Label>Review the game mechanics</Label>
								<Button variant='outline' size='sm' onClick={onReplayTutorial}>
									<IconBook size={16} />
									Replay Tutorial
								</Button>
							</div>
						</div>

						<div className='space-y-4'>
							<div>
								<h2 className='text-sm font-medium'>Account</h2>
								<div className='mt-1 border-b' />
							</div>

							<div className='flex justify-center'>
								<Button variant='destructive' onClick={onSignOut} className='w-40'>
									<IconLogout size={16} />
									Sign out
								</Button>
							</div>
						</div>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}

