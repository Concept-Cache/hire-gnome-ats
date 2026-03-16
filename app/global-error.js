'use client';

import ErrorStatePage from '@/app/components/error-state-page';
import './globals.css';

export default function GlobalError({ reset }) {
	return (
		<html lang="en">
			<body>
				<ErrorStatePage
					statusCode="500"
					title="System Error"
					subtitle="The gnome dropped the whole toolkit."
					description="A global application error interrupted the request before the normal screen could recover. Try the page again. If this persists, check the admin diagnostics and error logs."
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
			</body>
		</html>
	);
}
