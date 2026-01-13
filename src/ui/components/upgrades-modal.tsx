import {
	IconArrowRight,
	IconCheck,
	IconCoins,
	IconEye,
	IconLock,
	IconRun,
	IconShield,
	IconSpy,
	IconSwords,
	IconTool,
	IconUsers,
	IconX,
} from '@tabler/icons-react';
import { useMutation, useQuery } from 'convex/react';
import { useState } from 'react';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/ui/_shadcn/dialog';

import { api } from '../../../convex/_generated/api';
import { UPGRADE_DEFINITIONS, UPGRADE_MAP } from '../../../convex/lib/upgradeDefinitions';

import type { Id } from '../../../convex/_generated/dataModel';
import type { UpgradeCategory, UpgradeDefinition } from '../../../convex/lib/upgradeDefinitions';

interface Player {
	_id: string;
	color: string;
	username: string;
}

interface UpgradesModalProps {
	gameId: string;
	playerGold: number;
	totalPopulation: number;
	isCapitalMoving?: boolean;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	players?: Player[];
}

const CATEGORY_ORDER: UpgradeCategory[] = ['military', 'spy', 'economy', 'movement'];

const CATEGORY_LABELS: Record<UpgradeCategory, string> = {
	military: 'Military',
	spy: 'Espionage',
	economy: 'Economy',
	movement: 'Movement',
};

const CATEGORY_ICONS: Record<UpgradeCategory, React.ReactNode> = {
	military: <IconShield size={16} />,
	spy: <IconSpy size={16} />,
	economy: <IconTool size={16} />,
	movement: <IconRun size={16} />,
};

// Group upgrades into branches (tier1 -> tier2)
interface UpgradeBranch {
	tier1: UpgradeDefinition;
	tier2?: UpgradeDefinition;
}

function getUpgradeBranches(category: UpgradeCategory): UpgradeBranch[] {
	const categoryUpgrades = UPGRADE_DEFINITIONS.filter((u) => u.category === category);

	// Find root upgrades (no prerequisites within same category)
	const roots = categoryUpgrades.filter(
		(u) => u.prerequisites.length === 0 || !categoryUpgrades.some((other) => u.prerequisites.includes(other.id)),
	);

	// Build branches
	const branches: UpgradeBranch[] = [];
	for (const root of roots) {
		const tier2 = categoryUpgrades.find((u) => u.prerequisites.includes(root.id));
		branches.push({ tier1: root, tier2 });
	}

	return branches;
}

