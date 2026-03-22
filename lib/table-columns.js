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

export function normalizeOrderedColumnKeys(raw) {
	if (!Array.isArray(raw)) return [];
	return raw.map((value) => String(value || '').trim()).filter(Boolean);
}

export function normalizeColumnVisibilityState(raw) {
	if (Array.isArray(raw)) {
		return {
			hiddenColumnKeys: normalizeHiddenColumnKeys(raw),
			shownColumnKeys: [],
			orderedColumnKeys: []
		};
	}

	if (!raw || typeof raw !== 'object') {
		return {
			hiddenColumnKeys: [],
			shownColumnKeys: [],
			orderedColumnKeys: []
		};
	}

	return {
		hiddenColumnKeys: normalizeHiddenColumnKeys(raw.hiddenColumnKeys ?? raw.hidden),
		shownColumnKeys: normalizeShownColumnKeys(raw.shownColumnKeys ?? raw.shown),
		orderedColumnKeys: normalizeOrderedColumnKeys(raw.orderedColumnKeys ?? raw.ordered)
	};
}

export function normalizeTableColumnPreferences(raw) {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
	return Object.fromEntries(
		Object.entries(raw)
			.map(([tableKey, state]) => [normalizeTableKey(tableKey), normalizeColumnVisibilityState(state)])
			.filter(([tableKey]) => Boolean(tableKey))
	);
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

export function buildDefaultColumnVisibilityState(columns = []) {
	return {
		hiddenColumnKeys: defaultHiddenColumnKeys(columns),
		shownColumnKeys: [],
		orderedColumnKeys: resolveOrderedColumnKeys(columns, [])
	};
}

export function statesEqual(a, b) {
	return (
		JSON.stringify(normalizeColumnVisibilityState(a)) === JSON.stringify(normalizeColumnVisibilityState(b))
	);
}

export function isColumnVisibilityStateCustomized(visibilityState, columns = []) {
	const normalizedState = normalizeColumnVisibilityState(visibilityState);
	return (
		normalizedState.shownColumnKeys.length > 0 ||
		normalizedState.orderedColumnKeys.length > 0 ||
		JSON.stringify([...normalizedState.hiddenColumnKeys].sort()) !==
			JSON.stringify([...defaultHiddenColumnKeys(columns)].sort())
	);
}

export function resolveOrderedColumnKeys(columns = [], orderedColumnKeys = []) {
	const availableColumnKeys = columns.map((column) => String(column?.key || '').trim()).filter(Boolean);
	const normalizedOrderedKeys = normalizeOrderedColumnKeys(orderedColumnKeys).filter((key) =>
		availableColumnKeys.includes(key)
	);
	return [
		...normalizedOrderedKeys,
		...availableColumnKeys.filter((key) => !normalizedOrderedKeys.includes(key))
	];
}

export function orderColumns(columns = [], orderedColumnKeys = []) {
	const resolvedOrder = resolveOrderedColumnKeys(columns, orderedColumnKeys);
	const orderIndex = new Map(resolvedOrder.map((key, index) => [key, index]));
	return [...columns].sort((a, b) => {
		const aIndex = orderIndex.get(String(a?.key || '').trim());
		const bIndex = orderIndex.get(String(b?.key || '').trim());
		return Number(aIndex ?? Number.MAX_SAFE_INTEGER) - Number(bIndex ?? Number.MAX_SAFE_INTEGER);
	});
}

export function readColumnVisibilityState(tableKey, columns = []) {
	if (typeof window === 'undefined') {
		return buildDefaultColumnVisibilityState(columns);
	}
	const normalizedTableKey = normalizeTableKey(tableKey);
	if (!normalizedTableKey) {
		return {
			hiddenColumnKeys: [],
			shownColumnKeys: [],
			orderedColumnKeys: []
		};
	}
	try {
		const raw = window.localStorage.getItem(columnsStorageKey(normalizedTableKey));
		const storedState = normalizeColumnVisibilityState(raw ? JSON.parse(raw) : null);
		const availableColumnKeys = new Set(
			columns.map((column) => String(column?.key || '').trim()).filter(Boolean)
		);
		const shownColumnKeys = storedState.shownColumnKeys.filter((key) => availableColumnKeys.has(key));
		const orderedColumnKeys = resolveOrderedColumnKeys(
			columns,
			storedState.orderedColumnKeys.filter((key) => availableColumnKeys.has(key))
		);
		const hiddenColumnKeys = [
			...new Set([
				...storedState.hiddenColumnKeys.filter((key) => availableColumnKeys.has(key)),
				...defaultHiddenColumnKeys(columns).filter((key) => !shownColumnKeys.includes(key))
			])
		];
		return {
			hiddenColumnKeys,
			shownColumnKeys,
			orderedColumnKeys
		};
	} catch {
		return buildDefaultColumnVisibilityState(columns);
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
			shownColumnKeys: normalizedState.shownColumnKeys,
			orderedColumnKeys: normalizedState.orderedColumnKeys
		})
	);
}

export function writeHiddenColumnKeys(tableKey, hiddenColumnKeys) {
	writeColumnVisibilityState(tableKey, {
		hiddenColumnKeys,
		shownColumnKeys: [],
		orderedColumnKeys: []
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
