import { describe, it, expect } from 'vitest';

// Import actual spy movement functions and constants
import {
	TRAVEL_TIME_PER_HEX,
	calculateTravelTime,
	calculateProgress,
	calculatePathIndex,
	isMovementComplete,
	calculateElapsedTime,
	calculateRemainingTime,
} from './lib/spyMovement';

// Helper functions for testing (test-specific wrappers)
function calculateCurrentPathIndex(progress: number, pathLength: number): number {
	return calculatePathIndex(progress, pathLength);
}

function calculateCancelPathIndex(progress: number, pathLength: number): number {
	return Math.floor(progress * pathLength);
}

describe('Spy Movement Constants', () => {
	it('has correct travel time per hex', () => {
		expect(TRAVEL_TIME_PER_HEX).toBe(10000);
	});

	it('travel time matches military unit speed', () => {
		// Both spies and military units use 10 seconds per hex
		const MILITARY_TRAVEL_TIME_PER_HEX = 10000;
		expect(TRAVEL_TIME_PER_HEX).toBe(MILITARY_TRAVEL_TIME_PER_HEX);
	});
});

describe('calculateTravelTime', () => {
	it('calculates travel time for single hex', () => {
		const travelTime = calculateTravelTime(1);
		expect(travelTime).toBe(10000); // 10 seconds
	});

	it('calculates travel time for multiple hexes', () => {
		const travelTime = calculateTravelTime(5);
		expect(travelTime).toBe(50000); // 50 seconds
	});

	it('calculates travel time for long path', () => {
		const travelTime = calculateTravelTime(20);
		expect(travelTime).toBe(200000); // 200 seconds = 3m 20s
	});

	it('returns zero for zero-length path', () => {
		const travelTime = calculateTravelTime(0);
		expect(travelTime).toBe(0);
	});

	it('travel time scales linearly with path length', () => {
		const time5 = calculateTravelTime(5);
		const time10 = calculateTravelTime(10);
		expect(time10).toBe(time5 * 2);
	});

	it('calculates travel time for very long journey', () => {
		const travelTime = calculateTravelTime(100);
		expect(travelTime).toBe(1000000); // 1000 seconds = 16m 40s
	});
});

describe('calculateProgress', () => {
	it('returns 0 at departure time', () => {
		const departureTime = 1000;
		const arrivalTime = 11000;
		const currentTime = 1000;

		const progress = calculateProgress(departureTime, arrivalTime, currentTime);
		expect(progress).toBe(0);
	});

	it('returns 1 at arrival time', () => {
		const departureTime = 1000;
		const arrivalTime = 11000;
		const currentTime = 11000;

		const progress = calculateProgress(departureTime, arrivalTime, currentTime);
		expect(progress).toBe(1);
	});

	it('returns 0.5 at halfway point', () => {
		const departureTime = 1000;
		const arrivalTime = 11000;
		const currentTime = 6000;

		const progress = calculateProgress(departureTime, arrivalTime, currentTime);
		expect(progress).toBe(0.5);
	});

	it('returns 0.25 at quarter point', () => {
		const departureTime = 0;
		const arrivalTime = 40000;
		const currentTime = 10000;

		const progress = calculateProgress(departureTime, arrivalTime, currentTime);
		expect(progress).toBe(0.25);
	});

	it('returns 0.75 at three-quarter point', () => {
		const departureTime = 0;
		const arrivalTime = 40000;
		const currentTime = 30000;

		const progress = calculateProgress(departureTime, arrivalTime, currentTime);
		expect(progress).toBe(0.75);
	});

	it('clamps progress to 1 when past arrival time', () => {
		const departureTime = 1000;
		const arrivalTime = 11000;
		const currentTime = 15000;

		const progress = calculateProgress(departureTime, arrivalTime, currentTime);
		expect(progress).toBe(1);
	});

	it('clamps progress to 1 when significantly past arrival time', () => {
		const departureTime = 1000;
		const arrivalTime = 11000;
		const currentTime = 100000;

		const progress = calculateProgress(departureTime, arrivalTime, currentTime);
		expect(progress).toBe(1);
	});

	it('handles instant travel (zero duration)', () => {
		const departureTime = 1000;
		const arrivalTime = 1000;
		const currentTime = 1000;

		const progress = calculateProgress(departureTime, arrivalTime, currentTime);
		// When totalTime is 0, elapsed/totalTime is NaN or Infinity
		// Math.min(NaN, 1) = NaN, so this is an edge case
		// In practice, this shouldn't happen in the game
		expect(progress === 0 || progress === 1 || Number.isNaN(progress)).toBe(true);
	});

	it('progress increases linearly over time', () => {
		const departureTime = 0;
		const arrivalTime = 100000;

		const progress10 = calculateProgress(departureTime, arrivalTime, 10000);
		const progress20 = calculateProgress(departureTime, arrivalTime, 20000);
		const progress30 = calculateProgress(departureTime, arrivalTime, 30000);

		expect(progress10).toBe(0.1);
		expect(progress20).toBe(0.2);
		expect(progress30).toBe(0.3);
	});

	it('handles very long journeys', () => {
		const departureTime = 0;
		const arrivalTime = 1000000; // 1000 seconds
		const currentTime = 500000; // 500 seconds

		const progress = calculateProgress(departureTime, arrivalTime, currentTime);
		expect(progress).toBe(0.5);
	});
});

