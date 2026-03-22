export function normalizeTableSortState(raw) {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		return { key: '', direction: 'asc' };
	}

	const key = String(raw.key || '').trim();
	const direction = raw.direction === 'desc' ? 'desc' : 'asc';
	return { key, direction };
}

export function tableSortStatesEqual(a, b) {
	const left = normalizeTableSortState(a);
	const right = normalizeTableSortState(b);
	return left.key === right.key && left.direction === right.direction;
}

export function buildDefaultTableSortState(columns = []) {
	const firstColumn =
		columns.find((column) => column?.defaultVisible !== false && String(column?.key || '').trim()) ||
		columns.find((column) => String(column?.key || '').trim());

	return normalizeTableSortState({
		key: firstColumn?.key || '',
		direction: 'asc'
	});
}
