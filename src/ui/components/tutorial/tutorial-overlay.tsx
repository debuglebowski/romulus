import { IconChevronLeft, IconChevronRight, IconX } from '@tabler/icons-react';
import { useMutation } from 'convex/react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/ui/_shadcn/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/ui/_shadcn/dialog';
import { Progress } from '@/ui/_shadcn/progress';
import { cn } from '@/ui/_shadcn.lib/utils';

import { api } from '../../../../convex/_generated/api';
import { CombatStep } from './steps/combat-step';
import { CompletionStep } from './steps/completion-step';
import { EconomyStep } from './steps/economy-step';
import { MovementStep } from './steps/movement-step';
import { SpyStep } from './steps/spy-step';
import { WelcomeStep } from './steps/welcome-step';

// Tutorial step definitions
const TUTORIAL_STEPS = [
	{ id: 'welcome', title: 'Welcome' },
	{ id: 'movement', title: 'Movement' },
	{ id: 'combat', title: 'Combat' },
	{ id: 'spies', title: 'Spies' },
	{ id: 'economy', title: 'Economy' },
	{ id: 'completion', title: 'Complete' },
] as const;

// Map step IDs to their components
const STEP_COMPONENTS: Record<string, React.ComponentType> = {
	welcome: WelcomeStep,
	movement: MovementStep,
	combat: CombatStep,
	spies: SpyStep,
	economy: EconomyStep,
	completion: CompletionStep,
};

type TutorialOverlayProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onComplete?: () => void;
	onSkip?: () => void;
	initialStep?: number;
};

