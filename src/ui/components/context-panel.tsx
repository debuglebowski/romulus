import { IconBuilding, IconCrown, IconEye, IconFlag, IconHome, IconLogout, IconRoute, IconShield, IconX } from '@tabler/icons-react';
import { useEffect, useState } from 'react';

import { Slider } from '@/ui/_shadcn/slider';

import type { ArmyData, SpyData, TileData } from './hex-map';

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

interface SpyIntel {
	armyCount: number;
	unitCount: number;
	tileOwnerId?: string;
}

interface AllegianceBreakdown {
	teamId: string;
	score: number;
	color: string;
	isOwner: boolean;
	isMe: boolean;
}

interface AllegianceData {
	tileOwnerId?: string;
	tileType: 'city' | 'capital';
	breakdown: AllegianceBreakdown[];
}

interface ContextPanelProps {
	selectedTile?: TileData;
	selectedArmy?: ArmyData;
	selectedSpy?: SpyData;
	stationaryArmiesOnTile?: ArmyData[];
	spiesOnTile?: { _id: string; isRevealed: boolean }[];
	spyIntel?: SpyIntel | null;
	allegianceData?: AllegianceData | null;
	isOwnTile: boolean;
	mode: 'default' | 'move' | 'rally' | 'spy-move';
	moveUnitCount?: number;
	playerGold?: number;
	isCapitalMoving?: boolean;
	onMoveUnitCountChange?: (count: number) => void;
	onSetRallyPoint?: () => void;
	onCancelMove?: () => void;
	onCancelSpyMove?: () => void;
	onCancelSelection?: () => void;
	onSetMoveMode?: (armyId: string) => void;
	onSetSpyMoveMode?: (spyId: string) => void;
	onSetRallyMode?: () => void;
	onCallHome?: (armyId: string) => void;
	onBuildCity?: () => void;
	onRetreat?: (armyId: string) => void;
	onMoveCapitalHere?: () => void;
}

