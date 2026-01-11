import { IconFlag, IconRoute, IconShield, IconX } from '@tabler/icons-react';
import type { ArmyData, TileData } from './hex-map';

interface ContextPanelProps {
	selectedTile?: TileData;
	selectedArmy?: ArmyData;
	isOwnTile: boolean;
	mode: 'default' | 'move' | 'rally';
	onSetRallyPoint?: () => void;
	onCancelMove?: () => void;
	onCancelSelection?: () => void;
	onSetMoveMode?: () => void;
	onSetRallyMode?: () => void;
}

export function ContextPanel({
	selectedTile,
	selectedArmy,
	isOwnTile,
	mode,
	onSetRallyPoint,
	onCancelMove,
	onCancelSelection,
	onSetMoveMode,
	onSetRallyMode,
}: ContextPanelProps) {
	if (!selectedTile && !selectedArmy) {
		return (
			<div className='rounded-lg border border-zinc-800 bg-zinc-900 p-4'>
				<p className='text-sm text-zinc-500'>Click a tile or army to select</p>
			</div>
		);
	}

	return (
		<div className='rounded-lg border border-zinc-800 bg-zinc-900 p-4 space-y-3'>
			{/* Header with close button */}
			<div className='flex items-center justify-between'>
				<h3 className='font-medium text-white'>
					{selectedArmy ? 'Army' : selectedTile?.type === 'capital' ? 'Capital' : selectedTile?.type === 'city' ? 'City' : 'Territory'}
				</h3>
				<button
					onClick={onCancelSelection}
					className='p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white'
				>
					<IconX size={16} />
				</button>
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

			{/* Army info */}
			{selectedArmy && (
				<div className='flex items-center gap-2 text-sm'>
					<IconShield size={16} className='text-zinc-400' />
					<span className='text-white'>{selectedArmy.count} units</span>
					{selectedArmy.targetTileId && (
						<span className='text-amber-500 text-xs'>(moving)</span>
					)}
				</div>
			)}

			{/* Actions based on mode */}
			<div className='flex flex-col gap-2 pt-2'>
				{mode === 'default' && (
					<>
						{/* Move button for own stationary army */}
						{selectedArmy?.isOwn && !selectedArmy.targetTileId && (
							<button
								onClick={onSetMoveMode}
								className='flex items-center justify-center gap-2 rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700'
							>
								<IconRoute size={16} />
								Move Army
							</button>
						)}

						{/* Cancel move button for moving army */}
						{selectedArmy?.isOwn && selectedArmy.targetTileId && (
							<button
								onClick={onCancelMove}
								className='flex items-center justify-center gap-2 rounded bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700'
							>
								<IconX size={16} />
								Cancel Move
							</button>
						)}

						{/* Rally point button for own tile */}
						{isOwnTile && !selectedArmy && (
							<button
								onClick={onSetRallyMode}
								className='flex items-center justify-center gap-2 rounded bg-green-600 px-3 py-2 text-sm font-medium text-white hover:bg-green-700'
							>
								<IconFlag size={16} />
								Set Rally Point
							</button>
						)}
					</>
				)}

				{mode === 'move' && (
					<div className='space-y-2'>
						<p className='text-sm text-amber-400'>Select destination tile</p>
						<button
							onClick={onCancelSelection}
							className='w-full rounded bg-zinc-700 px-3 py-2 text-sm text-white hover:bg-zinc-600'
						>
							Cancel
						</button>
					</div>
				)}

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
						<button
							onClick={onCancelSelection}
							className='w-full rounded bg-zinc-700 px-3 py-2 text-sm text-white hover:bg-zinc-600'
						>
							Cancel
						</button>
					</div>
				)}
			</div>
		</div>
	);
}
