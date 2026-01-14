import { Button } from '@/ui/_shadcn/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/ui/_shadcn/dialog';

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
		<Dialog open={true} onOpenChange={() => {}}>
			<DialogContent className="sm:max-w-sm bg-zinc-950 border-zinc-800" showCloseButton={false}>
				<DialogHeader>
					<DialogTitle className="text-center text-xl font-bold text-primary">
						Game Paused
					</DialogTitle>
				</DialogHeader>

				<div className="text-center space-y-4">
					<p className="text-sm text-zinc-400">
						{isOwnPause ? 'You paused the game' : `${pausedByUsername} paused the game`}
					</p>

					<div className="text-3xl font-bold text-white">
						{formatTime(timeRemaining)}
					</div>

					<p className="text-xs text-zinc-500">remaining in pause budget</p>

					{/* Progress bar */}
					<div className="h-2 w-full overflow-hidden rounded-full bg-zinc-800">
						<div
							className="h-full bg-primary rounded-full transition-all duration-1000"
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
			</DialogContent>
		</Dialog>
	);
}
