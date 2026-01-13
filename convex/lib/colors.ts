export const PLAYER_COLORS = [
	'#DC2626', // red
	'#D1D5DB', // gray
	'#CA8A04', // yellow
	'#16A34A', // green
	'#14B8A6', // teal
	'#3B82F6', // blue
	'#7C3AED', // purple
	'#DB2777', // pink
] as const;

export function getNextAvailableColor(takenColors: string[]): string {
	const available = PLAYER_COLORS.find((color) => !takenColors.includes(color));
	return available ?? PLAYER_COLORS[0];
}
