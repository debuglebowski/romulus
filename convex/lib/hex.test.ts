import { describe, it, expect } from 'vitest';
import {
	hexDistance,
	getNeighbors,
	findPath,
	coordKey,
	computeLineOfSight,
	computeHorizon,
	hexesInRadiusFrom,
	type HexCoord,
} from './hex';

describe('hexDistance', () => {
	it('returns 0 for same hex', () => {
		expect(hexDistance({ q: 0, r: 0 }, { q: 0, r: 0 })).toBe(0);
		expect(hexDistance({ q: 5, r: -3 }, { q: 5, r: -3 })).toBe(0);
		expect(hexDistance({ q: -2, r: 7 }, { q: -2, r: 7 })).toBe(0);
	});

	it('returns 1 for adjacent hexes', () => {
		const origin: HexCoord = { q: 0, r: 0 };
		const neighbors = getNeighbors(0, 0);

		for (const neighbor of neighbors) {
			expect(hexDistance(origin, neighbor)).toBe(1);
		}
	});

	it('calculates distance along q axis', () => {
		expect(hexDistance({ q: 0, r: 0 }, { q: 3, r: 0 })).toBe(3);
		expect(hexDistance({ q: 0, r: 0 }, { q: -5, r: 0 })).toBe(5);
		expect(hexDistance({ q: 2, r: 1 }, { q: 7, r: 1 })).toBe(5);
	});

	it('calculates distance along r axis', () => {
		expect(hexDistance({ q: 0, r: 0 }, { q: 0, r: 4 })).toBe(4);
		expect(hexDistance({ q: 0, r: 0 }, { q: 0, r: -3 })).toBe(3);
		expect(hexDistance({ q: 3, r: 2 }, { q: 3, r: 8 })).toBe(6);
	});

	it('calculates diagonal distances', () => {
		expect(hexDistance({ q: 0, r: 0 }, { q: 2, r: -2 })).toBe(2);
		expect(hexDistance({ q: 0, r: 0 }, { q: -3, r: 3 })).toBe(3);
		expect(hexDistance({ q: 1, r: 1 }, { q: 4, r: -2 })).toBe(3);
	});

	it('is symmetric', () => {
		const pairs: [HexCoord, HexCoord][] = [
			[{ q: 0, r: 0 }, { q: 5, r: 3 }],
			[{ q: -2, r: 4 }, { q: 3, r: -1 }],
			[{ q: 10, r: -5 }, { q: -3, r: 8 }],
		];

		for (const [a, b] of pairs) {
			expect(hexDistance(a, b)).toBe(hexDistance(b, a));
		}
	});

	it('handles large distances', () => {
		expect(hexDistance({ q: 0, r: 0 }, { q: 20, r: -10 })).toBe(20);
		expect(hexDistance({ q: -15, r: 10 }, { q: 15, r: -10 })).toBe(30);
	});

	it('handles mixed positive and negative coordinates', () => {
		expect(hexDistance({ q: -5, r: -5 }, { q: 5, r: 5 })).toBe(20);
		expect(hexDistance({ q: 3, r: -7 }, { q: -2, r: 4 })).toBe(11);
		expect(hexDistance({ q: -8, r: 3 }, { q: 2, r: -3 })).toBe(10);
	});
});

