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

// Returns set of coord keys visible from owned tiles (owned + adjacent)
export function computeVisibleCoords(ownedTiles: HexCoord[]): Set<string> {
	const visible = new Set<string>();
	for (const tile of ownedTiles) {
		visible.add(coordKey(tile.q, tile.r));
		for (const neighbor of getNeighbors(tile.q, tile.r)) {
			visible.add(coordKey(neighbor.q, neighbor.r));
		}
	}
	return visible;
}

// A* pathfinding - returns path excluding start, including end
// canTraverse determines if a hex can be walked through (owned/neutral)
export function findPath(
	start: HexCoord,
	end: HexCoord,
	canTraverse: (coord: HexCoord) => boolean,
): HexCoord[] | null {
	if (!canTraverse(end)) return null;

	const startKey = coordKey(start.q, start.r);
	const endKey = coordKey(end.q, end.r);
	if (startKey === endKey) return [];

	const openSet = new Map<string, { coord: HexCoord; f: number; g: number }>();
	const cameFrom = new Map<string, HexCoord>();
	const gScore = new Map<string, number>();

	gScore.set(startKey, 0);
	openSet.set(startKey, { coord: start, f: hexDistance(start, end), g: 0 });

	while (openSet.size > 0) {
		// Find node with lowest f score
		let currentKey = '';
		let lowestF = Infinity;
		for (const [key, node] of openSet) {
			if (node.f < lowestF) {
				lowestF = node.f;
				currentKey = key;
			}
		}

		const current = openSet.get(currentKey)!;
		openSet.delete(currentKey);

		if (currentKey === endKey) {
			// Reconstruct path
			const path: HexCoord[] = [];
			let curr = current.coord;
			while (coordKey(curr.q, curr.r) !== startKey) {
				path.unshift(curr);
				curr = cameFrom.get(coordKey(curr.q, curr.r))!;
			}
			return path;
		}

		for (const neighbor of getNeighbors(current.coord.q, current.coord.r)) {
			const neighborKey = coordKey(neighbor.q, neighbor.r);
			if (!canTraverse(neighbor)) continue;

			const tentativeG = current.g + 1;
			const existingG = gScore.get(neighborKey);

			if (existingG === undefined || tentativeG < existingG) {
				cameFrom.set(neighborKey, current.coord);
				gScore.set(neighborKey, tentativeG);
				const f = tentativeG + hexDistance(neighbor, end);
				openSet.set(neighborKey, { coord: neighbor, f, g: tentativeG });
			}
		}
	}

	return null; // No path found
}
