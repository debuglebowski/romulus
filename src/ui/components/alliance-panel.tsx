import {
	IconCheck,
	IconCoin,
	IconEye,
	IconRoute,
	IconShield,
	IconSpy,
	IconUserPlus,
	IconUsersGroup,
	IconX,
} from '@tabler/icons-react';
import { useMutation, useQuery } from 'convex/react';
import { useState } from 'react';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/ui/_shadcn/dialog';
import { Switch } from '@/ui/_shadcn/switch';

import { api } from '../../../convex/_generated/api';

import type { Id } from '../../../convex/_generated/dataModel';

interface Player {
	_id: string;
	color: string;
	username: string;
	eliminatedAt?: number;
}

interface AlliancePanelProps {
	gameId: string;
	isCapitalMoving?: boolean;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	players?: Player[];
}

type SharingType = 'vision' | 'gold' | 'upgrades' | 'armyPositions' | 'spyIntel';

const SHARING_LABELS: Record<SharingType, { label: string; icon: React.ReactNode; description: string }> = {
	vision: {
		label: 'Vision',
		icon: <IconEye size={12} />,
		description: 'Share what you see',
	},
	gold: {
		label: 'Economy',
		icon: <IconCoin size={12} />,
		description: 'Share gold/pop info',
	},
	upgrades: {
		label: 'Upgrades',
		icon: <IconShield size={12} />,
		description: 'Share your upgrades',
	},
	armyPositions: {
		label: 'Armies',
		icon: <IconRoute size={12} />,
		description: 'Share army positions',
	},
	spyIntel: {
		label: 'Spy Intel',
		icon: <IconSpy size={12} />,
		description: 'Share spy information',
	},
};

const SHARING_TYPES: SharingType[] = ['vision', 'gold', 'upgrades', 'armyPositions', 'spyIntel'];