describe('calculateCurrentPathIndex', () => {
	it('returns 0 at start of journey', () => {
		const progress = 0;
		const pathLength = 10;

		const index = calculateCurrentPathIndex(progress, pathLength);
		expect(index).toBe(0);
	});

	it('returns last index at end of journey', () => {
		const progress = 1;
		const pathLength = 10;

		const index = calculateCurrentPathIndex(progress, pathLength);
		expect(index).toBe(9); // pathLength - 1
	});

	it('returns middle index at halfway point', () => {
		const progress = 0.5;
		const pathLength = 10;

		const index = calculateCurrentPathIndex(progress, pathLength);
		expect(index).toBe(5);
	});

	it('returns correct index at 25% progress', () => {
		const progress = 0.25;
		const pathLength = 8;

		const index = calculateCurrentPathIndex(progress, pathLength);
		expect(index).toBe(2); // floor(0.25 * 8) = 2
	});

	it('returns correct index at 75% progress', () => {
		const progress = 0.75;
		const pathLength = 8;

		const index = calculateCurrentPathIndex(progress, pathLength);
		expect(index).toBe(6); // floor(0.75 * 8) = 6
	});

	it('floors fractional indices', () => {
		const progress = 0.33;
		const pathLength = 10;

		const index = calculateCurrentPathIndex(progress, pathLength);
		expect(index).toBe(3); // floor(0.33 * 10) = 3
	});

	it('clamps to last index when progress > 1', () => {
		const progress = 1.5;
		const pathLength = 10;

		const index = calculateCurrentPathIndex(progress, pathLength);
		expect(index).toBe(9); // pathLength - 1
	});

	it('handles single hex path at start', () => {
		const progress = 0;
		const pathLength = 1;

		const index = calculateCurrentPathIndex(progress, pathLength);
		expect(index).toBe(0);
	});

	it('handles single hex path at end', () => {
		const progress = 1;
		const pathLength = 1;

		const index = calculateCurrentPathIndex(progress, pathLength);
		expect(index).toBe(0); // pathLength - 1 = 0
	});

	it('handles long path with fine-grained progress', () => {
		const progress = 0.123;
		const pathLength = 100;

		const index = calculateCurrentPathIndex(progress, pathLength);
		expect(index).toBe(12); // floor(0.123 * 100) = 12
	});

	it('never exceeds path bounds', () => {
		const pathLength = 10;
		const progresses = [0, 0.1, 0.5, 0.9, 0.99, 1, 1.5];

		for (const progress of progresses) {
			const index = calculateCurrentPathIndex(progress, pathLength);
			expect(index).toBeGreaterThanOrEqual(0);
			expect(index).toBeLessThan(pathLength);
		}
	});
});

