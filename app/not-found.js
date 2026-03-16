'use client';

import ErrorStatePage from '@/app/components/error-state-page';

export default function NotFound() {
	return (
		<ErrorStatePage
			statusCode="404"
			title="Page Not Found"
			subtitle="This trail went cold."
			description="The page you requested is not here, has moved, or never existed in this workspace."
			imageSrc="/error-404.png"
			imageAlt="Hire Gnome 404 illustration"
			primaryAction={{
				label: 'Go Home',
				href: '/',
				iconKind: 'home'
			}}
			secondaryAction={{
				label: 'Back',
				onClick: () => window.history.back(),
				variant: 'secondary',
				iconKind: 'back'
			}}
		/>
	);
}
