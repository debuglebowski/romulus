import { IconShield, IconSword, IconSwords, IconTarget } from '@tabler/icons-react';

import { TutorialHighlight, TutorialList, TutorialSection, TutorialStep } from '../tutorial-step';

/**
 * Combat step component that explains battle mechanics.
 * Covers attacking, defending, dice rolls, and battle resolution.
 */
export function CombatStep() {
	return (
		<TutorialStep
			illustration={
				<div className='flex items-center gap-3'>
					<IconSword className='h-8 w-8 text-muted-foreground' />
					<IconSwords className='h-10 w-10 text-primary' />
					<IconShield className='h-8 w-8 text-muted-foreground' />
				</div>
			}
		>
			<TutorialSection title='Engaging in Combat'>
				<p>
					When your army enters an enemy territory, combat begins automatically. Battles are resolved through dice rolls, with larger armies having better odds of victory.
				</p>
			</TutorialSection>

			<TutorialSection title='How Combat Works'>
				<TutorialList
					items={[
						'Move your army into an enemy territory to attack',
						'Both sides roll dice based on troop count',
						'Higher rolls win - ties go to the defender',
						'Combat continues until one side is eliminated',
					]}
				/>
			</TutorialSection>

			<TutorialSection title='Strategic Tips'>
				<TutorialList
					items={[
						'Attack with superior numbers when possible',
						'Defenders have a slight advantage in ties',
						'Weaken enemies before attacking their capital',
					]}
				/>
			</TutorialSection>

			<TutorialHighlight>
				<div className='flex items-center justify-center gap-2'>
					<IconTarget className='h-5 w-5' />
					<span>More troops = more dice = better odds!</span>
				</div>
			</TutorialHighlight>
		</TutorialStep>
	);
}
