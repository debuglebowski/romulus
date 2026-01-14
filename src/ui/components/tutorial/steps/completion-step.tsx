import { IconConfetti, IconCrown, IconStar, IconTrophy } from '@tabler/icons-react';

import { TutorialHighlight, TutorialList, TutorialSection, TutorialStep } from '../tutorial-step';

/**
 * Completion step component that congratulates players on finishing the tutorial.
 * Summarizes what was learned and provides a call to action to start playing.
 */
export function CompletionStep() {
	return (
		<TutorialStep
			illustration={
				<div className='flex items-center gap-4'>
					<IconStar className='h-8 w-8 text-[var(--accent)]' />
					<IconTrophy className='h-10 w-10 text-[var(--accent)]' />
					<IconStar className='h-8 w-8 text-[var(--accent)]' />
				</div>
			}
		>
			<TutorialSection title='Congratulations, Commander!'>
				<p>
					You have completed the tutorial and learned the fundamentals of warfare. You are now ready to lead your empire to glory on the
					battlefield.
				</p>
			</TutorialSection>

			<TutorialSection title='Skills Mastered'>
				<TutorialList
					items={[
						'Moving armies strategically across territories',
						'Engaging enemies in combat and capturing land',
						'Deploying spies for intelligence and sabotage',
						'Balancing your economy for sustained growth',
					]}
				/>
			</TutorialSection>

			<TutorialSection title='Your Journey Begins'>
				<p>
					The path to domination awaits. Apply what you have learned, adapt to your enemies, and claim victory. Remember: every great
					commander started with a single territory.
				</p>
			</TutorialSection>

			<TutorialHighlight>
				<div className='flex items-center justify-center gap-2'>
					<IconCrown className='h-5 w-5' />
					<span>Now go forth and conquer!</span>
					<IconConfetti className='h-5 w-5' />
				</div>
			</TutorialHighlight>
		</TutorialStep>
	);
}
