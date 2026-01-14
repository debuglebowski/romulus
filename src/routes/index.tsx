import { Link, createFileRoute } from '@tanstack/react-router';

import { Button } from '@/ui/_shadcn/button';

export const Route = createFileRoute('/')({
	component: TitlePage,
});

function TitlePage() {
	return (
		<div className='flex min-h-screen flex-col items-center justify-center gap-8'>
			<div className='text-center'>
				<h1 className='text-4xl font-bold tracking-tight sm:text-5xl'>
					Romulus
				</h1>
				<p className='mt-2 text-muted-foreground'>
					Strategic territory conquest
				</p>
			</div>

			<div className='flex flex-wrap justify-center gap-3'>
				<Link to='/lobbies'>
					<Button className='w-32'>Play</Button>
				</Link>
				<Link to='/how-to-play'>
					<Button variant='outline' className='w-32'>
						How to Play
					</Button>
				</Link>
				<Link to='/' search={{ settings: 'open' }}>
					<Button variant='outline' className='w-32'>
						Settings
					</Button>
				</Link>
			</div>
		</div>
	);
}