describe('getNeighbors', () => {
	it('returns exactly 6 neighbors', () => {
		expect(getNeighbors(0, 0)).toHaveLength(6);
		expect(getNeighbors(5, 3)).toHaveLength(6);
		expect(getNeighbors(-2, -7)).toHaveLength(6);
	});

	it('returns correct neighbors for origin', () => {
		const neighbors = getNeighbors(0, 0);
		const expected = [
			{ q: 1, r: 0 },
			{ q: 1, r: -1 },
			{ q: 0, r: -1 },
			{ q: -1, r: 0 },
			{ q: -1, r: 1 },
			{ q: 0, r: 1 },
		];

		expect(neighbors).toEqual(expected);
	});

	it('returns correct neighbors for positive coordinates', () => {
		const neighbors = getNeighbors(3, 2);
		const expected = [
			{ q: 4, r: 2 },
			{ q: 4, r: 1 },
			{ q: 3, r: 1 },
			{ q: 2, r: 2 },
			{ q: 2, r: 3 },
			{ q: 3, r: 3 },
		];

		expect(neighbors).toEqual(expected);
	});

	it('returns correct neighbors for negative coordinates', () => {
		const neighbors = getNeighbors(-2, -3);
		const expected = [
			{ q: -1, r: -3 },
			{ q: -1, r: -4 },
			{ q: -2, r: -4 },
			{ q: -3, r: -3 },
			{ q: -3, r: -2 },
			{ q: -2, r: -2 },
		];

		expect(neighbors).toEqual(expected);
	});

	it('all neighbors are distance 1 from center', () => {
		const testCoords = [
			{ q: 0, r: 0 },
			{ q: 5, r: -3 },
			{ q: -4, r: 7 },
			{ q: 10, r: 10 },
		];

		for (const coord of testCoords) {
			const neighbors = getNeighbors(coord.q, coord.r);
			for (const neighbor of neighbors) {
				expect(hexDistance(coord, neighbor)).toBe(1);
			}
		}
	});

	it('neighbors form a ring around the center', () => {
		const center = { q: 2, r: 3 };
		const neighbors = getNeighbors(center.q, center.r);

		// Each neighbor should be unique
		const neighborKeys = neighbors.map(n => `${n.q},${n.r}`);
		const uniqueKeys = new Set(neighborKeys);
		expect(uniqueKeys.size).toBe(6);
	});

	it('neighbors follow clockwise pattern', () => {
		const neighbors = getNeighbors(0, 0);

		// Starting from East (1,0) and going clockwise
		// The pattern should be: E, SE, SW, W, NW, NE
		expect(neighbors[0]).toEqual({ q: 1, r: 0 });   // E
		expect(neighbors[1]).toEqual({ q: 1, r: -1 });  // NE
		expect(neighbors[2]).toEqual({ q: 0, r: -1 });  // NW
		expect(neighbors[3]).toEqual({ q: -1, r: 0 });  // W
		expect(neighbors[4]).toEqual({ q: -1, r: 1 });  // SW
		expect(neighbors[5]).toEqual({ q: 0, r: 1 });   // SE
	});
});

