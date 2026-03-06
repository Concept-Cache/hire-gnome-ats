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

export function readHiddenColumnKeys(tableKey) {
	if (typeof window === 'undefined') return [];
	const normalizedTableKey = normalizeTableKey(tableKey);
	if (!normalizedTableKey) return [];
	try {
		const raw = window.localStorage.getItem(columnsStorageKey(normalizedTableKey));
		return normalizeHiddenColumnKeys(raw ? JSON.parse(raw) : []);
	} catch {
		return [];
	}
}

export function writeHiddenColumnKeys(tableKey, hiddenColumnKeys) {
	if (typeof window === 'undefined') return;
	const normalizedTableKey = normalizeTableKey(tableKey);
	if (!normalizedTableKey) return;
	window.localStorage.setItem(
		columnsStorageKey(normalizedTableKey),
		JSON.stringify(normalizeHiddenColumnKeys(hiddenColumnKeys))
	);
}

export function notifyHiddenColumnsChanged(tableKey) {
	if (typeof window === 'undefined') return;
	window.dispatchEvent(
		new CustomEvent(TABLE_COLUMNS_CHANGED_EVENT, {
			detail: { tableKey: normalizeTableKey(tableKey) }
		})
	);
}
