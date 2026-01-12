import { IconBuilding, IconCrown, IconFlag, IconHome, IconLogout, IconRoute, IconShield, IconX } from '@tabler/icons-react';
import { useEffect, useState } from 'react';

import { Slider } from '@/ui/_shadcn/slider';

import type { ArmyData, TileData } from './hex-map';

const CITY_BUILD_COST = 50;

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
	playerGold?: number;
	isCapitalMoving?: boolean;
	onMoveUnitCountChange?: (count: number) => void;
	onSetRallyPoint?: () => void;
	onCancelMove?: () => void;
	onCancelSelection?: () => void;
	onSetMoveMode?: (armyId: string) => void;
	onSetRallyMode?: () => void;
	onCallHome?: (armyId: string) => void;
	onBuildCity?: () => void;
	onRetreat?: (armyId: string) => void;
	onMoveCapitalHere?: () => void;
}

export function ContextPanel({
	selectedTile,
	selectedArmy,
	stationaryArmiesOnTile = [],
	isOwnTile,
	mode,
	moveUnitCount,
	playerGold = 0,
	isCapitalMoving = false,
	onMoveUnitCountChange,
	onSetRallyPoint,
	onCancelMove,
	onCancelSelection,
	onSetMoveMode,
	onSetRallyMode,
	onCallHome,
	onBuildCity,
	onRetreat,
	onMoveCapitalHere,
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
			<div className='rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2'>
				<p className='text-sm text-zinc-500'>Click a tile or army to select</p>
			</div>
		);
	}

	return (
		<div className='rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 space-y-2'>
			{/* Header with action icons */}
			<div className='flex items-center justify-between'>
				<div className='flex items-center gap-2'>
					<h3 className='text-sm font-medium text-white'>
						{selectedArmy ? 'Army' : selectedTile?.type === 'capital' ? 'Capital' : selectedTile?.type === 'city' ? 'City' : 'Territory'}
					</h3>
					{selectedTile?.ownerId && <span className='text-xs text-zinc-500'>• Owned</span>}
				</div>
				<div className='flex items-center gap-1'>
					{/* Rally point icon button - only for own tiles in default mode */}
					{isOwnTile && !selectedArmy && mode === 'default' && (
						<button
							onClick={onSetRallyMode}
							className='p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-green-400'
							title='Set Rally Point'
						>
							<IconFlag size={14} />
						</button>
					)}
					<button onClick={onCancelSelection} className='p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white'>
						<IconX size={14} />
					</button>
				</div>
			</div>

			{/* Rally mode UI */}
			{mode === 'rally' && (
				<div className='space-y-1.5'>
					<p className='text-xs text-green-400'>Select rally point tile</p>
					{isOwnTile && (
						<button
							onClick={onSetRallyPoint}
							className='w-full flex items-center justify-center gap-1.5 rounded bg-green-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-green-700'
						>
							<IconFlag size={14} />
							Set Here
						</button>
					)}
					<button onClick={onCancelSelection} className='w-full rounded bg-zinc-700 px-2 py-1.5 text-xs text-white hover:bg-zinc-600'>
						Cancel
					</button>
				</div>
			)}

			{/* Build City button for owned empty tiles */}
			{selectedTile && isOwnTile && selectedTile.type === 'empty' && mode === 'default' && !isCapitalMoving && (
				<div className='border-t border-zinc-800 pt-2'>
					<button
						onClick={onBuildCity}
						disabled={playerGold < CITY_BUILD_COST}
						className='w-full flex items-center justify-center gap-1.5 rounded bg-amber-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:bg-zinc-700 disabled:text-zinc-400 disabled:cursor-not-allowed'
					>
						<IconBuilding size={14} />
						Build City ({CITY_BUILD_COST}g)
					</button>
					{playerGold < CITY_BUILD_COST && (
						<p className='text-xs text-zinc-500 mt-1 text-center'>
							Need {CITY_BUILD_COST - Math.floor(playerGold)} more gold
						</p>
					)}
				</div>
			)}

			{/* Move Capital button for owned cities */}
			{selectedTile && isOwnTile && selectedTile.type === 'city' && mode === 'default' && !isCapitalMoving && (
				<div className='border-t border-zinc-800 pt-2'>
					<button
						onClick={onMoveCapitalHere}
						className='w-full flex items-center justify-center gap-1.5 rounded bg-purple-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-purple-700'
					>
						<IconCrown size={14} />
						Move Capital Here
					</button>
				</div>
			)}

			{/* Stationary armies section - separate card-like section */}
			{selectedTile && stationaryArmiesOnTile.length > 0 && mode !== 'rally' && (
				<div className='border-t border-zinc-800 pt-2 space-y-1.5'>
					{(() => {
						const totalUnits = stationaryArmiesOnTile.reduce((sum, a) => sum + a.unitCount, 0);
						const totalHp = stationaryArmiesOnTile.reduce((sum, a) => sum + a.totalHp, 0);
						const avgHpPercent = totalUnits > 0 ? (totalHp / (totalUnits * 100)) * 100 : 100;
						const isInCombat = stationaryArmiesOnTile.some((a) => a.isInCombat);

						return (
							<>
								<div className='flex items-center gap-1.5 text-xs'>
									<IconShield size={14} className={isInCombat ? 'text-red-400' : 'text-zinc-400'} />
									<span className='text-white'>{totalUnits} units</span>
									{isInCombat && <span className='text-red-400'>(in combat)</span>}
								</div>
								{avgHpPercent < 100 && (
									<div className='flex items-center gap-2 text-xs text-zinc-400'>
										<span>HP:</span>
										<div className='flex-1 h-1.5 bg-zinc-700 rounded overflow-hidden'>
											<div
												className='h-full transition-all'
												style={{
													width: `${avgHpPercent}%`,
													backgroundColor: avgHpPercent > 50 ? '#22c55e' : avgHpPercent > 25 ? '#f59e0b' : '#ef4444',
												}}
											/>
										</div>
										<span>{Math.round(avgHpPercent)}%</span>
									</div>
								)}
							</>
						);
					})()}
					{/* Move, Call Home, and Retreat buttons for own stationary army */}
					{mode === 'default' && (() => {
						const ownArmy = stationaryArmiesOnTile.find((a) => a.isOwn);
						if (ownArmy) {
							return (
								<div className='space-y-1.5 pt-1'>
									<div className='flex gap-1.5'>
										<button
											onClick={() => onSetMoveMode?.(ownArmy._id)}
											className='flex-1 flex items-center justify-center gap-1.5 rounded bg-blue-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-blue-700'
										>
											<IconRoute size={14} />
											Move
										</button>
										<button
											onClick={() => onCallHome?.(ownArmy._id)}
											className='flex-1 flex items-center justify-center gap-1.5 rounded bg-zinc-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-zinc-500'
										>
											<IconHome size={14} />
											Home
										</button>
									</div>
									{/* Retreat button (only when in combat) */}
									{ownArmy.isInCombat && (
										<button
											onClick={() => onRetreat?.(ownArmy._id)}
											className='w-full flex items-center justify-center gap-1.5 rounded bg-red-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-red-700'
										>
											<IconLogout size={14} />
											Retreat
										</button>
									)}
								</div>
							);
						}
						return null;
					})()}
					{/* Move mode UI */}
					{mode === 'move' && selectedArmy && (
						<div className='space-y-2'>
							<p className='text-xs text-amber-400'>Select destination tile</p>
							<div className='space-y-1'>
								<div className='flex justify-between text-xs text-zinc-400'>
									<span>Units to move</span>
									<span className='text-white font-medium'>
										{moveUnitCount} / {selectedArmy.unitCount}
									</span>
								</div>
								<Slider
									value={[moveUnitCount ?? selectedArmy.unitCount]}
									min={1}
									max={selectedArmy.unitCount}
									step={1}
									onValueChange={(vals: number[]) => onMoveUnitCountChange?.(vals[0])}
								/>
							</div>
							<button onClick={onCancelSelection} className='w-full rounded bg-zinc-700 px-2 py-1.5 text-xs text-white hover:bg-zinc-600'>
								Cancel
							</button>
						</div>
					)}
				</div>
			)}

			{/* Moving army info (directly selected) */}
			{selectedArmy && (
				<div className='border-t border-zinc-800 pt-2 space-y-1.5'>
					<div className='flex items-center gap-1.5 text-xs'>
						<IconShield size={14} className='text-zinc-400' />
						<span className='text-white'>{selectedArmy.unitCount} units</span>
						{selectedArmy.targetTileId && <span className='text-amber-500'>(moving)</span>}
					</div>

					{/* HP bar for moving army */}
					{selectedArmy.averageHpPercent < 100 && (
						<div className='flex items-center gap-2 text-xs text-zinc-400'>
							<span>HP:</span>
							<div className='flex-1 h-1.5 bg-zinc-700 rounded overflow-hidden'>
								<div
									className='h-full transition-all'
									style={{
										width: `${selectedArmy.averageHpPercent}%`,
										backgroundColor:
											selectedArmy.averageHpPercent > 50
												? '#22c55e'
												: selectedArmy.averageHpPercent > 25
													? '#f59e0b'
													: '#ef4444',
									}}
								/>
							</div>
							<span>{Math.round(selectedArmy.averageHpPercent)}%</span>
						</div>
					)}

					{/* Time estimates for moving army */}
					{timeEstimates && (
						<div className='text-xs text-zinc-400 space-y-0.5 pl-5'>
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
							className='w-full flex items-center justify-center gap-1.5 rounded bg-red-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-red-700'
						>
							<IconX size={14} />
							Cancel Move
						</button>
					)}
				</div>
			)}
		</div>
	);
}
