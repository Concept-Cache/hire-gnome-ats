import { DEFAULT_UNASSIGNED_DIVISION_NAME } from '@/lib/default-division';

function normalizeLabel(value) {
	return String(value || '').trim().toLowerCase();
}

export async function fetchUnassignedDivisionOption() {
	const res = await fetch(
		`/api/lookups/divisions?q=${encodeURIComponent(DEFAULT_UNASSIGNED_DIVISION_NAME)}&limit=25`,
		{ cache: 'no-store' }
	);
	if (!res.ok) return null;

	const options = await res.json().catch(() => []);
	if (!Array.isArray(options) || options.length === 0) return null;

	const exact = options.find(
		(option) => normalizeLabel(option?.label) === normalizeLabel(DEFAULT_UNASSIGNED_DIVISION_NAME)
	);
	return exact || options[0];
}

