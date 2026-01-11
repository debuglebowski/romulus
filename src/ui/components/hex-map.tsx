import { IconBuilding, IconStar } from '@tabler/icons-react';
import { useMemo } from 'react';

import type { Doc } from '../../../convex/_generated/dataModel';

const HEX_SIZE = 28;
const HEX_WIDTH = HEX_SIZE * 2;
const HEX_HEIGHT = Math.sqrt(3) * HEX_SIZE;

// Convert axial coords to pixel position
function axialToPixel(q: number, r: number): { x: number; y: number } {
	const x = HEX_SIZE * ((3 / 2) * q);
	const y = HEX_SIZE * ((Math.sqrt(3) / 2) * q + Math.sqrt(3) * r);
	return { x, y };
}

// Generate hex polygon points
function hexPoints(cx: number, cy: number): string {
	const points: string[] = [];
	for (let i = 0; i < 6; i++) {
		const angle = (Math.PI / 3) * i;
		const x = cx + HEX_SIZE * Math.cos(angle);
		const y = cy + HEX_SIZE * Math.sin(angle);
		points.push(`${x},${y}`);
	}
	return points.join(' ');
}

interface Player {
	_id: string;
	color: string;
	username: string;
}

interface HexMapProps {
	tiles: Doc<'tiles'>[];
	players: Player[];
}

export function HexMap({ tiles, players }: HexMapProps) {
	const playerColorMap = useMemo(() => {
		const map = new Map<string, string>();
		for (const p of players) {
			map.set(p._id, p.color);
		}
		return map;
	}, [players]);

	// Calculate bounds for viewBox
	const bounds = useMemo(() => {
		if (tiles.length === 0) return { minX: 0, minY: 0, maxX: 100, maxY: 100 };

		let minX = Infinity;
		let minY = Infinity;
		let maxX = -Infinity;
		let maxY = -Infinity;

		for (const tile of tiles) {
			const { x, y } = axialToPixel(tile.q, tile.r);
			minX = Math.min(minX, x - HEX_WIDTH / 2);
			minY = Math.min(minY, y - HEX_HEIGHT / 2);
			maxX = Math.max(maxX, x + HEX_WIDTH / 2);
			maxY = Math.max(maxY, y + HEX_HEIGHT / 2);
		}

		const padding = HEX_SIZE;
		return {
			minX: minX - padding,
			minY: minY - padding,
			maxX: maxX + padding,
			maxY: maxY + padding,
		};
	}, [tiles]);

	const viewBox = `${bounds.minX} ${bounds.minY} ${bounds.maxX - bounds.minX} ${bounds.maxY - bounds.minY}`;

	return (
		<svg viewBox={viewBox} className='h-full w-full' style={{ minHeight: 400 }}>
			{tiles.map((tile) => {
				const { x, y } = axialToPixel(tile.q, tile.r);
				const ownerColor = tile.ownerId ? playerColorMap.get(tile.ownerId) : undefined;

				let fillColor = '#374151'; // gray-700 for unowned
				if (ownerColor) {
					fillColor = ownerColor;
				} else if (tile.type === 'city') {
					fillColor = '#6b7280'; // gray-500 for NPC city
				}

				return (
					<g key={`${tile.q},${tile.r}`}>
						<polygon
							points={hexPoints(x, y)}
							fill={fillColor}
							stroke='#1f2937'
							strokeWidth={2}
							opacity={tile.ownerId ? 1 : 0.6}
						/>
						{tile.type === 'capital' && (
							<IconStar
								x={x - 10}
								y={y - 10}
								width={20}
								height={20}
								stroke='#fbbf24'
								fill='#fbbf24'
							/>
						)}
						{tile.type === 'city' && (
							<IconBuilding
								x={x - 8}
								y={y - 8}
								width={16}
								height={16}
								stroke={tile.ownerId ? '#fff' : '#9ca3af'}
								fill='none'
							/>
						)}
					</g>
				);
			})}
		</svg>
	);
}
