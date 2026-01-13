import { IconCoins, IconEye, IconShield, IconSpy, IconUsers } from '@tabler/icons-react';
import { useQuery } from 'convex/react';

import { api } from '../../../convex/_generated/api';

import type { Id } from '../../../convex/_generated/dataModel';

interface CapitalIntelPanelProps {
	gameId: string;
}

function formatTime(ms: number): string {
	if (ms <= 0) {
		return '0s';
	}
	const seconds = Math.ceil(ms / 1000);
	if (seconds < 60) {
		return `${seconds}s`;
	}
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = seconds % 60;
	return `${minutes}m ${remainingSeconds}s`;
}

export function CapitalIntelPanel({ gameId }: CapitalIntelPanelProps) {
	const capitalIntel = useQuery(api.spies.getCapitalIntel, { gameId: gameId as Id<'games'> });

	if (!capitalIntel || capitalIntel.length === 0) {
		return null;
	}

	return (
		<div className='rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden'>
			<div className='px-3 py-2 border-b border-zinc-800 bg-zinc-800/50'>
				<div className='flex items-center gap-1.5'>
					<IconEye size={14} className='text-purple-400' />
					<h3 className='text-xs font-medium text-white'>Capital Intel</h3>
				</div>
			</div>
			<div className='p-2 space-y-2 max-h-48 overflow-y-auto'>
				{capitalIntel.map((intel) => (
					<IntelEntry key={intel.targetPlayerId} intel={intel} />
				))}
			</div>
		</div>
	);
}

interface IntelEntryProps {
	intel: {
		targetPlayerId: string;
		targetColor: string;
		currentTier: number;
		nextTierTime: number | null;
		gold: number | null;
		population: number | null;
		upgrades: string[] | null;
	};
}

function IntelEntry({ intel }: IntelEntryProps) {
	return (
		<div className='rounded border border-zinc-700/50 bg-zinc-800/30 p-2 space-y-1.5'>
			{/* Header with player color indicator */}
			<div className='flex items-center justify-between'>
				<div className='flex items-center gap-1.5'>
					<div
						className='w-2.5 h-2.5 rounded-full'
						style={{ backgroundColor: intel.targetColor }}
					/>
					<span className='text-xs text-zinc-300'>
						Tier {intel.currentTier}/5
					</span>
				</div>
				{intel.nextTierTime !== null && (
					<span className='text-[10px] text-zinc-500'>
						Next: {formatTime(intel.nextTierTime)}
					</span>
				)}
			</div>

			{/* Intel data rows */}
			<div className='space-y-0.5 text-[10px]'>
				{intel.currentTier >= 1 && intel.gold !== null && (
					<div className='flex items-center gap-1.5 text-zinc-400'>
						<IconCoins size={10} className='text-yellow-500' />
						<span>{Math.floor(intel.gold)} gold</span>
					</div>
				)}
				{intel.currentTier >= 2 && intel.population !== null && (
					<div className='flex items-center gap-1.5 text-zinc-400'>
						<IconUsers size={10} className='text-blue-400' />
						<span>{intel.population} population</span>
					</div>
				)}
				{intel.currentTier >= 3 && intel.upgrades !== null && (
					<div className='flex items-center gap-1.5 text-zinc-400'>
						<IconShield size={10} className='text-green-400' />
						<span>{intel.upgrades.length} upgrades known</span>
					</div>
				)}
				{intel.currentTier >= 4 && (
					<div className='flex items-center gap-1.5 text-zinc-400'>
						<IconShield size={10} className='text-red-400' />
						<span>Armies visible</span>
					</div>
				)}
				{intel.currentTier >= 5 && (
					<div className='flex items-center gap-1.5 text-zinc-400'>
						<IconSpy size={10} className='text-purple-400' />
						<span>Spies visible</span>
					</div>
				)}
			</div>

			{/* Tier progress bar */}
			<div className='h-1 bg-zinc-700 rounded overflow-hidden'>
				<div
					className='h-full bg-purple-500 transition-all'
					style={{ width: `${(intel.currentTier / 5) * 100}%` }}
				/>
			</div>
		</div>
	);
}