export function UpgradesModal({
	gameId,
	playerGold,
	totalPopulation,
	isCapitalMoving = false,
	open,
	onOpenChange,
	players = [],
}: UpgradesModalProps) {
	const myUpgrades = useQuery(api.upgrades.getMyUpgrades, { gameId: gameId as Id<'games'> });
	const knownEnemyUpgrades = useQuery(api.upgrades.getKnownEnemyUpgrades, { gameId: gameId as Id<'games'> });
	const purchaseUpgrade = useMutation(api.upgrades.purchaseUpgrade);
	const [purchasing, setPurchasing] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [activeTab, setActiveTab] = useState<'my' | 'enemy'>('my');

	const purchasedIds = new Set(myUpgrades?.upgrades.map((u) => u.upgradeId) ?? []);
	const hasEnemyIntel = (knownEnemyUpgrades?.length ?? 0) > 0;

	const getUpgradeStatus = (upgrade: UpgradeDefinition): 'purchased' | 'available' | 'locked' => {
		if (purchasedIds.has(upgrade.id)) {
			return 'purchased';
		}

		// Check prerequisites
		const hasPrereqs = upgrade.prerequisites.every((prereq) => purchasedIds.has(prereq));
		if (!hasPrereqs) {
			return 'locked';
		}

		// Check population requirement
		if (totalPopulation < upgrade.populationRequired) {
			return 'locked';
		}

		return 'available';
	};

	const canAfford = (upgrade: UpgradeDefinition): boolean => {
		return playerGold >= upgrade.goldCost;
	};

	const handlePurchase = async (upgradeId: string) => {
		if (isCapitalMoving) {
			setError('Cannot purchase while capital is relocating');
			return;
		}

		setPurchasing(upgradeId);
		setError(null);

		try {
			await purchaseUpgrade({
				gameId: gameId as Id<'games'>,
				upgradeId,
			});
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Purchase failed');
		} finally {
			setPurchasing(null);
		}
	};

	const getMissingRequirement = (upgrade: UpgradeDefinition): string | null => {
		for (const prereq of upgrade.prerequisites) {
			if (!purchasedIds.has(prereq)) {
				const prereqUpgrade = UPGRADE_DEFINITIONS.find((u) => u.id === prereq);
				return `Requires: ${prereqUpgrade?.name ?? prereq}`;
			}
		}

		if (totalPopulation < upgrade.populationRequired) {
			return `Need ${upgrade.populationRequired} pop`;
		}

		return null;
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className='sm:max-w-2xl bg-zinc-900 z-100' showCloseButton={false}>
				<DialogHeader>
					<div className='flex items-center justify-between'>
						<DialogTitle className='text-white'>Upgrades</DialogTitle>
						<div className='flex items-center gap-4 text-sm'>
							<div className='flex items-center gap-1.5 text-zinc-300'>
								<IconCoins size={14} className='text-yellow-500' />
								<span>{Math.floor(playerGold)}</span>
							</div>
							<div className='flex items-center gap-1.5 text-zinc-300'>
								<IconUsers size={14} />
								<span>{totalPopulation}</span>
							</div>
							<button
								onClick={() => onOpenChange(false)}
								className='p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors'
							>
								<IconX size={16} />
							</button>
						</div>
					</div>
				</DialogHeader>

				{/* Tabs */}
				<div className='flex gap-2 border-b border-zinc-800 pb-2'>
					<button
						onClick={() => setActiveTab('my')}
						className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
							activeTab === 'my' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
						}`}
					>
						My Upgrades
					</button>
					<button
						onClick={() => setActiveTab('enemy')}
						className={`px-3 py-1.5 text-xs font-medium rounded transition-colors flex items-center gap-1.5 ${
							activeTab === 'enemy' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
						}`}
					>
						<IconEye size={12} />
						Enemy Intel
						{hasEnemyIntel && (
							<span className='bg-red-600 text-white text-[10px] px-1.5 py-0.5 rounded-full'>
								{knownEnemyUpgrades?.reduce((sum, e) => sum + e.upgrades.length, 0)}
							</span>
						)}
					</button>
				</div>

				{/* Error message */}
				{error && (
					<div className='px-3 py-2 rounded bg-red-900/30 border border-red-800/50'>
						<p className='text-xs text-red-400'>{error}</p>
					</div>
				)}

				{/* My Upgrades Tab */}
				{activeTab === 'my' && (
					<div className='space-y-4'>
						{CATEGORY_ORDER.map((category) => {
							const branches = getUpgradeBranches(category);
							if (branches.length === 0) {
								return null;
							}

							return (
								<div key={category} className='space-y-2'>
									{/* Category header */}
									<div className='flex items-center gap-2 text-sm text-zinc-300'>
										{CATEGORY_ICONS[category]}
										<span className='font-medium'>{CATEGORY_LABELS[category]}</span>
									</div>

									{/* Branches */}
									<div className='space-y-2 pl-6'>
										{branches.map((branch, idx) => (
											<div key={idx} className='flex items-center gap-2'>
												{/* Tier 1 */}
												<UpgradeNode
													upgrade={branch.tier1}
													status={getUpgradeStatus(branch.tier1)}
													canAfford={canAfford(branch.tier1)}
													missingRequirement={getMissingRequirement(branch.tier1)}
													isPurchasing={purchasing === branch.tier1.id}
													onPurchase={() => handlePurchase(branch.tier1.id)}
												/>

												{/* Arrow to tier 2 */}
												{branch.tier2 && (
													<>
														<IconArrowRight size={16} className='text-zinc-600 shrink-0' />
														<UpgradeNode
															upgrade={branch.tier2}
															status={getUpgradeStatus(branch.tier2)}
															canAfford={canAfford(branch.tier2)}
															missingRequirement={getMissingRequirement(branch.tier2)}
															isPurchasing={purchasing === branch.tier2.id}
															onPurchase={() => handlePurchase(branch.tier2.id)}
														/>
													</>
												)}
											</div>
										))}
									</div>
								</div>
							);
						})}
					</div>
				)}

				{/* Enemy Intel Tab */}
				{activeTab === 'enemy' && (
					<div className='space-y-4'>
						{!hasEnemyIntel ? (
							<div className='text-center py-8'>
								<IconEye size={32} className='mx-auto text-zinc-600 mb-2' />
								<p className='text-zinc-400 text-sm'>No enemy upgrades discovered yet</p>
								<p className='text-zinc-500 text-xs mt-1'>
									Upgrades are revealed through combat or spy intel at enemy capitals (9 min)
								</p>
							</div>
						) : (
							knownEnemyUpgrades?.map((enemyData) => {
								const enemy = players.find((p) => p._id === enemyData.enemyPlayerId);
								return (
									<div key={enemyData.enemyPlayerId} className='space-y-2'>
										{/* Enemy header */}
										<div className='flex items-center gap-2'>
											<div className='w-3 h-3 rounded-full' style={{ backgroundColor: enemy?.color ?? '#666' }} />
											<span className='text-sm font-medium text-white'>{enemy?.username ?? 'Unknown'}</span>
											<span className='text-xs text-zinc-500'>
												({enemyData.upgrades.length} upgrade{enemyData.upgrades.length !== 1 ? 's' : ''})
											</span>
										</div>

										{/* Discovered upgrades */}
										<div className='grid grid-cols-2 gap-2 pl-5'>
											{enemyData.upgrades.map((known) => {
												const upgrade = UPGRADE_MAP.get(known.upgradeId);
												if (!upgrade) {
													return null;
												}
												return (
													<div key={known.upgradeId} className='rounded border border-zinc-700 bg-zinc-800/50 p-2'>
														<div className='flex items-start justify-between gap-2'>
															<div className='flex-1'>
																<p className='text-xs font-medium text-zinc-200'>{upgrade.name}</p>
																<p className='text-[10px] text-zinc-400 mt-0.5'>{upgrade.description}</p>
															</div>
															<div className='shrink-0'>
																{known.revealSource === 'combat' ? (
																	<IconSwords size={12} className='text-red-400' title='Revealed in combat' />
																) : (
																	<IconSpy size={12} className='text-purple-400' title='Revealed by spy' />
																)}
															</div>
														</div>
													</div>
												);
											})}
										</div>
									</div>
								);
							})
						)}
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}

interface UpgradeNodeProps {
	upgrade: UpgradeDefinition;
	status: 'purchased' | 'available' | 'locked';
	canAfford: boolean;
	missingRequirement: string | null;
	isPurchasing: boolean;
	onPurchase: () => void;
}

function UpgradeNode({ upgrade, status, canAfford, missingRequirement, isPurchasing, onPurchase }: UpgradeNodeProps) {
	const isPurchased = status === 'purchased';
	const isLocked = status === 'locked';
	const isAvailable = status === 'available';

	return (
		<div
			className={`relative flex-1 min-w-[140px] max-w-[200px] rounded-lg border p-2 transition-colors ${
				isPurchased
					? 'border-green-700 bg-green-900/40'
					: isLocked
						? 'border-zinc-600 bg-zinc-800 opacity-60'
						: canAfford
							? 'border-amber-600 bg-zinc-800 hover:border-amber-500'
							: 'border-zinc-600 bg-zinc-800'
			}`}
		>
			{/* Status icon */}
			<div className='absolute -top-1.5 -right-1.5'>
				{isPurchased && (
					<div className='rounded-full bg-green-600 p-0.5'>
						<IconCheck size={10} className='text-white' />
					</div>
				)}
				{isLocked && (
					<div className='rounded-full bg-zinc-600 p-0.5'>
						<IconLock size={10} className='text-zinc-400' />
					</div>
				)}
			</div>

			{/* Content */}
			<div className='space-y-1'>
				<p className={`text-xs font-medium leading-tight ${isPurchased ? 'text-green-400' : isLocked ? 'text-zinc-400' : 'text-white'}`}>
					{upgrade.name}
				</p>
				<p className={`text-[10px] leading-tight ${isLocked ? 'text-zinc-500' : 'text-zinc-300'}`}>{upgrade.description}</p>

				{/* Requirement warning */}
				{isLocked && missingRequirement && <p className='text-[10px] text-amber-500/80 leading-tight'>{missingRequirement}</p>}

				{/* Purchase button / Cost */}
				{!isPurchased && (
					<div className='pt-1'>
						{isAvailable ? (
							<button
								onClick={onPurchase}
								disabled={!canAfford || isPurchasing}
								className={`w-full px-2 py-1 rounded text-[10px] font-medium flex items-center justify-center gap-1 transition-colors ${
									canAfford ? 'bg-amber-600 text-white hover:bg-amber-500' : 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
								}`}
							>
								{isPurchasing ? (
									<span>...</span>
								) : (
									<>
										<IconCoins size={10} />
										<span>{upgrade.goldCost}g</span>
									</>
								)}
							</button>
						) : (
							<div className='text-[10px] text-zinc-500 flex items-center justify-center gap-1'>
								<IconCoins size={10} />
								<span>{upgrade.goldCost}g</span>
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
