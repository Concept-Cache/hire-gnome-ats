'use client';

import { useEffect, useState } from 'react';

export default function useIsAdministrator(actingUser = null) {
	const [resolvedUser, setResolvedUser] = useState(actingUser);

	useEffect(() => {
		if (actingUser) {
			setResolvedUser(actingUser);
			return;
		}

		let cancelled = false;

		async function loadActingUser() {
			const res = await fetch('/api/session/acting-user', { cache: 'no-store' });
			const data = await res.json().catch(() => ({ user: null }));
			if (cancelled) return;
			setResolvedUser(data?.user || null);
		}

		loadActingUser().catch(() => {
			if (!cancelled) {
				setResolvedUser(null);
			}
		});

		return () => {
			cancelled = true;
		};
	}, [actingUser]);

	return resolvedUser?.role === 'ADMINISTRATOR';
}
