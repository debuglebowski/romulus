import '@/ui/styles/globals.css';

// Prevent Ctrl/Cmd + scroll wheel zoom
document.addEventListener(
	'wheel',
	(e) => {
		if (e.ctrlKey || e.metaKey) {
			e.preventDefault();
		}
	},
	{ passive: false },
);

// Prevent Ctrl/Cmd + +/-/0 zoom shortcuts
document.addEventListener('keydown', (e) => {
	if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0'].includes(e.key)) {
		e.preventDefault();
	}
});

import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { ConvexReactClient } from 'convex/react';
import { ThemeProvider } from 'next-themes';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { Toaster } from '@/ui/_shadcn/sonner';

import { routeTree } from './routeTree.gen';

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
	interface Register {
		router: typeof router;
	}
}

createRoot(document.getElementById('root') as HTMLElement).render(
	<StrictMode>
		<ThemeProvider attribute='class' defaultTheme='dark' disableTransitionOnChange>
			<ConvexAuthProvider client={convex}>
				<RouterProvider router={router} />
				<Toaster position='top-right' />
			</ConvexAuthProvider>
		</ThemeProvider>
	</StrictMode>,
);
