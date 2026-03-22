import { JOB_ORDER_EMPLOYMENT_TYPES, JOB_ORDER_STATUS_OPTIONS } from '@/lib/job-order-options';

const FIELD_DEFINITIONS = [
	{ key: 'title', label: 'Title', type: 'text' },
	{ key: 'client', label: 'Client', type: 'select' },
	{ key: 'owner', label: 'Owner', type: 'select' },
	{ key: 'status', label: 'Status', type: 'select' },
	{ key: 'feedbackStatus', label: 'Client Feedback', type: 'select' },
	{ key: 'employmentType', label: 'Employment Type', type: 'select' },
	{ key: 'location', label: 'Location', type: 'text' },
	{ key: 'openings', label: 'Openings', type: 'number' },
	{ key: 'submissionCount', label: 'Submissions', type: 'number' },
	{ key: 'clientFeedbackCount', label: 'Client Feedback', type: 'number' },
	{ key: 'careerSite', label: 'Career Site', type: 'select' },
	{ key: 'openedAt', label: 'Opened At', type: 'date' },
	{ key: 'closedAt', label: 'Closed At', type: 'date' },
	{ key: 'lastActivityAt', label: 'Last Activity Date', type: 'date' }
];

const OPERATOR_OPTIONS = {
	text: [
		{ value: 'contains', label: 'Contains' },
		{ value: 'not_contains', label: 'Does Not Contain' },
		{ value: 'is', label: 'Is' },
		{ value: 'is_not', label: 'Is Not' }
	],
	number: [
		{ value: 'is', label: 'Is' },
		{ value: 'is_not', label: 'Is Not' },
		{ value: 'gt', label: 'Greater Than' },
		{ value: 'gte', label: 'Greater Than or Equal' },
		{ value: 'lt', label: 'Less Than' },
		{ value: 'lte', label: 'Less Than or Equal' },
		{ value: 'between', label: 'Between' }
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
	number: 'gte',
	select: 'is',
	date: 'in_past_days'
};

const STATUS_LABELS = new Map(JOB_ORDER_STATUS_OPTIONS.map((option) => [option.value, option.label]));
const EMPLOYMENT_TYPE_LABELS = new Map(JOB_ORDER_EMPLOYMENT_TYPES.map((value) => [value, value]));
const CAREER_SITE_LABELS = new Map([
	['published', 'Published'],
	['hidden', 'Hidden']
]);
const FEEDBACK_LABELS = new Map([
	['with_feedback', 'With Feedback'],
	['no_feedback', 'No Feedback']
]);

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

export function normalizeJobOrderAdvancedCriteria(raw) {
	if (!Array.isArray(raw)) return [];
	return raw.map(normalizeCriterion).filter(Boolean);
}

export function getJobOrderAdvancedFieldDefinitions({ clientOptions = [], ownerOptions = [] } = {}) {
	return FIELD_DEFINITIONS.map((field) => {
		if (field.key === 'client') {
			return {
				...field,
				options: clientOptions.map((value) => ({ value, label: value }))
			};
		}
		if (field.key === 'owner') {
			return {
				...field,
				options: ownerOptions.map((value) => ({ value, label: value }))
			};
		}
		if (field.key === 'status') {
			return {
				...field,
				options: JOB_ORDER_STATUS_OPTIONS.map((option) => ({ value: option.value, label: option.label }))
			};
		}
		if (field.key === 'feedbackStatus') {
			return {
				...field,
				options: [
					{ value: 'with_feedback', label: 'With Feedback' },
					{ value: 'no_feedback', label: 'No Feedback' }
				]
			};
		}
		if (field.key === 'employmentType') {
			return {
				...field,
				options: JOB_ORDER_EMPLOYMENT_TYPES.map((value) => ({ value, label: value }))
			};
		}
		if (field.key === 'careerSite') {
			return {
				...field,
				options: [
					{ value: 'published', label: 'Published' },
					{ value: 'hidden', label: 'Hidden' }
				]
			};
		}
		return field;
	}).sort((a, b) => a.label.localeCompare(b.label));
}

export function getJobOrderAdvancedOperatorOptions(fieldKey) {
	const definition = fieldDefinitionFor(fieldKey);
	return definition ? getOperatorOptionsForType(definition.type) : [];
}

export function createDefaultJobOrderAdvancedCriterion() {
	return {
		field: 'title',
		operator: DEFAULT_OPERATOR_BY_TYPE.text,
		value: '',
		valueTo: ''
	};
}

function criterionHasRequiredValue(criterion) {
	if (!criterion?.field || !criterion?.operator) return false;
	if (criterion.operator === 'between') {
		return cleanString(criterion.value) && cleanString(criterion.valueTo);
	}
	return Boolean(cleanString(criterion.value));
}

export function isJobOrderAdvancedCriterionComplete(criterion) {
	return criterionHasRequiredValue(normalizeCriterion(criterion));
}

function rowValueForField(row, field) {
	switch (field) {
		case 'title':
			return row.title || '';
		case 'client':
			return row.client || '';
		case 'owner':
			return row.owner || '';
		case 'status':
			return row.status || '';
		case 'feedbackStatus':
			return Number(row.clientFeedbackCount || 0) > 0 ? 'with_feedback' : 'no_feedback';
		case 'employmentType':
			return row.employmentType || '';
		case 'location':
			return row.locationLabel || row.location || '';
		case 'openings':
			return row.openings;
		case 'submissionCount':
			return row.submissionCount;
		case 'clientFeedbackCount':
			return row.clientFeedbackCount;
		case 'careerSite':
			return row.publishToCareerSite ? 'published' : 'hidden';
		case 'openedAt':
			return row.openedAt;
		case 'closedAt':
			return row.closedAt;
		case 'lastActivityAt':
			return row.lastActivityAt;
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

function matchesNumberCriterion(rowValue, criterion) {
	const value = toNumber(rowValue);
	const target = toNumber(criterion.value);
	if (value == null || target == null) return false;
	switch (criterion.operator) {
		case 'is':
			return value === target;
		case 'is_not':
			return value !== target;
		case 'gt':
			return value > target;
		case 'gte':
			return value >= target;
		case 'lt':
			return value < target;
		case 'lte':
			return value <= target;
		case 'between': {
			const upper = toNumber(criterion.valueTo);
			if (upper == null) return false;
			return value >= Math.min(target, upper) && value <= Math.max(target, upper);
		}
		default:
			return true;
	}
}

function matchesSelectCriterion(rowValue, criterion) {
	const value = cleanLower(rowValue);
	const target = cleanLower(criterion.value);
	if (!target) return true;
	if (criterion.operator === 'is_not') {
		return value !== target;
	}
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

export function evaluateJobOrderAdvancedCriteria(row, rawCriteria) {
	const criteria = normalizeJobOrderAdvancedCriteria(rawCriteria).filter(isJobOrderAdvancedCriterionComplete);
	if (criteria.length === 0) return true;
	return criteria.every((criterion) => {
		const definition = fieldDefinitionFor(criterion.field);
		const rowValue = rowValueForField(row, criterion.field);
		switch (definition?.type) {
			case 'text':
				return matchesTextCriterion(rowValue, criterion);
			case 'number':
				return matchesNumberCriterion(rowValue, criterion);
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
	const options = getJobOrderAdvancedOperatorOptions(fieldKey);
	return options.find((option) => option.value === operator)?.label || operator;
}

function labelForSelectValue(fieldKey, value) {
	if (fieldKey === 'status') return STATUS_LABELS.get(value) || value;
	if (fieldKey === 'feedbackStatus') return FEEDBACK_LABELS.get(value) || value;
	if (fieldKey === 'employmentType') return EMPLOYMENT_TYPE_LABELS.get(value) || value;
	if (fieldKey === 'careerSite') return CAREER_SITE_LABELS.get(value) || value;
	return value;
}

export function summarizeJobOrderAdvancedCriterion(rawCriterion) {
	const criterion = normalizeCriterion(rawCriterion);
	if (!criterion || !isJobOrderAdvancedCriterionComplete(criterion)) return '';
	const field = fieldDefinitionFor(criterion.field);
	if (!field) return '';

	if (field.type === 'date' && criterion.operator === 'in_past_days') {
		return `${field.label} in past ${criterion.value} day${criterion.value === '1' ? '' : 's'}`;
	}

	if (criterion.operator === 'between') {
		const valueText =
			field.type === 'date'
				? `${formatDateValue(criterion.value)} to ${formatDateValue(criterion.valueTo)}`
				: `${criterion.value} to ${criterion.valueTo}`;
		return `${field.label} ${operatorLabelFor(field.key, criterion.operator).toLowerCase()} ${valueText}`;
	}

	const displayValue =
		field.type === 'date'
			? formatDateValue(criterion.value)
			: field.type === 'select'
				? labelForSelectValue(field.key, criterion.value)
				: criterion.value;
	return `${field.label} ${operatorLabelFor(field.key, criterion.operator).toLowerCase()} ${displayValue}`;
}
