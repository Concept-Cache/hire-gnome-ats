export function normalizeSortValue(value) {
	if (value == null) return '';
	if (typeof value === 'number') return Number.isFinite(value) ? value : '';
	if (typeof value === 'boolean') return value ? 1 : 0;
	if (value instanceof Date) return value.getTime();
	return String(value).trim().toLowerCase();
}

export function compareSortValues(a, b) {
	const aValue = normalizeSortValue(a);
	const bValue = normalizeSortValue(b);
	if (typeof aValue === 'number' && typeof bValue === 'number') {
		return aValue - bValue;
	}
	return String(aValue).localeCompare(String(bValue), undefined, {
		numeric: true,
		sensitivity: 'base'
	});
}

export function sortByConfig(items, sortConfig, valueResolver) {
	if (!Array.isArray(items) || items.length === 0) return [];
	if (!sortConfig?.field) return [...items];

	const multiplier = sortConfig.direction === 'asc' ? 1 : -1;
	return [...items]
		.map((item, index) => ({ item, index }))
		.sort((a, b) => {
			const aValue = valueResolver(a.item, sortConfig.field);
			const bValue = valueResolver(b.item, sortConfig.field);
			const compared = compareSortValues(aValue, bValue);
			if (compared !== 0) return compared * multiplier;
			return a.index - b.index;
		})
		.map((entry) => entry.item);
}
