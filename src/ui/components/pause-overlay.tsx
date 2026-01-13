import { Button } from '@/ui/_shadcn/button';

type PauseOverlayProps = {
	pausedByUsername: string;
	timeRemaining: number;
	budgetTotal: number;
	isOwnPause: boolean;
	onUnpause: () => void;
};

function formatTime(ms: number): string {
	if (ms <= 0) {
		return '0s';
	}
	const seconds = Math.ceil(ms / 1000);
	return `${seconds}s`;
}

export function PauseOverlay({
	pausedByUsername,
	timeRemaining,
	budgetTotal,
	isOwnPause,
	onUnpause,
}: PauseOverlayProps) {
	const progress = budgetTotal > 0 ? Math.max(0, (timeRemaining / budgetTotal) * 100) : 0;

	return (
		<div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70">
			<div className="w-full max-w-sm rounded-lg border border-zinc-800 bg-zinc-900 p-6 text-center">
				<h2 className="mb-2 text-xl font-bold uppercase tracking-wider text-amber-400">
					Game Paused
				</h2>

				<p className="mb-4 text-sm text-zinc-400">
					{isOwnPause ? 'You paused the game' : `${pausedByUsername} paused the game`}
				</p>

				<div className="mb-2 text-3xl font-bold text-white">
					{formatTime(timeRemaining)}
				</div>

				<p className="mb-4 text-xs text-zinc-500">remaining in pause budget</p>

				{/* Progress bar */}
				<div className="mb-6 h-2 w-full overflow-hidden rounded bg-zinc-700">
					<div
						className="h-full bg-amber-500 transition-all duration-1000"
						style={{ width: `${progress}%` }}
					/>
				</div>

				{isOwnPause ? (
					<Button onClick={onUnpause} className="w-full">
						Resume Game
					</Button>
				) : (
					<p className="text-sm text-zinc-500">
						Waiting for {pausedByUsername} to resume...
					</p>
				)}
			</div>
		</div>
	);
}
