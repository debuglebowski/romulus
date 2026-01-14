import { IconHammer, IconMoodEmpty, IconShield, IconSpy } from '@tabler/icons-react';

import { Slider } from '@/ui/_shadcn/slider';

interface RatioSlidersProps {
	labourRatio: number;
	militaryRatio: number;
	spyRatio: number;
	population: number;
	onRatioChange: (labour: number, military: number, spy: number) => void;
}

export function RatioSliders({ labourRatio, militaryRatio, spyRatio, population, onRatioChange }: RatioSlidersProps) {
	// Calculate idle percentage (unassigned population)
	const idleRatio = 100 - labourRatio - militaryRatio - spyRatio;

	const handleSliderChange = (which: 'labour' | 'military' | 'spy', newValue: number) => {
		// Validate input
		if (!Number.isFinite(newValue)) {
			return;
		}

		// Calculate the max for this slider based on available idle space
		const maxForSlider = {
			labour: 100 - militaryRatio - spyRatio,
			military: 100 - labourRatio - spyRatio,
			spy: 100 - labourRatio - militaryRatio,
		}[which];

		// Clamp to valid range (0 to available max)
		const clampedValue = Math.max(0, Math.min(maxForSlider, newValue));

		// Update only the changed slider, keep others the same
		const newRatios = {
			labour: labourRatio,
			military: militaryRatio,
			spy: spyRatio,
			[which]: clampedValue,
		};

		onRatioChange(newRatios.labour, newRatios.military, newRatios.spy);
	};

	return (
		<div className='rounded-lg border border-zinc-800 bg-zinc-950 p-3 space-y-2'>
			<SliderRow
				icon={<IconHammer className='h-3.5 w-3.5' />}
				label='Labour'
				value={labourRatio}
				count={Math.floor(population * (labourRatio / 100))}
				onChange={(v) => handleSliderChange('labour', v)}
			/>
			<SliderRow
				icon={<IconShield className='h-3.5 w-3.5' />}
				label='Military'
				value={militaryRatio}
				count={Math.floor(population * (militaryRatio / 100))}
				onChange={(v) => handleSliderChange('military', v)}
			/>
			<SliderRow
				icon={<IconSpy className='h-3.5 w-3.5' />}
				label='Spies'
				value={spyRatio}
				count={Math.floor(population * (spyRatio / 100))}
				onChange={(v) => handleSliderChange('spy', v)}
			/>
			{/* Idle row - display only */}
			<div className='space-y-1'>
				<div className='flex items-center justify-between text-zinc-400'>
					<div className='flex items-center gap-1.5'>
						<IconMoodEmpty className='h-3.5 w-3.5' />
						<span className='text-xs'>Idle</span>
					</div>
					<span className='text-xs font-medium text-white'>
						{idleRatio}% ({Math.floor(population * (idleRatio / 100))})
					</span>
				</div>
				<div className='relative h-1 bg-zinc-900 rounded-full'>
					<div
						className='absolute h-full bg-primary rounded-full'
						style={{ width: `${idleRatio}%` }}
					/>
				</div>
			</div>
		</div>
	);
}

function SliderRow({
	icon,
	label,
	value,
	count,
	onChange,
}: {
	icon: React.ReactNode;
	label: string;
	value: number;
	count: number;
	onChange: (v: number) => void;
}) {
	return (
		<div className='space-y-1'>
			<div className='flex items-center justify-between text-zinc-400'>
				<div className='flex items-center gap-1.5'>
					{icon}
					<span className='text-xs'>{label}</span>
				</div>
				<span className='text-xs font-medium text-white'>
					{value}% ({count})
				</span>
			</div>
			<Slider value={[value]} min={0} max={100} step={1} onValueChange={(vals) => onChange(Array.isArray(vals) ? vals[0] : vals)} />
		</div>
	);
}
