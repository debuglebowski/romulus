import { Billboard, Html, Line, OrbitControls, useGLTF } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

import grassModelUrl from '@/assets/models/grass.glb?url';
import stoneModelUrl from '@/assets/models/stone.glb?url';
import mountainModelUrl from '@/assets/models/stone-mountain.glb?url';
// Import model URLs via Vite
import houseModelUrl from '@/assets/models/unit-house.glb?url';
import towerModelUrl from '@/assets/models/unit-tower.glb?url';

import type { ThreeEvent } from '@react-three/fiber';
import type { GLTF, OrbitControls as OrbitControlsType } from 'three-stdlib';

// Hex tile size in world units - calculated for models that are 1 unit wide (flat-to-flat)
// For flat-top hexes: spacing = HEX_SIZE * sqrt(3), so HEX_SIZE = 1/sqrt(3) for tiles to touch
const HEX_SIZE = 1 / Math.sqrt(3);
// True isometric angle: arctan(1/√2) ≈ 35.264° from vertical
// This is the "magic" isometric angle where all three axes appear equal
const ISOMETRIC_POLAR_ANGLE = Math.atan(1 / Math.sqrt(2)); // ~0.615 radians (~35.264°)
// Azimuth angle for isometric view (0° aligns with flat-top hex grid)
const ISOMETRIC_AZIMUTH_ANGLE = 0;
// Default zoom level for orthographic camera
const DEFAULT_ZOOM = 240;
// Keyboard pan speed (units per frame when holding arrow key)
const KEYBOARD_PAN_SPEED = 0.3;
// Height offset for buildings sitting on tiles
const BUILDING_Y_OFFSET = 0.1;
// Height offset for army units
const ARMY_Y_OFFSET = 0.25;
// Z offset to position armies at bottom of tile (positive Z = toward bottom in isometric)
const ARMY_Z_OFFSET = 0.25;
// Model-specific Y offsets to align tile bases (adjust these values to match model origins)
const MODEL_Y_OFFSETS = {
	grass: 0,
	stone: -0.05,
	mountain: 0,
} as const;

// Convert axial coordinates (q, r) to 3D world position (flat-top hex formula)
function axialToWorld(q: number, r: number, yOffset = 0): [number, number, number] {
	const x = HEX_SIZE * Math.sqrt(3) * (q + r / 2);
	const z = HEX_SIZE * (3 / 2) * r;
	return [x, yOffset, z];
}

// Props matching the original HexMap interface
export interface TileData {
	_id: string;
	q: number;
	r: number;
	ownerId?: string;
	type: 'empty' | 'city' | 'capital' | 'mountain';
	visibility: 'visible' | 'fogged' | 'unexplored';
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
	unitCount: number;
	totalHp: number;
	averageHp: number;
	averageHpPercent: number;
	isInCombat: boolean;
}

interface Player {
	_id: string;
	color: string;
	username: string;
}

interface HexMap3DProps {
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

// Preload models
useGLTF.preload(grassModelUrl);
useGLTF.preload(stoneModelUrl);
useGLTF.preload(towerModelUrl);
useGLTF.preload(houseModelUrl);
useGLTF.preload(mountainModelUrl);

// ============================================================================
// Building Model Component
// ============================================================================

interface BuildingModelProps {
	position: [number, number, number];
	modelPath: string;
	scale?: number;
	rotation?: [number, number, number];
}

function BuildingModel({ position, modelPath, scale = 1, rotation = [0, 0, 0] }: BuildingModelProps) {
	const { scene } = useGLTF(modelPath) as GLTF & { scene: THREE.Group };
	const clonedScene = useMemo(() => scene.clone(true), [scene]);

	return <primitive object={clonedScene} position={position} scale={scale} rotation={rotation} />;
}

// ============================================================================
// Interactive Hex Tile Component
// ============================================================================

interface HexTileProps {
	tile: TileData;
	ownerColor?: string;
	isSelected: boolean;
	isHovered: boolean;
	onClick: (e: ThreeEvent<MouseEvent>) => void;
	onPointerOver: (e: ThreeEvent<PointerEvent>) => void;
	onPointerOut: (e: ThreeEvent<PointerEvent>) => void;
}

// Create hexagon shape for hitbox
// Use fixed radius based on model's visual size (inradius ≈ 0.5 for 1-unit wide hex)
const hexagonShape = new THREE.Shape();
const hexRadius = 0.48;
for (let i = 0; i < 6; i++) {
	const angle = (Math.PI / 3) * i + Math.PI / 6; // Flat-top orientation
	const x = hexRadius * Math.cos(angle);
	const y = hexRadius * Math.sin(angle);
	if (i === 0) {
		hexagonShape.moveTo(x, y);
	} else {
		hexagonShape.lineTo(x, y);
	}
}
hexagonShape.closePath();

// ============================================================================
// Fog Tile Component (replaces water for unexplored areas)
// ============================================================================

interface FogTileProps {
	position: [number, number, number];
}

function FogTile({ position }: FogTileProps) {
	const { scene } = useGLTF(grassModelUrl) as GLTF & { scene: THREE.Group };
	const clonedScene = useMemo(() => scene.clone(true), [scene]);

	return (
		<group position={position}>
			{/* Base grass tile */}
			<primitive object={clonedScene} />

			{/* Stacked fog layers */}
			{[0.15, 0.25, 0.38].map((h, i) => (
				<mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, h, 0]}>
					<shapeGeometry args={[hexagonShape]} />
					<meshBasicMaterial color='#1f1f2e' transparent opacity={0.45 - i * 0.1} depthWrite={false} />
				</mesh>
			))}

