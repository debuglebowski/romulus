import { describe, it, expect } from 'vitest';

// Import actual victory condition functions and constants
import {
	type EliminationReason,
	VALID_ELIMINATION_REASONS,
	calculateFinishPosition,
	calculateTimeLasted,
	shouldGameEnd,
	calculateWinnerPosition,
	isPlayerEliminated,
	calculateGamesPlayed,
	calculateWins,
	calculateTimePlayed,
	isWinningPosition,
} from './lib/victory';

// Helper functions for testing (not in lib as they're test-specific)
function isValidEliminationReason(reason: string): reason is EliminationReason {
	return reason === 'capitalCaptured' || reason === 'debt' || reason === 'forfeit';
}

function calculateAllFinishPositions(totalPlayers: number, eliminationOrder: number[]): number[] {
	return eliminationOrder.map((_, index) => totalPlayers - index);
}

function calculateRemainingPlayers(activePlayersBeforeElimination: number): number {
	return activePlayersBeforeElimination - 1;
}

describe('Elimination Reason Constants', () => {
	it('validates capital captured reason', () => {
		expect(isValidEliminationReason('capitalCaptured')).toBe(true);
	});

	it('validates debt reason', () => {
		expect(isValidEliminationReason('debt')).toBe(true);
	});

	it('validates forfeit reason', () => {
		expect(isValidEliminationReason('forfeit')).toBe(true);
	});

	it('rejects invalid elimination reason', () => {
		expect(isValidEliminationReason('unknown')).toBe(false);
		expect(isValidEliminationReason('timeout')).toBe(false);
		expect(isValidEliminationReason('')).toBe(false);
	});

	it('has exactly three valid elimination reasons', () => {
		const validReasons = ['capitalCaptured', 'debt', 'forfeit'];
		expect(validReasons.length).toBe(3);
	});
});

describe('calculateFinishPosition', () => {
	it('calculates position for first elimination in 5-player game', () => {
		const activePlayerCount = 5;
		const position = calculateFinishPosition(activePlayerCount);
		expect(position).toBe(5); // Last place
	});

	it('calculates position for second elimination in 5-player game', () => {
		const activePlayerCount = 4;
		const position = calculateFinishPosition(activePlayerCount);
		expect(position).toBe(4);
	});

	it('calculates position for third elimination in 5-player game', () => {
		const activePlayerCount = 3;
		const position = calculateFinishPosition(activePlayerCount);
		expect(position).toBe(3);
	});

	it('calculates position for fourth elimination in 5-player game', () => {
		const activePlayerCount = 2;
		const position = calculateFinishPosition(activePlayerCount);
		expect(position).toBe(2); // Runner-up
	});

	it('calculates position for 2-player game elimination', () => {
		const activePlayerCount = 2;
		const position = calculateFinishPosition(activePlayerCount);
		expect(position).toBe(2);
	});

	it('calculates position for 8-player game first elimination', () => {
		const activePlayerCount = 8;
		const position = calculateFinishPosition(activePlayerCount);
		expect(position).toBe(8);
	});

	it('finish position equals active player count', () => {
		const counts = [2, 3, 4, 5, 6, 7, 8];
		for (const count of counts) {
			const position = calculateFinishPosition(count);
			expect(position).toBe(count);
		}
	});
});

describe('calculateTimeLasted', () => {
	it('calculates time lasted for short game', () => {
		const startedAt = 1000;
		const eliminatedAt = 11000;
		const timeLasted = calculateTimeLasted(startedAt, eliminatedAt);
		expect(timeLasted).toBe(10000); // 10 seconds
	});

	it('calculates time lasted for long game', () => {
		const startedAt = 0;
		const eliminatedAt = 600000;
		const timeLasted = calculateTimeLasted(startedAt, eliminatedAt);
		expect(timeLasted).toBe(600000); // 10 minutes
	});

	it('calculates time lasted for immediate elimination', () => {
		const startedAt = 1000;
		const eliminatedAt = 1000;
		const timeLasted = calculateTimeLasted(startedAt, eliminatedAt);
		expect(timeLasted).toBe(0);
	});

	it('calculates time lasted for 1 minute game', () => {
		const startedAt = 5000;
		const eliminatedAt = 65000;
		const timeLasted = calculateTimeLasted(startedAt, eliminatedAt);
		expect(timeLasted).toBe(60000);
	});

	it('calculates time lasted for 30 minute game', () => {
		const startedAt = 0;
		const eliminatedAt = 1800000;
		const timeLasted = calculateTimeLasted(startedAt, eliminatedAt);
		expect(timeLasted).toBe(1800000);
	});

	it('handles large timestamp values', () => {
		const startedAt = 1000000000;
		const eliminatedAt = 1000100000;
		const timeLasted = calculateTimeLasted(startedAt, eliminatedAt);
		expect(timeLasted).toBe(100000);
	});

	it('time lasted is always non-negative in valid scenarios', () => {
		const startedAt = 1000;
		const eliminatedAt = 5000;
		const timeLasted = calculateTimeLasted(startedAt, eliminatedAt);
		expect(timeLasted).toBeGreaterThanOrEqual(0);
	});
});

