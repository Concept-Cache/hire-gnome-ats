export const CUSTOM_FIELD_MODULE_OPTIONS = Object.freeze([
	{ value: 'candidates', label: 'Candidates' },
	{ value: 'clients', label: 'Clients' },
	{ value: 'contacts', label: 'Contacts' },
	{ value: 'jobOrders', label: 'Job Orders' },
	{ value: 'submissions', label: 'Submissions' },
	{ value: 'interviews', label: 'Interviews' },
	{ value: 'placements', label: 'Placements' }
]);

export const CUSTOM_FIELD_TYPE_OPTIONS = Object.freeze([
	{ value: 'text', label: 'Text' },
	{ value: 'textarea', label: 'Long Text' },
	{ value: 'number', label: 'Number' },
	{ value: 'date', label: 'Date' },
	{ value: 'boolean', label: 'Yes / No' },
	{ value: 'select', label: 'Select' }
]);

const moduleLabelByValue = Object.freeze(
	Object.fromEntries(CUSTOM_FIELD_MODULE_OPTIONS.map((option) => [option.value, option.label]))
);

const typeLabelByValue = Object.freeze(
	Object.fromEntries(CUSTOM_FIELD_TYPE_OPTIONS.map((option) => [option.value, option.label]))
);

export function customFieldModuleLabel(value) {
	return moduleLabelByValue[String(value || '').trim()] || 'Unknown';
}

export function customFieldTypeLabel(value) {
	return typeLabelByValue[String(value || '').trim()] || 'Text';
}