// NOTE: findPath tests are split into separate files to avoid vitest hang issues
// See: hex-pathfinding-basic.test.ts, hex-pathfinding-obstacles.test.ts, hex-pathfinding-edge-cases.test.ts
describe.skip('findPath', () => {
	it('returns empty array when start and end are the same', () => {
		const allTraversable = () => true;

		expect(findPath({ q: 0, r: 0 }, { q: 0, r: 0 }, allTraversable)).toEqual([]);
		expect(findPath({ q: 5, r: -3 }, { q: 5, r: -3 }, allTraversable)).toEqual([]);
		expect(findPath({ q: -2, r: 7 }, { q: -2, r: 7 }, allTraversable)).toEqual([]);
	});

	it('returns null when end is not traversable', () => {
		const neverTraversable = () => false;

		expect(findPath({ q: 0, r: 0 }, { q: 1, r: 0 }, neverTraversable)).toBeNull();
		expect(findPath({ q: 0, r: 0 }, { q: 5, r: 5 }, neverTraversable)).toBeNull();
	});

	it('returns null when end is not traversable but path exists', () => {
		const canTraverse = (coord: HexCoord) => {
			// Only end is blocked
			return !(coord.q === 3 && coord.r === 0);
		};

		expect(findPath({ q: 0, r: 0 }, { q: 3, r: 0 }, canTraverse)).toBeNull();
	});

	it('finds path between adjacent hexes', () => {
		const allTraversable = () => true;

		const path = findPath({ q: 0, r: 0 }, { q: 1, r: 0 }, allTraversable);
		expect(path).not.toBeNull();
		expect(path).toHaveLength(1);
		expect(path![0]).toEqual({ q: 1, r: 0 });
	});

	it('excludes start and includes end in path', () => {
		const allTraversable = () => true;
		const start = { q: 0, r: 0 };
		const end = { q: 3, r: 0 };

		const path = findPath(start, end, allTraversable);
		expect(path).not.toBeNull();

		// Path should not include start
		const pathKeys = path!.map(coord => coordKey(coord.q, coord.r));
		expect(pathKeys).not.toContain(coordKey(start.q, start.r));

		// Path should include end
		expect(pathKeys).toContain(coordKey(end.q, end.r));
		expect(path![path!.length - 1]).toEqual(end);
	});

	it('finds straight path along q axis', () => {
		const allTraversable = () => true;

		const path = findPath({ q: 0, r: 0 }, { q: 4, r: 0 }, allTraversable);
		expect(path).not.toBeNull();
		expect(path).toHaveLength(4);

		// Verify it's the straight path
		expect(path![0]).toEqual({ q: 1, r: 0 });
		expect(path![1]).toEqual({ q: 2, r: 0 });
		expect(path![2]).toEqual({ q: 3, r: 0 });
		expect(path![3]).toEqual({ q: 4, r: 0 });
	});

	it('finds straight path along r axis', () => {
		const allTraversable = () => true;

		const path = findPath({ q: 0, r: 0 }, { q: 0, r: 3 }, allTraversable);
		expect(path).not.toBeNull();
		expect(path).toHaveLength(3);

		// Verify it's the straight path
		expect(path![0]).toEqual({ q: 0, r: 1 });
		expect(path![1]).toEqual({ q: 0, r: 2 });
		expect(path![2]).toEqual({ q: 0, r: 3 });
	});

	it('finds diagonal path', () => {
		const allTraversable = () => true;

		const path = findPath({ q: 0, r: 0 }, { q: 3, r: -3 }, allTraversable);
		expect(path).not.toBeNull();
		expect(path).toHaveLength(3);

		// Verify each step is adjacent to the next
		const start = { q: 0, r: 0 };
		let current = start;
		for (const step of path!) {
			expect(hexDistance(current, step)).toBe(1);
			current = step;
		}
	});

	it('finds path around single obstacle', () => {
		const blocked = new Set([coordKey(1, 0)]);
		const canTraverse = (coord: HexCoord) => !blocked.has(coordKey(coord.q, coord.r));

		const path = findPath({ q: 0, r: 0 }, { q: 2, r: 0 }, canTraverse);
		expect(path).not.toBeNull();

		// Path should go around the obstacle
		const pathKeys = path!.map(coord => coordKey(coord.q, coord.r));
		expect(pathKeys).not.toContain(coordKey(1, 0));

		// Path should still reach the end
		expect(path![path!.length - 1]).toEqual({ q: 2, r: 0 });
	});

	it('finds path around multiple obstacles', () => {
		// Create a wall with a gap
		const blocked = new Set([
			coordKey(1, -1),
			coordKey(1, 0),
			coordKey(1, 1),
		]);
		const canTraverse = (coord: HexCoord) => !blocked.has(coordKey(coord.q, coord.r));

		const path = findPath({ q: 0, r: 0 }, { q: 3, r: 0 }, canTraverse);
		expect(path).not.toBeNull();

		// Path should avoid all obstacles
		for (const coord of path!) {
			expect(blocked.has(coordKey(coord.q, coord.r))).toBe(false);
		}

		// Path should reach the end
		expect(path![path!.length - 1]).toEqual({ q: 3, r: 0 });
	});

	it('returns null when no path exists', () => {
		// Surround the target with obstacles
		const end = { q: 2, r: 0 };
		const blocked = new Set(
			getNeighbors(end.q, end.r).map(n => coordKey(n.q, n.r))
		);
		const canTraverse = (coord: HexCoord) => !blocked.has(coordKey(coord.q, coord.r));

		const path = findPath({ q: 0, r: 0 }, end, canTraverse);
		expect(path).toBeNull();
	});

	it('returns null when start is isolated', () => {
		const start = { q: 0, r: 0 };
		const blocked = new Set(
			getNeighbors(start.q, start.r).map(n => coordKey(n.q, n.r))
		);
		const canTraverse = (coord: HexCoord) => !blocked.has(coordKey(coord.q, coord.r));

		const path = findPath(start, { q: 5, r: 5 }, canTraverse);
		expect(path).toBeNull();
	});

	it('finds optimal path when multiple routes exist', () => {
		const allTraversable = () => true;

		const path = findPath({ q: 0, r: 0 }, { q: 3, r: 3 }, allTraversable);
		expect(path).not.toBeNull();

		// The optimal path length should equal the hex distance
		const expectedLength = hexDistance({ q: 0, r: 0 }, { q: 3, r: 3 });
		expect(path!.length).toBe(expectedLength);
	});

	it('finds path through narrow corridor', () => {
		// Create a corridor: only tiles at (1,0), (2,0), (3,0) are traversable
		const corridor = new Set([
			coordKey(1, 0),
			coordKey(2, 0),
			coordKey(3, 0),
			coordKey(4, 0),
		]);
		const canTraverse = (coord: HexCoord) => corridor.has(coordKey(coord.q, coord.r));

		const path = findPath({ q: 1, r: 0 }, { q: 4, r: 0 }, canTraverse);
		expect(path).not.toBeNull();
		expect(path).toHaveLength(3);

		// Verify the path follows the corridor
		expect(path![0]).toEqual({ q: 2, r: 0 });
		expect(path![1]).toEqual({ q: 3, r: 0 });
		expect(path![2]).toEqual({ q: 4, r: 0 });
	});

	it('handles long paths efficiently', () => {
		const allTraversable = () => true;
		const start = { q: 0, r: 0 };
		const end = { q: 15, r: -15 };

		const path = findPath(start, end, allTraversable);
		expect(path).not.toBeNull();

		// Verify path length matches hex distance
		const expectedLength = hexDistance(start, end);
		expect(path!.length).toBe(expectedLength);

		// Verify each step is adjacent
		let current = start;
		for (const step of path!) {
			expect(hexDistance(current, step)).toBe(1);
			current = step;
		}

		// Verify we reach the end
		expect(path![path!.length - 1]).toEqual(end);
	});

	it('finds path in complex maze', () => {
		// Create a maze with specific traversable tiles
		const traversable = new Set([
			coordKey(0, 0),
			coordKey(1, 0),
			coordKey(1, 1),
			coordKey(2, 1),
			coordKey(3, 1),
			coordKey(3, 0),
			coordKey(4, 0),
		]);
		const canTraverse = (coord: HexCoord) => traversable.has(coordKey(coord.q, coord.r));

		const path = findPath({ q: 0, r: 0 }, { q: 4, r: 0 }, canTraverse);
		expect(path).not.toBeNull();

		// Verify all steps are traversable
		for (const coord of path!) {
			expect(traversable.has(coordKey(coord.q, coord.r))).toBe(true);
		}

		// Verify we reach the end
		expect(path![path!.length - 1]).toEqual({ q: 4, r: 0 });
	});

	it('handles negative coordinates', () => {
		const allTraversable = () => true;

		const path = findPath({ q: -5, r: -5 }, { q: -2, r: -2 }, allTraversable);
		expect(path).not.toBeNull();

		// Verify path length
		const expectedLength = hexDistance({ q: -5, r: -5 }, { q: -2, r: -2 });
		expect(path!.length).toBe(expectedLength);

		// Verify we reach the end
		expect(path![path!.length - 1]).toEqual({ q: -2, r: -2 });
	});

	it('path contains only adjacent steps', () => {
		const allTraversable = () => true;
		const start = { q: 0, r: 0 };
		const end = { q: 7, r: -4 };

		const path = findPath(start, end, allTraversable);
		expect(path).not.toBeNull();

		// Verify each step is exactly distance 1 from previous
		let current = start;
		for (const step of path!) {
			expect(hexDistance(current, step)).toBe(1);
			current = step;
		}
	});

	it('finds path around L-shaped obstacle', () => {
		// Create an L-shaped obstacle
		const blocked = new Set([
			coordKey(1, 0),
			coordKey(2, 0),
			coordKey(2, -1),
			coordKey(2, -2),
		]);
		const canTraverse = (coord: HexCoord) => !blocked.has(coordKey(coord.q, coord.r));

		const path = findPath({ q: 0, r: 0 }, { q: 3, r: 0 }, canTraverse);
		expect(path).not.toBeNull();

		// Verify path avoids all obstacles
		for (const coord of path!) {
			expect(blocked.has(coordKey(coord.q, coord.r))).toBe(false);
		}

		// Verify we reach the end
		expect(path![path!.length - 1]).toEqual({ q: 3, r: 0 });
	});
});

