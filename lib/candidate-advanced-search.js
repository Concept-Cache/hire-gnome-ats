import { CANDIDATE_STATUS_OPTIONS } from '@/lib/candidate-status';

const FIELD_DEFINITIONS = [
	{ key: 'activityCount', label: 'Activities', type: 'number' },
	{ key: 'completenessScore', label: 'Profile Completeness', type: 'number' },
	{ key: 'currentEmployer', label: 'Current Employer', type: 'text' },
	{ key: 'currentTitle', label: 'Current Title', type: 'text' },
	{ key: 'division', label: 'Division', type: 'select' },
	{ key: 'fullName', label: 'Name', type: 'text' },
	{ key: 'email', label: 'Email', type: 'text' },
	{ key: 'fileCount', label: 'Files', type: 'number' },
	{ key: 'lastActivityAt', label: 'Last Activity Date', type: 'date' },
	{ key: 'location', label: 'Location', type: 'text' },
	{ key: 'mobile', label: 'Mobile', type: 'text' },
	{ key: 'noteCount', label: 'Notes', type: 'number' },
	{ key: 'owner', label: 'Owner', type: 'select' },
	{ key: 'resumeKeywords', label: 'Resume Keywords', type: 'text' },
	{ key: 'skills', label: 'Skills', type: 'text' },
	{ key: 'source', label: 'Source', type: 'select' },
	{ key: 'status', label: 'Status', type: 'select' },
	{ key: 'submissionCount', label: 'Submissions', type: 'number' }
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

const STATUS_LABELS = new Map(CANDIDATE_STATUS_OPTIONS.map((option) => [option.value, option.label]));

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

export function normalizeCandidateAdvancedCriteria(raw) {
	if (!Array.isArray(raw)) return [];
	return raw.map(normalizeCriterion).filter(Boolean);
}

export function getCandidateAdvancedFieldDefinitions({
	ownerOptions = [],
	sourceOptions = [],
	divisionOptions = []
} = {}) {
	return FIELD_DEFINITIONS.map((field) => {
		if (field.key === 'status') {
			return {
				...field,
				options: CANDIDATE_STATUS_OPTIONS.map((option) => ({ value: option.value, label: option.label }))
			};
		}
		if (field.key === 'owner') {
			return {
				...field,
				options: ownerOptions.map((value) => ({ value, label: value }))
			};
		}
		if (field.key === 'source') {
			return {
				...field,
				options: sourceOptions.map((value) => ({ value, label: value }))
			};
		}
		if (field.key === 'division') {
			return {
				...field,
				options: divisionOptions.map((value) => ({ value, label: value }))
			};
		}
		return field;
	}).sort((a, b) => a.label.localeCompare(b.label));
}

export function getCandidateAdvancedOperatorOptions(fieldKey) {
	const definition = fieldDefinitionFor(fieldKey);
	return definition ? getOperatorOptionsForType(definition.type) : [];
}

export function createDefaultCandidateAdvancedCriterion() {
	return {
		field: 'fullName',
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

export function isCandidateAdvancedCriterionComplete(criterion) {
	return criterionHasRequiredValue(normalizeCriterion(criterion));
}

function rowValueForField(row, field) {
	switch (field) {
		case 'fullName':
			return row.fullName || '';
		case 'status':
			return row.status || '';
		case 'owner':
			return row.ownerName || '';
		case 'skills':
			return row.skillsLabel || '';
		case 'resumeKeywords':
			return row.resumeSearchText || '';
		case 'source':
			return row.sourceLabel || '';
		case 'currentTitle':
			return row.currentTitle || '';
		case 'currentEmployer':
			return row.currentEmployerLabel || '';
		case 'email':
			return row.emailLabel || '';
		case 'mobile':
			return row.mobileLabel || '';
		case 'location':
			return row.locationLabel || '';
		case 'division':
			return row.divisionName || '';
		case 'completenessScore':
			return row.completenessScore;
		case 'submissionCount':
			return row.submissionCount;
		case 'noteCount':
			return row.noteCount;
		case 'fileCount':
			return row.fileCount;
		case 'activityCount':
			return row.activityCount;
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

export function evaluateCandidateAdvancedCriteria(row, rawCriteria) {
	const criteria = normalizeCandidateAdvancedCriteria(rawCriteria).filter(isCandidateAdvancedCriterionComplete);
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
	const options = getCandidateAdvancedOperatorOptions(fieldKey);
	return options.find((option) => option.value === operator)?.label || operator;
}

function labelForSelectValue(fieldKey, value) {
	if (fieldKey === 'status') return STATUS_LABELS.get(value) || value;
	return value;
}

export function summarizeCandidateAdvancedCriterion(rawCriterion) {
	const criterion = normalizeCriterion(rawCriterion);
	if (!criterion || !isCandidateAdvancedCriterionComplete(criterion)) return '';
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
