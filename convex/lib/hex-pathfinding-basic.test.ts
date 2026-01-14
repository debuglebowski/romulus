import { describe, it, expect } from 'vitest';
import { findPath, hexDistance, coordKey, type HexCoord } from './hex';

describe('findPath - Basic Paths', () => {
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
});