			{/* Invisible hitbox (non-interactive for fog tiles) */}
			<mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.2, 0]}>
				<shapeGeometry args={[hexagonShape]} />
				<meshBasicMaterial visible={false} />
			</mesh>
		</group>
	);
}

// ============================================================================
// Visible Hex Tile Component (for visible/fogged tiles with model loading)
// ============================================================================

function VisibleHexTile({ tile, ownerColor, isSelected, isHovered, onClick, onPointerOver, onPointerOut }: HexTileProps) {
	const isFogged = tile.visibility === 'fogged';
	const isMountain = tile.type === 'mountain';

	// Determine model type and URL - all non-mountain tiles use grass as base
	const modelType = isMountain ? 'mountain' : 'grass';
	const modelUrl = isMountain ? mountainModelUrl : grassModelUrl;
	const { scene } = useGLTF(modelUrl) as GLTF & {
		scene: THREE.Group;
	};

	// Calculate Y offset with model-specific offset to align bases
	const modelYOffset = MODEL_Y_OFFSETS[modelType];
	const position = axialToWorld(tile.q, tile.r, modelYOffset);

	// Create border points in WORLD coordinates (matching MovementPath pattern)
	// Each tile gets unique Vector3 instances to avoid drei Line caching issues
	const borderPoints = useMemo(() => {
		if (!ownerColor) {
			return null;
		}
		const [tileX, , tileZ] = axialToWorld(tile.q, tile.r, 0);
		const points: THREE.Vector3[] = [];
		for (let i = 0; i <= 6; i++) {
			const angle = (Math.PI / 3) * (i % 6) + Math.PI / 6;
			points.push(new THREE.Vector3(tileX + 0.58 * Math.cos(angle), 0.21, tileZ + 0.58 * Math.sin(angle)));
		}
		return points;
	}, [ownerColor, tile.q, tile.r]);

	const clonedScene = useMemo(() => {
		const clone = scene.clone(true);
		clone.traverse((child) => {
			if (child instanceof THREE.Mesh && child.material) {
				const isArray = Array.isArray(child.material);
				const materials = isArray ? child.material : [child.material];

				const processed = materials.map((originalMat: THREE.Material) => {
					const mat = originalMat.clone();

					// Apply selection/hover effects
					if ((isSelected || isHovered) && 'emissive' in mat) {
						const stdMat = mat as THREE.MeshStandardMaterial;
						stdMat.emissive = new THREE.Color('#ffffff');
						stdMat.emissiveIntensity = isSelected ? 0.15 : 0.08;
					}

					mat.needsUpdate = true;
					return mat;
				});

				child.material = isArray ? processed : processed[0];
			}
		});
		return clone;
	}, [scene, isFogged, isSelected, isHovered]);

	return (
		<>
			<group position={position}>
				{/* Visible hex tile model */}
				<primitive object={clonedScene} />

				{/* Stacked fog layers for fogged tiles */}
				{isFogged && (
					<>
						{[0.15, 0.25, 0.38].map((h, i) => (
							<mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, h, 0]}>
								<shapeGeometry args={[hexagonShape]} />
								<meshBasicMaterial color='#1f1f2e' transparent opacity={0.45 - i * 0.1} depthWrite={false} />
							</mesh>
						))}
					</>
				)}

				{/* Invisible hitbox for click detection */}
				<mesh
					rotation={[-Math.PI / 2, 0, 0]}
					position={[0, 0.1, 0]}
					onClick={onClick}
					onPointerOver={onPointerOver}
					onPointerOut={onPointerOut}
				>
					<shapeGeometry args={[hexagonShape]} />
					<meshBasicMaterial visible={false} />
				</mesh>
			</group>

			{/* Ownership border - OUTSIDE group with world coordinates (matches MovementPath) */}
			{borderPoints && <Line points={borderPoints} color={ownerColor!} lineWidth={3} />}
		</>
	);
}

