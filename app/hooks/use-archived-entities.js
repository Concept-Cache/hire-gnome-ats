'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

function normalizeEntityType(value) {
	return String(value || '').trim().toUpperCase();
}

export default function useArchivedEntities(entityType) {
	const normalizedEntityType = normalizeEntityType(entityType);
	const [archivedIds, setArchivedIds] = useState([]);
	const [loading, setLoading] = useState(false);

	const archivedIdSet = useMemo(() => new Set(archivedIds), [archivedIds]);

	const refreshArchivedIds = useCallback(async () => {
		if (!normalizedEntityType) {
			setArchivedIds([]);
			return;
		}
		setLoading(true);
		try {
			const res = await fetch(
				`/api/archive?entityType=${encodeURIComponent(normalizedEntityType)}&idsOnly=true`,
				{ cache: 'no-store' }
			);
			const data = await res.json().catch(() => ({}));
			if (!res.ok) {
				setArchivedIds([]);
				return;
			}
			setArchivedIds(Array.isArray(data.ids) ? data.ids : []);
		} finally {
			setLoading(false);
		}
	}, [normalizedEntityType]);

	useEffect(() => {
		refreshArchivedIds();
	}, [refreshArchivedIds]);

	async function archiveEntity(entityId, reason = '', cascade = undefined) {
		if (!normalizedEntityType) return { ok: false, error: 'Invalid entity type.' };
		const res = await fetch('/api/archive', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				entityType: normalizedEntityType,
				entityId,
				reason,
				cascade
			})
		});
		const data = await res.json().catch(() => ({}));
		if (!res.ok) {
			return {
				ok: false,
				error: data.error || 'Failed to archive record.'
			};
		}
		setArchivedIds((current) => [...new Set([...current, Number(entityId)])]);
		return {
			ok: true,
			archivedCount: Number(data.archivedCount) || 1,
			archivedByType: data.archivedByType || {}
		};
	}

	async function restoreEntity(entityId) {
		if (!normalizedEntityType) return { ok: false, error: 'Invalid entity type.' };
		const res = await fetch(
			`/api/archive/${encodeURIComponent(normalizedEntityType)}/${encodeURIComponent(entityId)}`,
			{
				method: 'DELETE'
			}
		);
		const data = await res.json().catch(() => ({}));
		if (!res.ok) {
			return {
				ok: false,
				error: data.error || 'Failed to restore record.'
			};
		}
		setArchivedIds((current) => current.filter((id) => Number(id) !== Number(entityId)));
		return { ok: true };
	}

	return {
		loading,
		archivedIds,
		archivedIdSet,
		refreshArchivedIds,
		archiveEntity,
		restoreEntity
	};
}
