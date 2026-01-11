import { IconArrowLeft, IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { Link, createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';

import { Button } from '@/ui/_shadcn/button';
import { Card, CardContent } from '@/ui/_shadcn/card';

export const Route = createFileRoute('/how-to-play')({
	component: HowToPlayPage,
});

const PAGES = [
	{
		sections: [
			{
				title: 'OBJECTIVE',
				content: ['Conquer all territories on the map to win.'],
			},
			{
				title: 'TURNS',
				content: [
					'Each turn you can:',
					'• Deploy reinforcements to your territories',
					'• Attack adjacent enemy territories',
					'• Fortify by moving troops between territories',
				],
			},
			{
				title: 'COMBAT',
				content: [
					'Battles are resolved with dice rolls.',
					'More troops = more dice = better odds.',
				],
			},
		],
	},
	{
		sections: [
			{
				title: 'TERRITORIES',
				content: [
					'Control territories to gain reinforcements each turn.',
					'The more territories you hold, the stronger you become.',
				],
			},
			{
				title: 'CAPITALS',
				content: [
					'Each player starts with a capital city.',
					'Lose your capital and you are eliminated.',
					'Capture enemy capitals to remove them from the game.',
				],
			},
		],
	},
	{
		sections: [
			{
				title: 'STRATEGY',
				content: [
					'Expand carefully - overextension leaves you vulnerable.',
					'Defend your capital at all costs.',
					'Watch your enemies and strike when they are weak.',
				],
			},
			{
				title: 'VICTORY',
				content: [
					'The last player standing wins.',
					'Eliminate all opponents to claim total domination.',
				],
			},
		],
	},
];

function HowToPlayPage() {
	const [page, setPage] = useState(0);

	return (
		<div className='mx-auto max-w-2xl p-4'>
			<div className='mb-6 flex items-center justify-between'>
				<Link to='/' className='flex items-center gap-1 text-muted-foreground hover:text-foreground'>
					<IconArrowLeft size={18} />
					Back
				</Link>
				<h1 className='text-xl uppercase tracking-wider'>How to Play</h1>
				<div className='w-16' />
			</div>

			<Card>
				<CardContent className='space-y-6 p-6'>
					{PAGES[page].sections.map((section) => (
						<div key={section.title}>
							<h2 className='mb-2 font-semibold uppercase tracking-wide'>{section.title}</h2>
							<div className='mb-4 border-b border-muted' />
							<div className='space-y-1 text-muted-foreground'>
								{section.content.map((line, i) => (
									<p key={i}>{line}</p>
								))}
							</div>
						</div>
					))}
				</CardContent>
			</Card>

			<div className='mt-6 flex items-center justify-center gap-4'>
				<Button
					variant='ghost'
					size='icon'
					onClick={() => setPage((p) => p - 1)}
					disabled={page === 0}
				>
					<IconChevronLeft />
				</Button>
				<span className='text-muted-foreground'>
					{page + 1} / {PAGES.length}
				</span>
				<Button
					variant='ghost'
					size='icon'
					onClick={() => setPage((p) => p + 1)}
					disabled={page === PAGES.length - 1}
				>
					<IconChevronRight />
				</Button>
			</div>
		</div>
	);
}