// ============================================================================
// HexTile Router Component (no hooks, delegates to specialized components)
// ============================================================================

function HexTile({ tile, ownerColor, isSelected, isHovered, onClick, onPointerOver, onPointerOut }: HexTileProps) {
	const isUnexplored = tile.visibility === 'unexplored';
	const isFogged = tile.visibility === 'fogged';
	const isMountain = tile.type === 'mountain';
	const isHiddenMountain = isMountain && (isUnexplored || isFogged);
	const shouldShowFog = isUnexplored || isHiddenMountain;

	// Render fog tile for unexplored or hidden mountain tiles
	if (shouldShowFog) {
		const position = axialToWorld(tile.q, tile.r, 0);
		return <FogTile position={position} />;
	}

	// Render visible tile for visible/fogged tiles
	return (
		<VisibleHexTile
			tile={tile}
			ownerColor={ownerColor}
			isSelected={isSelected}
			isHovered={isHovered}
			onClick={onClick}
			onPointerOver={onPointerOver}
			onPointerOut={onPointerOut}
		/>
	);
}

// ============================================================================
// Billboard Army Component (Shield Icon)
// ============================================================================

// Create shield silhouette shape (flat 2D, NO extrusion)
const shieldIconShape = new THREE.Shape();
const siw = 0.095; // shield icon half-width
const sih = 0.13; // shield icon half-height
shieldIconShape.moveTo(0, sih); // top center
shieldIconShape.lineTo(siw, sih * 0.5); // top-right
shieldIconShape.lineTo(siw, -sih * 0.3); // mid-right
shieldIconShape.lineTo(0, -sih); // bottom point
shieldIconShape.lineTo(-siw, -sih * 0.3); // mid-left
shieldIconShape.lineTo(-siw, sih * 0.5); // top-left
shieldIconShape.closePath();

interface BillboardArmyProps {
	army: ArmyData;
	color: string;
	isSelected: boolean;
	tiles: TileData[];
	now: number;
	onClick: (e: ThreeEvent<MouseEvent>) => void;
}