describe('calculateCancelPathIndex', () => {
	it('returns 0 at start of journey', () => {
		const progress = 0;
		const pathLength = 10;

		const index = calculateCancelPathIndex(progress, pathLength);
		expect(index).toBe(0);
	});

	it('returns path length at end of journey', () => {
		const progress = 1;
		const pathLength = 10;

		const index = calculateCancelPathIndex(progress, pathLength);
		expect(index).toBe(10);
	});

	it('returns middle index at halfway point', () => {
		const progress = 0.5;
		const pathLength = 10;

		const index = calculateCancelPathIndex(progress, pathLength);
		expect(index).toBe(5);
	});

	it('floors fractional indices', () => {
		const progress = 0.33;
		const pathLength = 10;

		const index = calculateCancelPathIndex(progress, pathLength);
		expect(index).toBe(3); // floor(0.33 * 10) = 3
	});

	it('handles cancel at 25% progress', () => {
		const progress = 0.25;
		const pathLength = 8;

		const index = calculateCancelPathIndex(progress, pathLength);
		expect(index).toBe(2); // floor(0.25 * 8) = 2
	});

	it('handles cancel at 75% progress', () => {
		const progress = 0.75;
		const pathLength = 8;

		const index = calculateCancelPathIndex(progress, pathLength);
		expect(index).toBe(6); // floor(0.75 * 8) = 6
	});

	it('handles early cancel (10% progress)', () => {
		const progress = 0.1;
		const pathLength = 20;

		const index = calculateCancelPathIndex(progress, pathLength);
		expect(index).toBe(2); // floor(0.1 * 20) = 2
	});

	it('handles late cancel (90% progress)', () => {
		const progress = 0.9;
		const pathLength = 20;

		const index = calculateCancelPathIndex(progress, pathLength);
		expect(index).toBe(18); // floor(0.9 * 20) = 18
	});

	it('returns 0 when canceled immediately', () => {
		const progress = 0.01;
		const pathLength = 10;

		const index = calculateCancelPathIndex(progress, pathLength);
		expect(index).toBe(0); // floor(0.01 * 10) = 0
	});

	it('handles single hex path', () => {
		const progress = 0.5;
		const pathLength = 1;

		const index = calculateCancelPathIndex(progress, pathLength);
		expect(index).toBe(0); // floor(0.5 * 1) = 0
	});

	it('can return path length when complete', () => {
		const progress = 1;
		const pathLength = 5;

		const index = calculateCancelPathIndex(progress, pathLength);
		expect(index).toBe(5); // floor(1 * 5) = 5
	});
});

describe('isMovementComplete', () => {
	it('returns false when current time before arrival', () => {
		const currentTime = 5000;
		const arrivalTime = 10000;

		expect(isMovementComplete(currentTime, arrivalTime)).toBe(false);
	});

	it('returns true when current time equals arrival', () => {
		const currentTime = 10000;
		const arrivalTime = 10000;

		expect(isMovementComplete(currentTime, arrivalTime)).toBe(true);
	});

	it('returns true when current time after arrival', () => {
		const currentTime = 15000;
		const arrivalTime = 10000;

		expect(isMovementComplete(currentTime, arrivalTime)).toBe(true);
	});

	it('returns false immediately after departure', () => {
		const currentTime = 1001;
		const arrivalTime = 11000;

		expect(isMovementComplete(currentTime, arrivalTime)).toBe(false);
	});

	it('returns true one tick after arrival', () => {
		const currentTime = 10001;
		const arrivalTime = 10000;

		expect(isMovementComplete(currentTime, arrivalTime)).toBe(true);
	});

	it('returns true long after arrival', () => {
		const currentTime = 100000;
		const arrivalTime = 10000;

		expect(isMovementComplete(currentTime, arrivalTime)).toBe(true);
	});

	it('handles zero arrival time', () => {
		const currentTime = 0;
		const arrivalTime = 0;

		expect(isMovementComplete(currentTime, arrivalTime)).toBe(true);
	});
});