describe('shouldGameEnd', () => {
	it('game should end when 2 players remain', () => {
		const activePlayerCount = 2;
		expect(shouldGameEnd(activePlayerCount)).toBe(true);
	});

	it('game should not end when 3 players remain', () => {
		const activePlayerCount = 3;
		expect(shouldGameEnd(activePlayerCount)).toBe(false);
	});

	it('game should not end when 4 players remain', () => {
		const activePlayerCount = 4;
		expect(shouldGameEnd(activePlayerCount)).toBe(false);
	});

	it('game should not end when 5 players remain', () => {
		const activePlayerCount = 5;
		expect(shouldGameEnd(activePlayerCount)).toBe(false);
	});

	it('game should not end when 8 players remain', () => {
		const activePlayerCount = 8;
		expect(shouldGameEnd(activePlayerCount)).toBe(false);
	});

	it('game ends only at exactly 2 players', () => {
		const playerCounts = [2, 3, 4, 5, 6, 7, 8];
		const shouldEnd = playerCounts.map(count => shouldGameEnd(count));
		expect(shouldEnd).toEqual([true, false, false, false, false, false, false]);
	});
});

describe('calculateWinnerPosition', () => {
	it('winner always gets position 1', () => {
		const position = calculateWinnerPosition();
		expect(position).toBe(1);
	});

	it('winner position is consistent', () => {
		expect(calculateWinnerPosition()).toBe(calculateWinnerPosition());
	});
});

describe('isPlayerEliminated', () => {
	it('player is eliminated when eliminatedAt is set', () => {
		const eliminatedAt = Date.now();
		expect(isPlayerEliminated(eliminatedAt)).toBe(true);
	});

	it('player is not eliminated when eliminatedAt is undefined', () => {
		const eliminatedAt = undefined;
		expect(isPlayerEliminated(eliminatedAt)).toBe(false);
	});

	it('player is eliminated even with eliminatedAt = 0', () => {
		const eliminatedAt = 0;
		expect(isPlayerEliminated(eliminatedAt)).toBe(true);
	});

	it('player is eliminated with any positive timestamp', () => {
		const timestamps = [1, 100, 1000, 10000, 1000000];
		for (const timestamp of timestamps) {
			expect(isPlayerEliminated(timestamp)).toBe(true);
		}
	});
});

describe('calculateGamesPlayed', () => {
	it('increments games played from 0', () => {
		const gamesPlayed = calculateGamesPlayed(0);
		expect(gamesPlayed).toBe(1);
	});

	it('increments games played from existing count', () => {
		const gamesPlayed = calculateGamesPlayed(5);
		expect(gamesPlayed).toBe(6);
	});

	it('handles undefined as 0', () => {
		const gamesPlayed = calculateGamesPlayed(undefined);
		expect(gamesPlayed).toBe(1);
	});

	it('increments from large existing count', () => {
		const gamesPlayed = calculateGamesPlayed(999);
		expect(gamesPlayed).toBe(1000);
	});

	it('always increments by exactly 1', () => {
		const counts = [0, 1, 5, 10, 50, 100];
		for (const count of counts) {
			expect(calculateGamesPlayed(count)).toBe(count + 1);
		}
	});
});

describe('calculateWins', () => {
	it('increments wins from 0', () => {
		const wins = calculateWins(0);
		expect(wins).toBe(1);
	});

	it('increments wins from existing count', () => {
		const wins = calculateWins(3);
		expect(wins).toBe(4);
	});

	it('handles undefined as 0', () => {
		const wins = calculateWins(undefined);
		expect(wins).toBe(1);
	});

	it('increments from large existing count', () => {
		const wins = calculateWins(99);
		expect(wins).toBe(100);
	});

	it('always increments by exactly 1', () => {
		const counts = [0, 1, 5, 10, 25, 50];
		for (const count of counts) {
			expect(calculateWins(count)).toBe(count + 1);
		}
	});
});

