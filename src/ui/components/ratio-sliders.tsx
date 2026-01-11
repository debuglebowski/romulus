import { IconHammer, IconShield, IconSpy } from '@tabler/icons-react';

import { Slider } from '@/ui/_shadcn/slider';

interface RatioSlidersProps {
	labourRatio: number;
	militaryRatio: number;
	spyRatio: number;
	population: number;
	onRatioChange: (labour: number, military: number, spy: number) => void;
}

export function RatioSliders({
	labourRatio,
	militaryRatio,
	spyRatio,
	population,
	onRatioChange,
}: RatioSlidersProps) {
	const handleSliderChange = (which: 'labour' | 'military' | 'spy', newValue: number) => {
		// Validate all current values are valid numbers
		if (!Number.isFinite(labourRatio) || !Number.isFinite(militaryRatio) || !Number.isFinite(spyRatio)) {
			return;
		}
		if (!Number.isFinite(newValue)) {
			return;
		}

		const current = { labour: labourRatio, military: militaryRatio, spy: spyRatio };
		const oldValue = current[which];
		const delta = newValue - oldValue;

		if (delta === 0) return;

		// Get the other two keys
		const otherKeys = (['labour', 'military', 'spy'] as const).filter((k) => k !== which);
		const otherSum = current[otherKeys[0]] + current[otherKeys[1]];

		let newA: number;
		let newB: number;

		if (otherSum === 0) {
			// Both others are 0
			if (delta > 0) return; // Can't increase, nothing to take from
			// When decreasing, distribute freed amount evenly to others
			const freed = -delta;
			newA = Math.round(freed / 2);
			newB = freed - newA; // Ensure they sum correctly
		} else {
			// Proportional redistribution
			const ratioA = current[otherKeys[0]] / otherSum;
			newA = Math.max(0, Math.round(current[otherKeys[0]] - delta * ratioA));
			newB = 100 - newValue - newA;

			// Clamp newB and adjust newA if needed
			if (newB < 0) {
				newB = 0;
				newA = 100 - newValue;
			}
		}

		const result = { ...current, [which]: newValue, [otherKeys[0]]: newA, [otherKeys[1]]: newB };
		onRatioChange(result.labour, result.military, result.spy);
	};

	return (
		<div className='border-t border-border bg-gray-900 px-4 py-3 text-gray-100'>
			<div className='mx-auto flex max-w-md flex-col gap-3'>
				<SliderRow
					icon={<IconHammer className='h-4 w-4' />}
					label='Labour'
					value={labourRatio}
					count={Math.floor(population * (labourRatio / 100))}
					onChange={(v) => handleSliderChange('labour', v)}
				/>
				<SliderRow
					icon={<IconShield className='h-4 w-4' />}
					label='Military'
					value={militaryRatio}
					count={Math.floor(population * (militaryRatio / 100))}
					onChange={(v) => handleSliderChange('military', v)}
				/>
				<SliderRow
					icon={<IconSpy className='h-4 w-4' />}
					label='Spy'
					value={spyRatio}
					count={Math.floor(population * (spyRatio / 100))}
					onChange={(v) => handleSliderChange('spy', v)}
				/>
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
		<div className='flex items-center gap-3'>
			<div className='flex w-20 items-center gap-2 text-gray-400'>
				{icon}
				<span className='text-sm'>{label}</span>
			</div>
			<div className='flex-1'>
				<Slider
					value={[value]}
					min={0}
					max={100}
					step={1}
					onValueChange={(vals: number[]) => onChange(vals[0])}
				/>
			</div>
			<span className='w-20 text-right text-sm font-medium'>
				{value}% ({count})
			</span>
		</div>
	);
}
