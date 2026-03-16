'use client';

import ErrorStatePage from '@/app/components/error-state-page';

export default function Error({ reset }) {
	return (
		<ErrorStatePage
			statusCode="500"
			title="Something Broke"
			subtitle="The gnome hit a live wire."
			description="We could not finish loading this page. Try the request again first. If it keeps failing, head back and retry the flow from a clean screen."
			imageSrc="/error-500.png"
			imageAlt="Hire Gnome 500 illustration"
			primaryAction={{
				label: 'Try Again',
				onClick: () => reset(),
				iconKind: 'retry'
			}}
			secondaryAction={{
				label: 'Go Home',
				href: '/',
				variant: 'secondary',
				iconKind: 'home'
			}}
		/>
	);
}