function BillboardArmy({ army, color, isSelected, tiles, now, onClick }: BillboardArmyProps) {
	// Calculate interpolated position for moving armies
	const position = useMemo((): [number, number, number] => {
		if (!army.departureTime || !army.arrivalTime || !army.path || army.path.length === 0) {
			// Stationary army - offset to bottom of tile
			const [x, y, z] = axialToWorld(army.currentQ, army.currentR, ARMY_Y_OFFSET);
			return [x, y, z + ARMY_Z_OFFSET];
		}

		const elapsed = Math.max(0, now - army.departureTime);
		const totalTime = army.arrivalTime - army.departureTime;
		const pathLength = army.path.length;
		const timePerHex = totalTime / pathLength;

		// Which segment are we in?
		const segmentIndex = Math.min(Math.floor(elapsed / timePerHex), pathLength - 1);
		const segmentProgress = Math.min((elapsed - segmentIndex * timePerHex) / timePerHex, 1);

		// Get origin hex
		const originTile = tiles.find((t) => t._id === army.tileId);
		const originHex = originTile ? { q: originTile.q, r: originTile.r } : army.path[0];

		// Determine from/to hexes for current segment
		const fromHex = segmentIndex === 0 ? originHex : army.path[segmentIndex - 1];
		const toHex = army.path[segmentIndex];

		// Interpolate position with Z offset for bottom of tile
		const from = axialToWorld(fromHex.q, fromHex.r, ARMY_Y_OFFSET);
		const to = axialToWorld(toHex.q, toHex.r, ARMY_Y_OFFSET);

		return [
			from[0] + (to[0] - from[0]) * segmentProgress,
			from[1] + (to[1] - from[1]) * segmentProgress,
			from[2] + ARMY_Z_OFFSET + (to[2] - from[2]) * segmentProgress,
		];
	}, [army, tiles, now]);

	// Subtle size scaling based on unit count
	const scale = 1 + Math.min(army.unitCount, 20) * 0.01;

	// HP bar color
	const hpPercent = army.averageHpPercent;
	const hpColor = hpPercent > 50 ? '#22c55e' : hpPercent > 25 ? '#f59e0b' : '#ef4444';
	const showHpBar = hpPercent < 100;

	return (
		<group position={position}>
			{/* Billboard shield icon - always faces camera */}
			<Billboard>
				{/* Dark outline (slightly larger, behind) */}
				<mesh position={[0, 0, -0.001]} scale={[scale * 1.2, scale * 1.2, 1]}>
					<shapeGeometry args={[shieldIconShape]} />
					<meshBasicMaterial color={isSelected ? '#ffffff' : '#1f2937'} side={THREE.DoubleSide} />
				</mesh>

				{/* Shield fill (player color) */}
				<mesh onClick={onClick} scale={[scale, scale, 1]}>
					<shapeGeometry args={[shieldIconShape]} />
					<meshBasicMaterial color={color} side={THREE.DoubleSide} />
				</mesh>
			</Billboard>

			{/* Combat indicator ring on ground */}
			{army.isInCombat && (
				<mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
					<ringGeometry args={[0.12, 0.16, 32]} />
					<meshBasicMaterial color='#ef4444' transparent opacity={0.6} side={THREE.DoubleSide} />
				</mesh>
			)}

			{/* Unit count badge */}
			<Html
				position={[0, 0.20, 0]}
				center
				style={{
					pointerEvents: 'none',
					userSelect: 'none',
				}}
			>
				<div
					style={{
						background: 'rgba(0, 0, 0, 0.85)',
						color: 'white',
						fontSize: '11px',
						fontWeight: 'bold',
						padding: '2px 5px',
						borderRadius: '3px',
						border: `2px solid ${color}`,
						whiteSpace: 'nowrap',
						boxShadow: isSelected ? `0 0 8px ${color}` : 'none',
					}}
				>
					{army.unitCount}
				</div>
			</Html>

			{/* HP bar (only show when damaged) */}
			{showHpBar && (
				<Html
					position={[0, -0.18, 0]}
					center
					style={{
						pointerEvents: 'none',
						userSelect: 'none',
					}}
				>
					<div
						style={{
							width: '28px',
							height: '4px',
							background: '#374151',
							borderRadius: '2px',
							overflow: 'hidden',
						}}
					>
						<div
							style={{
								width: `${hpPercent}%`,
								height: '100%',
								background: hpColor,
								borderRadius: '2px',
							}}
						/>
					</div>
				</Html>
			)}
		</group>
	);
}

// ============================================================================
// Movement Path Line Component
// ============================================================================

interface MovementPathProps {
	path: { q: number; r: number }[];
}

function MovementPath({ path }: MovementPathProps) {
	const points = useMemo(() => {
		return path.map((p) => new THREE.Vector3(...axialToWorld(p.q, p.r, 0.15)));
	}, [path]);

	if (points.length < 2) {
		return null;
	}

	return <Line points={points} color='#22c55e' lineWidth={3} dashed dashSize={0.2} gapSize={0.1} />;
}

// ============================================================================
// Rally Point Marker Component
// ============================================================================

interface RallyPointMarkerProps {
	position: [number, number, number];
}

