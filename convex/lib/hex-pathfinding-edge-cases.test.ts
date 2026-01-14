import { describe, it, expect } from 'vitest';
import { findPath, hexDistance, coordKey, type HexCoord } from './hex';

describe('findPath - Edge Cases', () => {
	it('finds optimal path when multiple routes exist', () => {
		const allTraversable = () => true;

		const path = findPath({ q: 0, r: 0 }, { q: 3, r: 3 }, allTraversable);
		expect(path).not.toBeNull();

		// The optimal path length should equal the hex distance
		const expectedLength = hexDistance({ q: 0, r: 0 }, { q: 3, r: 3 });
		expect(path!.length).toBe(expectedLength);
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

		// Verify each step is adjacent to the previous one
		let current = start;
		for (const step of path!) {
			expect(hexDistance(current, step)).toBe(1);
			current = step;
		}
	});
});
