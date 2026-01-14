import { IconCheck, IconCoins, IconLock, IconRun, IconShield, IconSpy, IconTool, IconUsers } from '@tabler/icons-react';
import { useMutation, useQuery } from 'convex/react';
import { useState } from 'react';

import { api } from '../../../convex/_generated/api';
import { UPGRADE_DEFINITIONS } from '../../../convex/lib/upgradeDefinitions';

import type { Id } from '../../../convex/_generated/dataModel';
import type { UpgradeCategory, UpgradeDefinition } from '../../../convex/lib/upgradeDefinitions';

interface UpgradesPanelProps {
	gameId: string;
	playerGold: number;
	totalPopulation: number;
	isCapitalMoving?: boolean;
	onClose: () => void;
}

const CATEGORY_ORDER: UpgradeCategory[] = ['military', 'spy', 'economy', 'movement'];

const CATEGORY_LABELS: Record<UpgradeCategory, string> = {
	military: 'Military',
	spy: 'Espionage',
	economy: 'Economy',
	movement: 'Movement',
};

const CATEGORY_ICONS: Record<UpgradeCategory, React.ReactNode> = {
	military: <IconShield size={14} />,
	spy: <IconSpy size={14} />,
	economy: <IconTool size={14} />,
	movement: <IconRun size={14} />,
};

export function UpgradesPanel({ gameId, playerGold, totalPopulation, isCapitalMoving = false, onClose }: UpgradesPanelProps) {
	const myUpgrades = useQuery(api.upgrades.getMyUpgrades, { gameId: gameId as Id<'games'> });
	const purchaseUpgrade = useMutation(api.upgrades.purchaseUpgrade);
	const [purchasing, setPurchasing] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const purchasedIds = new Set(myUpgrades?.upgrades.map((u) => u.upgradeId) ?? []);

	// Group upgrades by category
	const upgradesByCategory = new Map<UpgradeCategory, UpgradeDefinition[]>();
	for (const upgrade of UPGRADE_DEFINITIONS) {
		const list = upgradesByCategory.get(upgrade.category) ?? [];
		list.push(upgrade);
		upgradesByCategory.set(upgrade.category, list);
	}

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

		// Check gold (available even if can't afford - just can't purchase)
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
		// Check prerequisites first
		for (const prereq of upgrade.prerequisites) {
			if (!purchasedIds.has(prereq)) {
				const prereqUpgrade = UPGRADE_DEFINITIONS.find((u) => u.id === prereq);
				return `Requires: ${prereqUpgrade?.name ?? prereq}`;
			}
		}

		// Check population
		if (totalPopulation < upgrade.populationRequired) {
			return `Need ${upgrade.populationRequired} pop (have ${totalPopulation})`;
		}

		return null;
	};

	return (
		<div className='border border-[var(--border-default)] bg-[var(--bg-base)] overflow-hidden max-h-[500px] flex flex-col'>
			{/* Header */}
			<div className='flex items-center justify-between px-3 py-2 border-b border-[var(--border-default)] bg-[var(--bg-surface)]/50'>
				<h3 className='text-sm font-medium text-white uppercase'>Upgrades</h3>
				<div className='flex items-center gap-3'>
					<div className='flex items-center gap-1 text-xs text-[var(--text-muted)]'>
						<IconCoins size={12} className='text-[var(--accent)]' />
						<span className='tabular-nums'>{Math.floor(playerGold)}</span>
					</div>
					<div className='flex items-center gap-1 text-xs text-[var(--text-muted)]'>
						<IconUsers size={12} />
						<span className='tabular-nums'>{totalPopulation}</span>
					</div>
					<button onClick={onClose} className='text-[var(--text-muted)] hover:text-white text-xs'>
						Close
					</button>
				</div>
			</div>

			{/* Error message */}
			{error && (
				<div className='px-3 py-2 bg-red-900/30 border-b border-red-800/50'>
					<p className='text-xs text-red-400'>{error}</p>
				</div>
			)}

			{/* Upgrade categories */}
			<div className='overflow-y-auto flex-1 p-2 space-y-3'>
				{CATEGORY_ORDER.map((category) => {
					const upgrades = upgradesByCategory.get(category) ?? [];
					if (upgrades.length === 0) {
						return null;
					}

					return (
						<div key={category} className='space-y-1.5'>
							<div className='flex items-center gap-1.5 text-xs text-[var(--text-muted)] px-1 uppercase'>
								{CATEGORY_ICONS[category]}
								<span>{CATEGORY_LABELS[category]}</span>
							</div>
							<div className='space-y-1'>
								{upgrades.map((upgrade) => (
									<UpgradeCard
										key={upgrade.id}
										upgrade={upgrade}
										status={getUpgradeStatus(upgrade)}
										canAfford={canAfford(upgrade)}
										missingRequirement={getMissingRequirement(upgrade)}
										isPurchasing={purchasing === upgrade.id}
										onPurchase={() => handlePurchase(upgrade.id)}
									/>
								))}
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}

interface UpgradeCardProps {
	upgrade: UpgradeDefinition;
	status: 'purchased' | 'available' | 'locked';
	canAfford: boolean;
	missingRequirement: string | null;
	isPurchasing: boolean;
	onPurchase: () => void;
}

function UpgradeCard({ upgrade, status, canAfford, missingRequirement, isPurchasing, onPurchase }: UpgradeCardProps) {
	const isPurchased = status === 'purchased';
	const isLocked = status === 'locked';
	const isAvailable = status === 'available';

	return (
		<div
			className={`border px-2 py-1.5 ${
				isPurchased
					? 'border-green-800/50 bg-green-900/20'
					: isLocked
						? 'border-[var(--border-default)]/50 bg-[var(--bg-surface)]/30 opacity-60'
						: 'border-[var(--border-default)] bg-[var(--bg-surface)]/50'
			}`}
		>
			<div className='flex items-start justify-between gap-2'>
				<div className='flex-1 min-w-0'>
					<div className='flex items-center gap-1.5'>
						{isPurchased && <IconCheck size={12} className='text-green-500 shrink-0' />}
						{isLocked && <IconLock size={12} className='text-[var(--text-faint)] shrink-0' />}
						<span
							className={`text-xs font-medium truncate ${isPurchased ? 'text-green-400' : isLocked ? 'text-[var(--text-faint)]' : 'text-white'}`}
						>
							{upgrade.name}
						</span>
					</div>
					<p className={`text-[10px] mt-0.5 ${isLocked ? 'text-[var(--text-faint)]' : 'text-[var(--text-muted)]'}`}>{upgrade.description}</p>
					{isLocked && missingRequirement && <p className='text-[10px] text-[var(--accent)]/70 mt-0.5 tabular-nums'>{missingRequirement}</p>}
				</div>

				{/* Cost / Purchase button */}
				{!isPurchased && (
					<div className='shrink-0'>
						{isAvailable ? (
							<button
								onClick={onPurchase}
								disabled={!canAfford || isPurchasing}
								className={`px-2 py-1 text-[10px] font-medium flex items-center gap-1 ${
									canAfford ? 'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)]' : 'bg-[var(--bg-raised)] text-[var(--text-muted)] cursor-not-allowed'
								}`}
							>
								{isPurchasing ? (
									<span>...</span>
								) : (
									<>
										<IconCoins size={10} />
										<span className='tabular-nums'>{upgrade.goldCost}</span>
									</>
								)}
							</button>
						) : (
							<div className='px-2 py-1 text-[10px] text-[var(--text-faint)] flex items-center gap-1'>
								<IconCoins size={10} />
								<span className='tabular-nums'>{upgrade.goldCost}</span>
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
