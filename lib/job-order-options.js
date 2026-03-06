export const JOB_ORDER_EMPLOYMENT_TYPES = ['Temporary - W2', 'Temporary - 1099', 'Permanent'];

export const JOB_ORDER_STATUS_OPTIONS = [
	{ value: 'open', label: 'Open' },
	{ value: 'on_hold', label: 'On Hold' },
	{ value: 'closed', label: 'Closed' }
];

export const JOB_ORDER_STATUS_VALUES = JOB_ORDER_STATUS_OPTIONS.map((option) => option.value);

const JOB_ORDER_STATUS_ALIASES = {
	active: 'open',
	inactive: 'on_hold',
	onhold: 'on_hold',
	hold: 'on_hold',
	paused: 'on_hold',
	close: 'closed'
};

export function normalizeJobOrderStatusInput(value) {
	const raw = String(value || '').trim();
	if (!raw) return '';

	const normalized = raw.toLowerCase().replace(/[\s-]+/g, '_');
	if (JOB_ORDER_STATUS_VALUES.includes(normalized)) return normalized;
	if (JOB_ORDER_STATUS_ALIASES[normalized]) return JOB_ORDER_STATUS_ALIASES[normalized];
	return raw;
}

export function toJobOrderStatusValue(value) {
	const normalized = normalizeJobOrderStatusInput(value);
	return JOB_ORDER_STATUS_VALUES.includes(normalized) ? normalized : 'open';
}