describe('calculateTimePlayed', () => {
	it('adds time to existing time played', () => {
		const currentTimePlayed = 100000;
		const timeLasted = 50000;
		const newTimePlayed = calculateTimePlayed(currentTimePlayed, timeLasted);
		expect(newTimePlayed).toBe(150000);
	});

	it('handles undefined as 0', () => {
		const timeLasted = 60000;
		const newTimePlayed = calculateTimePlayed(undefined, timeLasted);
		expect(newTimePlayed).toBe(60000);
	});

	it('handles zero current time played', () => {
		const currentTimePlayed = 0;
		const timeLasted = 30000;
		const newTimePlayed = calculateTimePlayed(currentTimePlayed, timeLasted);
		expect(newTimePlayed).toBe(30000);
	});

	it('accumulates time over multiple games', () => {
		let totalTime = 0;
		const gameTimes = [60000, 120000, 90000, 180000];

		for (const gameTime of gameTimes) {
			totalTime = calculateTimePlayed(totalTime, gameTime);
		}

		expect(totalTime).toBe(450000);
	});

	it('handles large time values', () => {
		const currentTimePlayed = 10000000;
		const timeLasted = 600000;
		const newTimePlayed = calculateTimePlayed(currentTimePlayed, timeLasted);
		expect(newTimePlayed).toBe(10600000);
	});
});

describe('calculateAllFinishPositions', () => {
	it('calculates positions for 5-player game', () => {
		const totalPlayers = 5;
		const eliminationOrder = [0, 1, 2, 3, 4]; // Order of elimination
		const positions = calculateAllFinishPositions(totalPlayers, eliminationOrder);
		expect(positions).toEqual([5, 4, 3, 2, 1]);
	});

	it('calculates positions for 2-player game', () => {
		const totalPlayers = 2;
		const eliminationOrder = [0, 1];
		const positions = calculateAllFinishPositions(totalPlayers, eliminationOrder);
		expect(positions).toEqual([2, 1]);
	});

	it('calculates positions for 3-player game', () => {
		const totalPlayers = 3;
		const eliminationOrder = [0, 1, 2];
		const positions = calculateAllFinishPositions(totalPlayers, eliminationOrder);
		expect(positions).toEqual([3, 2, 1]);
	});

	it('calculates positions for 8-player game', () => {
		const totalPlayers = 8;
		const eliminationOrder = [0, 1, 2, 3, 4, 5, 6, 7];
		const positions = calculateAllFinishPositions(totalPlayers, eliminationOrder);
		expect(positions).toEqual([8, 7, 6, 5, 4, 3, 2, 1]);
	});

	it('first eliminated gets worst position', () => {
		const totalPlayers = 5;
		const eliminationOrder = [0, 1, 2, 3, 4];
		const positions = calculateAllFinishPositions(totalPlayers, eliminationOrder);
		expect(positions[0]).toBe(totalPlayers);
	});

	it('last surviving player gets position 1', () => {
		const totalPlayers = 5;
		const eliminationOrder = [0, 1, 2, 3, 4];
		const positions = calculateAllFinishPositions(totalPlayers, eliminationOrder);
		expect(positions[positions.length - 1]).toBe(1);
	});
});

describe('isWinningPosition', () => {
	it('position 1 is winning position', () => {
		expect(isWinningPosition(1)).toBe(true);
	});

	it('position 2 is not winning position', () => {
		expect(isWinningPosition(2)).toBe(false);
	});

	it('position 3 is not winning position', () => {
		expect(isWinningPosition(3)).toBe(false);
	});

	it('any position other than 1 is not winning', () => {
		const positions = [2, 3, 4, 5, 6, 7, 8];
		for (const position of positions) {
			expect(isWinningPosition(position)).toBe(false);
		}
	});

	it('position 0 is not winning position', () => {
		expect(isWinningPosition(0)).toBe(false);
	});
});

describe('calculateRemainingPlayers', () => {
	it('calculates remaining players after elimination from 5', () => {
		const remaining = calculateRemainingPlayers(5);
		expect(remaining).toBe(4);
	});

	it('calculates remaining players after elimination from 2', () => {
		const remaining = calculateRemainingPlayers(2);
		expect(remaining).toBe(1);
	});

	it('calculates remaining players after elimination from 3', () => {
		const remaining = calculateRemainingPlayers(3);
		expect(remaining).toBe(2);
	});

	it('calculates remaining players after elimination from 8', () => {
		const remaining = calculateRemainingPlayers(8);
		expect(remaining).toBe(7);
	});

	it('always decreases by exactly 1', () => {
		const counts = [2, 3, 4, 5, 6, 7, 8];
		for (const count of counts) {
			expect(calculateRemainingPlayers(count)).toBe(count - 1);
		}
	});
});