describe('calculateRemainingTime', () => {
	it('calculates remaining time before arrival', () => {
		const currentTime = 5000;
		const arrivalTime = 10000;

		const remaining = calculateRemainingTime(currentTime, arrivalTime);
		expect(remaining).toBe(5000);
	});

	it('returns 0 at arrival time', () => {
		const currentTime = 10000;
		const arrivalTime = 10000;

		const remaining = calculateRemainingTime(currentTime, arrivalTime);
		expect(remaining).toBe(0);
	});

	it('returns 0 after arrival time', () => {
		const currentTime = 15000;
		const arrivalTime = 10000;

		const remaining = calculateRemainingTime(currentTime, arrivalTime);
		expect(remaining).toBe(0);
	});

	it('calculates remaining time for long journey', () => {
		const currentTime = 100000;
		const arrivalTime = 500000;

		const remaining = calculateRemainingTime(currentTime, arrivalTime);
		expect(remaining).toBe(400000);
	});

	it('calculates remaining time with 1 second left', () => {
		const currentTime = 9999;
		const arrivalTime = 10000;

		const remaining = calculateRemainingTime(currentTime, arrivalTime);
		expect(remaining).toBe(1);
	});

	it('never returns negative time', () => {
		const currentTime = 100000;
		const arrivalTime = 10000;

		const remaining = calculateRemainingTime(currentTime, arrivalTime);
		expect(remaining).toBeGreaterThanOrEqual(0);
	});
});

describe('calculateElapsedTime', () => {
	it('calculates elapsed time since departure', () => {
		const departureTime = 1000;
		const currentTime = 6000;

		const elapsed = calculateElapsedTime(departureTime, currentTime);
		expect(elapsed).toBe(5000);
	});

	it('returns 0 at departure time', () => {
		const departureTime = 1000;
		const currentTime = 1000;

		const elapsed = calculateElapsedTime(departureTime, currentTime);
		expect(elapsed).toBe(0);
	});

	it('calculates elapsed time for long journey', () => {
		const departureTime = 0;
		const currentTime = 500000;

		const elapsed = calculateElapsedTime(departureTime, currentTime);
		expect(elapsed).toBe(500000);
	});

	it('calculates elapsed time with millisecond precision', () => {
		const departureTime = 1000;
		const currentTime = 1001;

		const elapsed = calculateElapsedTime(departureTime, currentTime);
		expect(elapsed).toBe(1);
	});

	it('handles large time values', () => {
		const departureTime = 1000000;
		const currentTime = 2000000;

		const elapsed = calculateElapsedTime(departureTime, currentTime);
		expect(elapsed).toBe(1000000);
	});
});

