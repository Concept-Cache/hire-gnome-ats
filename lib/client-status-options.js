export const CLIENT_STATUS_OPTIONS = [
	{ value: 'Prospect', label: 'Prospect' },
	{ value: 'Active', label: 'Active' },
	{ value: 'Active + Verified', label: 'Active + Verified' },
	{ value: 'Inactive', label: 'Inactive' }
];

const CLIENT_STATUS_VALUE_SET = new Set(CLIENT_STATUS_OPTIONS.map((option) => option.value));

export function normalizeClientStatusValue(value) {
	const status = typeof value === 'string' ? value.trim() : '';
	if (!status) return 'Prospect';
	if (CLIENT_STATUS_VALUE_SET.has(status)) return status;
	if (status.toLowerCase() === 'active + verfieid') return 'Active + Verified';
	return 'Prospect';
}