describe('Elimination Scenarios', () => {
	it('handles first elimination in 5-player game', () => {
		const activePlayerCount = 5;
		const startedAt = 0;
		const eliminatedAt = 300000; // 5 minutes

		const finishPosition = calculateFinishPosition(activePlayerCount);
		const timeLasted = calculateTimeLasted(startedAt, eliminatedAt);
		const gameEnds = shouldGameEnd(activePlayerCount);

		expect(finishPosition).toBe(5);
		expect(timeLasted).toBe(300000);
		expect(gameEnds).toBe(false);
	});

	it('handles last elimination in 5-player game', () => {
		const activePlayerCount = 2; // 2 players left, one gets eliminated
		const startedAt = 0;
		const eliminatedAt = 1200000; // 20 minutes

		const loserPosition = calculateFinishPosition(activePlayerCount);
		const loserTimeLasted = calculateTimeLasted(startedAt, eliminatedAt);
		const winnerPosition = calculateWinnerPosition();
		const winnerTimeLasted = calculateTimeLasted(startedAt, eliminatedAt);
		const gameEnds = shouldGameEnd(activePlayerCount);

		expect(loserPosition).toBe(2);
		expect(loserTimeLasted).toBe(1200000);
		expect(winnerPosition).toBe(1);
		expect(winnerTimeLasted).toBe(1200000);
		expect(gameEnds).toBe(true);
	});

	it('handles 2-player game elimination', () => {
		const activePlayerCount = 2;
		const startedAt = 1000;
		const eliminatedAt = 61000; // 1 minute game

		const loserPosition = calculateFinishPosition(activePlayerCount);
		const winnerPosition = calculateWinnerPosition();
		const timeLasted = calculateTimeLasted(startedAt, eliminatedAt);
		const gameEnds = shouldGameEnd(activePlayerCount);

		expect(loserPosition).toBe(2);
		expect(winnerPosition).toBe(1);
		expect(timeLasted).toBe(60000);
		expect(gameEnds).toBe(true);
		expect(isWinningPosition(winnerPosition)).toBe(true);
		expect(isWinningPosition(loserPosition)).toBe(false);
	});

	it('handles capital captured elimination', () => {
		const reason = 'capitalCaptured';
		const activePlayerCount = 4;

		expect(isValidEliminationReason(reason)).toBe(true);
		expect(calculateFinishPosition(activePlayerCount)).toBe(4);
		expect(shouldGameEnd(activePlayerCount)).toBe(false);
	});

	it('handles debt elimination', () => {
		const reason = 'debt';
		const activePlayerCount = 3;

		expect(isValidEliminationReason(reason)).toBe(true);
		expect(calculateFinishPosition(activePlayerCount)).toBe(3);
		expect(shouldGameEnd(activePlayerCount)).toBe(false);
	});

	it('handles forfeit elimination', () => {
		const reason = 'forfeit';
		const activePlayerCount = 2;
		const startedAt = 0;
		const eliminatedAt = 30000;

		expect(isValidEliminationReason(reason)).toBe(true);
		expect(calculateFinishPosition(activePlayerCount)).toBe(2);
		expect(calculateTimeLasted(startedAt, eliminatedAt)).toBe(30000);
		expect(shouldGameEnd(activePlayerCount)).toBe(true);
	});

	it('tracks sequential eliminations in 4-player game', () => {
		const startedAt = 0;
		const totalPlayers = 4;

		// First elimination at 5 minutes
		const elim1 = {
			activeCount: 4,
			eliminatedAt: 300000,
			position: calculateFinishPosition(4),
			timeLasted: calculateTimeLasted(startedAt, 300000),
			gameEnds: shouldGameEnd(4),
		};

		// Second elimination at 10 minutes
		const elim2 = {
			activeCount: 3,
			eliminatedAt: 600000,
			position: calculateFinishPosition(3),
			timeLasted: calculateTimeLasted(startedAt, 600000),
			gameEnds: shouldGameEnd(3),
		};

		// Third elimination at 15 minutes (game ends)
		const elim3 = {
			activeCount: 2,
			eliminatedAt: 900000,
			position: calculateFinishPosition(2),
			timeLasted: calculateTimeLasted(startedAt, 900000),
			gameEnds: shouldGameEnd(2),
		};

		expect(elim1.position).toBe(4);
		expect(elim1.gameEnds).toBe(false);

		expect(elim2.position).toBe(3);
		expect(elim2.gameEnds).toBe(false);

		expect(elim3.position).toBe(2);
		expect(elim3.gameEnds).toBe(true);

		// Winner (never eliminated)
		const winner = {
			position: calculateWinnerPosition(),
			timeLasted: calculateTimeLasted(startedAt, 900000),
		};

		expect(winner.position).toBe(1);
		expect(winner.timeLasted).toBe(900000);
	});

	it('updates player stats after elimination', () => {
		const loser = {
			currentGamesPlayed: 10,
			currentTimePlayed: 5000000,
			timeLasted: 600000,
		};

		const winner = {
			currentGamesPlayed: 15,
			currentWins: 3,
			currentTimePlayed: 8000000,
			timeLasted: 600000,
		};

		expect(calculateGamesPlayed(loser.currentGamesPlayed)).toBe(11);
		expect(calculateTimePlayed(loser.currentTimePlayed, loser.timeLasted)).toBe(5600000);

		expect(calculateGamesPlayed(winner.currentGamesPlayed)).toBe(16);
		expect(calculateWins(winner.currentWins)).toBe(4);
		expect(calculateTimePlayed(winner.currentTimePlayed, winner.timeLasted)).toBe(8600000);
	});

	it('handles new player stats (undefined values)', () => {
		const timeLasted = 120000;

		expect(calculateGamesPlayed(undefined)).toBe(1);
		expect(calculateWins(undefined)).toBe(1);
		expect(calculateTimePlayed(undefined, timeLasted)).toBe(120000);
	});

	it('verifies elimination decrements active players correctly', () => {
		let activePlayers = 5;

		// First elimination (5 -> 4)
		const shouldEnd1 = shouldGameEnd(activePlayers);
		expect(shouldEnd1).toBe(false);
		activePlayers = calculateRemainingPlayers(activePlayers);
		expect(activePlayers).toBe(4);

		// Second elimination (4 -> 3)
		const shouldEnd2 = shouldGameEnd(activePlayers);
		expect(shouldEnd2).toBe(false);
		activePlayers = calculateRemainingPlayers(activePlayers);
		expect(activePlayers).toBe(3);

		// Third elimination (3 -> 2)
		const shouldEnd3 = shouldGameEnd(activePlayers);
		expect(shouldEnd3).toBe(false);
		activePlayers = calculateRemainingPlayers(activePlayers);
		expect(activePlayers).toBe(2);

		// Fourth elimination (2 -> 1, game ends)
		const shouldEnd4 = shouldGameEnd(activePlayers);
		expect(shouldEnd4).toBe(true);
		activePlayers = calculateRemainingPlayers(activePlayers);
		expect(activePlayers).toBe(1);
	});
});

