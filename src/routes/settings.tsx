import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery } from 'convex/react';
import { useCallback, useState } from 'react';

import { Button } from '@/ui/_shadcn/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/ui/_shadcn/card';
import { Label } from '@/ui/_shadcn/label';
import { Slider } from '@/ui/_shadcn/slider';
import { Switch } from '@/ui/_shadcn/switch';

import { api } from '../../convex/_generated/api';

export const Route = createFileRoute('/settings')({
	component: SettingsPage,
});

function SettingsPage() {
	const user = useQuery(api.users.currentUser);
	const updateSettings = useMutation(api.users.updateSettings);
	const [isSaving, setIsSaving] = useState(false);
	const [saved, setSaved] = useState(false);

	const [soundVolume, setSoundVolume] = useState<number | null>(null);
	const [musicVolume, setMusicVolume] = useState<number | null>(null);
	const [showToasts, setShowToasts] = useState<boolean | null>(null);
	const [soundOnAttack, setSoundOnAttack] = useState<boolean | null>(null);

	// Use local state if set, otherwise fall back to user data
	const currentSoundVolume = soundVolume ?? user?.settingSoundVolume ?? 100;
	const currentMusicVolume = musicVolume ?? user?.settingMusicVolume ?? 100;
	const currentShowToasts = showToasts ?? user?.settingShowToastAlerts ?? true;
	const currentSoundOnAttack = soundOnAttack ?? user?.settingPlaySoundOnAttack ?? true;

	const hasChanges =
		soundVolume !== null ||
		musicVolume !== null ||
		showToasts !== null ||
		soundOnAttack !== null;

	const handleSave = useCallback(async () => {
		setIsSaving(true);
		setSaved(false);

		try {
			await updateSettings({
				...(soundVolume !== null && { settingSoundVolume: soundVolume }),
				...(musicVolume !== null && { settingMusicVolume: musicVolume }),
				...(showToasts !== null && { settingShowToastAlerts: showToasts }),
				...(soundOnAttack !== null && { settingPlaySoundOnAttack: soundOnAttack }),
			});

			// Reset local state after saving
			setSoundVolume(null);
			setMusicVolume(null);
			setShowToasts(null);
			setSoundOnAttack(null);
			setSaved(true);

			setTimeout(() => setSaved(false), 2000);
		} finally {
			setIsSaving(false);
		}
	}, [updateSettings, soundVolume, musicVolume, showToasts, soundOnAttack]);

	if (!user) {
		return (
			<div className='flex min-h-[calc(100vh-64px)] items-center justify-center'>
				<div className='animate-pulse text-muted-foreground'>Loading...</div>
			</div>
		);
	}

	return (
		<div className='mx-auto max-w-2xl p-4'>
			<Card>
				<CardHeader>
					<CardTitle>Settings</CardTitle>
					<CardDescription>Customize your game experience</CardDescription>
				</CardHeader>
				<CardContent className='space-y-6'>
					{/* Audio settings */}
					<div className='space-y-4'>
						<h3 className='font-semibold'>Audio</h3>

						<div className='space-y-2'>
							<div className='flex items-center justify-between'>
								<Label>Sound Effects</Label>
								<span className='text-muted-foreground text-sm'>{currentSoundVolume}%</span>
							</div>
							<Slider
								value={[currentSoundVolume]}
								onValueChange={(value) => setSoundVolume(Array.isArray(value) ? value[0] : value)}
								max={100}
								step={1}
							/>
						</div>

						<div className='space-y-2'>
							<div className='flex items-center justify-between'>
								<Label>Music</Label>
								<span className='text-muted-foreground text-sm'>{currentMusicVolume}%</span>
							</div>
							<Slider
								value={[currentMusicVolume]}
								onValueChange={(value) => setMusicVolume(Array.isArray(value) ? value[0] : value)}
								max={100}
								step={1}
							/>
						</div>
					</div>

					{/* Notification settings */}
					<div className='space-y-4'>
						<h3 className='font-semibold'>Notifications</h3>

						<div className='flex items-center justify-between'>
							<div className='space-y-0.5'>
								<Label>Toast Alerts</Label>
								<p className='text-muted-foreground text-sm'>Show in-game event notifications</p>
							</div>
							<Switch checked={currentShowToasts} onCheckedChange={setShowToasts} />
						</div>

						<div className='flex items-center justify-between'>
							<div className='space-y-0.5'>
								<Label>Attack Sound</Label>
								<p className='text-muted-foreground text-sm'>
									Play sound when your territory is attacked
								</p>
							</div>
							<Switch checked={currentSoundOnAttack} onCheckedChange={setSoundOnAttack} />
						</div>
					</div>

					{/* Save button */}
					<Button onClick={handleSave} disabled={!hasChanges || isSaving} className='w-full'>
						{isSaving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'}
					</Button>
				</CardContent>
			</Card>
		</div>
	);
}