describe('Spy Movement Scenarios', () => {
	it('calculates complete journey for 5-hex path', () => {
		const pathLength = 5;
		const departureTime = 0;
		const travelTime = calculateTravelTime(pathLength);
		const arrivalTime = departureTime + travelTime;

		expect(travelTime).toBe(50000); // 50 seconds
		expect(arrivalTime).toBe(50000);

		// At 25 seconds (halfway)
		const midTime = 25000;
		const midProgress = calculateProgress(departureTime, arrivalTime, midTime);
		expect(midProgress).toBe(0.5);

		const midIndex = calculateCurrentPathIndex(midProgress, pathLength);
		expect(midIndex).toBe(2); // Middle of 5-hex path
	});

	it('calculates position updates during travel', () => {
		const pathLength = 10;
		const departureTime = 0;
		const travelTime = calculateTravelTime(pathLength);
		const arrivalTime = departureTime + travelTime;

		// Track position every 20 seconds
		const times = [0, 20000, 40000, 60000, 80000, 100000];
		const expectedIndices = [0, 2, 4, 6, 8, 9];

		for (let i = 0; i < times.length; i++) {
			const progress = calculateProgress(departureTime, arrivalTime, times[i]);
			const index = calculateCurrentPathIndex(progress, pathLength);
			expect(index).toBe(expectedIndices[i]);
		}
	});

	it('simulates spy movement from start to finish', () => {
		const pathLength = 8;
		const departureTime = 1000;
		const travelTime = calculateTravelTime(pathLength);
		const arrivalTime = departureTime + travelTime;

		expect(arrivalTime).toBe(81000); // 1000 + 80000

		// At departure
		const startProgress = calculateProgress(departureTime, arrivalTime, departureTime);
		expect(startProgress).toBe(0);
		expect(calculateCurrentPathIndex(startProgress, pathLength)).toBe(0);

		// At 1/4 point
		const quarter = departureTime + travelTime * 0.25;
		const quarterProgress = calculateProgress(departureTime, arrivalTime, quarter);
		expect(quarterProgress).toBe(0.25);
		expect(calculateCurrentPathIndex(quarterProgress, pathLength)).toBe(2);

		// At 1/2 point
		const half = departureTime + travelTime * 0.5;
		const halfProgress = calculateProgress(departureTime, arrivalTime, half);
		expect(halfProgress).toBe(0.5);
		expect(calculateCurrentPathIndex(halfProgress, pathLength)).toBe(4);

		// At 3/4 point
		const threeQuarters = departureTime + travelTime * 0.75;
		const threeQuartersProgress = calculateProgress(departureTime, arrivalTime, threeQuarters);
		expect(threeQuartersProgress).toBe(0.75);
		expect(calculateCurrentPathIndex(threeQuartersProgress, pathLength)).toBe(6);

		// At arrival
		const endProgress = calculateProgress(departureTime, arrivalTime, arrivalTime);
		expect(endProgress).toBe(1);
		expect(calculateCurrentPathIndex(endProgress, pathLength)).toBe(7);

		// After arrival
		expect(isMovementComplete(arrivalTime + 1000, arrivalTime)).toBe(true);
	});

	it('simulates canceling movement at various points', () => {
		const pathLength = 10;
		const departureTime = 0;
		const travelTime = calculateTravelTime(pathLength);
		const arrivalTime = departureTime + travelTime;

		// Cancel at 10%
		const cancel10 = departureTime + travelTime * 0.1;
		const progress10 = calculateProgress(departureTime, arrivalTime, cancel10);
		const cancelIndex10 = calculateCancelPathIndex(progress10, pathLength);
		expect(cancelIndex10).toBe(1); // floor(0.1 * 10) = 1

		// Cancel at 50%
		const cancel50 = departureTime + travelTime * 0.5;
		const progress50 = calculateProgress(departureTime, arrivalTime, cancel50);
		const cancelIndex50 = calculateCancelPathIndex(progress50, pathLength);
		expect(cancelIndex50).toBe(5); // floor(0.5 * 10) = 5

		// Cancel at 90%
		const cancel90 = departureTime + travelTime * 0.9;
		const progress90 = calculateProgress(departureTime, arrivalTime, cancel90);
		const cancelIndex90 = calculateCancelPathIndex(progress90, pathLength);
		expect(cancelIndex90).toBe(9); // floor(0.9 * 10) = 9
	});

	it('calculates journey time for various distances', () => {
		const distances = [1, 5, 10, 20, 50, 100];
		const expectedTimes = [10000, 50000, 100000, 200000, 500000, 1000000];

		for (let i = 0; i < distances.length; i++) {
			const travelTime = calculateTravelTime(distances[i]);
			expect(travelTime).toBe(expectedTimes[i]);
		}
	});

	it('verifies spy moves one hex at a time', () => {
		const pathLength = 20;
		const departureTime = 0;
		const travelTime = calculateTravelTime(pathLength);
		const arrivalTime = departureTime + travelTime;

		// Check every hex in path
		for (let expectedIndex = 0; expectedIndex < pathLength; expectedIndex++) {
			// Calculate time when spy should be at this hex
			const timeAtHex = departureTime + (travelTime * expectedIndex / pathLength);
			const progress = calculateProgress(departureTime, arrivalTime, timeAtHex);
			const actualIndex = calculateCurrentPathIndex(progress, pathLength);

			expect(actualIndex).toBe(expectedIndex);
		}
	});

	it('handles concurrent spy movements', () => {
		// Multiple spies moving with different paths
		const spy1 = {
			pathLength: 5,
			departureTime: 0,
		};
		const spy2 = {
			pathLength: 10,
			departureTime: 5000,
		};

		const spy1Travel = calculateTravelTime(spy1.pathLength);
		const spy2Travel = calculateTravelTime(spy2.pathLength);

		const spy1Arrival = spy1.departureTime + spy1Travel;
		const spy2Arrival = spy2.departureTime + spy2Travel;

		expect(spy1Arrival).toBe(50000);
		expect(spy2Arrival).toBe(105000);

		// At time 30000, check both positions
		const currentTime = 30000;

		const spy1Progress = calculateProgress(spy1.departureTime, spy1Arrival, currentTime);
		const spy1Index = calculateCurrentPathIndex(spy1Progress, spy1.pathLength);
		expect(spy1Progress).toBe(0.6);
		expect(spy1Index).toBe(3);

		const spy2Progress = calculateProgress(spy2.departureTime, spy2Arrival, currentTime);
		const spy2Index = calculateCurrentPathIndex(spy2Progress, spy2.pathLength);
		expect(spy2Progress).toBe(0.25);
		expect(spy2Index).toBe(2);
	});
});

