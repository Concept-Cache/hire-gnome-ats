'use client';

import { useEffect, useState } from 'react';
import LoadingIndicator from '@/app/components/loading-indicator';

export default function AdminGate({ children }) {
	const [state, setState] = useState({ loading: true, allowed: false });

	useEffect(() => {
		let cancelled = false;

		async function checkAccess() {
			const res = await fetch('/api/session/acting-user');
			if (!res.ok) {
				if (!cancelled) {
					setState({ loading: false, allowed: false });
				}
				return;
			}

			const data = await res.json();
			const allowed = data?.user?.role === 'ADMINISTRATOR';
			if (!cancelled) {
				setState({ loading: false, allowed });
			}
		}

		checkAccess();
		return () => {
			cancelled = true;
		};
	}, []);

	if (state.loading) {
		return (
			<section className="module-page">
				<LoadingIndicator className="page-loading-indicator" label="Checking admin access" />
			</section>
		);
	}

	if (!state.allowed) {
		return (
			<section className="module-page">
				<article className="panel panel-narrow">
					<h3>Admin Access Required</h3>
					<p className="panel-subtext">
						This area is only available for administrators.
					</p>
				</article>
			</section>
		);
	}

	return children;
}
