export const TABLE_COLUMNS_CHANGED_EVENT = 'hg-table-columns-changed';

export function normalizeTableKey(tableKey) {
	return String(tableKey || '').trim().toLowerCase();
}

export function columnsStorageKey(tableKey) {
	return `hg:list-columns:${normalizeTableKey(tableKey)}`;
}

export function normalizeHiddenColumnKeys(raw) {
	if (!Array.isArray(raw)) return [];
	return raw.map((value) => String(value || '').trim()).filter(Boolean);
}

export function normalizeShownColumnKeys(raw) {
	if (!Array.isArray(raw)) return [];
	return raw.map((value) => String(value || '').trim()).filter(Boolean);
}

function normalizeColumnVisibilityState(raw) {
	if (Array.isArray(raw)) {
		return {
			hiddenColumnKeys: normalizeHiddenColumnKeys(raw),
			shownColumnKeys: []
		};
	}

	if (!raw || typeof raw !== 'object') {
		return {
			hiddenColumnKeys: [],
			shownColumnKeys: []
		};
	}

	return {
		hiddenColumnKeys: normalizeHiddenColumnKeys(raw.hiddenColumnKeys ?? raw.hidden),
		shownColumnKeys: normalizeShownColumnKeys(raw.shownColumnKeys ?? raw.shown)
	};
}

export function defaultHiddenColumnKeys(columns = []) {
	return columns
		.map((column) => ({
			key: String(column?.key || '').trim(),
			defaultVisible: column?.defaultVisible
		}))
		.filter((column) => column.key && column.defaultVisible === false)
		.map((column) => column.key);
}

export function readColumnVisibilityState(tableKey, columns = []) {
	if (typeof window === 'undefined') {
		return {
			hiddenColumnKeys: defaultHiddenColumnKeys(columns),
			shownColumnKeys: []
		};
	}
	const normalizedTableKey = normalizeTableKey(tableKey);
	if (!normalizedTableKey) {
		return {
			hiddenColumnKeys: [],
			shownColumnKeys: []
		};
	}
	try {
		const raw = window.localStorage.getItem(columnsStorageKey(normalizedTableKey));
		const storedState = normalizeColumnVisibilityState(raw ? JSON.parse(raw) : null);
		const availableColumnKeys = new Set(
			columns.map((column) => String(column?.key || '').trim()).filter(Boolean)
		);
		const shownColumnKeys = storedState.shownColumnKeys.filter((key) => availableColumnKeys.has(key));
		const hiddenColumnKeys = [
			...new Set([
				...storedState.hiddenColumnKeys.filter((key) => availableColumnKeys.has(key)),
				...defaultHiddenColumnKeys(columns).filter((key) => !shownColumnKeys.includes(key))
			])
		];
		return {
			hiddenColumnKeys,
			shownColumnKeys
		};
	} catch {
		return {
			hiddenColumnKeys: defaultHiddenColumnKeys(columns),
			shownColumnKeys: []
		};
	}
}

export function readHiddenColumnKeys(tableKey, columns = []) {
	return readColumnVisibilityState(tableKey, columns).hiddenColumnKeys;
}

export function writeColumnVisibilityState(tableKey, visibilityState) {
	if (typeof window === 'undefined') return;
	const normalizedTableKey = normalizeTableKey(tableKey);
	if (!normalizedTableKey) return;
	const normalizedState = normalizeColumnVisibilityState(visibilityState);
	window.localStorage.setItem(
		columnsStorageKey(normalizedTableKey),
		JSON.stringify({
			hiddenColumnKeys: normalizedState.hiddenColumnKeys,
			shownColumnKeys: normalizedState.shownColumnKeys
		})
	);
}

export function writeHiddenColumnKeys(tableKey, hiddenColumnKeys) {
	writeColumnVisibilityState(tableKey, {
		hiddenColumnKeys,
		shownColumnKeys: []
	});
}

export function notifyHiddenColumnsChanged(tableKey) {
	if (typeof window === 'undefined') return;
	window.dispatchEvent(
		new CustomEvent(TABLE_COLUMNS_CHANGED_EVENT, {
			detail: { tableKey: normalizeTableKey(tableKey) }
		})
	);
}
