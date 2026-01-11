import { useMutation, useQuery } from 'convex/react';
import { useCallback, useState } from 'react';

import { Button } from '@/ui/_shadcn/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/ui/_shadcn/dialog';
import { Label } from '@/ui/_shadcn/label';
import { Switch } from '@/ui/_shadcn/switch';

import { api } from '../../../convex/_generated/api';

type SettingsModalProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
};

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
	const user = useQuery(api.users.currentUser);
	const updateSettings = useMutation(api.users.updateSettings);
	const [isSaving, setIsSaving] = useState(false);
	const [saved, setSaved] = useState(false);

	const [showToasts, setShowToasts] = useState<boolean | null>(null);
	const [soundOnAttack, setSoundOnAttack] = useState<boolean | null>(null);

	const currentShowToasts = showToasts ?? user?.settingShowToastAlerts ?? true;
	const currentSoundOnAttack = soundOnAttack ?? user?.settingPlaySoundOnAttack ?? true;

	const hasChanges = showToasts !== null || soundOnAttack !== null;

	const handleSave = useCallback(async () => {
		setIsSaving(true);
		setSaved(false);

		try {
			await updateSettings({
				...(showToasts !== null && { settingShowToastAlerts: showToasts }),
				...(soundOnAttack !== null && { settingPlaySoundOnAttack: soundOnAttack }),
			});

			setShowToasts(null);
			setSoundOnAttack(null);
			setSaved(true);

			setTimeout(() => setSaved(false), 2000);
		} finally {
			setIsSaving(false);
		}
	}, [updateSettings, showToasts, soundOnAttack]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="text-center uppercase tracking-wider">Settings</DialogTitle>
				</DialogHeader>

				{!user ? (
					<div className="flex items-center justify-center py-8">
						<div className="animate-pulse text-muted-foreground">Loading...</div>
					</div>
				) : (
					<div className="space-y-6">
						{/* Notification settings */}
						<div className="space-y-4">
							<div>
								<h2 className="uppercase tracking-wider text-sm">Notifications</h2>
								<div className="mt-1 border-b" />
							</div>

							<div className="flex items-center justify-between">
								<Label>Game Invites</Label>
								<Switch checked={currentShowToasts} onCheckedChange={setShowToasts} />
							</div>

							<div className="flex items-center justify-between">
								<Label>Turn Alerts</Label>
								<Switch checked={currentSoundOnAttack} onCheckedChange={setSoundOnAttack} />
							</div>
						</div>

						{/* Save button */}
						<div className="flex justify-center">
							<Button onClick={handleSave} disabled={!hasChanges || isSaving} className="w-32">
								{isSaving ? '...' : saved ? 'SAVED' : 'SAVE'}
							</Button>
						</div>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
