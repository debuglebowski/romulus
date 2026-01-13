import { useMutation, useQuery } from 'convex/react';
import { useCallback, useState } from 'react';

import { Button } from '@/ui/_shadcn/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/ui/_shadcn/dialog';
import { Label } from '@/ui/_shadcn/label';
import { Slider } from '@/ui/_shadcn/slider';
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

	// Volume settings
	const [soundVolume, setSoundVolume] = useState<number | null>(null);
	const [musicVolume, setMusicVolume] = useState<number | null>(null);

	// Notification settings
	const [showToasts, setShowToasts] = useState<boolean | null>(null);
	const [soundOnAttack, setSoundOnAttack] = useState<boolean | null>(null);

	const currentSoundVolume = soundVolume ?? user?.settingSoundVolume ?? 100;
	const currentMusicVolume = musicVolume ?? user?.settingMusicVolume ?? 50;
	const currentShowToasts = showToasts ?? user?.settingShowToastAlerts ?? true;
	const currentSoundOnAttack = soundOnAttack ?? user?.settingPlaySoundOnAttack ?? true;

	const hasChanges = showToasts !== null || soundOnAttack !== null || soundVolume !== null || musicVolume !== null;

	const handleSave = useCallback(async () => {
		setIsSaving(true);
		setSaved(false);

		try {
			await updateSettings({
				...(showToasts !== null && { settingShowToastAlerts: showToasts }),
				...(soundOnAttack !== null && { settingPlaySoundOnAttack: soundOnAttack }),
				...(soundVolume !== null && { settingSoundVolume: soundVolume }),
				...(musicVolume !== null && { settingMusicVolume: musicVolume }),
			});

			setShowToasts(null);
			setSoundOnAttack(null);
			setSoundVolume(null);
			setMusicVolume(null);
			setSaved(true);

			setTimeout(() => setSaved(false), 2000);
		} finally {
			setIsSaving(false);
		}
	}, [updateSettings, showToasts, soundOnAttack, soundVolume, musicVolume]);

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
						{/* Audio settings */}
						<div className="space-y-4">
							<div>
								<h2 className="uppercase tracking-wider text-sm">Audio</h2>
								<div className="mt-1 border-b" />
							</div>

							<div className="space-y-2">
								<div className="flex items-center justify-between">
									<Label>Sound Effects</Label>
									<span className="text-sm text-muted-foreground w-12 text-right">{currentSoundVolume}%</span>
								</div>
								<Slider
									value={[currentSoundVolume]}
									onValueChange={([value]) => setSoundVolume(value)}
									max={100}
									step={5}
								/>
							</div>

							<div className="space-y-2">
								<div className="flex items-center justify-between">
									<Label>Music</Label>
									<span className="text-sm text-muted-foreground w-12 text-right">{currentMusicVolume}%</span>
								</div>
								<Slider
									value={[currentMusicVolume]}
									onValueChange={([value]) => setMusicVolume(value)}
									max={100}
									step={5}
								/>
							</div>
						</div>

						{/* Notification settings */}
						<div className="space-y-4">
							<div>
								<h2 className="uppercase tracking-wider text-sm">Notifications</h2>
								<div className="mt-1 border-b" />
							</div>

							<div className="flex items-center justify-between">
								<Label>Toast Alerts</Label>
								<Switch checked={currentShowToasts} onCheckedChange={setShowToasts} />
							</div>

							<div className="flex items-center justify-between">
								<Label>Sound on Attack</Label>
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
