import { createFileRoute } from '@tanstack/react-router';

import { ComponentExample } from '@/ui/components/component-example';

export const Route = createFileRoute('/')({
	component: IndexPage,
});

function IndexPage() {
	return <ComponentExample />;
}
