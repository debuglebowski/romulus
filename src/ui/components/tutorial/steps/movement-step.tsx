import { IconArrowRight, IconClick, IconFlag, IconRoute } from '@tabler/icons-react';

import { TutorialHighlight, TutorialList, TutorialSection, TutorialStep } from '../tutorial-step';

/**
 * Movement step component that explains army movement mechanics.
 * Covers selecting armies, setting destinations, and using rally points.
 */
export function MovementStep() {
	return (
		<TutorialStep
			illustration={
				<div className='flex items-center gap-3'>
					<IconRoute className='h-8 w-8 text-muted-foreground' />
					<IconArrowRight className='h-6 w-6 text-muted-foreground' />
					<IconFlag className='h-8 w-8 text-muted-foreground' />
				</div>
			}
		>
			<TutorialSection title='Moving Your Armies'>
				<p>
					Armies are your main fighting force. To move an army, select it on the map and click the move button in the context panel.
				</p>
			</TutorialSection>

			<TutorialSection title='How to Move'>
				<TutorialList
					items={[
						'Click on an army to select it',
						'Click the move icon to enter move mode',
						'Select how many units to send',
						'Click a destination tile to confirm',
					]}
				/>
			</TutorialSection>

			<TutorialSection title='Rally Points'>
				<p>
					Set rally points on your territories to automatically direct newly spawned units. This keeps your forces organized without constant micromanagement.
				</p>
			</TutorialSection>

			<TutorialHighlight>
				<div className='flex items-center justify-center gap-2'>
					<IconClick className='h-5 w-5' />
					<span>Tip: Movement takes time based on distance!</span>
				</div>
			</TutorialHighlight>
		</TutorialStep>
	);
}