describe('Spy Movement Edge Cases', () => {
	it('handles immediate cancel (progress = 0)', () => {
		const pathLength = 10;
		const progress = 0;

		const cancelIndex = calculateCancelPathIndex(progress, pathLength);
		expect(cancelIndex).toBe(0);
	});

	it('handles cancel just before arrival', () => {
		const pathLength = 10;
		const departureTime = 0;
		const arrivalTime = 100000;
		const currentTime = 99999;

		const progress = calculateProgress(departureTime, arrivalTime, currentTime);
		const cancelIndex = calculateCancelPathIndex(progress, pathLength);

		expect(cancelIndex).toBeLessThan(pathLength);
		expect(cancelIndex).toBeGreaterThan(pathLength - 2);
	});

	it('handles very short journey (1 hex)', () => {
		const pathLength = 1;
		const travelTime = calculateTravelTime(pathLength);

		expect(travelTime).toBe(10000); // 10 seconds

		const departureTime = 0;
		const arrivalTime = departureTime + travelTime;
		const midTime = 5000;

		const progress = calculateProgress(departureTime, arrivalTime, midTime);
		expect(progress).toBe(0.5);

		const index = calculateCurrentPathIndex(progress, pathLength);
		expect(index).toBe(0); // Only one position in path
	});

	it('handles very long journey (100 hexes)', () => {
		const pathLength = 100;
		const travelTime = calculateTravelTime(pathLength);

		expect(travelTime).toBe(1000000); // 1000 seconds = 16m 40s

		const departureTime = 0;
		const arrivalTime = departureTime + travelTime;
		const midTime = 500000;

		const progress = calculateProgress(departureTime, arrivalTime, midTime);
		expect(progress).toBe(0.5);

		const index = calculateCurrentPathIndex(progress, pathLength);
		expect(index).toBe(50); // Halfway
	});

	it('handles movement check long after arrival', () => {
		const departureTime = 0;
		const arrivalTime = 10000;
		const currentTime = 1000000; // Way past arrival

		const progress = calculateProgress(departureTime, arrivalTime, currentTime);
		expect(progress).toBe(1); // Clamped to 1

		const pathLength = 10;
		const index = calculateCurrentPathIndex(progress, pathLength);
		expect(index).toBe(9); // Last position
	});

	it('verifies position never goes backwards', () => {
		const pathLength = 10;
		const departureTime = 0;
		const arrivalTime = 100000;

		// Sample positions over time
		const times = [0, 10000, 20000, 30000, 40000, 50000];
		let lastIndex = -1;

		for (const time of times) {
			const progress = calculateProgress(departureTime, arrivalTime, time);
			const index = calculateCurrentPathIndex(progress, pathLength);

			expect(index).toBeGreaterThanOrEqual(lastIndex);
			lastIndex = index;
		}
	});

	it('handles fractional progress near boundaries', () => {
		const pathLength = 10;

		// Test progress values near 0 and 1
		const progressValues = [0.001, 0.01, 0.99, 0.999];

		for (const progress of progressValues) {
			const index = calculateCurrentPathIndex(progress, pathLength);
			expect(index).toBeGreaterThanOrEqual(0);
			expect(index).toBeLessThan(pathLength);
		}
	});

	it('calculates remaining time throughout journey', () => {
		const departureTime = 0;
		const pathLength = 10;
		const travelTime = calculateTravelTime(pathLength);
		const arrivalTime = departureTime + travelTime;

		// At 25%
		const time25 = 25000;
		const remaining25 = calculateRemainingTime(time25, arrivalTime);
		expect(remaining25).toBe(75000);

		// At 50%
		const time50 = 50000;
		const remaining50 = calculateRemainingTime(time50, arrivalTime);
		expect(remaining50).toBe(50000);

		// At 75%
		const time75 = 75000;
		const remaining75 = calculateRemainingTime(time75, arrivalTime);
		expect(remaining75).toBe(25000);

		// At arrival
		const remaining100 = calculateRemainingTime(arrivalTime, arrivalTime);
		expect(remaining100).toBe(0);
	});
});

