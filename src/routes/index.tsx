import { Link, createFileRoute } from '@tanstack/react-router';

import { Button } from '@/ui/_shadcn/button';

export const Route = createFileRoute('/')({
	component: TitlePage,
});

const ASCII_LOGO = `██████╗  ██████╗ ███╗   ███╗██╗   ██╗██╗     ██╗   ██╗███████╗
██╔══██╗██╔═══██╗████╗ ████║██║   ██║██║     ██║   ██║██╔════╝
██████╔╝██║   ██║██╔████╔██║██║   ██║██║     ██║   ██║███████╗
██╔══██╗██║   ██║██║╚██╔╝██║██║   ██║██║     ██║   ██║╚════██║
██║  ██║╚██████╔╝██║ ╚═╝ ██║╚██████╔╝███████╗╚██████╔╝███████║
╚═╝  ╚═╝ ╚═════╝ ╚═╝     ╚═╝ ╚═════╝ ╚══════╝ ╚═════╝ ╚══════╝`;

function TitlePage() {
	return (
		<div className='flex min-h-screen flex-col items-center justify-center gap-8'>
			<div className='text-center'>
				<pre className='font-mono text-primary text-[0.4rem] sm:text-xs md:text-sm leading-tight'>
					{ASCII_LOGO}
				</pre>
			</div>

			<p className='text-muted-foreground italic'>"All roads lead here"</p>

			<div className='flex flex-wrap justify-center gap-4'>
				<Link to='/lobbies'>
					<Button className='w-40'>PLAY</Button>
				</Link>
				<Link to='/how-to-play'>
					<Button variant='outline' className='w-40'>
						HOW TO PLAY
					</Button>
				</Link>
				<Link to='/' search={{ settings: 'open' }}>
					<Button variant='outline' className='w-40'>
						SETTINGS
					</Button>
				</Link>
			</div>
		</div>
	);
}
