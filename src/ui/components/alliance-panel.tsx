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
			<DialogContent className='sm:max-w-lg bg-zinc-900 z-100' showCloseButton={false}>
				<DialogHeader>
					<div className='flex items-center justify-between'>
						<div className='flex items-center gap-2'>
							<IconUsersGroup size={20} className='text-blue-400' />
							<DialogTitle className='text-white'>Alliances</DialogTitle>
						</div>
						<button
							onClick={() => onOpenChange(false)}
							className='p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors'
						>
							<IconX size={16} />
						</button>
					</div>
				</DialogHeader>

				{/* Tabs */}
				<div className='flex gap-2 border-b border-zinc-800 pb-2'>
					<button
						onClick={() => setActiveTab('allies')}
						className={`px-3 py-1.5 text-xs font-medium rounded transition-colors flex items-center gap-1.5 ${
							activeTab === 'allies' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
						}`}
					>
						<IconUsersGroup size={12} />
						Allies
						{activeAlliances.length > 0 && (
							<span className='bg-blue-600 text-white text-[10px] px-1.5 py-0.5 rounded-full'>{activeAlliances.length}</span>
						)}
					</button>
					<button
						onClick={() => setActiveTab('pending')}
						className={`px-3 py-1.5 text-xs font-medium rounded transition-colors flex items-center gap-1.5 ${
							activeTab === 'pending' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
						}`}
					>
						Pending
						{pendingCount > 0 && (
							<span className='bg-amber-600 text-white text-[10px] px-1.5 py-0.5 rounded-full'>{pendingCount}</span>
						)}
					</button>
					<button
						onClick={() => setActiveTab('invite')}
						className={`px-3 py-1.5 text-xs font-medium rounded transition-colors flex items-center gap-1.5 ${
							activeTab === 'invite' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
						}`}
					>
						<IconUserPlus size={12} />
						Invite
					</button>
				</div>

				{/* Error message */}
				{error && (
					<div className='px-3 py-2 rounded bg-red-900/30 border border-red-800/50'>
						<p className='text-xs text-red-400'>{error}</p>
					</div>
				)}

				{/* Allies Tab */}
				{activeTab === 'allies' && (
					<div className='space-y-3 max-h-80 overflow-y-auto'>
						{activeAlliances.length === 0 ? (
							<div className='text-center py-8'>
								<IconUsersGroup size={32} className='mx-auto text-zinc-600 mb-2' />
								<p className='text-zinc-400 text-sm'>No active alliances</p>
								<p className='text-zinc-500 text-xs mt-1'>Send invitations to form alliances with other players</p>
							</div>
						) : (
							activeAlliances.map((alliance) => (
								<div key={alliance._id} className='rounded-lg border border-zinc-700 bg-zinc-800/50 p-3 space-y-3'>
									{/* Ally header */}
									<div className='flex items-center justify-between'>
										<div className='flex items-center gap-2'>
											<div
												className='w-4 h-4 rounded-full border-2 border-zinc-600'
												style={{ backgroundColor: alliance.otherPlayer.color }}
											/>
											<span className='text-sm font-medium text-white'>{alliance.otherPlayer.username}</span>
										</div>
										<button
											onClick={() => handleBreak(alliance._id)}
											disabled={loading === alliance._id}
											className='px-2 py-1 text-[10px] font-medium rounded bg-red-900/50 text-red-400 hover:bg-red-900 transition-colors'
										>
											{loading === alliance._id ? '...' : 'Break'}
										</button>
									</div>

									{/* My sharing toggles */}
									<div className='space-y-1.5'>
										<p className='text-[10px] text-zinc-400 uppercase tracking-wide'>I share with them:</p>
										<div className='grid grid-cols-5 gap-1'>
											{SHARING_TYPES.map((type) => (
												<div
													key={type}
													className='flex flex-col items-center gap-1 p-1.5 rounded bg-zinc-900/50'
													title={SHARING_LABELS[type].description}
												>
													<div className={alliance.mySharing[type] ? 'text-blue-400' : 'text-zinc-500'}>
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
										<p className='text-[10px] text-zinc-400 uppercase tracking-wide'>They share with me:</p>
										<div className='grid grid-cols-5 gap-1'>
											{SHARING_TYPES.map((type) => (
												<div
													key={type}
													className='flex flex-col items-center gap-1 p-1.5 rounded bg-zinc-900/50'
													title={SHARING_LABELS[type].description}
												>
													<div className={alliance.theirSharing[type] ? 'text-green-400' : 'text-zinc-500'}>
														{SHARING_LABELS[type].icon}
													</div>
													<div className='h-4 flex items-center'>
														{alliance.theirSharing[type] ? (
															<IconCheck size={12} className='text-green-400' />
														) : (
															<IconX size={12} className='text-zinc-600' />
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
								<p className='text-xs text-zinc-400 font-medium'>Received</p>
								{pendingReceived.map((alliance) => (
									<div
										key={alliance._id}
										className='flex items-center justify-between rounded-lg border border-amber-700/50 bg-amber-900/20 p-3'
									>
										<div className='flex items-center gap-2'>
											<div
												className='w-4 h-4 rounded-full border-2 border-zinc-600'
												style={{ backgroundColor: alliance.otherPlayer.color }}
											/>
											<span className='text-sm text-white'>{alliance.otherPlayer.username}</span>
										</div>
										<div className='flex items-center gap-2'>
											<button
												onClick={() => handleAccept(alliance._id)}
												disabled={loading === alliance._id}
												className='px-2 py-1 text-[10px] font-medium rounded bg-green-600 text-white hover:bg-green-500 transition-colors'
											>
												{loading === alliance._id ? '...' : 'Accept'}
											</button>
											<button
												onClick={() => handleReject(alliance._id)}
												disabled={loading === alliance._id}
												className='px-2 py-1 text-[10px] font-medium rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-600 transition-colors'
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
								<p className='text-xs text-zinc-400 font-medium'>Sent</p>
								{pendingSent.map((alliance) => (
									<div
										key={alliance._id}
										className='flex items-center justify-between rounded-lg border border-zinc-700 bg-zinc-800/50 p-3'
									>
										<div className='flex items-center gap-2'>
											<div
												className='w-4 h-4 rounded-full border-2 border-zinc-600'
												style={{ backgroundColor: alliance.otherPlayer.color }}
											/>
											<span className='text-sm text-white'>{alliance.otherPlayer.username}</span>
											<span className='text-[10px] text-zinc-500'>Waiting...</span>
										</div>
										<button
											onClick={() => handleCancel(alliance._id)}
											disabled={loading === alliance._id}
											className='px-2 py-1 text-[10px] font-medium rounded bg-zinc-700 text-zinc-300 hover:bg-zinc-600 transition-colors'
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
								<p className='text-zinc-400 text-sm'>No pending invitations</p>
							</div>
						)}
					</div>
				)}

				{/* Invite Tab */}
				{activeTab === 'invite' && (
					<div className='space-y-2 max-h-80 overflow-y-auto'>
						{availablePlayers.length === 0 ? (
							<div className='text-center py-8'>
								<IconUserPlus size={32} className='mx-auto text-zinc-600 mb-2' />
								<p className='text-zinc-400 text-sm'>No players to invite</p>
								<p className='text-zinc-500 text-xs mt-1'>All other players are already allied or have pending invitations</p>
							</div>
						) : (
							availablePlayers.map((player) => (
								<div key={player._id} className='flex items-center justify-between rounded-lg border border-zinc-700 bg-zinc-800/50 p-3'>
									<div className='flex items-center gap-2'>
										<div className='w-4 h-4 rounded-full border-2 border-zinc-600' style={{ backgroundColor: player.color }} />
										<span className='text-sm text-white'>{player.username}</span>
									</div>
									<button
										onClick={() => handleSendInvite(player._id)}
										disabled={loading === player._id}
										className='px-3 py-1 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-500 transition-colors flex items-center gap-1'
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