describe('computeLineOfSight', () => {
	it('returns empty set for no owned tiles', () => {
		const los = computeLineOfSight([]);
		expect(los.size).toBe(0);
	});

	it('returns tile and neighbors for single owned tile', () => {
		const ownedTiles = [{ q: 0, r: 0 }];
		const los = computeLineOfSight(ownedTiles);

		// Should include the owned tile (1) + 6 neighbors = 7 total
		expect(los.size).toBe(7);

		// Check that owned tile is included
		expect(los.has(coordKey(0, 0))).toBe(true);

		// Check that all neighbors are included
		const neighbors = getNeighbors(0, 0);
		for (const neighbor of neighbors) {
			expect(los.has(coordKey(neighbor.q, neighbor.r))).toBe(true);
		}
	});

	it('includes all owned tiles and their neighbors', () => {
		const ownedTiles = [
			{ q: 0, r: 0 },
			{ q: 3, r: 3 },
		];
		const los = computeLineOfSight(ownedTiles);

		// Check owned tiles are included
		expect(los.has(coordKey(0, 0))).toBe(true);
		expect(los.has(coordKey(3, 3))).toBe(true);

		// Check neighbors of first tile
		const neighbors1 = getNeighbors(0, 0);
		for (const neighbor of neighbors1) {
			expect(los.has(coordKey(neighbor.q, neighbor.r))).toBe(true);
		}

		// Check neighbors of second tile
		const neighbors2 = getNeighbors(3, 3);
		for (const neighbor of neighbors2) {
			expect(los.has(coordKey(neighbor.q, neighbor.r))).toBe(true);
		}
	});

	it('handles overlapping neighbor sets correctly', () => {
		// Adjacent tiles will have overlapping neighbor sets
		const ownedTiles = [
			{ q: 0, r: 0 },
			{ q: 1, r: 0 },
		];
		const los = computeLineOfSight(ownedTiles);

		// Both owned tiles should be in LOS
		expect(los.has(coordKey(0, 0))).toBe(true);
		expect(los.has(coordKey(1, 0))).toBe(true);

		// Count should not double-count overlapping neighbors
		// Tile 1: 7 hexes (tile + 6 neighbors)
		// Tile 2: 7 hexes (tile + 6 neighbors)
		// But they share 4 hexes (2 owned + 2 common neighbors)
		// So: 7 + 7 - 4 = 10 unique hexes
		expect(los.size).toBe(10);
	});

	it('handles line of 3 adjacent tiles', () => {
		const ownedTiles = [
			{ q: 0, r: 0 },
			{ q: 1, r: 0 },
			{ q: 2, r: 0 },
		];
		const los = computeLineOfSight(ownedTiles);

		// All owned tiles should be visible
		for (const tile of ownedTiles) {
			expect(los.has(coordKey(tile.q, tile.r))).toBe(true);
		}

		// All neighbors of all tiles should be visible
		for (const tile of ownedTiles) {
			const neighbors = getNeighbors(tile.q, tile.r);
			for (const neighbor of neighbors) {
				expect(los.has(coordKey(neighbor.q, neighbor.r))).toBe(true);
			}
		}
	});

	it('works with negative coordinates', () => {
		const ownedTiles = [
			{ q: -2, r: -3 },
		];
		const los = computeLineOfSight(ownedTiles);

		// Should include tile + neighbors = 7
		expect(los.size).toBe(7);
		expect(los.has(coordKey(-2, -3))).toBe(true);

		const neighbors = getNeighbors(-2, -3);
		for (const neighbor of neighbors) {
			expect(los.has(coordKey(neighbor.q, neighbor.r))).toBe(true);
		}
	});

	it('handles cluster of tiles', () => {
		// Create a cluster around origin
		const ownedTiles = [
			{ q: 0, r: 0 },
			{ q: 1, r: 0 },
			{ q: 0, r: 1 },
			{ q: -1, r: 1 },
		];
		const los = computeLineOfSight(ownedTiles);

		// All owned tiles should be visible
		for (const tile of ownedTiles) {
			expect(los.has(coordKey(tile.q, tile.r))).toBe(true);
		}

		// Size should be reasonable (owned + unique neighbors)
		expect(los.size).toBeGreaterThan(ownedTiles.length);
		expect(los.size).toBeLessThan(ownedTiles.length * 7); // Max if no overlap
	});

	it('handles scattered tiles', () => {
		// Tiles far apart with no overlapping neighbors
		const ownedTiles = [
			{ q: 0, r: 0 },
			{ q: 10, r: 10 },
			{ q: -10, r: -10 },
		];
		const los = computeLineOfSight(ownedTiles);

		// Each tile + its neighbors should be separate clusters
		// 3 tiles * 7 hexes each = 21 total
		expect(los.size).toBe(21);

		// All tiles should be visible
		for (const tile of ownedTiles) {
			expect(los.has(coordKey(tile.q, tile.r))).toBe(true);
		}
	});

	it('includes only immediate neighbors, not second ring', () => {
		const ownedTiles = [{ q: 0, r: 0 }];
		const los = computeLineOfSight(ownedTiles);

		// First ring neighbors should be included
		const neighbors = getNeighbors(0, 0);
		for (const neighbor of neighbors) {
			expect(los.has(coordKey(neighbor.q, neighbor.r))).toBe(true);
		}

		// Second ring should NOT be included (neighbors of neighbors)
		// Pick one second-ring tile: (2, 0) is distance 2 from origin
		expect(los.has(coordKey(2, 0))).toBe(false);
		expect(los.has(coordKey(0, 2))).toBe(false);
		expect(los.has(coordKey(-2, 0))).toBe(false);
	});
});

