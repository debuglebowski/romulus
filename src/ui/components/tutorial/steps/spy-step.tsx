import { IconAlertTriangle, IconEye, IconEyeOff, IconSpy } from '@tabler/icons-react';

import { TutorialHighlight, TutorialList, TutorialSection, TutorialStep } from '../tutorial-step';

/**
 * Spy step component that explains espionage mechanics.
 * Covers spy deployment, movement, intel gathering, and revealed status.
 */
export function SpyStep() {
	return (
		<TutorialStep
			illustration={
				<div className='flex items-center gap-3'>
					<IconEyeOff className='h-8 w-8 text-muted-foreground' />
					<IconSpy className='h-10 w-10 text-purple-400' />
					<IconEye className='h-8 w-8 text-muted-foreground' />
				</div>
			}
		>
			<TutorialSection title='Espionage Operations'>
				<p>
					Spies are your eyes behind enemy lines. They infiltrate enemy territories to gather intelligence about their military strength and
					movements.
				</p>
			</TutorialSection>

			<TutorialSection title='How Spies Work'>
				<TutorialList
					items={[
						'Spies are deployed from your spy allocation ratio',
						'Select a spy and click Move to send them to a tile',
						'Spies on enemy tiles gather intel automatically',
						'Intel reveals army counts and unit numbers',
					]}
				/>
			</TutorialSection>

			<TutorialSection title='Revealed Status'>
				<p>
					Spies can be detected and revealed by the enemy. Revealed spies are visible to their target and may be neutralized. Keep your
					spies moving to avoid detection.
				</p>
			</TutorialSection>

			<TutorialHighlight>
				<div className='flex items-center justify-center gap-2'>
					<IconAlertTriangle className='h-5 w-5' />
					<span>Knowledge is power - use spies before attacking!</span>
				</div>
			</TutorialHighlight>
		</TutorialStep>
	);
}
