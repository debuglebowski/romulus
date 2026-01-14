import { IconCoins, IconHammer, IconMoodEmpty, IconShield, IconSpy, IconUsers } from '@tabler/icons-react';

import { TutorialHighlight, TutorialList, TutorialSection, TutorialStep } from '../tutorial-step';

/**
 * Economy step component that explains resource management.
 * Covers population allocation, labour, military, spies, and idle ratios.
 */
export function EconomyStep() {
	return (
		<TutorialStep
			illustration={
				<div className='flex items-center gap-3'>
					<IconHammer className='h-8 w-8 text-muted-foreground' />
					<IconCoins className='h-10 w-10 text-[var(--accent)]' />
					<IconUsers className='h-8 w-8 text-muted-foreground' />
				</div>
			}
		>
			<TutorialSection title='Managing Your Economy'>
				<p>
					Your population is your most valuable resource. By adjusting allocation ratios, you decide how your people contribute to your
					empire's growth and defense.
				</p>
			</TutorialSection>

			<TutorialSection title='Population Allocation'>
				<TutorialList
					items={[
						'Labour - Workers produce resources for your empire',
						'Military - Soldiers join your armies for combat',
						'Spies - Agents gather intel and conduct espionage',
						'Idle - Unassigned population awaiting orders',
					]}
				/>
			</TutorialSection>

			<TutorialSection title='Strategic Balance'>
				<p>
					Finding the right balance is key. Too much military leaves your economy weak. Too much labour leaves you defenseless. Adapt your
					ratios based on the current situation.
				</p>
			</TutorialSection>

			<TutorialHighlight>
				<div className='flex items-center justify-center gap-4'>
					<IconHammer className='h-5 w-5' />
					<IconShield className='h-5 w-5' />
					<IconSpy className='h-5 w-5' />
					<IconMoodEmpty className='h-5 w-5' />
				</div>
				<span className='mt-1 block'>Balance your ratios to match your strategy!</span>
			</TutorialHighlight>
		</TutorialStep>
	);
}
