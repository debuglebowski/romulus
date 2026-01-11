import { IconBuilding, IconFlag, IconShield, IconStar } from '@tabler/icons-react';
import { useMemo, useRef, useState } from 'react';

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

export type VisibilityState = 'visible' | 'fogged' | 'unexplored';

export interface TileData {
	_id: string;
	q: number;
	r: number;
	ownerId?: string;
	type: 'empty' | 'city' | 'capital';
	visibility: VisibilityState;
}

export interface ArmyData {
	_id: string;
	ownerId: string;
	tileId: string;
	count: number;
	currentQ: number;
	currentR: number;
	isOwn: boolean;
	path?: { q: number; r: number }[];
	targetTileId?: string;
}

interface HexMapProps {
	tiles: TileData[];
	players: Player[];
	currentPlayerId: string;
	armies?: ArmyData[];
	selectedTileId?: string;
	selectedArmyId?: string;
	rallyPointTileId?: string;
	movementPath?: { q: number; r: number }[];
	onTileClick?: (tileId: string, q: number, r: number) => void;
	onArmyClick?: (armyId: string) => void;
}

const PAN_STEP = HEX_SIZE * 2; // pixels in SVG coords per arrow press
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.025;

export function HexMap({
	tiles,
	players,
	armies = [],
	selectedTileId,
	selectedArmyId,
	rallyPointTileId,
	movementPath,
	onTileClick,
	onArmyClick,
}: HexMapProps) {
	const svgRef = useRef<SVGSVGElement>(null);
	const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
	const [isDragging, setIsDragging] = useState(false);
	const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
	const [hasDragged, setHasDragged] = useState(false);
	const [zoom, setZoom] = useState(1);

	const playerColorMap = useMemo(() => {
		const map = new Map<string, string>();
		for (const p of players) {
			map.set(p._id, p.color);
		}
		return map;
	}, [players]);

	// Calculate bounds for viewBox
	const bounds = useMemo(() => {
		if (tiles.length === 0) {
			return { minX: 0, minY: 0, maxX: 100, maxY: 100 };
		}

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

	// Group armies by current position
	const armiesByCoord = useMemo(() => {
		const map = new Map<string, ArmyData[]>();
		for (const army of armies) {
			const key = `${army.currentQ},${army.currentR}`;
			const existing = map.get(key) || [];
			existing.push(army);
			map.set(key, existing);
		}
		return map;
	}, [armies]);

	// Build movement path line
	const pathLine = useMemo(() => {
		if (!movementPath || movementPath.length === 0) {
			return null;
		}
		const points = movementPath.map((p) => {
			const { x, y } = axialToPixel(p.q, p.r);
			return `${x},${y}`;
		});
		return points.join(' ');
	}, [movementPath]);

	// Convert screen delta to SVG coordinate delta
	function screenToSvgDelta(dx: number, dy: number) {
		const svg = svgRef.current;
		if (!svg) {
			return { dx: 0, dy: 0 };
		}
		const rect = svg.getBoundingClientRect();
		const viewBoxWidth = bounds.maxX - bounds.minX;
		const viewBoxHeight = bounds.maxY - bounds.minY;
		return {
			dx: (dx / rect.width) * viewBoxWidth,
			dy: (dy / rect.height) * viewBoxHeight,
		};
	}

	function handleMouseDown(e: React.MouseEvent) {
		if (e.button !== 0) {
			return; // Only left click
		}
		setIsDragging(true);
		setHasDragged(false);
		setDragStart({ x: e.clientX, y: e.clientY });
	}

	function handleMouseMove(e: React.MouseEvent) {
		if (!isDragging) {
			return;
		}
		const dx = e.clientX - dragStart.x;
		const dy = e.clientY - dragStart.y;
		// Only set hasDragged if moved more than a small threshold
		if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
			setHasDragged(true);
		}
		const svgDelta = screenToSvgDelta(dx, dy);
		setPanOffset((prev) => ({
			x: prev.x + svgDelta.dx,
			y: prev.y + svgDelta.dy,
		}));
		setDragStart({ x: e.clientX, y: e.clientY });
	}

	function handleMouseUp() {
		setIsDragging(false);
	}

	function handleMouseLeave() {
		setIsDragging(false);
	}

	function handleKeyDown(e: React.KeyboardEvent) {
		// Handle zoom with +/- keys
		if (e.key === '+' || e.key === '=') {
			e.preventDefault();
			setZoom((prev) => Math.min(ZOOM_MAX, prev + ZOOM_STEP));
			return;
		}
		if (e.key === '-' || e.key === '_') {
			e.preventDefault();
			setZoom((prev) => Math.max(ZOOM_MIN, prev - ZOOM_STEP));
			return;
		}

		// Handle pan with arrow keys
		const delta = { x: 0, y: 0 };
		switch (e.key) {
			case 'ArrowUp':
				delta.y = PAN_STEP;
				break;
			case 'ArrowDown':
				delta.y = -PAN_STEP;
				break;
			case 'ArrowLeft':
				delta.x = PAN_STEP;
				break;
			case 'ArrowRight':
				delta.x = -PAN_STEP;
				break;
			default:
				return;
		}
		e.preventDefault();
		setPanOffset((prev) => ({ x: prev.x + delta.x, y: prev.y + delta.y }));
	}

	function handleWheel(e: React.WheelEvent) {
		e.preventDefault();
		const zoomDelta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
		setZoom((prev) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, prev + zoomDelta)));
	}

	const baseWidth = bounds.maxX - bounds.minX;
	const baseHeight = bounds.maxY - bounds.minY;
	const zoomedWidth = baseWidth / zoom;
	const zoomedHeight = baseHeight / zoom;
	// Center the zoom by adjusting the origin
	const zoomOffsetX = (baseWidth - zoomedWidth) / 2;
	const zoomOffsetY = (baseHeight - zoomedHeight) / 2;
	const viewBox = `${bounds.minX + zoomOffsetX - panOffset.x} ${bounds.minY + zoomOffsetY - panOffset.y} ${zoomedWidth} ${zoomedHeight}`;

	return (
		<svg
			ref={svgRef}
			viewBox={viewBox}
			tabIndex={0}
			className='h-full w-full outline-none focus:ring-2 focus:ring-blue-500/50'
			style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
			onMouseDown={handleMouseDown}
			onMouseMove={handleMouseMove}
			onMouseUp={handleMouseUp}
			onMouseLeave={handleMouseLeave}
			onKeyDown={handleKeyDown}
			onWheel={handleWheel}
		>
			<defs>
				<pattern id='fog-pattern' patternUnits='userSpaceOnUse' width='6' height='6'>
					<rect width='6' height='6' fill='#0a0a0a' />
					<line x1='0' y1='0' x2='6' y2='6' stroke='#1a1a1a' strokeWidth='1' />
					<line x1='6' y1='0' x2='0' y2='6' stroke='#1a1a1a' strokeWidth='1' />
				</pattern>
			</defs>

			{/* Tiles */}
			{tiles.map((tile) => {
				if (tile.visibility === 'unexplored') {
					return null;
				}

				const { x, y } = axialToPixel(tile.q, tile.r);
				const ownerColor = tile.ownerId ? playerColorMap.get(tile.ownerId) : undefined;
				const isFogged = tile.visibility === 'fogged';
				const isSelected = tile._id === selectedTileId;
				const isRallyPoint = tile._id === rallyPointTileId;

				let fillColor = '#374151';
				if (ownerColor) {
					fillColor = ownerColor;
				} else if (tile.type === 'city') {
					fillColor = '#6b7280';
				}

				return (
					<g
						key={`tile-${tile.q},${tile.r}`}
						onClick={() => {
							if (!hasDragged) {
								onTileClick?.(tile._id, tile.q, tile.r);
							}
						}}
						style={{ cursor: onTileClick ? 'pointer' : 'default' }}
					>
						<polygon
							points={hexPoints(x, y)}
							fill={fillColor}
							stroke={isSelected ? '#fff' : '#1f2937'}
							strokeWidth={isSelected ? 3 : 2}
							opacity={isFogged ? 0.35 : tile.ownerId ? 1 : 0.6}
						/>
						{isFogged && <polygon points={hexPoints(x, y)} fill='url(#fog-pattern)' opacity={0.7} />}
						{tile.type === 'capital' && (
							<IconStar x={x - 10} y={y - 10} width={20} height={20} stroke='#fbbf24' fill='#fbbf24' opacity={isFogged ? 0.4 : 1} />
						)}
						{tile.type === 'city' && (
							<IconBuilding
								x={x - 8}
								y={y - 8}
								width={16}
								height={16}
								stroke={tile.ownerId ? '#fff' : '#9ca3af'}
								fill='none'
								opacity={isFogged ? 0.4 : 1}
							/>
						)}
						{isRallyPoint && <IconFlag x={x + 6} y={y - 14} width={14} height={14} stroke='#22c55e' fill='#22c55e' />}
					</g>
				);
			})}

			{/* Movement path preview */}
			{pathLine && <polyline points={pathLine} fill='none' stroke='#22c55e' strokeWidth={3} strokeDasharray='8,4' opacity={0.8} />}

			{/* Armies */}
			{Array.from(armiesByCoord.entries()).map(([coord, coordArmies]) => {
				const [q, r] = coord.split(',').map(Number);
				const { x, y } = axialToPixel(q, r);

				// Show only the first army icon, sum counts if multiple
				const primaryArmy = coordArmies[0];
				const totalCount = coordArmies.reduce((sum, a) => sum + a.count, 0);
				const isSelected = coordArmies.some((a) => a._id === selectedArmyId);
				const ownerColor = playerColorMap.get(primaryArmy.ownerId) || '#888';

				return (
					<g
						key={`army-${coord}`}
						onClick={(e) => {
							e.stopPropagation();
							if (!hasDragged && primaryArmy.isOwn) {
								onArmyClick?.(primaryArmy._id);
							}
						}}
						style={{ cursor: primaryArmy.isOwn && onArmyClick ? 'pointer' : 'default' }}
					>
						<circle
							cx={x}
							cy={y + 12}
							r={12}
							fill={ownerColor}
							stroke={isSelected ? '#fff' : '#000'}
							strokeWidth={isSelected ? 2 : 1}
							opacity={0.9}
						/>
						<IconShield x={x - 6} y={y + 6} width={12} height={12} stroke='#fff' fill='none' />
						<text x={x} y={y + 18} textAnchor='middle' fontSize={8} fontWeight='bold' fill='#fff'>
							{totalCount}
						</text>
					</g>
				);
			})}
		</svg>
	);
}
