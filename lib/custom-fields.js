import { createRecordId } from '@/lib/record-id';

export const CUSTOM_FIELD_MODULE_OPTIONS = Object.freeze([
	{ value: 'candidates', label: 'Candidates', entityType: 'CANDIDATE' },
	{ value: 'clients', label: 'Clients', entityType: 'CLIENT' },
	{ value: 'contacts', label: 'Contacts', entityType: 'CONTACT' },
	{ value: 'jobOrders', label: 'Job Orders', entityType: 'JOB_ORDER' },
	{ value: 'submissions', label: 'Submissions', entityType: 'SUBMISSION' },
	{ value: 'interviews', label: 'Interviews', entityType: 'INTERVIEW' },
	{ value: 'placements', label: 'Placements', entityType: 'PLACEMENT' }
]);

export const CUSTOM_FIELD_MODULE_VALUES = Object.freeze(
	CUSTOM_FIELD_MODULE_OPTIONS.map((option) => option.value)
);

export const CUSTOM_FIELD_TYPE_OPTIONS = Object.freeze([
	{ value: 'text', label: 'Text' },
	{ value: 'textarea', label: 'Long Text' },
	{ value: 'number', label: 'Number' },
	{ value: 'date', label: 'Date' },
	{ value: 'boolean', label: 'Yes / No' },
	{ value: 'select', label: 'Select' }
]);

export const CUSTOM_FIELD_TYPE_VALUES = Object.freeze(
	CUSTOM_FIELD_TYPE_OPTIONS.map((option) => option.value)
);

function isPlainObject(value) {
	return value != null && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeCustomFieldModuleKey(value) {
	const moduleKey = String(value || '').trim();
	if (!CUSTOM_FIELD_MODULE_VALUES.includes(moduleKey)) {
		return '';
	}
	return moduleKey;
}

export function normalizeCustomFieldType(value) {
	const fieldType = String(value || '').trim().toLowerCase();
	if (!CUSTOM_FIELD_TYPE_VALUES.includes(fieldType)) {
		return 'text';
	}
	return fieldType;
}

export function normalizeCustomFieldKey(value) {
	return String(value || '')
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '')
		.slice(0, 64);
}

export function normalizeCustomFieldSelectOptions(value) {
	if (Array.isArray(value)) {
		const uniqueValues = [];
		const seen = new Set();
		for (const optionValue of value) {
			const nextValue = String(optionValue || '').trim();
			if (!nextValue) continue;
			const key = nextValue.toLowerCase();
			if (seen.has(key)) continue;
			seen.add(key);
			uniqueValues.push(nextValue);
		}
		return uniqueValues;
	}

	const rawText = String(value || '').trim();
	if (!rawText) return [];
	const tokens = rawText
		.split(/\r?\n|,/)
		.map((token) => token.trim())
		.filter(Boolean);
	return normalizeCustomFieldSelectOptions(tokens);
}

export function toCustomFieldInputObject(value) {
	if (!isPlainObject(value)) return {};
	return Object.fromEntries(Object.entries(value));
}

function hasProvidedValue(value) {
	if (value == null) return false;
	if (typeof value === 'string') return value.trim().length > 0;
	return true;
}

function normalizeBooleanValue(value) {
	if (typeof value === 'boolean') return value;
	const normalized = String(value || '').trim().toLowerCase();
	if (!normalized) return null;
	if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
	if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
	return null;
}

function normalizeDateValue(value) {
	const raw = String(value || '').trim();
	if (!raw) return null;
	const parsed = new Date(raw);
	if (Number.isNaN(parsed.getTime())) return null;
	return raw;
}

function normalizeNumericValue(value) {
	if (value === '' || value == null) return null;
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return null;
	return parsed;
}

function normalizeTextValue(value) {
	const normalized = String(value ?? '').trim();
	return normalized || null;
}

