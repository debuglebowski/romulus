import { IconFlag, IconHome, IconRoute, IconShield, IconX } from '@tabler/icons-react';
import { useEffect, useState } from 'react';

import { Slider } from '@/ui/_shadcn/slider';

import type { ArmyData, TileData } from './hex-map';

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

interface ContextPanelProps {
	selectedTile?: TileData;
	selectedArmy?: ArmyData;
	stationaryArmiesOnTile?: ArmyData[];
	isOwnTile: boolean;
	mode: 'default' | 'move' | 'rally';
	moveUnitCount?: number;
	onMoveUnitCountChange?: (count: number) => void;
	onSetRallyPoint?: () => void;
	onCancelMove?: () => void;
	onCancelSelection?: () => void;
	onSetMoveMode?: (armyId: string) => void;
	onSetRallyMode?: () => void;
	onCallHome?: (armyId: string) => void;
}

export function ContextPanel({
	selectedTile,
	selectedArmy,
	stationaryArmiesOnTile = [],
	isOwnTile,
	mode,
	moveUnitCount,
	onMoveUnitCountChange,
	onSetRallyPoint,
	onCancelMove,
	onCancelSelection,
	onSetMoveMode,
	onSetRallyMode,
	onCallHome,
}: ContextPanelProps) {
	const [now, setNow] = useState(Date.now());

	// Update time every second when viewing a moving army
	useEffect(() => {
		if (!selectedArmy?.targetTileId || !selectedArmy.departureTime || !selectedArmy.arrivalTime) {
			return;
		}

		const interval = setInterval(() => {
			setNow(Date.now());
		}, 1000);

		return () => clearInterval(interval);
	}, [selectedArmy?.targetTileId, selectedArmy?.departureTime, selectedArmy?.arrivalTime]);

	// Calculate time estimates for moving army
	const timeEstimates = (() => {
		if (
			!selectedArmy?.targetTileId ||
			!selectedArmy.departureTime ||
			!selectedArmy.arrivalTime ||
			!selectedArmy.path ||
			selectedArmy.path.length === 0
		) {
			return null;
		}

		const elapsed = now - selectedArmy.departureTime;
		const totalTime = selectedArmy.arrivalTime - selectedArmy.departureTime;
		const pathLength = selectedArmy.path.length;

		// Time to destination
		const timeToDestination = Math.max(0, selectedArmy.arrivalTime - now);

		// Time to next tile
		const timePerHex = totalTime / pathLength;
		const currentHexIndex = Math.min(Math.floor(elapsed / timePerHex), pathLength - 1);
		const timeIntoCurrentHex = elapsed - currentHexIndex * timePerHex;
		const timeToNextTile = Math.max(0, timePerHex - timeIntoCurrentHex);

		return {
			timeToNextTile,
			timeToDestination,
			tilesRemaining: pathLength - currentHexIndex,
		};
	})();

	if (!selectedTile && !selectedArmy) {
		return (
			<div className='rounded-lg border border-zinc-800 bg-zinc-900 p-4'>
				<p className='text-sm text-zinc-500'>Click a tile or army to select</p>
			</div>
		);
	}

	return (
		<div className='rounded-lg border border-zinc-800 bg-zinc-900 p-4 space-y-3'>
			{/* Header with action icons */}
			<div className='flex items-center justify-between'>
				<h3 className='font-medium text-white'>
					{selectedArmy ? 'Army' : selectedTile?.type === 'capital' ? 'Capital' : selectedTile?.type === 'city' ? 'City' : 'Territory'}
				</h3>
				<div className='flex items-center gap-1'>
					{/* Rally point icon button - only for own tiles in default mode */}
					{isOwnTile && !selectedArmy && mode === 'default' && (
						<button
							onClick={onSetRallyMode}
							className='p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-green-400'
							title='Set Rally Point'
						>
							<IconFlag size={16} />
						</button>
					)}
					<button onClick={onCancelSelection} className='p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white'>
						<IconX size={16} />
					</button>
				</div>
			</div>

			{/* Tile info */}
			{selectedTile && (
				<div className='text-sm text-zinc-400'>
					<p>
						Position: ({selectedTile.q}, {selectedTile.r})
					</p>
					<p>Type: {selectedTile.type}</p>
					{selectedTile.ownerId && <p>Owned</p>}
				</div>
			)}

			{/* Rally mode UI */}
			{mode === 'rally' && (
				<div className='space-y-2'>
					<p className='text-sm text-green-400'>Select rally point tile</p>
					{isOwnTile && (
						<button
							onClick={onSetRallyPoint}
							className='w-full flex items-center justify-center gap-2 rounded bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700'
						>
							<IconFlag size={16} />
							Set Here
						</button>
					)}
					<button onClick={onCancelSelection} className='w-full rounded bg-zinc-700 px-3 py-2 text-sm text-white hover:bg-zinc-600'>
						Cancel
					</button>
				</div>
			)}

			{/* Stationary armies section - separate card-like section */}
			{selectedTile && stationaryArmiesOnTile.length > 0 && mode !== 'rally' && (
				<div className='border-t border-zinc-800 pt-3 space-y-2'>
					<div className='flex items-center justify-between'>
						<h4 className='text-sm font-medium text-zinc-300'>Army</h4>
					</div>
					<div className='flex items-center gap-2 text-sm'>
						<IconShield size={16} className='text-zinc-400' />
						<span className='text-white'>
							{stationaryArmiesOnTile.reduce((sum, a) => sum + a.count, 0)} units
						</span>
					</div>
					{/* Move and Call Home buttons for own stationary army */}
					{mode === 'default' && (() => {
						const ownArmy = stationaryArmiesOnTile.find((a) => a.isOwn);
						if (ownArmy) {
							return (
								<div className='flex gap-2'>
									<button
										onClick={() => onSetMoveMode?.(ownArmy._id)}
										className='flex-1 flex items-center justify-center gap-2 rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700'
									>
										<IconRoute size={16} />
										Move
									</button>
									<button
										onClick={() => onCallHome?.(ownArmy._id)}
										className='flex-1 flex items-center justify-center gap-2 rounded bg-zinc-600 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-500'
									>
										<IconHome size={16} />
										Call Home
									</button>
								</div>
							);
						}
						return null;
					})()}
					{/* Move mode UI */}
					{mode === 'move' && selectedArmy && (
						<div className='space-y-3'>
							<p className='text-sm text-amber-400'>Select destination tile</p>
							<div className='space-y-1'>
								<div className='flex justify-between text-xs text-zinc-400'>
									<span>Units to move</span>
									<span className='text-white font-medium'>
										{moveUnitCount} / {selectedArmy.count}
									</span>
								</div>
								<Slider
									value={[moveUnitCount ?? selectedArmy.count]}
									min={1}
									max={selectedArmy.count}
									step={1}
									onValueChange={(vals: number[]) => onMoveUnitCountChange?.(vals[0])}
								/>
							</div>
							<button onClick={onCancelSelection} className='w-full rounded bg-zinc-700 px-3 py-2 text-sm text-white hover:bg-zinc-600'>
								Cancel
							</button>
						</div>
					)}
				</div>
			)}

			{/* Moving army info (directly selected) */}
			{selectedArmy && (
				<div className='border-t border-zinc-800 pt-3 space-y-2'>
					<div className='flex items-center gap-2 text-sm'>
						<IconShield size={16} className='text-zinc-400' />
						<span className='text-white'>{selectedArmy.count} units</span>
						{selectedArmy.targetTileId && <span className='text-amber-500 text-xs'>(moving)</span>}
					</div>

					{/* Time estimates for moving army */}
					{timeEstimates && (
						<div className='text-xs text-zinc-400 space-y-1 pl-6'>
							<div className='flex justify-between'>
								<span>Next tile:</span>
								<span className='text-amber-400 font-medium'>{formatTime(timeEstimates.timeToNextTile)}</span>
							</div>
							<div className='flex justify-between'>
								<span>Destination ({timeEstimates.tilesRemaining} tiles):</span>
								<span className='text-amber-400 font-medium'>{formatTime(timeEstimates.timeToDestination)}</span>
							</div>
						</div>
					)}

					{/* Cancel move button for moving army */}
					{selectedArmy.isOwn && selectedArmy.targetTileId && mode === 'default' && (
						<button
							onClick={onCancelMove}
							className='w-full flex items-center justify-center gap-2 rounded bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700'
						>
							<IconX size={16} />
							Cancel Move
						</button>
					)}
				</div>
			)}
		</div>
	);
}
