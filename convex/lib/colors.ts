export const PLAYER_COLORS = [
	'#E63946', // red
	'#457B9D', // blue
	'#2A9D8F', // teal
	'#E9C46A', // gold
	'#9B5DE5', // purple
	'#F77F00', // orange
	'#06D6A0', // mint
	'#EF476F', // pink
] as const;

export function getNextAvailableColor(takenColors: string[]): string {
	const available = PLAYER_COLORS.find((color) => !takenColors.includes(color));
	return available ?? PLAYER_COLORS[0];
}