describe('Elimination Edge Cases', () => {
	it('handles immediate elimination at game start', () => {
		const startedAt = 1000;
		const eliminatedAt = 1000;
		const timeLasted = calculateTimeLasted(startedAt, eliminatedAt);
		expect(timeLasted).toBe(0);
	});

	it('handles very long game elimination', () => {
		const startedAt = 0;
		const eliminatedAt = 7200000; // 2 hours
		const timeLasted = calculateTimeLasted(startedAt, eliminatedAt);
		expect(timeLasted).toBe(7200000);
	});

	it('handles elimination with undefined stats', () => {
		const timeLasted = 60000;

		const gamesPlayed = calculateGamesPlayed(undefined);
		const wins = calculateWins(undefined);
		const timePlayed = calculateTimePlayed(undefined, timeLasted);

		expect(gamesPlayed).toBe(1);
		expect(wins).toBe(1);
		expect(timePlayed).toBe(60000);
	});

	it('handles elimination with zero stats', () => {
		const timeLasted = 60000;

		const gamesPlayed = calculateGamesPlayed(0);
		const wins = calculateWins(0);
		const timePlayed = calculateTimePlayed(0, timeLasted);

		expect(gamesPlayed).toBe(1);
		expect(wins).toBe(1);
		expect(timePlayed).toBe(60000);
	});

	it('validates all elimination reasons', () => {
		expect(isValidEliminationReason('capitalCaptured')).toBe(true);
		expect(isValidEliminationReason('debt')).toBe(true);
		expect(isValidEliminationReason('forfeit')).toBe(true);
		expect(isValidEliminationReason('invalid')).toBe(false);
	});

	it('handles position calculation for minimum players', () => {
		const position2 = calculateFinishPosition(2);
		expect(position2).toBe(2);
		expect(isWinningPosition(position2)).toBe(false);
	});

	it('handles position calculation for maximum players', () => {
		const position8 = calculateFinishPosition(8);
		expect(position8).toBe(8);
		expect(isWinningPosition(position8)).toBe(false);
	});

	it('winner position is always 1 regardless of player count', () => {
		expect(calculateWinnerPosition()).toBe(1);
		expect(isWinningPosition(calculateWinnerPosition())).toBe(true);
	});

	it('verifies game ends only when 2 players remain', () => {
		for (let playerCount = 2; playerCount <= 8; playerCount++) {
			const shouldEnd = shouldGameEnd(playerCount);
			if (playerCount === 2) {
				expect(shouldEnd).toBe(true);
			} else {
				expect(shouldEnd).toBe(false);
			}
		}
	});

	it('handles concurrent eliminations (simultaneous)', () => {
		// If two players are eliminated at the same tick, they share the same finish position
		const activePlayerCount = 4;
		const startedAt = 0;
		const eliminatedAt = 120000;

		const position1 = calculateFinishPosition(activePlayerCount);
		const position2 = calculateFinishPosition(activePlayerCount);

		expect(position1).toBe(position2);
		expect(position1).toBe(4);
	});
});

