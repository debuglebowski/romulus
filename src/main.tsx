import '@/ui/styles/globals.css';

import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { ConvexReactClient } from 'convex/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

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
		<ConvexAuthProvider client={convex}>
			<RouterProvider router={router} />
		</ConvexAuthProvider>
	</StrictMode>,
);
