const FIELD_DEFINITIONS = [
	{ key: 'candidate', label: 'Candidate', type: 'text' },
	{ key: 'client', label: 'Client', type: 'text' },
	{ key: 'clientPortal', label: 'Client Portal', type: 'select' },
	{ key: 'jobOrder', label: 'Job Order', type: 'text' },
	{ key: 'origin', label: 'Origin', type: 'select' },
	{ key: 'recordId', label: 'Record ID', type: 'text' },
	{ key: 'status', label: 'Status', type: 'select' },
	{ key: 'submittedAt', label: 'Submitted At', type: 'date' },
	{ key: 'submittedBy', label: 'Submitted By', type: 'select' },
	{ key: 'updatedAt', label: 'Updated At', type: 'date' }
];

const OPERATOR_OPTIONS = {
	text: [
		{ value: 'contains', label: 'Contains' },
		{ value: 'not_contains', label: 'Does Not Contain' },
		{ value: 'is', label: 'Is' },
		{ value: 'is_not', label: 'Is Not' }
	],
	select: [
		{ value: 'is', label: 'Is' },
		{ value: 'is_not', label: 'Is Not' }
	],
	date: [
		{ value: 'on', label: 'On' },
		{ value: 'before', label: 'Before' },
		{ value: 'after', label: 'After' },
		{ value: 'between', label: 'Between' },
		{ value: 'in_past_days', label: 'In Past Days' }
	]
};

const DEFAULT_OPERATOR_BY_TYPE = {
	text: 'contains',
	select: 'is',
	date: 'in_past_days'
};

const ORIGIN_OPTIONS = [
	{ value: 'recruiter', label: 'Recruiter' },
	{ value: 'web', label: 'Web' }
];

const CLIENT_PORTAL_OPTIONS = [
	{ value: 'visible', label: 'Visible' },
	{ value: 'hidden', label: 'Hidden' }
];

function cleanString(value) {
	return String(value || '').trim();
}

function cleanLower(value) {
	return cleanString(value).toLowerCase();
}

function toDayTimestamp(value) {
	if (!value) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	date.setHours(0, 0, 0, 0);
	return date.getTime();
}

function toNumber(value) {
	if (typeof value === 'number') return Number.isFinite(value) ? value : null;
	const parsed = Number(cleanString(value));
	return Number.isFinite(parsed) ? parsed : null;
}

function fieldDefinitionFor(fieldKey) {
	return FIELD_DEFINITIONS.find((field) => field.key === fieldKey) || null;
}

function getOperatorOptionsForType(type) {
	return OPERATOR_OPTIONS[type] || [];
}

function normalizeCriterion(raw) {
	const field = cleanString(raw?.field);
	const definition = fieldDefinitionFor(field);
	if (!definition) return null;
	const operatorOptions = getOperatorOptionsForType(definition.type);
	const operator = operatorOptions.some((option) => option.value === raw?.operator)
		? raw.operator
		: DEFAULT_OPERATOR_BY_TYPE[definition.type];
	return {
		field,
		operator,
		value: cleanString(raw?.value),
		valueTo: cleanString(raw?.valueTo)
	};
}

export function normalizeSubmissionAdvancedCriteria(raw) {
	if (!Array.isArray(raw)) return [];
	return raw.map(normalizeCriterion).filter(Boolean);
}

export function getSubmissionAdvancedFieldDefinitions({ statusOptions = [], submitterOptions = [] } = {}) {
	return FIELD_DEFINITIONS.map((field) => {
		if (field.key === 'status') {
			return { ...field, options: statusOptions };
		}
		if (field.key === 'submittedBy') {
			return {
				...field,
				options: submitterOptions.map((value) => ({ value, label: value }))
			};
		}
		if (field.key === 'origin') {
			return { ...field, options: ORIGIN_OPTIONS };
		}
		if (field.key === 'clientPortal') {
			return { ...field, options: CLIENT_PORTAL_OPTIONS };
		}
		return field;
	}).sort((a, b) => a.label.localeCompare(b.label));
}

export function getSubmissionAdvancedOperatorOptions(fieldKey) {
	const definition = fieldDefinitionFor(fieldKey);
	return definition ? getOperatorOptionsForType(definition.type) : [];
}

export function createDefaultSubmissionAdvancedCriterion() {
	return { field: 'candidate', operator: DEFAULT_OPERATOR_BY_TYPE.text, value: '', valueTo: '' };
}

function criterionHasRequiredValue(criterion) {
	if (!criterion?.field || !criterion?.operator) return false;
	if (criterion.operator === 'between') {
		return cleanString(criterion.value) && cleanString(criterion.valueTo);
	}
	return Boolean(cleanString(criterion.value));
}

