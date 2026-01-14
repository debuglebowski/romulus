import { IconDoorExit, IconMenu2, IconPlayerPause, IconSettings, IconUsersGroup, IconUsers } from '@tabler/icons-react';
import { useEffect, useState } from 'react';

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/ui/_shadcn/dropdown-menu';

interface Player {
	_id: string;
	color: string;
	username: string;
	eliminatedAt?: number;
}

interface GameStatsBarProps {
	gold: number;
	goldRate: number;
	population: number;
	popCap: number;
	startedAt: number;
	players?: Player[];
	activePlayers?: number;
	alliedPlayerIds?: string[];
	pendingAllianceCount?: number;
	isPaused?: boolean;
	onLeaveGame?: () => void;
	onOpenSettings?: () => void;
	onOpenAlliances?: () => void;
	onPauseGame?: () => void;
}

export function GameStatsBar({
	gold,
	goldRate,
	population,
	popCap,
	startedAt,
	players,
	activePlayers,
	alliedPlayerIds = [],
	pendingAllianceCount = 0,
	isPaused = false,
	onLeaveGame,
	onOpenSettings,
	onOpenAlliances,
	onPauseGame,
}: GameStatsBarProps) {
	const alliedSet = new Set(alliedPlayerIds);
	const [elapsed, setElapsed] = useState(0);

	useEffect(() => {
		const update = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000));
		update();
		const interval = setInterval(update, 1000);
		return () => clearInterval(interval);
	}, [startedAt]);

	const formatTime = (secs: number) => {
		const m = Math.floor(secs / 60);
		const s = secs % 60;
		return `${m}:${s.toString().padStart(2, '0')}`;
	};

	return (
		<div className='flex items-center justify-between bg-zinc-900 px-4 py-2 text-zinc-100'>
			<div className='flex items-center gap-6'>
				<div className='flex items-center gap-2'>
					<span className='font-semibold text-primary tabular-nums'>{Math.floor(gold)}</span>
					<span className='text-zinc-400 text-sm tabular-nums'>
						({goldRate >= 0 ? '+' : ''}
						{goldRate.toFixed(1)}/s)
					</span>
				</div>
				<div className='flex items-center gap-2'>
					<IconUsers className='h-4 w-4 text-zinc-400' />
					<span className='font-medium tabular-nums'>
						{population}/{popCap}
					</span>
				</div>
			</div>

			<div className='flex items-center gap-6'>
				{/* Player indicators - clickable to open alliances */}
				{players && activePlayers !== undefined && (
					<button
						type='button'
						onClick={onOpenAlliances}
						className='flex items-center gap-2 px-2 py-1 -my-1 rounded hover:bg-zinc-800 cursor-pointer'
						title='Manage alliances'
					>
						<div className='flex -space-x-1'>
							{players.map((player) => {
								const isAlly = alliedSet.has(player._id);
								return (
									<div
										key={player._id}
										className={`h-5 w-5 rounded border-2 ${isAlly ? 'border-primary' : 'border-zinc-700'}`}
										style={{
											backgroundColor: player.color,
											opacity: player.eliminatedAt ? 0.3 : 1,
										}}
										title={`${player.username}${isAlly ? ' (ally)' : ''}${player.eliminatedAt ? ' (eliminated)' : ''}`}
									/>
								);
							})}
						</div>
						<span className='text-zinc-400 text-sm tabular-nums'>
							{activePlayers}/{players.length}
						</span>
						{pendingAllianceCount > 0 && (
							<span className='bg-primary text-white text-[10px] px-1.5 py-0.5 rounded font-semibold tabular-nums'>
								{pendingAllianceCount}
							</span>
						)}
					</button>
				)}

				<div className='font-mono text-zinc-400 tabular-nums'>{formatTime(elapsed)}</div>

				{/* Hamburger menu */}
				<DropdownMenu>
					<DropdownMenuTrigger className='cursor-pointer outline-none p-1 rounded hover:bg-zinc-800'>
						<IconMenu2 className='h-5 w-5' />
					</DropdownMenuTrigger>
					<DropdownMenuContent align='end' className='w-48'>
						{onPauseGame && !isPaused && (
							<DropdownMenuItem onClick={onPauseGame}>
								<IconPlayerPause />
								Pause Game
							</DropdownMenuItem>
						)}
						{onOpenAlliances && (
							<DropdownMenuItem onClick={onOpenAlliances}>
								<IconUsersGroup />
								Alliances
								{pendingAllianceCount > 0 && (
									<span className='ml-auto bg-primary text-white text-[10px] px-1.5 py-0.5 rounded font-semibold tabular-nums'>
										{pendingAllianceCount}
									</span>
								)}
							</DropdownMenuItem>
						)}
						{onOpenSettings && (
							<DropdownMenuItem onClick={onOpenSettings}>
								<IconSettings />
								Settings
							</DropdownMenuItem>
						)}
						{onLeaveGame && (
							<DropdownMenuItem onClick={onLeaveGame} className='text-destructive focus:text-destructive'>
								<IconDoorExit />
								Leave Game
							</DropdownMenuItem>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
			</div>
		</div>
	);
}
