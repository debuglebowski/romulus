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
				content: [
					'Capture all enemy capitals to win.',
					'You are eliminated if your capital is captured or you go bankrupt.',
				],
			},
			{
				title: 'ECONOMY',
				content: [
					'Your population generates gold through labour.',
					'Use the sliders to balance between Labour, Military, and Spies.',
					'Labourers produce gold (1 gold/sec per 5 labourers).',
					'Military and spies cost upkeep but expand your power.',
				],
			},
			{
				title: 'POPULATION',
				content: [
					'Population grows over time based on labourers and cities.',
					'Your capital provides +50 pop cap, each city adds +20.',
					'Going into debt (-50 gold) eliminates you!',
				],
			},
		],
	},
	{
		sections: [
			{
				title: 'MILITARY',
				content: [
					'Set a rally point and assign population to Military.',
					'Units spawn at your rally point over time.',
					'Select an army and click a tile to move.',
					'Armies capture undefended tiles instantly.',
				],
			},
			{
				title: 'COMBAT',
				content: [
					'When armies meet, combat happens automatically each tick.',
					'Damage is based on army strength vs enemy defense.',
					'Defenders get a +10% defense bonus.',
					'Retreat to an adjacent tile to escape - no penalty!',
				],
			},
		],
	},
	{
		sections: [
			{
				title: 'SPIES',
				content: [
					'Assign population to Spies to train agents.',
					'Spies move invisibly through any territory.',
					'Station spies on enemy tiles to scout army positions.',
				],
			},
			{
				title: 'ALLEGIANCE',
				content: [
					'Spies at enemy cities lower the owner\'s allegiance.',
					'When allegiance hits 0, the city flips to you!',
					'Target flip time is ~4 minutes uncontested.',
					'Beware: enemy spies and military can detect your agents.',
				],
			},
			{
				title: 'CAPITAL INTEL',
				content: [
					'Spies at enemy capitals gather intel over time.',
					'The longer they stay, the more you learn about that player.',
				],
			},
		],
	},
	{
		sections: [
			{
				title: 'CAPITAL MOVEMENT',
				content: [
					'Your capital can be moved to any owned city.',
					'Travel time is 30 sec/hex - you\'re frozen during the move.',
					'Use this to escape when your capital is threatened!',
				],
			},
			{
				title: 'UPGRADES',
				content: [
					'Spend gold on permanent upgrades for your empire.',
					'Upgrades boost military strength, defense, spy effectiveness, and more.',
					'Some upgrades require population thresholds to unlock.',
				],
			},
			{
				title: 'ALLIANCES',
				content: [
					'Form alliances with other players for mutual benefit.',
					'Share vision, gold, or intel with your allies.',
					'But beware: betrayal is always an option.',
					'The last player standing wins - alliances don\'t share victory.',
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