function RallyPointMarker({ position }: RallyPointMarkerProps) {
	const groupRef = useRef<THREE.Group>(null);

	// Subtle bobbing animation
	useFrame(() => {
		if (groupRef.current) {
			groupRef.current.position.y = position[1] + Math.sin(Date.now() * 0.003) * 0.02;
		}
	});

	const flagColor = '#22c55e'; // Green consistent with 2D map

	return (
		<group ref={groupRef} position={position}>
			{/* Flag pole */}
			<mesh position={[0, 0.2, 0]}>
				<cylinderGeometry args={[0.015, 0.015, 0.4, 8]} />
				<meshStandardMaterial color='#8b7355' metalness={0.2} roughness={0.8} />
			</mesh>

			{/* Flag (triangular banner) */}
			<mesh position={[0.08, 0.32, 0]} rotation={[0, 0, 0]}>
				<coneGeometry args={[0.12, 0.18, 3]} />
				<meshStandardMaterial
					color={flagColor}
					emissive={flagColor}
					emissiveIntensity={0.3}
					metalness={0.1}
					roughness={0.6}
					side={THREE.DoubleSide}
				/>
			</mesh>

			{/* Glow ring at base */}
			<mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
				<ringGeometry args={[0.15, 0.2, 32]} />
				<meshBasicMaterial color={flagColor} transparent opacity={0.4} />
			</mesh>
		</group>
	);
}

// ============================================================================
// Camera Controller (Isometric Orthographic)
// ============================================================================

function CameraController({ tiles, mapCenter }: { tiles: TileData[]; mapCenter: [number, number, number] }) {
	const { camera } = useThree();
	const hasInitialized = useRef(false);

	useEffect(() => {
		if (tiles.length === 0 || hasInitialized.current) {
			return;
		}

		const [centerX, , centerZ] = mapCenter;

		// For orthographic isometric, position camera along isometric direction
		// Distance doesn't affect size (orthographic), but affects clipping
		const distance = 50;

		// Calculate camera position using spherical coordinates
		// polar angle from Y axis, azimuth from Z axis
		const cameraX = centerX + distance * Math.sin(ISOMETRIC_POLAR_ANGLE) * Math.sin(ISOMETRIC_AZIMUTH_ANGLE);
		const cameraY = distance * Math.cos(ISOMETRIC_POLAR_ANGLE);
		const cameraZ = centerZ + distance * Math.sin(ISOMETRIC_POLAR_ANGLE) * Math.cos(ISOMETRIC_AZIMUTH_ANGLE);

		camera.position.set(cameraX, cameraY, cameraZ);
		// NOTE: No camera.lookAt() - OrbitControls handles orientation via target prop
		camera.updateProjectionMatrix();

		hasInitialized.current = true;
	}, [tiles, camera, mapCenter]);

	return null;
}

// ============================================================================
// Keyboard Pan Controller
// ============================================================================

interface KeyboardPanControllerProps {
	controlsRef: React.RefObject<OrbitControlsType | null>;
}

function KeyboardPanController({ controlsRef }: KeyboardPanControllerProps) {
	const keysPressed = useRef<Set<string>>(new Set());

	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
				e.preventDefault();
				keysPressed.current.add(e.key);
			}
		};

		const handleKeyUp = (e: KeyboardEvent) => {
			keysPressed.current.delete(e.key);
		};

		window.addEventListener('keydown', handleKeyDown);
		window.addEventListener('keyup', handleKeyUp);

		return () => {
			window.removeEventListener('keydown', handleKeyDown);
			window.removeEventListener('keyup', handleKeyUp);
		};
	}, []);

	useFrame(() => {
		const keys = keysPressed.current;
		if (keys.size === 0 || !controlsRef.current) {
			return;
		}

		const controls = controlsRef.current;

		// Update OrbitControls target, not camera position directly
		// For isometric view with 0° azimuth, X is left/right, Z is up/down on screen
		if (keys.has('ArrowLeft')) {
			controls.target.x -= KEYBOARD_PAN_SPEED;
		}
		if (keys.has('ArrowRight')) {
			controls.target.x += KEYBOARD_PAN_SPEED;
		}
		if (keys.has('ArrowUp')) {
			controls.target.z -= KEYBOARD_PAN_SPEED;
		}
		if (keys.has('ArrowDown')) {
			controls.target.z += KEYBOARD_PAN_SPEED;
		}

		// Tell OrbitControls to recalculate camera position based on new target
		controls.update();
	});

	return null;
}

// ============================================================================
// Main Scene Component
// ============================================================================

