const FIELD_DEFINITIONS = [
	{ key: 'candidate', label: 'Candidate', type: 'text' },
	{ key: 'client', label: 'Client', type: 'text' },
	{ key: 'compensationType', label: 'Compensation Type', type: 'select' },
	{ key: 'endDate', label: 'End Date', type: 'date' },
	{ key: 'expectedJoinDate', label: 'Expected Join', type: 'date' },
	{ key: 'jobOrder', label: 'Job Order', type: 'text' },
	{ key: 'offeredOn', label: 'Offered On', type: 'date' },
	{ key: 'placementType', label: 'Placement Type', type: 'select' },
	{ key: 'status', label: 'Status', type: 'select' }
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

const COMPENSATION_TYPE_OPTIONS = [
	{ value: 'salary', label: 'Salary' },
	{ value: 'hourly', label: 'Hourly' },
	{ value: 'daily', label: 'Daily' }
];

function cleanString(value) {
	return String(value || '').trim();
}

function cleanLower(value) {
	return cleanString(value).toLowerCase();
}

function toNumber(value) {
	if (typeof value === 'number') return Number.isFinite(value) ? value : null;
	const parsed = Number(cleanString(value));
	return Number.isFinite(parsed) ? parsed : null;
}

function toDayTimestamp(value) {
	if (!value) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	date.setHours(0, 0, 0, 0);
	return date.getTime();
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

export function normalizePlacementAdvancedCriteria(raw) {
	if (!Array.isArray(raw)) return [];
	return raw.map(normalizeCriterion).filter(Boolean);
}

export function getPlacementAdvancedFieldDefinitions({ statusOptions = [], typeOptions = [] } = {}) {
	return FIELD_DEFINITIONS.map((field) => {
		if (field.key === 'status') return { ...field, options: statusOptions };
		if (field.key === 'placementType') return { ...field, options: typeOptions };
		if (field.key === 'compensationType') return { ...field, options: COMPENSATION_TYPE_OPTIONS };
		return field;
	}).sort((a, b) => a.label.localeCompare(b.label));
}

export function getPlacementAdvancedOperatorOptions(fieldKey) {
	const definition = fieldDefinitionFor(fieldKey);
	return definition ? getOperatorOptionsForType(definition.type) : [];
}

export function createDefaultPlacementAdvancedCriterion() {
	return { field: 'candidate', operator: DEFAULT_OPERATOR_BY_TYPE.text, value: '', valueTo: '' };
}

function criterionHasRequiredValue(criterion) {
	if (!criterion?.field || !criterion?.operator) return false;
	if (criterion.operator === 'between') {
		return cleanString(criterion.value) && cleanString(criterion.valueTo);
	}
	return Boolean(cleanString(criterion.value));
}

export function isPlacementAdvancedCriterionComplete(criterion) {
	return criterionHasRequiredValue(normalizeCriterion(criterion));
}

function rowValueForField(row, field) {
	switch (field) {
		case 'candidate':
			return row.candidate || '';
		case 'client':
			return row.client || '';
		case 'compensationType':
			return row.compensationType || '';
		case 'endDate':
			return row.endDate;
		case 'expectedJoinDate':
			return row.expectedJoinDate;
		case 'jobOrder':
			return row.jobOrder || '';
		case 'offeredOn':
			return row.offeredOn;
		case 'placementType':
			return row.placementType || '';
		case 'status':
			return row.status || '';
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

export function evaluatePlacementAdvancedCriteria(row, rawCriteria) {
	const criteria = normalizePlacementAdvancedCriteria(rawCriteria).filter(isPlacementAdvancedCriterionComplete);
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
	const options = getPlacementAdvancedOperatorOptions(fieldKey);
	return options.find((option) => option.value === operator)?.label || operator;
}

export function summarizePlacementAdvancedCriterion(rawCriterion) {
	const criterion = normalizeCriterion(rawCriterion);
	if (!criterion || !isPlacementAdvancedCriterionComplete(criterion)) return '';
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