export function TutorialOverlay({ open, onOpenChange, onComplete, onSkip, initialStep = 0 }: TutorialOverlayProps) {
	const [currentStep, setCurrentStep] = useState(initialStep);
	const [isSkipConfirmOpen, setIsSkipConfirmOpen] = useState(false);
	const [isTransitioning, setIsTransitioning] = useState(false);
	const [_transitionDirection, setTransitionDirection] = useState<'next' | 'prev'>('next');
	const prevStepRef = useRef(initialStep);

	const updateTutorialStep = useMutation(api.users.updateTutorialStep);

	// Sync currentStep with saved tutorialStep when dialog opens
	// This ensures users resume from their persisted progress
	useEffect(() => {
		if (open) {
			// Clamp initialStep to valid range to handle edge cases
			const validStep = Math.max(0, Math.min(initialStep, TUTORIAL_STEPS.length - 1));
			setCurrentStep(validStep);
			prevStepRef.current = validStep;
		}
	}, [open, initialStep]);

	const completeTutorial = useMutation(api.users.completeTutorial);
	const skipTutorial = useMutation(api.users.skipTutorial);

	const totalSteps = TUTORIAL_STEPS.length;
	const isFirstStep = currentStep === 0;
	const isLastStep = currentStep === totalSteps - 1;
	const progressValue = ((currentStep + 1) / totalSteps) * 100;

	const handleNext = useCallback(async () => {
		if (isTransitioning) {
			return;
		}

		if (isLastStep) {
			await completeTutorial();
			onComplete?.();
			onOpenChange(false);
		} else {
			setTransitionDirection('next');
			setIsTransitioning(true);

			// Brief delay for exit animation
			setTimeout(() => {
				const nextStep = currentStep + 1;
				prevStepRef.current = currentStep;
				setCurrentStep(nextStep);
				updateTutorialStep({ step: nextStep });

				// Reset transition state after enter animation
				setTimeout(() => setIsTransitioning(false), 200);
			}, 150);
		}
	}, [currentStep, isLastStep, isTransitioning, completeTutorial, updateTutorialStep, onComplete, onOpenChange]);

	const handlePrev = useCallback(async () => {
		if (!isFirstStep && !isTransitioning) {
			setTransitionDirection('prev');
			setIsTransitioning(true);

			// Brief delay for exit animation
			setTimeout(() => {
				const prevStep = currentStep - 1;
				prevStepRef.current = currentStep;
				setCurrentStep(prevStep);
				updateTutorialStep({ step: prevStep });

				// Reset transition state after enter animation
				setTimeout(() => setIsTransitioning(false), 200);
			}, 150);
		}
	}, [currentStep, isFirstStep, isTransitioning, updateTutorialStep]);

	const handleSkip = useCallback(async () => {
		await skipTutorial();
		setIsSkipConfirmOpen(false);
		onSkip?.();
		onOpenChange(false);
	}, [skipTutorial, onSkip, onOpenChange]);

	const handleSkipRequest = useCallback(() => {
		setIsSkipConfirmOpen(true);
	}, []);

	const handleSkipCancel = useCallback(() => {
		setIsSkipConfirmOpen(false);
	}, []);

	// Keyboard navigation handler
	useEffect(() => {
		if (!open) {
			return;
		}

		const handleKeyDown = (event: KeyboardEvent) => {
			// Don't handle keyboard events when skip confirmation dialog is open
			if (isSkipConfirmOpen) {
				return;
			}

			switch (event.key) {
				case 'ArrowRight':
					event.preventDefault();
					handleNext();
					break;
				case 'ArrowLeft':
					event.preventDefault();
					if (!isFirstStep) {
						handlePrev();
					}
					break;
				case 'Escape':
					event.preventDefault();
					handleSkipRequest();
					break;
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [open, isSkipConfirmOpen, isFirstStep, handleNext, handlePrev, handleSkipRequest]);

	const stepInfo = TUTORIAL_STEPS[currentStep];

	return (
		<>
			<Dialog open={open} onOpenChange={onOpenChange}>
				<DialogContent className='sm:max-w-lg' showCloseButton={false}>
					<DialogHeader>
						<div className='flex items-center justify-between'>
							<DialogTitle className='uppercase tracking-wider'>{stepInfo.title}</DialogTitle>
							<Button variant='ghost' size='icon-sm' onClick={handleSkipRequest} aria-label='Skip tutorial'>
								<IconX />
							</Button>
						</div>
					</DialogHeader>

					{/* Progress indicator with step dots */}
					<div className='space-y-3'>
						<Progress
							value={progressValue}
							className='[&_[data-slot=progress-indicator]]:transition-all [&_[data-slot=progress-indicator]]:duration-300 [&_[data-slot=progress-indicator]]:ease-out'
						/>
						<div className='flex items-center justify-center gap-2'>
							{TUTORIAL_STEPS.map((step, index) => (
								<div
									key={step.id}
									className={cn(
										'h-2 w-2',
										index === currentStep
											? 'bg-primary scale-125'
											: index < currentStep
												? 'bg-primary/60'
												: 'bg-muted-foreground/30',
									)}
									aria-label={`Step ${index + 1}: ${step.title}`}
								/>
							))}
						</div>
						<p className='text-center text-xs text-muted-foreground'>
							Step {currentStep + 1} of {totalSteps}
						</p>
					</div>

					{/* Step content area */}
					<div className='relative min-h-[200px] overflow-hidden py-4'>
						<div key={currentStep} className={cn('flex h-full items-center justify-center text-muted-foreground')}>
							{(() => {
								const StepComponent = STEP_COMPONENTS[stepInfo.id];
								return StepComponent ? <StepComponent /> : null;
							})()}
						</div>
					</div>

					{/* Navigation buttons */}
					<div className='flex items-center justify-between pt-4'>
						<Button variant='ghost' onClick={handlePrev} disabled={isFirstStep} className='gap-1'>
							<IconChevronLeft size={18} />
							Back
						</Button>

						<Button variant='ghost' onClick={handleSkipRequest} className='text-muted-foreground'>
							Skip Tutorial
						</Button>

						<Button onClick={handleNext} className='gap-1'>
							{isLastStep ? 'Finish' : 'Next'}
							{!isLastStep && <IconChevronRight size={18} />}
						</Button>
					</div>
				</DialogContent>
			</Dialog>

			{/* Skip confirmation dialog */}
			<Dialog open={isSkipConfirmOpen} onOpenChange={setIsSkipConfirmOpen}>
				<DialogContent className='sm:max-w-sm'>
					<DialogHeader>
						<DialogTitle className='text-center uppercase tracking-wider'>Skip Tutorial?</DialogTitle>
					</DialogHeader>

					<p className='text-center text-muted-foreground'>
						Are you sure you want to skip the tutorial? You can always replay it later from the settings menu.
					</p>

					<div className='flex justify-center gap-4 pt-4'>
						<Button variant='outline' onClick={handleSkipCancel}>
							Continue Learning
						</Button>
						<Button variant='destructive' onClick={handleSkip}>
							Skip
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</>
	);
}