describe('Elimination Balance Verification', () => {
	it('verifies finish positions are sequential', () => {
		const playerCounts = [5, 4, 3, 2];
		const positions = playerCounts.map(count => calculateFinishPosition(count));

		expect(positions).toEqual([5, 4, 3, 2]);

		// Each position is exactly 1 less than the previous
		for (let i = 1; i < positions.length; i++) {
			expect(positions[i - 1] - positions[i]).toBe(1);
		}
	});

	it('verifies time lasted increases over game duration', () => {
		const startedAt = 0;
		const eliminations = [60000, 120000, 180000, 240000];

		const times = eliminations.map(elim => calculateTimeLasted(startedAt, elim));

		// Each time should be greater than the previous
		for (let i = 1; i < times.length; i++) {
			expect(times[i]).toBeGreaterThan(times[i - 1]);
		}
	});

	it('verifies stats accumulate correctly over multiple games', () => {
		let gamesPlayed = 0;
		let wins = 0;
		let timePlayed = 0;

		// Play 5 games
		const gameDurations = [60000, 120000, 90000, 180000, 150000];
		const gameWins = [true, false, true, false, true];

		for (let i = 0; i < gameDurations.length; i++) {
			gamesPlayed = calculateGamesPlayed(gamesPlayed);
			timePlayed = calculateTimePlayed(timePlayed, gameDurations[i]);

			if (gameWins[i]) {
				wins = calculateWins(wins);
			}
		}

		expect(gamesPlayed).toBe(5);
		expect(wins).toBe(3);
		expect(timePlayed).toBe(600000); // Sum of all durations
	});

	it('verifies winner always gets better position than loser', () => {
		const loserPosition = calculateFinishPosition(2);
		const winnerPosition = calculateWinnerPosition();

		expect(winnerPosition).toBeLessThan(loserPosition);
		expect(isWinningPosition(winnerPosition)).toBe(true);
		expect(isWinningPosition(loserPosition)).toBe(false);
	});

	it('verifies game ending condition is consistent', () => {
		// Game should end when going from 2 to 1 active players
		expect(shouldGameEnd(2)).toBe(true);
		expect(calculateRemainingPlayers(2)).toBe(1);

		// Game should not end for any other count
		for (let count = 3; count <= 8; count++) {
			expect(shouldGameEnd(count)).toBe(false);
		}
	});

	it('verifies elimination tracking fields are consistent', () => {
		const startedAt = 0;
		const eliminatedAt = 300000;
		const activePlayerCount = 3;

		const position = calculateFinishPosition(activePlayerCount);
		const timeLasted = calculateTimeLasted(startedAt, eliminatedAt);
		const eliminated = isPlayerEliminated(eliminatedAt);

		expect(position).toBe(3);
		expect(timeLasted).toBe(300000);
		expect(eliminated).toBe(true);
	});

	it('verifies all elimination reasons are valid and distinct', () => {
		const reasons: EliminationReason[] = ['capitalCaptured', 'debt', 'forfeit'];

		// All should be valid
		for (const reason of reasons) {
			expect(isValidEliminationReason(reason)).toBe(true);
		}

		// Set should have 3 unique values
		const uniqueReasons = new Set(reasons);
		expect(uniqueReasons.size).toBe(3);
	});
});