export function normalizeCustomFieldValue(definition, rawValue) {
	const fieldType = normalizeCustomFieldType(definition?.fieldType);
	if (fieldType === 'boolean') {
		return normalizeBooleanValue(rawValue);
	}
	if (fieldType === 'number') {
		return normalizeNumericValue(rawValue);
	}
	if (fieldType === 'date') {
		return normalizeDateValue(rawValue);
	}

	const normalizedText = normalizeTextValue(rawValue);
	if (fieldType === 'select') {
		if (!normalizedText) return null;
		const options = normalizeCustomFieldSelectOptions(definition?.selectOptions);
		if (options.length > 0 && !options.includes(normalizedText)) {
			return null;
		}
	}
	return normalizedText;
}

export async function getActiveCustomFieldDefinitions(prisma, moduleKey) {
	const normalizedModule = normalizeCustomFieldModuleKey(moduleKey);
	if (!normalizedModule) return [];
	return prisma.customFieldDefinition.findMany({
		where: {
			moduleKey: normalizedModule,
			isActive: true
		},
		orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
	});
}

export function normalizeCustomFieldDefinitionRow(row) {
	if (!row) return null;
	return {
		...row,
		fieldType: normalizeCustomFieldType(row.fieldType),
		selectOptions: normalizeCustomFieldSelectOptions(row.selectOptions)
	};
}

export function normalizeCustomFieldDefinitionInput(payload) {
	const input = payload && typeof payload === 'object' ? payload : {};
	const moduleKey = normalizeCustomFieldModuleKey(input.moduleKey);
	if (!moduleKey) {
		return { error: 'Module is required.' };
	}

	const label = String(input.label || '').trim();
	if (!label) {
		return { error: 'Label is required.' };
	}

	const fieldType = normalizeCustomFieldType(input.fieldType);
	const fieldKeyCandidate = normalizeCustomFieldKey(input.fieldKey || label);
	if (!fieldKeyCandidate) {
		return { error: 'Field key is required.' };
	}

	const selectOptions = normalizeCustomFieldSelectOptions(input.selectOptions);
	if (fieldType === 'select' && selectOptions.length <= 0) {
		return { error: 'Select fields require at least one option.' };
	}

	const sortOrder = Number.isInteger(Number(input.sortOrder)) ? Number(input.sortOrder) : 0;
	return {
		data: {
			recordId: createRecordId('CFD'),
			moduleKey,
			fieldKey: fieldKeyCandidate,
			label,
			fieldType,
			selectOptions: fieldType === 'select' ? selectOptions : [],
			placeholder: normalizeTextValue(input.placeholder),
			helpText: normalizeTextValue(input.helpText),
			isRequired: Boolean(input.isRequired),
			isActive: input.isActive == null ? true : Boolean(input.isActive),
			sortOrder
		}
	};
}

export async function validateAndNormalizeCustomFieldValues({
	prisma,
	moduleKey,
	customFieldsInput
}) {
	const definitions = await getActiveCustomFieldDefinitions(prisma, moduleKey);
	if (definitions.length <= 0) {
		return { customFields: null, errors: [] };
	}

	const input = toCustomFieldInputObject(customFieldsInput);
	const normalized = {};
	const errors = [];

	for (const definition of definitions) {
		const normalizedDefinition = normalizeCustomFieldDefinitionRow(definition);
		const rawValue = input[normalizedDefinition.fieldKey];
		const normalizedValue = normalizeCustomFieldValue(normalizedDefinition, rawValue);
		const hasValue = hasProvidedValue(normalizedValue);

		if (normalizedDefinition.isRequired && !hasValue) {
			errors.push(`${normalizedDefinition.label} is required.`);
			continue;
		}

		if (rawValue != null && rawValue !== '' && !hasValue) {
			errors.push(`Invalid value for ${normalizedDefinition.label}.`);
			continue;
		}

		if (normalizedDefinition.fieldType === 'select' && hasValue) {
			const options = normalizeCustomFieldSelectOptions(normalizedDefinition.selectOptions);
			if (options.length > 0 && !options.includes(normalizedValue)) {
				errors.push(`${normalizedDefinition.label} must be one of the configured options.`);
				continue;
			}
		}

		if (hasValue) {
			normalized[normalizedDefinition.fieldKey] = normalizedValue;
		}
	}

	return {
		customFields: Object.keys(normalized).length > 0 ? normalized : null,
		errors
	};
}

