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
			<DialogContent className="sm:max-w-sm" showCloseButton={false}>
				<DialogHeader>
					<DialogTitle className="text-center text-xl font-bold uppercase tracking-wider text-[var(--accent)]">
						Game Paused
					</DialogTitle>
				</DialogHeader>

				<div className="text-center space-y-4">
					<p className="text-sm text-[var(--text-muted)]">
						{isOwnPause ? 'You paused the game' : `${pausedByUsername} paused the game`}
					</p>

					<div className="text-3xl font-bold text-white">
						{formatTime(timeRemaining)}
					</div>

					<p className="text-xs text-[var(--text-faint)]">remaining in pause budget</p>

					{/* Progress bar */}
					<div className="h-2 w-full overflow-hidden bg-[var(--bg-raised)]">
						<div
							className="h-full bg-[var(--accent)] transition-all duration-1000"
							style={{ width: `${progress}%` }}
						/>
					</div>

					{isOwnPause ? (
						<Button onClick={onUnpause} className="w-full">
							Resume Game
						</Button>
					) : (
						<p className="text-sm text-[var(--text-faint)]">
							Waiting for {pausedByUsername} to resume...
						</p>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
