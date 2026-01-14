// Spy movement calculation functions extracted for testability

export const TRAVEL_TIME_PER_HEX = 7000; // 7 seconds per hex (1.43x speed)

export function calculateTravelTime(pathLength: number): number {
	return pathLength * TRAVEL_TIME_PER_HEX;
}

export function calculateProgress(departureTime: number, arrivalTime: number, currentTime: number): number {
	const elapsed = currentTime - departureTime;
	const totalTime = arrivalTime - departureTime;
	if (totalTime === 0) return 1;
	return Math.min(elapsed / totalTime, 1);
}

export function calculatePathIndex(progress: number, pathLength: number): number {
	return Math.min(Math.floor(progress * pathLength), pathLength - 1);
}

export function isMovementComplete(currentTime: number, arrivalTime: number): boolean {
	return currentTime >= arrivalTime;
}

export function calculateElapsedTime(departureTime: number, currentTime: number): number {
	return currentTime - departureTime;
}

export function calculateRemainingTime(currentTime: number, arrivalTime: number): number {
	return Math.max(arrivalTime - currentTime, 0);
}