interface HexSceneProps {
	tiles: TileData[];
	players: Player[];
	armies: ArmyData[];
	selectedTileId?: string;
	selectedArmyId?: string;
	rallyPointTileId?: string;
	movementPath?: { q: number; r: number }[];
	onTileClick?: (tileId: string, q: number, r: number) => void;
	onArmyClick?: (armyId: string) => void;
	onBackgroundClick?: () => void;
	setHoveredTileId: (id: string | null) => void;
}

function HexScene({
	tiles,
	players,
	armies,
	selectedTileId,
	selectedArmyId,
	rallyPointTileId,
	movementPath,
	onTileClick,
	onArmyClick,
	onBackgroundClick,
	setHoveredTileId,
}: HexSceneProps) {
	const [hoveredTileId, setLocalHoveredTileId] = useState<string | null>(null);
	const [now, setNow] = useState(Date.now());
	const controlsRef = useRef<OrbitControlsType>(null);

	// Update hover state both locally and in parent
	const handleSetHovered = useCallback(
		(id: string | null) => {
			setLocalHoveredTileId(id);
			setHoveredTileId(id);
		},
		[setHoveredTileId],
	);

	// Build player color map
	const playerColorMap = useMemo(() => {
		const map = new Map<string, string>();
		for (const p of players) {
			map.set(p._id, p.color);
		}
		return map;
	}, [players]);

	// Calculate map center for camera targeting
	const mapCenter = useMemo<[number, number, number]>(() => {
		if (tiles.length === 0) {
			return [0, 0, 0];
		}

		let minX = Infinity,
			maxX = -Infinity;
		let minZ = Infinity,
			maxZ = -Infinity;

		for (const tile of tiles) {
			const [x, , z] = axialToWorld(tile.q, tile.r);
			minX = Math.min(minX, x);
			maxX = Math.max(maxX, x);
			minZ = Math.min(minZ, z);
			maxZ = Math.max(maxZ, z);
		}

		return [(minX + maxX) / 2, 0, (minZ + maxZ) / 2];
	}, [tiles]);

	// All tiles are now rendered (unexplored shows as water)
	const visibleTiles = tiles;

	// Check if there are any moving armies for animation
	const hasMovingArmies = armies.some((a) => a.targetTileId && a.departureTime && a.arrivalTime && a.path?.length);

	// Update time for smooth animation of moving armies
	useEffect(() => {
		if (!hasMovingArmies) {
			return;
		}
		const interval = setInterval(() => setNow(Date.now()), 50); // 20fps for smooth movement
		return () => clearInterval(interval);
	}, [hasMovingArmies]);

	return (
		<>
			{/* Lighting */}
			<ambientLight intensity={0.6} />
			<directionalLight position={[10, 20, 10]} intensity={0.8} castShadow />

			{/* Background click plane */}
			<mesh
				position={[0, -0.5, 0]}
				rotation={[-Math.PI / 2, 0, 0]}
				onClick={(e) => {
					e.stopPropagation();
					onBackgroundClick?.();
				}}
			>
				<planeGeometry args={[1000, 1000]} />
				<meshBasicMaterial visible={false} />
			</mesh>

			{/* Render hex tiles */}
			{visibleTiles.map((tile) => {
				const ownerColor = tile.ownerId ? playerColorMap.get(tile.ownerId) : undefined;
				const isSelected = tile._id === selectedTileId;
				const isHovered = tile._id === hoveredTileId;
				const isUnexplored = tile.visibility === 'unexplored';
				const isMountain = tile.type === 'mountain';
				const isNonInteractive = isUnexplored || isMountain;

				return (
					<HexTile
						key={`tile-${tile.q}-${tile.r}`}
						tile={tile}
						ownerColor={ownerColor}
						isSelected={isNonInteractive ? false : isSelected}
						isHovered={isNonInteractive ? false : isHovered}
						onClick={(e) => {
							e.stopPropagation();
							if (!isNonInteractive) {
								onTileClick?.(tile._id, tile.q, tile.r);
							}
						}}
						onPointerOver={(e) => {
							e.stopPropagation();
							if (!isNonInteractive) {
								handleSetHovered(tile._id);
							}
						}}
						onPointerOut={() => {
							if (!isNonInteractive) {
								handleSetHovered(null);
							}
						}}
					/>
				);
			})}

			{/* Render buildings on city/capital tiles (skip unexplored and mountains) */}
			{visibleTiles.map((tile) => {
				if (tile.type === 'empty' || tile.type === 'mountain' || tile.visibility === 'unexplored') {
					return null;
				}

				const isCapital = tile.type === 'capital';
				const yOffset = BUILDING_Y_OFFSET + MODEL_Y_OFFSETS.grass;
				const [x, y, z] = axialToWorld(tile.q, tile.r, yOffset);
				// Position buildings at the top of the hex tile (negative Z with padding)
				const position: [number, number, number] = [x, y + 0.1, z - 0.2];
				const modelPath = isCapital ? towerModelUrl : houseModelUrl;
				// Rotate house 45 degrees around Y axis
				const rotation: [number, number, number] = isCapital ? [0, 0, 0] : [0, Math.PI / 4, 0];

				return <BuildingModel key={`building-${tile.q}-${tile.r}`} position={position} modelPath={modelPath} rotation={rotation} />;
			})}

			{/* Render armies */}
			{armies.map((army) => {
				const color = playerColorMap.get(army.ownerId) || '#888888';
				const isSelected = army._id === selectedArmyId;

				return (
					<BillboardArmy
						key={`army-${army._id}`}
						army={army}
						color={color}
						isSelected={isSelected}
						tiles={tiles}
						now={now}
						onClick={(e) => {
							e.stopPropagation();
							if (army.isOwn) {
								onArmyClick?.(army._id);
							}
						}}
					/>
				);
			})}

			{/* Movement path preview */}
			{movementPath && movementPath.length > 0 && <MovementPath path={movementPath} />}

			{/* Rally point marker */}
			{rallyPointTileId &&
				(() => {
					const rallyTile = tiles.find((t) => t._id === rallyPointTileId);
					if (!rallyTile) {
						return null;
					}
					const position = axialToWorld(rallyTile.q, rallyTile.r, 0.1);
					return <RallyPointMarker position={position} />;
				})()}

			{/* Camera controller */}
			<CameraController tiles={tiles} mapCenter={mapCenter} />

			{/* Keyboard pan controller */}
			<KeyboardPanController controlsRef={controlsRef} />

			{/* Orbit controls (configured for orthographic isometric) */}
			{/* Left-click is reserved for tile selection, right-click/middle for pan */}
			<OrbitControls
				ref={controlsRef}
				target={mapCenter}
				enablePan
				enableZoom
				enableRotate={false}
				screenSpacePanning
				panSpeed={1.5}
				zoomSpeed={0.3}
				minPolarAngle={ISOMETRIC_POLAR_ANGLE}
				maxPolarAngle={ISOMETRIC_POLAR_ANGLE}
				minAzimuthAngle={ISOMETRIC_AZIMUTH_ANGLE}
				maxAzimuthAngle={ISOMETRIC_AZIMUTH_ANGLE}
				minZoom={10}
				maxZoom={300}
				mouseButtons={{
					LEFT: THREE.MOUSE.PAN,
					MIDDLE: THREE.MOUSE.DOLLY,
					RIGHT: undefined as unknown as THREE.MOUSE,
				}}
			/>
		</>
	);
}

