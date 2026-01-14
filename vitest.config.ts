import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'node',
		include: ['**/*.test.ts', '**/*.test.tsx'],
		exclude: ['**/node_modules/**', '**/dist/**', '**/.auto-claude/**'],
		testTimeout: 10000,
		hookTimeout: 10000,
		pool: 'threads',
		poolOptions: {
			threads: {
				singleThread: false,
			},
		},
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html'],
			include: ['convex/**/*.ts'],
			exclude: [
				'**/node_modules/**',
				'**/dist/**',
				'**/.auto-claude/**',
				'**/convex/_generated/**',
				'**/*.config.*',
				'**/mockups/**',
				'**/*.test.ts',
				'**/*.test.tsx',
			],
		},
	},
});
