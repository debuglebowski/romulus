import { IconCoin, IconDoorExit, IconMenu2, IconSettings, IconUsers } from '@tabler/icons-react';
import { useEffect, useState } from 'react';

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/ui/_shadcn/dropdown-menu';

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
	onLeaveGame?: () => void;
	onOpenSettings?: () => void;
}

export function GameStatsBar({
	gold,
	goldRate,
	population,
	popCap,
	startedAt,
	players,
	activePlayers,
	onLeaveGame,
	onOpenSettings,
}: GameStatsBarProps) {
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
		<div className='flex items-center justify-between bg-gray-900 px-4 py-2 text-gray-100'>
			<div className='flex items-center gap-6'>
				<div className='flex items-center gap-2'>
					<IconCoin className='h-4 w-4 text-yellow-500' />
					<span className='font-medium'>{Math.floor(gold)}</span>
					<span className='text-gray-400 text-sm'>(+{goldRate.toFixed(1)}/s)</span>
				</div>
				<div className='flex items-center gap-2'>
					<IconUsers className='h-4 w-4 text-blue-500' />
					<span className='font-medium'>
						{population}/{popCap}
					</span>
				</div>
			</div>

			<div className='flex items-center gap-6'>
				{/* Player indicators */}
				{players && activePlayers !== undefined && (
					<div className='flex items-center gap-2'>
						<div className='flex -space-x-1'>
							{players.map((player) => (
								<div
									key={player._id}
									className='h-5 w-5 rounded-full border-2 border-gray-900'
									style={{
										backgroundColor: player.color,
										opacity: player.eliminatedAt ? 0.3 : 1,
									}}
									title={`${player.username}${player.eliminatedAt ? ' (eliminated)' : ''}`}
								/>
							))}
						</div>
						<span className='text-gray-400 text-sm'>
							{activePlayers}/{players.length}
						</span>
					</div>
				)}

				<div className='font-mono text-gray-400'>{formatTime(elapsed)}</div>

				{/* Hamburger menu */}
				<DropdownMenu>
					<DropdownMenuTrigger className='cursor-pointer outline-none p-1 hover:bg-gray-800 rounded'>
						<IconMenu2 className='h-5 w-5' />
					</DropdownMenuTrigger>
					<DropdownMenuContent align='end' className='w-48'>
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
