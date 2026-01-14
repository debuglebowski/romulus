// Victory condition and elimination logic functions extracted for testability

export type EliminationReason = 'capitalCaptured' | 'debt' | 'forfeit';

export const VALID_ELIMINATION_REASONS: EliminationReason[] = [
	'capitalCaptured',
	'debt',
	'forfeit',
];

export function calculateFinishPosition(activePlayerCount: number): number {
	return activePlayerCount;
}

export function calculateTimeLasted(gameStartTime: number, eliminationTime: number): number {
	return eliminationTime - gameStartTime;
}

export function shouldGameEnd(activePlayersBeforeElimination: number): boolean {
	return activePlayersBeforeElimination === 2;
}

export function calculateWinnerPosition(): number {
	return 1;
}

export function isPlayerEliminated(eliminatedAt: number | undefined): boolean {
	return eliminatedAt !== undefined;
}

export function calculateGamesPlayed(currentGamesPlayed: number | undefined): number {
	return (currentGamesPlayed || 0) + 1;
}

export function calculateWins(currentWins: number | undefined): number {
	return (currentWins || 0) + 1;
}

export function calculateTimePlayed(
	currentTimePlayed: number | undefined,
	timeLasted: number,
): number {
	return (currentTimePlayed || 0) + timeLasted;
}

export function isWinningPosition(position: number): boolean {
	return position === 1;
}