describe('computeHorizon', () => {
	it('includes 5-tile radius from capital with no owned tiles', () => {
		const capital = { q: 0, r: 0 };
		const ownedTiles: HexCoord[] = [];
		const horizon = computeHorizon(capital, ownedTiles);

		// Should include all hexes within 5 tiles of capital
		const radius5 = hexesInRadiusFrom(capital, 5);
		expect(horizon.size).toBeGreaterThanOrEqual(radius5.length);

		// All hexes within radius 5 should be in horizon
		for (const hex of radius5) {
			expect(horizon.has(coordKey(hex.q, hex.r))).toBe(true);
		}
	});

	it('includes capital in horizon', () => {
		const capital = { q: 5, r: -3 };
		const ownedTiles: HexCoord[] = [];
		const horizon = computeHorizon(capital, ownedTiles);

		expect(horizon.has(coordKey(capital.q, capital.r))).toBe(true);
	});

	it('includes owned tiles and their neighbors', () => {
		const capital = { q: 0, r: 0 };
		const ownedTiles = [{ q: 10, r: 10 }]; // Far from capital
		const horizon = computeHorizon(capital, ownedTiles);

		// Should include the owned tile
		expect(horizon.has(coordKey(10, 10))).toBe(true);

		// Should include neighbors of owned tile
		const neighbors = getNeighbors(10, 10);
		for (const neighbor of neighbors) {
			expect(horizon.has(coordKey(neighbor.q, neighbor.r))).toBe(true);
		}
	});

	it('includes ring 2 around owned tiles', () => {
		const capital = { q: 0, r: 0 };
		const ownedTiles = [{ q: 10, r: 10 }];
		const horizon = computeHorizon(capital, ownedTiles);

		// Get ring 1 (neighbors of owned tile)
		const ring1 = getNeighbors(10, 10);

		// Get ring 2 (neighbors of ring 1)
		const ring2Set = new Set<string>();
		for (const r1Hex of ring1) {
			const ring2Neighbors = getNeighbors(r1Hex.q, r1Hex.r);
			for (const r2Hex of ring2Neighbors) {
				ring2Set.add(coordKey(r2Hex.q, r2Hex.r));
			}
		}

		// All ring 2 hexes should be in horizon
		for (const key of Array.from(ring2Set)) {
			expect(horizon.has(key)).toBe(true);
		}
	});

	it('combines capital radius and owned tile regions', () => {
		const capital = { q: 0, r: 0 };
		const ownedTiles = [{ q: 8, r: 8 }]; // Outside radius 5 from capital
		const horizon = computeHorizon(capital, ownedTiles);

		// Should include hexes near capital
		expect(horizon.has(coordKey(0, 0))).toBe(true);
		expect(horizon.has(coordKey(3, 0))).toBe(true);

		// Should include hexes near owned tile
		expect(horizon.has(coordKey(8, 8))).toBe(true);
		expect(horizon.has(coordKey(9, 8))).toBe(true);

		// Size should be sum of both regions (minus any overlap)
		const radius5Count = hexesInRadiusFrom(capital, 5).length;
		expect(horizon.size).toBeGreaterThan(radius5Count);
	});

	it('handles overlapping regions correctly', () => {
		const capital = { q: 0, r: 0 };
		// Owned tile within radius 5 of capital
		const ownedTiles = [{ q: 2, r: 2 }];
		const horizon = computeHorizon(capital, ownedTiles);

		// Should not double-count overlapping hexes
		// The owned tile and its neighbors are already in capital's radius
		// So the main addition is ring 2 around the owned tile

		// Verify owned tile is included
		expect(horizon.has(coordKey(2, 2))).toBe(true);

		// Verify capital is included
		expect(horizon.has(coordKey(0, 0))).toBe(true);

		// Set should have unique entries only
		const horizonArray = Array.from(horizon);
		const uniqueCount = new Set(horizonArray).size;
		expect(uniqueCount).toBe(horizon.size);
	});

	it('handles multiple owned tiles', () => {
		const capital = { q: 0, r: 0 };
		const ownedTiles = [
			{ q: 10, r: 10 },
			{ q: -10, r: -10 },
			{ q: 10, r: -10 },
		];
		const horizon = computeHorizon(capital, ownedTiles);

		// All owned tiles should be in horizon
		for (const tile of ownedTiles) {
			expect(horizon.has(coordKey(tile.q, tile.r))).toBe(true);
		}

		// Neighbors of all owned tiles should be in horizon
		for (const tile of ownedTiles) {
			const neighbors = getNeighbors(tile.q, tile.r);
			for (const neighbor of neighbors) {
				expect(horizon.has(coordKey(neighbor.q, neighbor.r))).toBe(true);
			}
		}

		// Should include capital radius
		const capitalRadius = hexesInRadiusFrom(capital, 5);
		for (const hex of capitalRadius) {
			expect(horizon.has(coordKey(hex.q, hex.r))).toBe(true);
		}
	});

	it('works with negative capital coordinates', () => {
		const capital = { q: -5, r: -5 };
		const ownedTiles: HexCoord[] = [];
		const horizon = computeHorizon(capital, ownedTiles);

		// Should include capital
		expect(horizon.has(coordKey(-5, -5))).toBe(true);

		// Should include hexes within radius 5
		const radius5 = hexesInRadiusFrom(capital, 5);
		for (const hex of radius5) {
			expect(horizon.has(coordKey(hex.q, hex.r))).toBe(true);
		}
	});

	it('formula: includes exactly owned + ring1 + ring2 + capital radius', () => {
		const capital = { q: 0, r: 0 };
		const ownedTiles = [{ q: 20, r: 20 }]; // Far from capital, no overlap
		const horizon = computeHorizon(capital, ownedTiles);

		// Build expected set manually
		const expected = new Set<string>();

		// Add capital radius (5 tiles)
		const capitalRadius = hexesInRadiusFrom(capital, 5);
		for (const hex of capitalRadius) {
			expected.add(coordKey(hex.q, hex.r));
		}

		// Add owned tile
		expected.add(coordKey(20, 20));

		// Add ring 1 (neighbors of owned)
		const ring1 = getNeighbors(20, 20);
		for (const hex of ring1) {
			expected.add(coordKey(hex.q, hex.r));
		}

		// Add ring 2 (neighbors of ring 1)
		for (const hex of ring1) {
			const ring2 = getNeighbors(hex.q, hex.r);
			for (const r2Hex of ring2) {
				expected.add(coordKey(r2Hex.q, r2Hex.r));
			}
		}

		// Horizon should match expected
		expect(horizon.size).toBe(expected.size);
		for (const key of Array.from(expected)) {
			expect(horizon.has(key)).toBe(true);
		}
	});

	it('handles adjacent owned tiles efficiently', () => {
		const capital = { q: 0, r: 0 };
		const ownedTiles = [
			{ q: 10, r: 10 },
			{ q: 11, r: 10 }, // Adjacent to first
		];
		const horizon = computeHorizon(capital, ownedTiles);

		// Both tiles should be in horizon
		expect(horizon.has(coordKey(10, 10))).toBe(true);
		expect(horizon.has(coordKey(11, 10))).toBe(true);

		// Should not double-count overlapping neighbor rings
		// Each tile adds its ring 1 and ring 2, but they overlap significantly
		const horizonArray = Array.from(horizon);
		const uniqueCount = new Set(horizonArray).size;
		expect(uniqueCount).toBe(horizon.size);
	});

	it('horizon is larger than line of sight', () => {
		const capital = { q: 0, r: 0 };
		const ownedTiles = [
			{ q: 0, r: 0 },
			{ q: 1, r: 0 },
		];

		const los = computeLineOfSight(ownedTiles);
		const horizon = computeHorizon(capital, ownedTiles);

		// Horizon should be larger because it includes:
		// - Capital radius (5 tiles)
		// - Ring 2 around owned tiles (LOS only has ring 1)
		expect(horizon.size).toBeGreaterThan(los.size);
	});

	it('handles capital that is also an owned tile', () => {
		const capital = { q: 0, r: 0 };
		const ownedTiles = [{ q: 0, r: 0 }]; // Capital is owned
		const horizon = computeHorizon(capital, ownedTiles);

		// Capital should be included (no double counting)
		expect(horizon.has(coordKey(0, 0))).toBe(true);

		// Should include capital radius (5) + rings around capital as owned tile
		// Since they overlap at center, just verify it's a reasonable size
		expect(horizon.size).toBeGreaterThan(0);

		// All hexes in radius 5 should be included
		const radius5 = hexesInRadiusFrom(capital, 5);
		for (const hex of radius5) {
			expect(horizon.has(coordKey(hex.q, hex.r))).toBe(true);
		}
	});
});
