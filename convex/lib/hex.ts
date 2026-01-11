// Hex grid utilities using axial coordinates (q, r)

export type HexCoord = { q: number; r: number };

// Axial direction vectors for the 6 neighbors
const DIRECTIONS: HexCoord[] = [
	{ q: 1, r: 0 },
	{ q: 1, r: -1 },
	{ q: 0, r: -1 },
	{ q: -1, r: 0 },
	{ q: -1, r: 1 },
	{ q: 0, r: 1 },
];

export function hexDistance(a: HexCoord, b: HexCoord): number {
	return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
}

export function getNeighbors(q: number, r: number): HexCoord[] {
	return DIRECTIONS.map((d) => ({ q: q + d.q, r: r + d.r }));
}

export function hexesInRadius(radius: number): HexCoord[] {
	const results: HexCoord[] = [];
	for (let q = -radius; q <= radius; q++) {
		const r1 = Math.max(-radius, -q - radius);
		const r2 = Math.min(radius, -q + radius);
		for (let r = r1; r <= r2; r++) {
			results.push({ q, r });
		}
	}
	return results;
}

// Pre-defined starting positions for 2-8 players, evenly distributed
// Returns positions at ~70% of given radius
export function getStartingPositions(playerCount: number, radius: number): HexCoord[] {
	const dist = Math.floor(radius * 0.7);
	const positions: Record<number, HexCoord[]> = {
		2: [
			{ q: 0, r: -dist },
			{ q: 0, r: dist },
		],
		3: [
			{ q: 0, r: -dist },
			{ q: -dist, r: dist },
			{ q: dist, r: 0 },
		],
		4: [
			{ q: -dist, r: 0 },
			{ q: dist, r: 0 },
			{ q: 0, r: -dist },
			{ q: 0, r: dist },
		],
		5: [
			{ q: 0, r: -dist },
			{ q: dist, r: -dist },
			{ q: dist, r: 0 },
			{ q: -dist, r: dist },
			{ q: -dist, r: 0 },
		],
		6: [
			{ q: 0, r: -dist },
			{ q: dist, r: -dist },
			{ q: dist, r: 0 },
			{ q: 0, r: dist },
			{ q: -dist, r: dist },
			{ q: -dist, r: 0 },
		],
		7: [
			{ q: 0, r: -dist },
			{ q: dist, r: -dist },
			{ q: dist, r: 0 },
			{ q: Math.floor(dist / 2), r: dist },
			{ q: -Math.floor(dist / 2), r: dist },
			{ q: -dist, r: Math.floor(dist / 2) },
			{ q: -dist, r: -Math.floor(dist / 2) },
		],
		8: [
			{ q: 0, r: -dist },
			{ q: dist, r: -dist },
			{ q: dist, r: 0 },
			{ q: dist, r: Math.floor(dist / 2) },
			{ q: 0, r: dist },
			{ q: -dist, r: dist },
			{ q: -dist, r: 0 },
			{ q: -dist, r: -Math.floor(dist / 2) },
		],
	};
	return positions[playerCount] ?? positions[2];
}

export function coordKey(q: number, r: number): string {
	return `${q},${r}`;
}
