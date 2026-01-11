import { IconBuilding, IconFlag, IconShield, IconStar } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';

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
	type: 'empty' | 'city' | 'capital' | 'mountain';
	visibility: VisibilityState;
}

export interface ArmyData {
	_id: string;
	ownerId: string;
	tileId: string;
	currentQ: number;
	currentR: number;
	isOwn: boolean;
	path?: { q: number; r: number }[];
	targetTileId?: string;
	departureTime?: number;
	arrivalTime?: number;
	// Unit stats (computed from units table)
	unitCount: number;
	totalHp: number;
	averageHp: number;
	averageHpPercent: number;
	isInCombat: boolean;
}

interface HexMapProps {
	tiles: TileData[];
	players: Player[];
	currentPlayerId: string;
	armies?: ArmyData[];
	combatTileIds?: string[];
	selectedTileId?: string;
	selectedArmyId?: string;
	rallyPointTileId?: string;
	movementPath?: { q: number; r: number }[];
	onTileClick?: (tileId: string, q: number, r: number) => void;
	onArmyClick?: (armyId: string) => void;
	onBackgroundClick?: () => void;
}

const PAN_STEP = HEX_SIZE * 2; // pixels in SVG coords per arrow press
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.025;

export function HexMap({
	tiles,
	players,
	armies = [],
	combatTileIds = [],
	selectedTileId,
	selectedArmyId,
	rallyPointTileId,
	movementPath,
	onTileClick,
	onArmyClick,
	onBackgroundClick,
}: HexMapProps) {
	const combatTileSet = useMemo(() => new Set(combatTileIds), [combatTileIds]);
	const svgRef = useRef<SVGSVGElement>(null);
	const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
	const [isDragging, setIsDragging] = useState(false);
	const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
	const [hasDragged, setHasDragged] = useState(false);
	const [zoom, setZoom] = useState(1);
	const [now, setNow] = useState(Date.now());

	const playerColorMap = useMemo(() => {
		const map = new Map<string, string>();
		for (const p of players) {
			map.set(p._id, p.color);
		}
		return map;
	}, [players]);

	// Check if there are any moving armies for animation
	const hasMovingArmies = armies.some((a) => a.targetTileId && a.departureTime && a.arrivalTime && a.path?.length);

	// Update time for smooth animation of moving armies
	useEffect(() => {
		if (!hasMovingArmies) {
			return;
		}
		const interval = setInterval(() => setNow(Date.now()), 100); // 10fps
		return () => clearInterval(interval);
	}, [hasMovingArmies]);

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

	// Separate moving and stationary armies
	const { stationaryByCoord, movingArmies } = useMemo(() => {
		const stationary = new Map<string, ArmyData[]>();
		const moving: ArmyData[] = [];

		for (const army of armies) {
			if (army.targetTileId && army.departureTime && army.arrivalTime && army.path?.length) {
				moving.push(army);
			} else {
				const key = `${army.currentQ},${army.currentR},${army.ownerId}`;
				const existing = stationary.get(key) || [];
				existing.push(army);
				stationary.set(key, existing);
			}
		}
		return { stationaryByCoord: stationary, movingArmies: moving };
	}, [armies]);

	// Build a map of coordinate -> list of owner IDs for offset calculation when multiple teams share a tile
	const coordToOwners = useMemo(() => {
		const map = new Map<string, string[]>();
		for (const [key] of stationaryByCoord.entries()) {
			const parts = key.split(',');
			const coordKey = `${parts[0]},${parts[1]}`;
			const ownerId = parts[2];
			const owners = map.get(coordKey) || [];
			if (!owners.includes(ownerId)) {
				owners.push(ownerId);
				map.set(coordKey, owners);
			}
		}
		return map;
	}, [stationaryByCoord]);

	// Build movement path line (preview when selecting destination)
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

	// Get the selected moving army's destination tile for pulsing effect
	const selectedMovingArmyDestination = useMemo(() => {
		if (!selectedArmyId) {
			return null;
		}

		const selectedArmy = armies.find((a) => a._id === selectedArmyId);
		if (!selectedArmy?.targetTileId) {
			return null;
		}

		// Find the destination tile
		const destTile = tiles.find((t) => t._id === selectedArmy.targetTileId);
		if (!destTile) {
			return null;
		}

		return { q: destTile.q, r: destTile.r };
	}, [selectedArmyId, armies, tiles]);

	// Calculate interpolated pixel position for a moving army
	function getMovingArmyPosition(army: ArmyData): { x: number; y: number } {
		if (!army.departureTime || !army.arrivalTime || !army.path || army.path.length === 0) {
			// Fallback to current position
			return axialToPixel(army.currentQ, army.currentR);
		}

		const elapsed = Math.max(0, now - army.departureTime);
		const totalTime = army.arrivalTime - army.departureTime;
		const pathLength = army.path.length;
		const timePerHex = totalTime / pathLength;

		// Which segment are we in? (segment i = traveling to path[i])
		const segmentIndex = Math.min(Math.floor(elapsed / timePerHex), pathLength - 1);
		const segmentProgress = Math.min((elapsed - segmentIndex * timePerHex) / timePerHex, 1);

		// Get origin hex from tiles (army.tileId is the starting tile)
		const originTile = tiles.find((t) => t._id === army.tileId);
		const originHex = originTile ? { q: originTile.q, r: originTile.r } : army.path[0]; // Fallback if origin tile not visible

		// Determine from/to hexes for current segment
		const fromHex = segmentIndex === 0 ? originHex : army.path[segmentIndex - 1];
		const toHex = army.path[segmentIndex];

		// Interpolate pixel position
		const from = axialToPixel(fromHex.q, fromHex.r);
		const to = axialToPixel(toHex.q, toHex.r);

		return {
			x: from.x + (to.x - from.x) * segmentProgress,
			y: from.y + (to.y - from.y) * segmentProgress,
		};
	}

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
				<style>
					{`
						@keyframes shield-pulse {
							0%, 100% { opacity: 1; }
							50% { opacity: 0.5; }
						}
						@keyframes destination-pulse {
							0%, 100% { opacity: 1; stroke-width: 2; }
							50% { opacity: 0.4; stroke-width: 3; }
						}
						@keyframes combat-pulse {
							0%, 100% { stroke: #ef4444; stroke-width: 2; }
							50% { stroke: #fbbf24; stroke-width: 3; }
						}
						.animate-shield-pulse {
							animation: shield-pulse 1s ease-in-out infinite;
						}
						.animate-destination-pulse {
							animation: destination-pulse 1.5s ease-in-out infinite;
						}
						.animate-combat-pulse {
							animation: combat-pulse 0.8s ease-in-out infinite;
						}
					`}
				</style>
				<pattern id='fog-pattern' patternUnits='userSpaceOnUse' width='6' height='6'>
					<rect width='6' height='6' fill='#0a0a0a' />
					<line x1='0' y1='0' x2='6' y2='6' stroke='#1a1a1a' strokeWidth='1' />
					<line x1='6' y1='0' x2='0' y2='6' stroke='#1a1a1a' strokeWidth='1' />
				</pattern>
				<filter id='selection-glow' x='-50%' y='-50%' width='200%' height='200%'>
					<feGaussianBlur stdDeviation='2' result='blur' />
					<feMerge>
						<feMergeNode in='blur' />
						<feMergeNode in='SourceGraphic' />
					</feMerge>
				</filter>
				<filter id='shield-glow' x='-100%' y='-100%' width='300%' height='300%'>
					<feGaussianBlur stdDeviation='1.5' result='blur' />
					<feMerge>
						<feMergeNode in='blur' />
						<feMergeNode in='SourceGraphic' />
					</feMerge>
				</filter>
			</defs>

			{/* Clickable background to deselect */}
			<rect
				x={bounds.minX - 1000}
				y={bounds.minY - 1000}
				width={bounds.maxX - bounds.minX + 2000}
				height={bounds.maxY - bounds.minY + 2000}
				fill='transparent'
				onClick={() => {
					if (!hasDragged && onBackgroundClick) {
						onBackgroundClick();
					}
				}}
			/>

			{/* Tiles */}
			{tiles.map((tile) => {
				if (tile.visibility === 'unexplored') {
					return null;
				}

				const { x, y } = axialToPixel(tile.q, tile.r);
				const ownerColor = tile.ownerId ? playerColorMap.get(tile.ownerId) : undefined;
				const isFogged = tile.visibility === 'fogged';
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
							stroke='#1f2937'
							strokeWidth={2}
							opacity={isFogged ? 0.2 : tile.ownerId ? 1 : 0.6}
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

			{/* Combat indicators - pulsing ring around tiles with combat */}
			{tiles.map((tile) => {
				if (!combatTileSet.has(tile._id)) {
					return null;
				}
				const { x, y } = axialToPixel(tile.q, tile.r);
				return (
					<polygon
						key={`combat-${tile._id}`}
						points={hexPoints(x, y)}
						fill='none'
						stroke='#ef4444'
						strokeWidth={2}
						className='animate-combat-pulse'
					/>
				);
			})}

			{/* Selection ring - rendered after all tiles to be on top */}
			{selectedTileId &&
				(() => {
					const selectedTile = tiles.find((t) => t._id === selectedTileId);
					if (!selectedTile || selectedTile.visibility === 'unexplored') {
						return null;
					}
					const { x, y } = axialToPixel(selectedTile.q, selectedTile.r);
					return (
						<polygon
							points={hexPoints(x, y)}
							fill='none'
							stroke='#e5e7eb'
							strokeWidth={1.5}
							strokeDasharray='6,3'
							filter='url(#selection-glow)'
						/>
					);
				})()}

			{/* Movement path preview (when selecting destination) */}
			{pathLine && <polyline points={pathLine} fill='none' stroke='#22c55e' strokeWidth={3} strokeDasharray='8,4' opacity={0.8} />}

			{/* Pulsing ring around destination tile for selected moving army */}
			{selectedMovingArmyDestination &&
				(() => {
					const { x, y } = axialToPixel(selectedMovingArmyDestination.q, selectedMovingArmyDestination.r);
					return <polygon points={hexPoints(x, y)} fill='none' stroke='#f59e0b' strokeWidth={2} className='animate-destination-pulse' />;
				})()}

			{/* Stationary Armies (not directly selectable - select via tile) */}
			{Array.from(stationaryByCoord.entries()).map(([key, coordArmies]) => {
				const parts = key.split(',');
				const q = Number(parts[0]);
				const r = Number(parts[1]);
				const ownerId = parts[2];
				const { x, y } = axialToPixel(q, r);

				// Calculate horizontal offset when multiple teams share a tile
				const coordKey = `${q},${r}`;
				const owners = coordToOwners.get(coordKey) || [ownerId];
				const teamIndex = owners.indexOf(ownerId);
				const teamCount = owners.length;
				// Shield width is 10px, so offset by (shieldWidth + gap) to prevent overlap
				const offsetX = teamCount > 1 ? (teamIndex - (teamCount - 1) / 2) * 10.2 : 0;

				const totalCount = coordArmies.reduce((sum, a) => sum + a.unitCount, 0);
				const totalHp = coordArmies.reduce((sum, a) => sum + a.totalHp, 0);
				const avgHpPercent = totalCount > 0 ? (totalHp / (totalCount * 100)) * 100 : 100;
				const ownerColor = playerColorMap.get(ownerId) || '#888';
				const isInCombat = coordArmies.some((a) => a.isInCombat);

				return (
					<g key={`army-${key}`} style={{ pointerEvents: 'none' }}>
						{/* Shield filled with team color */}
						<IconShield
							x={x - 5 + offsetX}
							y={y + 7}
							width={10}
							height={10}
							stroke={isInCombat ? '#ef4444' : '#000'}
							strokeWidth={isInCombat ? 1.5 : 1}
							fill={ownerColor}
						/>
						{/* Count inside shield */}
						<text x={x + offsetX} y={y + 13} textAnchor='middle' dominantBaseline='middle' fontSize={4} fontWeight='bold' fill='#fff'>
							{totalCount}
						</text>
						{/* HP bar (only show if damaged) */}
						{avgHpPercent < 100 && (
							<g>
								<rect x={x - 6 + offsetX} y={y + 18} width={12} height={2} fill='#374151' rx={1} />
								<rect
									x={x - 6 + offsetX}
									y={y + 18}
									width={Math.max(0, (12 * avgHpPercent) / 100)}
									height={2}
									fill={avgHpPercent > 50 ? '#22c55e' : avgHpPercent > 25 ? '#f59e0b' : '#ef4444'}
									rx={1}
								/>
							</g>
						)}
					</g>
				);
			})}

			{/* Moving Armies (rendered with interpolated positions) */}
			{movingArmies.map((army) => {
				const { x, y } = getMovingArmyPosition(army);
				const isSelected = army._id === selectedArmyId;
				const ownerColor = playerColorMap.get(army.ownerId) || '#888';
				const avgHpPercent = army.averageHpPercent;

				return (
					<g
						key={`moving-army-${army._id}`}
						onClick={(e) => {
							e.stopPropagation();
							if (!hasDragged && army.isOwn) {
								onArmyClick?.(army._id);
							}
						}}
						style={{ cursor: army.isOwn && onArmyClick ? 'pointer' : 'default' }}
					>
						{/* Shield filled with team color */}
						<IconShield
							x={x - 5}
							y={y + 7}
							width={10}
							height={10}
							stroke={isSelected ? '#f59e0b' : '#000'}
							strokeWidth={isSelected ? 2 : 1}
							fill={ownerColor}
							filter={isSelected ? 'url(#shield-glow)' : undefined}
							className={isSelected ? 'animate-shield-pulse' : undefined}
						/>
						{/* Count inside shield */}
						<text x={x} y={y + 13} textAnchor='middle' dominantBaseline='middle' fontSize={4} fontWeight='bold' fill='#fff'>
							{army.unitCount}
						</text>
						{/* HP bar (only show if damaged) */}
						{avgHpPercent < 100 && (
							<g>
								<rect x={x - 6} y={y + 18} width={12} height={2} fill='#374151' rx={1} />
								<rect
									x={x - 6}
									y={y + 18}
									width={Math.max(0, (12 * avgHpPercent) / 100)}
									height={2}
									fill={avgHpPercent > 50 ? '#22c55e' : avgHpPercent > 25 ? '#f59e0b' : '#ef4444'}
									rx={1}
								/>
							</g>
						)}
					</g>
				);
			})}
		</svg>
	);
}
