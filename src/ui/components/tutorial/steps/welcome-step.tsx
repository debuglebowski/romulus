import { IconFlag, IconRoute, IconShield, IconSpy } from '@tabler/icons-react';

import { TutorialHighlight, TutorialList, TutorialSection, TutorialStep } from '../tutorial-step';

/**
 * Welcome step component that introduces new players to the tutorial.
 * Provides a brief overview of what will be covered and encourages continuation.
 */
export function WelcomeStep() {
	return (
		<TutorialStep
			illustration={
				<div className='flex items-center gap-4'>
					<IconRoute className='h-8 w-8 text-muted-foreground' />
					<IconShield className='h-8 w-8 text-muted-foreground' />
					<IconSpy className='h-8 w-8 text-muted-foreground' />
					<IconFlag className='h-8 w-8 text-muted-foreground' />
				</div>
			}
		>
			<TutorialSection title='Welcome, Commander'>
				<p>
					You are about to embark on a journey of conquest and strategy. This quick tutorial will teach you everything you need to dominate
					the battlefield.
				</p>
			</TutorialSection>

			<TutorialSection title="What You'll Learn">
				<TutorialList
					items={[
						'Moving your armies across the map',
						'Engaging in combat and capturing territory',
						'Deploying spies for intelligence and sabotage',
						'Managing your economy and resources',
					]}
				/>
			</TutorialSection>

			<TutorialHighlight>This will only take a few minutes. Let's begin!</TutorialHighlight>
		</TutorialStep>
	);
}