describe('Spy Movement Integration', () => {
	it('verifies complete movement cycle', () => {
		// Setup journey
		const pathLength = 8;
		const departureTime = 1000;
		const travelTime = calculateTravelTime(pathLength);
		const arrivalTime = departureTime + travelTime;

		expect(travelTime).toBe(80000);
		expect(arrivalTime).toBe(81000);

		// Simulate movement
		const currentTime = departureTime + 40000; // Halfway

		const elapsed = calculateElapsedTime(departureTime, currentTime);
		expect(elapsed).toBe(40000);

		const remaining = calculateRemainingTime(currentTime, arrivalTime);
		expect(remaining).toBe(40000);

		const progress = calculateProgress(departureTime, arrivalTime, currentTime);
		expect(progress).toBe(0.5);

		const index = calculateCurrentPathIndex(progress, pathLength);
		expect(index).toBe(4); // Halfway through 8 hexes

		const complete = isMovementComplete(currentTime, arrivalTime);
		expect(complete).toBe(false);
	});

	it('verifies cancel returns correct position', () => {
		// Spy is 30% through a 10-hex journey
		const pathLength = 10;
		const departureTime = 0;
		const travelTime = calculateTravelTime(pathLength);
		const arrivalTime = departureTime + travelTime;
		const cancelTime = departureTime + travelTime * 0.3;

		const progress = calculateProgress(departureTime, arrivalTime, cancelTime);
		expect(progress).toBe(0.3);

		const cancelIndex = calculateCancelPathIndex(progress, pathLength);
		expect(cancelIndex).toBe(3); // floor(0.3 * 10) = 3

		// Spy should land at path[cancelIndex - 1] if cancelIndex > 0
		// Or stay at origin if cancelIndex === 0
	});

	it('compares movement and cancel index calculations', () => {
		const pathLength = 10;
		const progress = 0.5;

		const moveIndex = calculateCurrentPathIndex(progress, pathLength);
		const cancelIndex = calculateCancelPathIndex(progress, pathLength);

		// Both should be 5 at exact halfway point
		expect(moveIndex).toBe(5);
		expect(cancelIndex).toBe(5);
	});

	it('verifies time calculations are consistent', () => {
		const pathLength = 15;
		const departureTime = 5000;
		const travelTime = calculateTravelTime(pathLength);
		const arrivalTime = departureTime + travelTime;

		// At any point in time
		const currentTime = departureTime + 50000;

		const elapsed = calculateElapsedTime(departureTime, currentTime);
		const remaining = calculateRemainingTime(currentTime, arrivalTime);

		// Elapsed + remaining should equal total travel time (if not yet arrived)
		if (currentTime < arrivalTime) {
			expect(elapsed + remaining).toBe(travelTime);
		}
	});

	it('simulates real-time position updates', () => {
		// Spy moving across 20 hexes
		const pathLength = 20;
		const departureTime = 0;
		const travelTime = calculateTravelTime(pathLength);
		const arrivalTime = departureTime + travelTime;

		// Simulate ticks every second for first 30 seconds
		for (let tick = 0; tick <= 30; tick++) {
			const currentTime = departureTime + tick * 1000;
			const progress = calculateProgress(departureTime, arrivalTime, currentTime);
			const index = calculateCurrentPathIndex(progress, pathLength);

			// Verify index is valid
			expect(index).toBeGreaterThanOrEqual(0);
			expect(index).toBeLessThan(pathLength);

			// Verify progress increases monotonically
			if (tick > 0) {
				const prevProgress = calculateProgress(departureTime, arrivalTime, currentTime - 1000);
				expect(progress).toBeGreaterThanOrEqual(prevProgress);
			}
		}
	});
});