export function isSubmissionAdvancedCriterionComplete(criterion) {
	return criterionHasRequiredValue(normalizeCriterion(criterion));
}

function rowValueForField(row, field) {
	switch (field) {
		case 'candidate':
			return row.candidate || '';
		case 'client':
			return row.client || '';
		case 'clientPortal':
			return row.clientPortalLabel ? String(row.clientPortalLabel).toLowerCase() : '';
		case 'jobOrder':
			return row.jobOrder || '';
		case 'origin':
			return row.originLabel ? String(row.originLabel).toLowerCase() : '';
		case 'recordId':
			return row.recordId || '';
		case 'status':
			return row.effectiveStatus || '';
		case 'submittedAt':
			return row.createdAt;
		case 'submittedBy':
			return row.submittedBy || '';
		case 'updatedAt':
			return row.updatedAt;
		default:
			return '';
	}
}

function matchesTextCriterion(rowValue, criterion) {
	const haystack = cleanLower(rowValue);
	const needle = cleanLower(criterion.value);
	if (!needle) return true;
	switch (criterion.operator) {
		case 'contains':
			return haystack.includes(needle);
		case 'not_contains':
			return !haystack.includes(needle);
		case 'is':
			return haystack === needle;
		case 'is_not':
			return haystack !== needle;
		default:
			return true;
	}
}

function matchesSelectCriterion(rowValue, criterion) {
	const value = cleanLower(rowValue);
	const target = cleanLower(criterion.value);
	if (!target) return true;
	if (criterion.operator === 'is_not') return value !== target;
	return value === target;
}

function matchesDateCriterion(rowValue, criterion) {
	const value = toDayTimestamp(rowValue);
	if (value == null) return false;
	const target = toDayTimestamp(criterion.value);
	switch (criterion.operator) {
		case 'on':
			return target != null ? value === target : false;
		case 'before':
			return target != null ? value < target : false;
		case 'after':
			return target != null ? value > target : false;
		case 'between': {
			const upper = toDayTimestamp(criterion.valueTo);
			if (target == null || upper == null) return false;
			return value >= Math.min(target, upper) && value <= Math.max(target, upper);
		}
		case 'in_past_days': {
			const days = toNumber(criterion.value);
			if (days == null || days <= 0) return false;
			const today = new Date();
			today.setHours(0, 0, 0, 0);
			const end = today.getTime();
			const start = new Date(today);
			start.setDate(start.getDate() - (Math.max(1, Math.trunc(days)) - 1));
			return value >= start.getTime() && value <= end;
		}
		default:
			return true;
	}
}

export function evaluateSubmissionAdvancedCriteria(row, rawCriteria) {
	const criteria = normalizeSubmissionAdvancedCriteria(rawCriteria).filter(isSubmissionAdvancedCriterionComplete);
	if (criteria.length === 0) return true;
	return criteria.every((criterion) => {
		const definition = fieldDefinitionFor(criterion.field);
		const rowValue = rowValueForField(row, criterion.field);
		switch (definition?.type) {
			case 'text':
				return matchesTextCriterion(rowValue, criterion);
			case 'select':
				return matchesSelectCriterion(rowValue, criterion);
			case 'date':
				return matchesDateCriterion(rowValue, criterion);
			default:
				return true;
		}
	});
}

function formatDateValue(value) {
	if (!value) return '';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return cleanString(value);
	return date.toLocaleDateString();
}

function operatorLabelFor(fieldKey, operator) {
	const options = getSubmissionAdvancedOperatorOptions(fieldKey);
	return options.find((option) => option.value === operator)?.label || operator;
}

export function summarizeSubmissionAdvancedCriterion(rawCriterion) {
	const criterion = normalizeCriterion(rawCriterion);
	if (!criterion || !isSubmissionAdvancedCriterionComplete(criterion)) return '';
	const field = fieldDefinitionFor(criterion.field);
	if (!field) return '';
	if (field.type === 'date' && criterion.operator === 'in_past_days') {
		return `${field.label} in past ${criterion.value} day${criterion.value === '1' ? '' : 's'}`;
	}
	if (criterion.operator === 'between') {
		return `${field.label} ${operatorLabelFor(field.key, criterion.operator).toLowerCase()} ${formatDateValue(criterion.value)} to ${formatDateValue(criterion.valueTo)}`;
	}
	const displayValue = field.type === 'date' ? formatDateValue(criterion.value) : criterion.value;
	return `${field.label} ${operatorLabelFor(field.key, criterion.operator).toLowerCase()} ${displayValue}`;
}