export function ContextPanel({
	selectedTile,
	selectedArmy,
	selectedSpy,
	stationaryArmiesOnTile = [],
	spiesOnTile = [],
	spyIntel,
	allegianceData,
	isOwnTile,
	mode,
	moveUnitCount,
	playerGold = 0,
	isCapitalMoving = false,
	onMoveUnitCountChange,
	onSetRallyPoint,
	onCancelMove,
	onCancelSpyMove,
	onCancelSelection,
	onSetMoveMode,
	onSetSpyMoveMode,
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

	if (!selectedTile && !selectedArmy && !selectedSpy) {
		return (
			<div className='rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2'>
				<p className='text-sm text-zinc-500'>Click a tile, army, or spy to select</p>
			</div>
		);
	}

	return (
		<div className='rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 space-y-2'>
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
							className='p-1 hover:bg-zinc-900 rounded text-zinc-400 hover:text-green-400'
							title='Set Rally Point'
						>
							<IconFlag size={14} />
						</button>
					)}
					<button onClick={onCancelSelection} className='p-1 hover:bg-zinc-900 rounded text-zinc-400 hover:text-white'>
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
					<button onClick={onCancelSelection} className='w-full rounded bg-zinc-800 px-2 py-1.5 text-xs text-white hover:bg-zinc-700'>
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
						className='w-full flex items-center justify-center gap-1.5 rounded bg-primary px-2 py-1.5 text-xs font-medium text-white hover:bg-primary/90 disabled:bg-zinc-800 disabled:text-zinc-400 disabled:cursor-not-allowed'
					>
						<IconBuilding size={14} />
						<span className='tabular-nums'>Build City ({CITY_BUILD_COST}g)</span>
					</button>
					{playerGold < CITY_BUILD_COST && (
						<p className='text-xs text-zinc-500 mt-1 text-center tabular-nums'>
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

			{/* Spy Intel section - shows intel from player's spies on enemy tiles */}
			{selectedTile && !isOwnTile && spyIntel && mode === 'default' && (
				<div className='border-t border-zinc-800 pt-2 space-y-1'>
					<div className='flex items-center gap-1.5 text-xs text-purple-400'>
						<IconEye size={14} />
						<span>Intel</span>
					</div>
					<div className='text-xs text-zinc-300 pl-5 space-y-0.5'>
						<div className='flex justify-between'>
							<span>Armies:</span>
							<span className='text-white font-medium tabular-nums'>{spyIntel.armyCount}</span>
						</div>
						<div className='flex justify-between'>
							<span>Units:</span>
							<span className='text-white font-medium tabular-nums'>{spyIntel.unitCount}</span>
						</div>
					</div>
				</div>
			)}

			{/* Allegiance section - shows city loyalty breakdown when spy is present */}
			{selectedTile && allegianceData && (selectedTile.type === 'city' || selectedTile.type === 'capital') && mode === 'default' && (
				<div className='border-t border-zinc-800 pt-2 space-y-1.5'>
					<div className='flex items-center gap-1.5 text-xs text-primary'>
						<IconCrown size={14} />
						<span>Allegiance</span>
					</div>
					<div className='space-y-1'>
						{allegianceData.breakdown.map((entry) => (
							<div key={entry.teamId} className='flex items-center gap-2'>
								<div
									className='w-2 h-2 rounded-full shrink-0'
									style={{ backgroundColor: entry.color }}
								/>
								<div className='flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden'>
									<div
										className='h-full rounded-full transition-all'
										style={{
											width: `${entry.score}%`,
											backgroundColor: entry.isOwner ? '#22c55e' : entry.isMe ? '#a855f7' : entry.color,
										}}
									/>
								</div>
								<span className={`text-[10px] w-8 text-right tabular-nums ${entry.isMe ? 'text-purple-400 font-medium' : 'text-zinc-400'}`}>
									{Math.round(entry.score)}%
								</span>
							</div>
						))}
					</div>
					{/* Show flip warning if owner allegiance is low */}
					{allegianceData.breakdown.find((b) => b.isOwner)?.score !== undefined &&
					 allegianceData.breakdown.find((b) => b.isOwner)!.score < 30 && (
						<p className='text-[10px] text-primary'>City loyalty wavering!</p>
					)}
				</div>
			)}

			{/* Spies on tile section */}
			{selectedTile && spiesOnTile.length > 0 && mode !== 'rally' && mode !== 'spy-move' && (
				<div className='border-t border-zinc-800 pt-2 space-y-1.5'>
					<div className='flex items-center gap-1.5 text-xs'>
						<IconEye size={14} className='text-purple-400' />
						<span className='text-white tabular-nums'>{spiesOnTile.length} {spiesOnTile.length === 1 ? 'spy' : 'spies'}</span>
						{spiesOnTile.some((s) => s.isRevealed) && (
							<span className='text-red-400 text-[10px] tabular-nums'>
								({spiesOnTile.filter((s) => s.isRevealed).length} revealed)
							</span>
						)}
					</div>
					{/* Spy move button */}
					{mode === 'default' && spiesOnTile.length > 0 && (
						<button
							onClick={() => onSetSpyMoveMode?.(spiesOnTile[0]._id)}
							className='w-full flex items-center justify-center gap-1.5 rounded bg-purple-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-purple-700'
						>
							<IconRoute size={14} />
							Move Spy
						</button>
					)}
				</div>
			)}

			{/* Spy move mode UI */}
			{mode === 'spy-move' && (
				<div className='border-t border-zinc-800 pt-2 space-y-1.5'>
					<p className='text-xs text-purple-400'>Select destination for spy</p>
					<button onClick={onCancelSelection} className='w-full rounded bg-zinc-800 px-2 py-1.5 text-xs text-white hover:bg-zinc-700'>
						Cancel
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
									<span className='text-white tabular-nums'>{totalUnits} units</span>
									{isInCombat && <span className='text-red-400'>(in combat)</span>}
								</div>
								{avgHpPercent < 100 && (
									<div className='flex items-center gap-2 text-xs text-zinc-400'>
										<span>HP:</span>
										<div className='flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden'>
											<div
												className='h-full rounded-full transition-all'
												style={{
													width: `${avgHpPercent}%`,
													backgroundColor: avgHpPercent > 50 ? '#22c55e' : avgHpPercent > 25 ? '#f59e0b' : '#ef4444',
												}}
											/>
										</div>
										<span className='tabular-nums'>{Math.round(avgHpPercent)}%</span>
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
											className='flex-1 flex items-center justify-center gap-1.5 rounded bg-zinc-800 px-2 py-1.5 text-xs font-medium text-white hover:bg-zinc-700'
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
							<p className='text-xs text-primary'>Select destination tile</p>
							<div className='space-y-1'>
								<div className='flex justify-between text-xs text-zinc-400'>
									<span>Units to move</span>
									<span className='text-white font-medium tabular-nums'>
										{moveUnitCount} / {selectedArmy.unitCount}
									</span>
								</div>
								<Slider
									value={[moveUnitCount ?? selectedArmy.unitCount]}
									min={1}
									max={selectedArmy.unitCount}
									step={1}
									onValueChange={(value) => {
										const vals = Array.isArray(value) ? value : [value];
										onMoveUnitCountChange?.(vals[0]);
									}}
								/>
							</div>
							<button onClick={onCancelSelection} className='w-full rounded bg-zinc-800 px-2 py-1.5 text-xs text-white hover:bg-zinc-700'>
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
						<span className='text-white tabular-nums'>{selectedArmy.unitCount} units</span>
						{selectedArmy.targetTileId && <span className='text-primary'>(moving)</span>}
					</div>

					{/* HP bar for moving army */}
					{selectedArmy.averageHpPercent < 100 && (
						<div className='flex items-center gap-2 text-xs text-zinc-400'>
							<span>HP:</span>
							<div className='flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden'>
								<div
									className='h-full rounded-full transition-all'
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
							<span className='tabular-nums'>{Math.round(selectedArmy.averageHpPercent)}%</span>
						</div>
					)}

					{/* Time estimates for moving army */}
					{timeEstimates && (
						<div className='text-xs text-zinc-400 space-y-0.5 pl-5'>
							<div className='flex justify-between'>
								<span>Next tile:</span>
								<span className='text-primary font-medium tabular-nums'>{formatTime(timeEstimates.timeToNextTile)}</span>
							</div>
							<div className='flex justify-between'>
								<span>Destination (<span className='tabular-nums'>{timeEstimates.tilesRemaining}</span> tiles):</span>
								<span className='text-primary font-medium tabular-nums'>{formatTime(timeEstimates.timeToDestination)}</span>
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

			{/* Selected spy info (directly selected moving spy) */}
			{selectedSpy && (
				<div className='border-t border-zinc-800 pt-2 space-y-1.5'>
					<div className='flex items-center gap-1.5 text-xs'>
						<IconEye size={14} className={selectedSpy.isRevealed ? 'text-red-400' : 'text-purple-400'} />
						<span className='text-white'>Spy</span>
						{selectedSpy.targetTileId && <span className='text-purple-400'>(moving)</span>}
						{selectedSpy.isRevealed && <span className='text-red-400'>(revealed)</span>}
					</div>

					{/* Cancel move button for moving spy */}
					{selectedSpy.isOwn && selectedSpy.targetTileId && mode === 'default' && (
						<button
							onClick={onCancelSpyMove}
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
