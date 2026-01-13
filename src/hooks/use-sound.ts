import { useQuery } from 'convex/react';
import { useCallback, useEffect, useRef } from 'react';

import { api } from '../../convex/_generated/api';

export type SoundEffect =
	| 'combat'
	| 'capture'
	| 'cityUnderAttack'
	| 'spyDetected'
	| 'borderContact'
	| 'unitSpawned'
	| 'buildCity'
	| 'victory'
	| 'defeat'
	| 'notification';

// Placeholder sound URLs - in a real implementation, these would be actual audio files
// For now, we use the Web Audio API to generate simple beeps
const SOUND_FREQUENCIES: Record<SoundEffect, { frequency: number; duration: number; type: OscillatorType }> = {
	combat: { frequency: 200, duration: 150, type: 'square' },
	capture: { frequency: 600, duration: 200, type: 'sine' },
	cityUnderAttack: { frequency: 300, duration: 400, type: 'sawtooth' },
	spyDetected: { frequency: 440, duration: 300, type: 'triangle' },
	borderContact: { frequency: 350, duration: 200, type: 'sine' },
	unitSpawned: { frequency: 500, duration: 100, type: 'sine' },
	buildCity: { frequency: 700, duration: 300, type: 'sine' },
	victory: { frequency: 800, duration: 500, type: 'sine' },
	defeat: { frequency: 150, duration: 600, type: 'sawtooth' },
	notification: { frequency: 550, duration: 150, type: 'sine' },
};

export function useSound() {
	const user = useQuery(api.users.currentUser);
	const audioContextRef = useRef<AudioContext | null>(null);
	const musicGainRef = useRef<GainNode | null>(null);
	const musicOscillatorRef = useRef<OscillatorNode | null>(null);

	// Get user's volume settings (0-100)
	const soundVolume = user?.settingSoundVolume ?? 100;
	const musicVolume = user?.settingMusicVolume ?? 50;
	const showToastAlerts = user?.settingShowToastAlerts ?? true;
	const playSoundOnAttack = user?.settingPlaySoundOnAttack ?? true;

	// Initialize audio context lazily
	const getAudioContext = useCallback(() => {
		if (!audioContextRef.current) {
			audioContextRef.current = new AudioContext();
		}
		return audioContextRef.current;
	}, []);

	// Play a sound effect
	const playSound = useCallback(
		(soundId: SoundEffect) => {
			// Respect user settings
			if (soundVolume === 0) {
				return;
			}

			// Check specific settings for attack sounds
			if (!playSoundOnAttack && (soundId === 'combat' || soundId === 'cityUnderAttack')) {
				return;
			}

			const ctx = getAudioContext();
			const config = SOUND_FREQUENCIES[soundId];

			// Create oscillator for the sound
			const oscillator = ctx.createOscillator();
			const gainNode = ctx.createGain();

			oscillator.type = config.type;
			oscillator.frequency.setValueAtTime(config.frequency, ctx.currentTime);

			// Apply volume (convert 0-100 to 0-0.3 for reasonable volume)
			const volume = (soundVolume / 100) * 0.3;
			gainNode.gain.setValueAtTime(volume, ctx.currentTime);
			gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + config.duration / 1000);

			oscillator.connect(gainNode);
			gainNode.connect(ctx.destination);

			oscillator.start(ctx.currentTime);
			oscillator.stop(ctx.currentTime + config.duration / 1000);
		},
		[soundVolume, playSoundOnAttack, getAudioContext],
	);

	// Start ambient background music (simple drone for now)
	const playMusic = useCallback(() => {
		if (musicVolume === 0) {
			return;
		}

		const ctx = getAudioContext();

		// Stop existing music
		if (musicOscillatorRef.current) {
			musicOscillatorRef.current.stop();
		}

		// Create a simple ambient drone
		const oscillator = ctx.createOscillator();
		const gainNode = ctx.createGain();

		oscillator.type = 'sine';
		oscillator.frequency.setValueAtTime(80, ctx.currentTime);

		// Very low volume ambient drone
		const volume = (musicVolume / 100) * 0.05;
		gainNode.gain.setValueAtTime(volume, ctx.currentTime);

		oscillator.connect(gainNode);
		gainNode.connect(ctx.destination);

		oscillator.start();

		musicOscillatorRef.current = oscillator;
		musicGainRef.current = gainNode;
	}, [musicVolume, getAudioContext]);

	// Stop background music
	const stopMusic = useCallback(() => {
		if (musicOscillatorRef.current) {
			musicOscillatorRef.current.stop();
			musicOscillatorRef.current = null;
		}
	}, []);

	// Update music volume when setting changes
	useEffect(() => {
		if (musicGainRef.current) {
			const volume = (musicVolume / 100) * 0.05;
			musicGainRef.current.gain.setValueAtTime(volume, audioContextRef.current?.currentTime ?? 0);
		}
	}, [musicVolume]);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			stopMusic();
			if (audioContextRef.current) {
				audioContextRef.current.close();
			}
		};
	}, [stopMusic]);

	return {
		playSound,
		playMusic,
		stopMusic,
		soundVolume,
		musicVolume,
		showToastAlerts,
	};
}