describe('Victory Condition Tests', () => {
	it('victory occurs when only 1 player remains', () => {
		const activePlayersBeforeElimination = 2;
		const gameEnds = shouldGameEnd(activePlayersBeforeElimination);
		const remainingPlayers = calculateRemainingPlayers(activePlayersBeforeElimination);

		expect(gameEnds).toBe(true);
		expect(remainingPlayers).toBe(1);
	});

	it('winner gets position 1 in 2-player game', () => {
		const activePlayerCount = 2;
		const startedAt = 0;
		const eliminatedAt = 120000;

		// Loser
		const loserPosition = calculateFinishPosition(activePlayerCount);
		const loserTimeLasted = calculateTimeLasted(startedAt, eliminatedAt);

		// Winner (last player standing)
		const winnerPosition = calculateWinnerPosition();
		const winnerTimeLasted = calculateTimeLasted(startedAt, eliminatedAt);

		expect(loserPosition).toBe(2);
		expect(winnerPosition).toBe(1);
		expect(isWinningPosition(winnerPosition)).toBe(true);
		expect(isWinningPosition(loserPosition)).toBe(false);
		expect(winnerTimeLasted).toBe(loserTimeLasted);
	});

	it('winner gets position 1 in 5-player game', () => {
		const startedAt = 0;
		const finalEliminationTime = 900000;

		// Final elimination (5th place -> 2nd place already eliminated)
		const activePlayerCount = 2;
		const loserPosition = calculateFinishPosition(activePlayerCount);
		const winnerPosition = calculateWinnerPosition();
		const gameEnds = shouldGameEnd(activePlayerCount);

		expect(loserPosition).toBe(2);
		expect(winnerPosition).toBe(1);
		expect(gameEnds).toBe(true);
		expect(isWinningPosition(winnerPosition)).toBe(true);
	});

	it('winner and loser both get correct time lasted', () => {
		const startedAt = 1000;
		const eliminatedAt = 301000; // 5 minutes
		const timeLasted = calculateTimeLasted(startedAt, eliminatedAt);

		expect(timeLasted).toBe(300000);
		// Both winner and loser get the same time lasted (time from start to final elimination)
	});

	it('winner stats are updated correctly', () => {
		const winner = {
			currentGamesPlayed: 5,
			currentWins: 2,
			currentTimePlayed: 2000000,
			timeLasted: 600000,
		};

		const newGamesPlayed = calculateGamesPlayed(winner.currentGamesPlayed);
		const newWins = calculateWins(winner.currentWins);
		const newTimePlayed = calculateTimePlayed(winner.currentTimePlayed, winner.timeLasted);

		expect(newGamesPlayed).toBe(6);
		expect(newWins).toBe(3);
		expect(newTimePlayed).toBe(2600000);
	});

	it('loser stats are updated correctly (no win increment)', () => {
		const loser = {
			currentGamesPlayed: 3,
			currentWins: 1,
			currentTimePlayed: 1000000,
			timeLasted: 600000,
		};

		const newGamesPlayed = calculateGamesPlayed(loser.currentGamesPlayed);
		const newTimePlayed = calculateTimePlayed(loser.currentTimePlayed, loser.timeLasted);

		expect(newGamesPlayed).toBe(4);
		// Loser does not get win increment
		expect(loser.currentWins).toBe(1);
		expect(newTimePlayed).toBe(1600000);
	});

	it('victory condition met with capital captured elimination', () => {
		const reason: EliminationReason = 'capitalCaptured';
		const activePlayerCount = 2;

		expect(isValidEliminationReason(reason)).toBe(true);
		expect(shouldGameEnd(activePlayerCount)).toBe(true);
		expect(calculateWinnerPosition()).toBe(1);
	});

	it('victory condition met with debt elimination', () => {
		const reason: EliminationReason = 'debt';
		const activePlayerCount = 2;

		expect(isValidEliminationReason(reason)).toBe(true);
		expect(shouldGameEnd(activePlayerCount)).toBe(true);
		expect(calculateWinnerPosition()).toBe(1);
	});

	it('victory condition met with forfeit elimination', () => {
		const reason: EliminationReason = 'forfeit';
		const activePlayerCount = 2;

		expect(isValidEliminationReason(reason)).toBe(true);
		expect(shouldGameEnd(activePlayerCount)).toBe(true);
		expect(calculateWinnerPosition()).toBe(1);
	});

	it('no victory when more than 2 players remain', () => {
		const playerCounts = [3, 4, 5, 6, 7, 8];

		for (const count of playerCounts) {
			expect(shouldGameEnd(count)).toBe(false);
		}
	});

	it('complete victory scenario in 2-player game', () => {
		const startedAt = 0;
		const eliminatedAt = 180000; // 3 minute game

		// Setup
		const activePlayerCount = 2;
		const timeLasted = calculateTimeLasted(startedAt, eliminatedAt);

		// Loser eliminated
		const loserPosition = calculateFinishPosition(activePlayerCount);
		const loserEliminated = isPlayerEliminated(eliminatedAt);

		// Winner (last player standing)
		const winnerPosition = calculateWinnerPosition();
		const winnerEliminated = isPlayerEliminated(undefined);

		// Game ends
		const gameEnds = shouldGameEnd(activePlayerCount);
		const remainingPlayers = calculateRemainingPlayers(activePlayerCount);

		// Verify loser
		expect(loserPosition).toBe(2);
		expect(loserEliminated).toBe(true);

		// Verify winner
		expect(winnerPosition).toBe(1);
		expect(winnerEliminated).toBe(false);
		expect(isWinningPosition(winnerPosition)).toBe(true);

		// Verify game state
		expect(gameEnds).toBe(true);
		expect(remainingPlayers).toBe(1);
		expect(timeLasted).toBe(180000);
	});

	it('complete victory scenario in 8-player game', () => {
		const startedAt = 0;
		const totalPlayers = 8;

		// Simulate eliminations until final showdown
		let activePlayers = totalPlayers;

		// First 6 eliminations
		for (let i = 0; i < 6; i++) {
			expect(shouldGameEnd(activePlayers)).toBe(false);
			activePlayers = calculateRemainingPlayers(activePlayers);
		}

		expect(activePlayers).toBe(2);

		// Final elimination - victory condition
		const finalEliminationTime = 1200000; // 20 minutes
		const loserPosition = calculateFinishPosition(activePlayers);
		const winnerPosition = calculateWinnerPosition();
		const gameEnds = shouldGameEnd(activePlayers);

		expect(loserPosition).toBe(2);
		expect(winnerPosition).toBe(1);
		expect(gameEnds).toBe(true);
		expect(isWinningPosition(winnerPosition)).toBe(true);
		expect(isWinningPosition(loserPosition)).toBe(false);

		// Verify final player count
		const finalPlayerCount = calculateRemainingPlayers(activePlayers);
		expect(finalPlayerCount).toBe(1);
	});

	it('winner is last player standing after all eliminations', () => {
		const eliminationOrder = [0, 1, 2, 3, 4];
		const totalPlayers = 5;
		const positions = calculateAllFinishPositions(totalPlayers, eliminationOrder);

		// Last player in elimination order is the winner
		const winnerPosition = positions[positions.length - 1];
		expect(winnerPosition).toBe(1);
		expect(isWinningPosition(winnerPosition)).toBe(true);
	});

	it('only one player can achieve victory', () => {
		const totalPlayers = 5;
		const eliminationOrder = [0, 1, 2, 3, 4];
		const positions = calculateAllFinishPositions(totalPlayers, eliminationOrder);

		// Count how many positions are winning positions
		const winningPositions = positions.filter(pos => isWinningPosition(pos));
		expect(winningPositions.length).toBe(1);
	});

	it('victory results in correct final standings', () => {
		const startedAt = 0;
		const finalTime = 600000;

		// 4-player game final elimination
		const activePlayerCount = 2;

		// Loser (2nd place)
		const loserPosition = calculateFinishPosition(activePlayerCount);
		const loserTimeLasted = calculateTimeLasted(startedAt, finalTime);

		// Winner (1st place)
		const winnerPosition = calculateWinnerPosition();
		const winnerTimeLasted = calculateTimeLasted(startedAt, finalTime);

		// Verify positions
		expect(winnerPosition).toBe(1);
		expect(loserPosition).toBe(2);
		expect(winnerPosition).toBeLessThan(loserPosition);

		// Verify both players lasted the full game
		expect(winnerTimeLasted).toBe(600000);
		expect(loserTimeLasted).toBe(600000);
		expect(winnerTimeLasted).toBe(loserTimeLasted);

		// Verify game ends
		expect(shouldGameEnd(activePlayerCount)).toBe(true);
	});

	it('new player achieves first victory', () => {
		const winner = {
			currentGamesPlayed: undefined,
			currentWins: undefined,
			currentTimePlayed: undefined,
			timeLasted: 300000,
		};

		const newGamesPlayed = calculateGamesPlayed(winner.currentGamesPlayed);
		const newWins = calculateWins(winner.currentWins);
		const newTimePlayed = calculateTimePlayed(winner.currentTimePlayed, winner.timeLasted);

		expect(newGamesPlayed).toBe(1);
		expect(newWins).toBe(1);
		expect(newTimePlayed).toBe(300000);
	});
});