export function AlliancePanel({ gameId, isCapitalMoving = false, open, onOpenChange, players = [] }: AlliancePanelProps) {
	const allianceData = useQuery(api.alliances.getAlliances, { gameId: gameId as Id<'games'> });
	const otherPlayers = useQuery(api.alliances.getOtherPlayers, { gameId: gameId as Id<'games'> });

	const sendInvitation = useMutation(api.alliances.sendInvitation);
	const acceptInvitation = useMutation(api.alliances.acceptInvitation);
	const rejectInvitation = useMutation(api.alliances.rejectInvitation);
	const cancelInvitation = useMutation(api.alliances.cancelInvitation);
	const breakAlliance = useMutation(api.alliances.breakAlliance);
	const updateSharing = useMutation(api.alliances.updateSharing);

	const [activeTab, setActiveTab] = useState<'allies' | 'pending' | 'invite'>('allies');
	const [loading, setLoading] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const handleSendInvite = async (targetPlayerId: string) => {
		if (isCapitalMoving) {
			setError('Cannot send invitation while capital is relocating');
			return;
		}
		setLoading(targetPlayerId);
		setError(null);
		try {
			await sendInvitation({
				gameId: gameId as Id<'games'>,
				targetPlayerId: targetPlayerId as Id<'gamePlayers'>,
			});
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Failed to send invitation');
		} finally {
			setLoading(null);
		}
	};

	const handleAccept = async (allianceId: string) => {
		if (isCapitalMoving) {
			setError('Cannot accept invitation while capital is relocating');
			return;
		}
		setLoading(allianceId);
		setError(null);
		try {
			await acceptInvitation({ allianceId: allianceId as Id<'alliances'> });
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Failed to accept invitation');
		} finally {
			setLoading(null);
		}
	};

	const handleReject = async (allianceId: string) => {
		setLoading(allianceId);
		setError(null);
		try {
			await rejectInvitation({ allianceId: allianceId as Id<'alliances'> });
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Failed to reject invitation');
		} finally {
			setLoading(null);
		}
	};

	const handleCancel = async (allianceId: string) => {
		setLoading(allianceId);
		setError(null);
		try {
			await cancelInvitation({ allianceId: allianceId as Id<'alliances'> });
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Failed to cancel invitation');
		} finally {
			setLoading(null);
		}
	};

	const handleBreak = async (allianceId: string) => {
		setLoading(allianceId);
		setError(null);
		try {
			await breakAlliance({ allianceId: allianceId as Id<'alliances'> });
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Failed to break alliance');
		} finally {
			setLoading(null);
		}
	};

	const handleToggleSharing = async (allianceId: string, sharingType: SharingType, enabled: boolean) => {
		setError(null);
		try {
			await updateSharing({
				allianceId: allianceId as Id<'alliances'>,
				sharingType,
				enabled,
			});
		} catch (e) {
			setError(e instanceof Error ? e.message : 'Failed to update sharing');
		}
	};

	const activeAlliances = allianceData?.active ?? [];
	const pendingSent = allianceData?.pendingSent ?? [];
	const pendingReceived = allianceData?.pendingReceived ?? [];
	const availablePlayers = otherPlayers ?? [];

	const pendingCount = pendingSent.length + pendingReceived.length;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className='sm:max-w-lg bg-[var(--bg-base)] z-100' showCloseButton={false}>
				<DialogHeader>
					<div className='flex items-center justify-between'>
						<div className='flex items-center gap-2'>
							<IconUsersGroup size={20} className='text-blue-400' />
							<DialogTitle className='text-white uppercase'>Alliances</DialogTitle>
						</div>
						<button
							onClick={() => onOpenChange(false)}
							className='p-1 hover:bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-white'
						>
							<IconX size={16} />
						</button>
					</div>
				</DialogHeader>

				{/* Tabs */}
				<div className='flex gap-2 border-b border-[var(--border-default)] pb-2'>
					<button
						onClick={() => setActiveTab('allies')}
						className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 uppercase ${
							activeTab === 'allies' ? 'bg-[var(--bg-surface)] text-white' : 'text-[var(--text-muted)] hover:text-white'
						}`}
					>
						<IconUsersGroup size={12} />
						Allies
						{activeAlliances.length > 0 && (
							<span className='bg-blue-600 text-white text-[10px] px-1.5 py-0.5 tabular-nums'>{activeAlliances.length}</span>
						)}
					</button>
					<button
						onClick={() => setActiveTab('pending')}
						className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 uppercase ${
							activeTab === 'pending' ? 'bg-[var(--bg-surface)] text-white' : 'text-[var(--text-muted)] hover:text-white'
						}`}
					>
						Pending
						{pendingCount > 0 && (
							<span className='bg-[var(--accent)] text-white text-[10px] px-1.5 py-0.5 tabular-nums'>{pendingCount}</span>
						)}
					</button>
					<button
						onClick={() => setActiveTab('invite')}
						className={`px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 uppercase ${
							activeTab === 'invite' ? 'bg-[var(--bg-surface)] text-white' : 'text-[var(--text-muted)] hover:text-white'
						}`}
					>
						<IconUserPlus size={12} />
						Invite
					</button>
				</div>

				{/* Error message */}
				{error && (
					<div className='px-3 py-2 bg-red-900/30 border border-red-800/50'>
						<p className='text-xs text-red-400'>{error}</p>
					</div>
				)}

				{/* Allies Tab */}
				{activeTab === 'allies' && (
					<div className='space-y-3 max-h-80 overflow-y-auto'>
						{activeAlliances.length === 0 ? (
							<div className='text-center py-8'>
								<IconUsersGroup size={32} className='mx-auto text-[var(--text-faint)] mb-2' />
								<p className='text-[var(--text-muted)] text-sm'>No active alliances</p>
								<p className='text-[var(--text-faint)] text-xs mt-1'>Send invitations to form alliances with other players</p>
							</div>
						) : (
							activeAlliances.map((alliance) => (
								<div key={alliance._id} className='border border-[var(--border-default)] bg-[var(--bg-surface)]/50 p-3 space-y-3'>
									{/* Ally header */}
									<div className='flex items-center justify-between'>
										<div className='flex items-center gap-2'>
											<div
												className='w-4 h-4 border-2 border-[var(--border-default)]'
												style={{ backgroundColor: alliance.otherPlayer.color }}
											/>
											<span className='text-sm font-medium text-white'>{alliance.otherPlayer.username}</span>
										</div>
										<button
											onClick={() => handleBreak(alliance._id)}
											disabled={loading === alliance._id}
											className='px-2 py-1 text-[10px] font-medium bg-red-900/50 text-red-400 hover:bg-red-900'
										>
											{loading === alliance._id ? '...' : 'Break'}
										</button>
									</div>

									{/* My sharing toggles */}
									<div className='space-y-1.5'>
										<p className='text-[10px] text-[var(--text-muted)] uppercase tracking-wide'>I share with them:</p>
										<div className='grid grid-cols-5 gap-1'>
											{SHARING_TYPES.map((type) => (
												<div
													key={type}
													className='flex flex-col items-center gap-1 p-1.5 bg-[var(--bg-base)]/50'
													title={SHARING_LABELS[type].description}
												>
													<div className={alliance.mySharing[type] ? 'text-blue-400' : 'text-[var(--text-faint)]'}>
														{SHARING_LABELS[type].icon}
													</div>
													<Switch
														checked={alliance.mySharing[type]}
														onCheckedChange={(checked) => handleToggleSharing(alliance._id, type, checked)}
														className='scale-75'
													/>
												</div>
											))}
										</div>
									</div>

									{/* Their sharing status */}
									<div className='space-y-1.5'>
										<p className='text-[10px] text-[var(--text-muted)] uppercase tracking-wide'>They share with me:</p>
										<div className='grid grid-cols-5 gap-1'>
											{SHARING_TYPES.map((type) => (
												<div
													key={type}
													className='flex flex-col items-center gap-1 p-1.5 bg-[var(--bg-base)]/50'
													title={SHARING_LABELS[type].description}
												>
													<div className={alliance.theirSharing[type] ? 'text-green-400' : 'text-[var(--text-faint)]'}>
														{SHARING_LABELS[type].icon}
													</div>
													<div className='h-4 flex items-center'>
														{alliance.theirSharing[type] ? (
															<IconCheck size={12} className='text-green-400' />
														) : (
															<IconX size={12} className='text-[var(--text-faint)]' />
														)}
													</div>
												</div>
											))}
										</div>
									</div>
								</div>
							))
						)}
					</div>
				)}

				{/* Pending Tab */}
				{activeTab === 'pending' && (
					<div className='space-y-4 max-h-80 overflow-y-auto'>
						{/* Received invitations */}
						{pendingReceived.length > 0 && (
							<div className='space-y-2'>
								<p className='text-xs text-[var(--text-muted)] font-medium uppercase'>Received</p>
								{pendingReceived.map((alliance) => (
									<div
										key={alliance._id}
										className='flex items-center justify-between border border-[var(--accent)]/50 bg-[var(--accent)]/20 p-3'
									>
										<div className='flex items-center gap-2'>
											<div
												className='w-4 h-4 border-2 border-[var(--border-default)]'
												style={{ backgroundColor: alliance.otherPlayer.color }}
											/>
											<span className='text-sm text-white'>{alliance.otherPlayer.username}</span>
										</div>
										<div className='flex items-center gap-2'>
											<button
												onClick={() => handleAccept(alliance._id)}
												disabled={loading === alliance._id}
												className='px-2 py-1 text-[10px] font-medium bg-green-600 text-white hover:bg-green-500'
											>
												{loading === alliance._id ? '...' : 'Accept'}
											</button>
											<button
												onClick={() => handleReject(alliance._id)}
												disabled={loading === alliance._id}
												className='px-2 py-1 text-[10px] font-medium bg-[var(--bg-raised)] text-[var(--text-primary)] hover:bg-[var(--bg-raised)]'
											>
												Reject
											</button>
										</div>
									</div>
								))}
							</div>
						)}

						{/* Sent invitations */}
						{pendingSent.length > 0 && (
							<div className='space-y-2'>
								<p className='text-xs text-[var(--text-muted)] font-medium uppercase'>Sent</p>
								{pendingSent.map((alliance) => (
									<div
										key={alliance._id}
										className='flex items-center justify-between border border-[var(--border-default)] bg-[var(--bg-surface)]/50 p-3'
									>
										<div className='flex items-center gap-2'>
											<div
												className='w-4 h-4 border-2 border-[var(--border-default)]'
												style={{ backgroundColor: alliance.otherPlayer.color }}
											/>
											<span className='text-sm text-white'>{alliance.otherPlayer.username}</span>
											<span className='text-[10px] text-[var(--text-faint)]'>Waiting...</span>
										</div>
										<button
											onClick={() => handleCancel(alliance._id)}
											disabled={loading === alliance._id}
											className='px-2 py-1 text-[10px] font-medium bg-[var(--bg-raised)] text-[var(--text-primary)] hover:bg-[var(--bg-raised)]'
										>
											{loading === alliance._id ? '...' : 'Cancel'}
										</button>
									</div>
								))}
							</div>
						)}

						{/* No pending */}
						{pendingReceived.length === 0 && pendingSent.length === 0 && (
							<div className='text-center py-8'>
								<p className='text-[var(--text-muted)] text-sm'>No pending invitations</p>
							</div>
						)}
					</div>
				)}

				{/* Invite Tab */}
				{activeTab === 'invite' && (
					<div className='space-y-2 max-h-80 overflow-y-auto'>
						{availablePlayers.length === 0 ? (
							<div className='text-center py-8'>
								<IconUserPlus size={32} className='mx-auto text-[var(--text-faint)] mb-2' />
								<p className='text-[var(--text-muted)] text-sm'>No players to invite</p>
								<p className='text-[var(--text-faint)] text-xs mt-1'>All other players are already allied or have pending invitations</p>
							</div>
						) : (
							availablePlayers.map((player) => (
								<div key={player._id} className='flex items-center justify-between border border-[var(--border-default)] bg-[var(--bg-surface)]/50 p-3'>
									<div className='flex items-center gap-2'>
										<div className='w-4 h-4 border-2 border-[var(--border-default)]' style={{ backgroundColor: player.color }} />
										<span className='text-sm text-white'>{player.username}</span>
									</div>
									<button
										onClick={() => handleSendInvite(player._id)}
										disabled={loading === player._id}
										className='px-3 py-1 text-xs font-medium bg-blue-600 text-white hover:bg-blue-500 flex items-center gap-1'
									>
										{loading === player._id ? (
											'...'
										) : (
											<>
												<IconUserPlus size={12} />
												Invite
											</>
										)}
									</button>
								</div>
							))
						)}
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
