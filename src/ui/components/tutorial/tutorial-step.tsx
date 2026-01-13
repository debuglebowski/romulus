import { type ReactNode } from 'react';

import { cn } from '@/ui/_shadcn.lib/utils';

type TutorialStepProps = {
	/** Optional illustration or visual element displayed above the content */
	illustration?: ReactNode;
	/** Main content of the step */
	children: ReactNode;
	/** Additional CSS classes for the container */
	className?: string;
	/** Whether the step is currently animating in */
	isAnimating?: boolean;
};

/**
 * Base component for tutorial steps providing consistent layout.
 * Used by all individual step components (welcome, movement, combat, etc.)
 * Includes built-in staggered animation for child elements.
 */
export function TutorialStep({ illustration, children, className, isAnimating = false }: TutorialStepProps) {
	return (
		<div
			className={cn(
				'space-y-4',
				// Apply subtle fade-in animation when step mounts
				!isAnimating && 'animate-in fade-in-0 duration-300',
				className
			)}
		>
			{illustration && (
				<div
					className={cn(
						'flex justify-center',
						!isAnimating && 'animate-in fade-in-0 slide-in-from-bottom-2 duration-300 delay-75'
					)}
				>
					<div className='rounded-lg bg-muted/50 p-4 transition-all duration-200 hover:bg-muted/70'>
						{illustration}
					</div>
				</div>
			)}
			<div
				className={cn(
					'space-y-4',
					!isAnimating && 'animate-in fade-in-0 slide-in-from-bottom-2 duration-300 delay-150'
				)}
			>
				{children}
			</div>
		</div>
	);
}

type TutorialSectionProps = {
	/** Section title displayed as uppercase header */
	title: string;
	/** Content lines for the section */
	children: ReactNode;
	/** Additional CSS classes */
	className?: string;
};

/**
 * Section component for grouping related content within a tutorial step.
 * Follows the pattern from how-to-play.tsx for consistent styling.
 * Includes subtle hover interactions.
 */
export function TutorialSection({ title, children, className }: TutorialSectionProps) {
	return (
		<div className={cn('transition-colors duration-200', className)}>
			<h3 className='mb-2 font-semibold uppercase tracking-wide'>{title}</h3>
			<div className='mb-3 border-b border-muted transition-colors duration-200' />
			<div className='space-y-2 text-muted-foreground'>{children}</div>
		</div>
	);
}

type TutorialListProps = {
	/** List items to display */
	items: string[];
	/** Additional CSS classes */
	className?: string;
};

/**
 * Bullet list component for displaying multiple points within a tutorial section.
 * Each item has a subtle hover effect for interactivity.
 */
export function TutorialList({ items, className }: TutorialListProps) {
	return (
		<ul className={cn('space-y-1', className)}>
			{items.map((item, i) => (
				<li
					key={i}
					className='rounded px-1 transition-colors duration-150 hover:bg-muted/50'
				>
					• {item}
				</li>
			))}
		</ul>
	);
}

type TutorialHighlightProps = {
	/** Content to highlight */
	children: ReactNode;
	/** Additional CSS classes */
	className?: string;
};

/**
 * Highlight component for emphasizing key information in a tutorial step.
 * Features a subtle pulse animation to draw attention.
 */
export function TutorialHighlight({ children, className }: TutorialHighlightProps) {
	return (
		<div
			className={cn(
				'rounded-md bg-primary/10 p-3 text-center font-medium text-primary',
				'ring-1 ring-primary/20 transition-all duration-200',
				'hover:bg-primary/15 hover:ring-primary/30',
				className
			)}
		>
			{children}
		</div>
	);
}