// ============================================================================
// Main HexMap3D Component
// ============================================================================

export function HexMap3D({
	tiles,
	players,
	armies = [],
	selectedTileId,
	selectedArmyId,
	rallyPointTileId,
	movementPath,
	onTileClick,
	onArmyClick,
	onBackgroundClick,
}: HexMap3DProps) {
	const [hoveredTileId, setHoveredTileId] = useState<string | null>(null);

	// Determine cursor based on hover state
	const cursor = hoveredTileId ? 'pointer' : 'grab';

	return (
		<Canvas
			className='h-full w-full'
			orthographic
			camera={{ zoom: DEFAULT_ZOOM, near: 0.1, far: 1000, position: [10, 10, 10] }}
			gl={{ antialias: true }}
			style={{ cursor }}
		>
			<color attach='background' args={['#111827']} />
			<HexScene
				tiles={tiles}
				players={players}
				armies={armies}
				selectedTileId={selectedTileId}
				selectedArmyId={selectedArmyId}
				rallyPointTileId={rallyPointTileId}
				movementPath={movementPath}
				onTileClick={onTileClick}
				onArmyClick={onArmyClick}
				onBackgroundClick={onBackgroundClick}
				setHoveredTileId={setHoveredTileId}
			/>
		</Canvas>
	);
}
