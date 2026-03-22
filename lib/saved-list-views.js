import { normalizeColumnVisibilityState } from '@/lib/table-columns';

export const SYSTEM_SAVED_VIEW_ID = '__system__';

export function normalizeSavedListKey(value) {
	return String(value || '').trim().toLowerCase();
}

function isJsonSafeListViewValue(value) {
	if (value == null) return true;
	if (['string', 'number', 'boolean'].includes(typeof value)) return true;
	if (Array.isArray(value)) return value.every((item) => isJsonSafeListViewValue(item));
	if (typeof value === 'object') {
		return Object.entries(value).every(
			([key, nestedValue]) => String(key || '').trim() && isJsonSafeListViewValue(nestedValue)
		);
	}
	return false;
}

export function normalizeSavedListViewState(raw) {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
	return Object.fromEntries(
		Object.entries(raw)
			.map(([key, value]) => [String(key || '').trim(), value])
			.filter(([key, value]) => key && isJsonSafeListViewValue(value))
			.map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])
	);
}

export function savedListViewStatesEqual(a, b) {
	return JSON.stringify(normalizeSavedListViewState(a)) === JSON.stringify(normalizeSavedListViewState(b));
}

export function normalizeSavedListView(raw) {
	const id = String(raw?.id || '').trim();
	if (!id) return null;
	const name = String(raw?.name || '').trim();
	if (!name) return null;
	return {
		id,
		name,
		state: normalizeSavedListViewState(raw?.state),
		columnVisibilityState: normalizeColumnVisibilityState(raw?.columnVisibilityState),
		createdAt: raw?.createdAt ? String(raw.createdAt) : null,
		updatedAt: raw?.updatedAt ? String(raw.updatedAt) : null
	};
}

export function normalizeSavedListViewGroup(raw) {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		return {
			activeViewId: null,
			defaultViewId: null,
			views: []
		};
	}

	const views = Array.isArray(raw.views) ? raw.views.map(normalizeSavedListView).filter(Boolean) : [];
	const activeViewId = String(raw.activeViewId || '').trim() || null;
	const defaultViewId = String(raw.defaultViewId || '').trim() || null;

	return {
		activeViewId:
			activeViewId === SYSTEM_SAVED_VIEW_ID || views.some((view) => view.id === activeViewId)
				? activeViewId
				: null,
		defaultViewId: views.some((view) => view.id === defaultViewId) ? defaultViewId : null,
		views
	};
}

export function normalizeSavedListViews(raw) {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
	return Object.fromEntries(
		Object.entries(raw)
			.map(([listKey, group]) => [normalizeSavedListKey(listKey), normalizeSavedListViewGroup(group)])
			.filter(([listKey]) => Boolean(listKey))
	);
}
