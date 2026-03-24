export const RECORD_NAVIGATION_QUERY_PARAM = 'navContext';

function storageKey(entityKey) {
	return `hg-record-navigation:${String(entityKey || '').trim().toLowerCase()}`;
}

function normalizeIds(values) {
	return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || '').trim()).filter(Boolean))];
}

export function saveRecordNavigationContext(entityKey, payload = {}) {
	if (typeof window === 'undefined') return;

	const ids = normalizeIds(payload.ids);
	if (ids.length === 0) {
		window.sessionStorage.removeItem(storageKey(entityKey));
		return;
	}

	const value = {
		ids,
		label: String(payload.label || '').trim(),
		listPath: String(payload.listPath || '').trim() || '/'
	};

	try {
		window.sessionStorage.setItem(storageKey(entityKey), JSON.stringify(value));
	} catch {
		// Ignore session storage write errors.
	}
}

export function clearRecordNavigationContext(entityKey) {
	if (typeof window === 'undefined') return;

	try {
		window.sessionStorage.removeItem(storageKey(entityKey));
	} catch {
		// Ignore session storage write errors.
	}
}

export function readRecordNavigationContext(entityKey) {
	if (typeof window === 'undefined') return null;

	try {
		const raw = window.sessionStorage.getItem(storageKey(entityKey));
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		const ids = normalizeIds(parsed?.ids);
		if (ids.length === 0) return null;
		return {
			ids,
			label: String(parsed?.label || '').trim(),
			listPath: String(parsed?.listPath || '').trim() || '/'
		};
	} catch {
		return null;
	}
}

export function withRecordNavigationQuery(href) {
	const value = String(href || '').trim();
	if (!value) return value;

	const [pathAndSearch, hashFragment] = value.split('#');
	const params = new URLSearchParams();
	const [pathname, search = ''] = pathAndSearch.split('?');
	const existingParams = new URLSearchParams(search);
	existingParams.forEach((paramValue, key) => {
		params.set(key, paramValue);
	});
	params.set(RECORD_NAVIGATION_QUERY_PARAM, '1');
	const nextSearch = params.toString();
	return `${pathname}${nextSearch ? `?${nextSearch}` : ''}${hashFragment ? `#${hashFragment}` : ''}`;
}
