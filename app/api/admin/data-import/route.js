import JSZip from 'jszip';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createRecordId } from '@/lib/record-id';
import { withApiLogging } from '@/lib/api-logging';
import { AccessControlError, getActingUser } from '@/lib/access-control';
import { enforceMutationThrottle } from '@/lib/mutation-throttle';
import { parseCsvText, normalizeHeaderKey } from '@/lib/data-import-csv';
import {
	GENERIC_IMPORT_ENTITY_OPTIONS,
	getGenericImportProfile,
	mapGenericImportRow
} from '@/lib/generic-import-profiles';
import { normalizeCandidateSourceValue } from '@/app/constants/candidate-source-options';
import { normalizeContactSourceValue } from '@/app/constants/contact-source-options';
import { toJobOrderStatusValue } from '@/lib/job-order-options';
import {
	normalizeCustomFieldKey,
	normalizeCustomFieldModuleKey,
	normalizeCustomFieldSelectOptions,
	normalizeCustomFieldType
} from '@/lib/custom-fields';
import {
	isAllowedCandidateAttachmentContentType,
	isAllowedCandidateAttachmentFileName
} from '@/lib/candidate-attachment-options';
import { deriveResumeSearchTextFromBuffer } from '@/lib/candidate-resume-search';
import {
	buildCandidateAttachmentStorageKey,
	uploadObjectBuffer
} from '@/lib/object-storage';
import {
	BULLHORN_CANDIDATE_FILES_MANIFEST_LEGACY_NAMES,
	BULLHORN_CANDIDATE_FILES_MANIFEST_NAME
} from '@/lib/bullhorn-export';
import { getBullhornOperationsEnabled, getZohoRecruitOperationsEnabled } from '@/lib/integration-operations';

export const dynamic = 'force-dynamic';

const SUPPORTED_IMPORT_ENTITY_KEYS = Object.freeze([
	'customFieldDefinitions',
	'clients',
	'contacts',
	'contactNotes',
	'candidates',
	'candidateNotes',
	'candidateEducations',
	'candidateWorkExperiences',
	'jobOrders',
	'submissions',
	'interviews',
	'placements'
]);
const SUPPORTED_SOURCE_TYPES = Object.freeze([
	'hire_gnome_export',
	'generic_csv',
	'generic_csv_manual',
	'generic_csv_zip',
	'bullhorn_csv',
	'bullhorn_csv_manual',
	'bullhorn_csv_zip',
	'zoho_recruit_csv',
	'zoho_recruit_manual',
	'zoho_recruit_zip'
]);
const GENERIC_IMPORT_PROFILES = Object.freeze(GENERIC_IMPORT_ENTITY_OPTIONS.map((option) => option.value));
const BULLHORN_IMPORT_PROFILES = Object.freeze([
	'customFieldDefinitions',
	'clients',
	'contacts',
	'contactNotes',
	'candidates',
	'candidateNotes',
	'candidateEducations',
	'candidateWorkExperiences',
	'jobOrders',
	'submissions',
	'interviews',
	'placements'
]);
const ZOHO_IMPORT_PROFILES = Object.freeze(['clients', 'contacts', 'candidates', 'jobOrders', 'submissions', 'interviews', 'placements']);
const VALID_CANDIDATE_STATUSES = new Set([
	'new',
	'in_review',
	'qualified',
	'submitted',
	'interview',
	'offered',
	'hired',
	'rejected'
]);

class ImportValidationError extends Error {
	constructor(message, status = 400) {
		super(message);
		this.name = 'ImportValidationError';
		this.status = status;
	}
}

function createEmptyImportData() {
	return Object.fromEntries(SUPPORTED_IMPORT_ENTITY_KEYS.map((key) => [key, []]));
}

function toTrimmedString(value) {
	const normalized = String(value ?? '').trim();
	return normalized || null;
}

function toOptionalNumber(value) {
	if (value === '' || value == null) return null;
	if (typeof value === 'string') {
		const cleaned = value.replace(/[$,%\s]/g, '').replace(/,/g, '');
		if (!cleaned) return null;
		const parsed = Number(cleaned);
		return Number.isFinite(parsed) ? parsed : null;
	}
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function toOptionalInt(value, fallback = null) {
	if (value === '' || value == null) return fallback;
	const parsed = Number(value);
	if (!Number.isInteger(parsed)) return fallback;
	return parsed;
}

function toOptionalDate(value) {
	if (!value) return null;
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseSourceType(value) {
	const normalized = String(value || 'hire_gnome_export').trim().toLowerCase();
	if (!SUPPORTED_SOURCE_TYPES.includes(normalized)) {
		throw new ImportValidationError(
			'Import source must be `hire_gnome_export`, `generic_csv`, `generic_csv_manual`, `generic_csv_zip`, `bullhorn_csv`, `bullhorn_csv_manual`, `bullhorn_csv_zip`, `zoho_recruit_csv`, `zoho_recruit_manual`, or `zoho_recruit_zip`.'
		);
	}
	if (
		(normalized === 'bullhorn_csv' || normalized === 'bullhorn_csv_manual' || normalized === 'bullhorn_csv_zip')
		&& !getBullhornOperationsEnabled()
	) {
		throw new ImportValidationError('Bullhorn operations are disabled.');
	}
	if (
		(normalized === 'zoho_recruit_csv' || normalized === 'zoho_recruit_manual' || normalized === 'zoho_recruit_zip')
		&& !getZohoRecruitOperationsEnabled()
	) {
		throw new ImportValidationError('Zoho Recruit operations are disabled.');
	}
	return normalized;
}

function parseGenericEntityProfile(value) {
	const normalized = String(value || '').trim();
	if (!normalized) {
		throw new ImportValidationError('Select a generic CSV profile before running import.');
	}
	if (!GENERIC_IMPORT_PROFILES.includes(normalized)) {
		throw new ImportValidationError('Unsupported generic CSV profile.');
	}
	return normalized;
}

function parseBullhornEntityProfile(value) {
	const normalized = String(value || '').trim();
	if (!normalized) {
		throw new ImportValidationError('Select a Bullhorn CSV profile before running import.');
	}
	if (!BULLHORN_IMPORT_PROFILES.includes(normalized)) {
		throw new ImportValidationError('Unsupported Bullhorn CSV profile.');
	}
	return normalized;
}

function parseZohoEntityProfile(value) {
	const normalized = String(value || '').trim();
	if (!normalized) {
		throw new ImportValidationError('Select a Zoho Recruit CSV profile before running import.');
	}
	if (!ZOHO_IMPORT_PROFILES.includes(normalized)) {
		throw new ImportValidationError('Unsupported Zoho Recruit CSV profile.');
	}
	return normalized;
}

function parseMode(value) {
	const normalized = String(value || 'preview').trim().toLowerCase();
	if (!['preview', 'apply'].includes(normalized)) {
		throw new ImportValidationError('Import mode must be `preview` or `apply`.');
	}
	return normalized;
}

function normalizeImportData(rawData) {
	const source = rawData?.data && typeof rawData.data === 'object' ? rawData.data : rawData;
	const normalized = createEmptyImportData();
	for (const key of SUPPORTED_IMPORT_ENTITY_KEYS) {
		const value = source?.[key];
		if (Array.isArray(value)) {
			normalized[key] = value;
		} else if (value && typeof value === 'object') {
			normalized[key] = [value];
		}
	}
	return normalized;
}

function assertAtLeastOneEntity(data) {
	const totalRows = SUPPORTED_IMPORT_ENTITY_KEYS.reduce((sum, key) => sum + data[key].length, 0);
	if (totalRows <= 0) {
		throw new ImportValidationError('Import file contains no supported entity records.');
	}
}

function normalizeLookupKey(value) {
	return String(value || '').trim().toLowerCase();
}

function normalizeZipCode(value) {
	const raw = toTrimmedString(value);
	if (!raw) return null;
	const digits = raw.replace(/\D/g, '');
	if (digits.length >= 5) {
		return digits.slice(0, 5);
	}
	return raw;
}

function normalizeImportedSkillName(value) {
	return String(value || '').trim();
}

function normalizeImportedSkillKey(value) {
	return normalizeImportedSkillName(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function uniqueImportedSkillNames(values) {
	const seen = new Set();
	const result = [];
	for (const rawValue of Array.isArray(values) ? values : []) {
		const value = normalizeImportedSkillName(rawValue);
		if (!value) continue;
		const key = normalizeImportedSkillKey(value);
		if (!key || seen.has(key)) continue;
		seen.add(key);
		result.push(value);
	}
	return result;
}

function splitImportedSkillNames(value) {
	if (Array.isArray(value)) {
		return uniqueImportedSkillNames(value);
	}
	return uniqueImportedSkillNames(String(value || '').split(/[,;\n|/]+/));
}

function headersContainAnyAlias(headers, aliases) {
	const headerKeys = new Set((Array.isArray(headers) ? headers : []).map((header) => header?.key).filter(Boolean));
	return (Array.isArray(aliases) ? aliases : []).some((alias) => headerKeys.has(normalizeHeaderKey(alias)));
}

async function resolveImportedSkillIds(tx, skillNames, skillCache) {
	const normalizedSkillNames = uniqueImportedSkillNames(skillNames);
	if (normalizedSkillNames.length <= 0) {
		return [];
	}

	const ids = [];
	for (const skillName of normalizedSkillNames) {
		const lookupKey = normalizeImportedSkillKey(skillName);
		if (!lookupKey) continue;

		let existingId = skillCache.skillIdByKey.get(lookupKey);
		if (!existingId) {
			const savedSkill = await tx.skill.upsert({
				where: { name: skillName },
				update: { isActive: true },
				create: {
					recordId: createRecordId('SKL'),
					name: skillName,
					isActive: true
				},
				select: { id: true, name: true }
			});
			existingId = savedSkill.id;
			skillCache.skillIdByKey.set(normalizeImportedSkillKey(savedSkill.name), savedSkill.id);
		}
		ids.push(existingId);
	}

	return [...new Set(ids)];
}

async function syncCandidateImportedSkills(tx, candidateId, skillIds) {
	await tx.candidateSkill.deleteMany({
		where: { candidateId }
	});
	if (!Array.isArray(skillIds) || skillIds.length <= 0) {
		return;
	}
	await tx.candidateSkill.createMany({
		data: skillIds.map((skillId) => ({
			candidateId,
			skillId
		})),
		skipDuplicates: true
	});
}

function normalizeCustomFieldValues(value) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const entries = Object.entries(value);
	if (entries.length <= 0) return null;
	return Object.fromEntries(entries);
}

function bullhornModuleKeyForEntity(entityKey) {
	const moduleMap = {
		clients: 'clients',
		contacts: 'contacts',
		candidates: 'candidates',
		jobOrders: 'jobOrders',
		submissions: 'submissions',
		interviews: 'interviews',
		placements: 'placements'
	};
	return moduleMap[entityKey] || '';
}

function stripBullhornCustomHeaderPrefix(value) {
	return String(value || '')
		.replace(/^custom\s*:\s*/i, '')
		.trim();
}

function parseBullhornCustomHeaderLabel(value) {
	const raw = stripBullhornCustomHeaderPrefix(value);
	const match = raw.match(/^(.*?)\s*\[([a-z0-9_]+)\]\s*$/i);
	if (match) {
		return {
			label: String(match[1] || '').trim() || raw,
			fieldKey: normalizeCustomFieldKey(match[2] || '')
		};
	}
	return {
		label: raw,
		fieldKey: ''
	};
}

function bullhornCustomFieldTypeFromValue(value) {
	const normalized = String(value || '').trim();
	if (!normalized) return 'text';
	if (['true', 'false', 'yes', 'no', '1', '0'].includes(normalized.toLowerCase())) return 'boolean';
	if (Number.isFinite(Number(normalized.replace(/[$,%\s]/g, '').replace(/,/g, '')))) return 'number';
	const parsedDate = new Date(normalized);
	if (!Number.isNaN(parsedDate.getTime())) return 'date';
	return normalized.length > 255 ? 'textarea' : 'text';
}

function bullhornImportedRecordId(prefix, sourceId, explicitRecordId = null) {
	const normalizedRecordId = toTrimmedString(explicitRecordId);
	if (normalizedRecordId) return normalizedRecordId;
	const normalizedSourceId = toOptionalInt(sourceId);
	if (Number.isInteger(normalizedSourceId) && normalizedSourceId > 0) {
		return `BH-${prefix}-${normalizedSourceId}`;
	}
	return null;
}

function buildBullhornCustomFieldDefinitionIndexes(rows) {
	const byModuleAndFieldKey = new Map();
	const byModuleAndLabel = new Map();
	for (const row of rows || []) {
		const moduleKey = normalizeCustomFieldModuleKey(row?.moduleKey);
		const fieldKey = normalizeCustomFieldKey(row?.fieldKey);
		const label = String(row?.label || '').trim();
		if (!moduleKey) continue;
		if (fieldKey) {
			byModuleAndFieldKey.set(`${moduleKey}|${fieldKey}`, row);
		}
		if (label) {
			byModuleAndLabel.set(`${moduleKey}|${normalizeLookupKey(label)}`, row);
		}
	}
	return { byModuleAndFieldKey, byModuleAndLabel };
}

function parseBullhornCustomFieldDefinitionRow(row) {
	const moduleKey = normalizeCustomFieldModuleKey(
		pickBullhornValue(row, ['module key', 'module', 'entity'])
	);
	const label = toTrimmedString(pickBullhornValue(row, ['label', 'field label']));
	const fieldKey = normalizeCustomFieldKey(
		pickBullhornValue(row, ['field key', 'key']) || label
	);
	if (!moduleKey || !label || !fieldKey) return null;
	const fieldType = normalizeCustomFieldType(
		pickBullhornValue(row, ['field type', 'type'])
	);
	return {
		moduleKey,
		fieldKey,
		label,
		fieldType,
		selectOptions: normalizeCustomFieldSelectOptions(
			pickBullhornValue(row, ['select options', 'options'])
		),
		helpText: toTrimmedString(
			pickBullhornValue(row, ['help text', 'description', 'bullhorn field name'])
		),
		isRequired: parseBooleanFlag(pickBullhornValue(row, ['is required', 'required']), false),
		isActive: parseBooleanFlag(pickBullhornValue(row, ['is active', 'active']), true),
		sortOrder: toOptionalInt(pickBullhornValue(row, ['sort order', 'order']), 0)
	};
}

function collectBullhornCustomFields({
	entityKey,
	row,
	headers,
	definitionIndexes
}) {
	const moduleKey = bullhornModuleKeyForEntity(entityKey);
	if (!moduleKey || !Array.isArray(headers) || headers.length <= 0) {
		return { customFields: null, inferredDefinitions: [] };
	}

	const values = {};
	const inferredDefinitions = [];
	for (const header of headers) {
		const headerKey = String(header?.key || '').trim();
		const headerLabel = String(header?.label || '').trim();
		if (!headerKey || !headerLabel || !headerKey.startsWith('custom')) continue;
		const rawValue = String(row?.[headerKey] || '').trim();
		if (!rawValue) continue;

		const parsed = parseBullhornCustomHeaderLabel(headerLabel);
		const explicitDefinition =
			(parsed.fieldKey && definitionIndexes.byModuleAndFieldKey.get(`${moduleKey}|${parsed.fieldKey}`)) ||
			definitionIndexes.byModuleAndLabel.get(`${moduleKey}|${normalizeLookupKey(parsed.label)}`) ||
			null;
		const fieldKey = explicitDefinition?.fieldKey || parsed.fieldKey || normalizeCustomFieldKey(parsed.label);
		if (!fieldKey) continue;

		values[fieldKey] = rawValue;

		if (!explicitDefinition) {
			inferredDefinitions.push({
				moduleKey,
				fieldKey,
				label: parsed.label || headerLabel,
				fieldType: bullhornCustomFieldTypeFromValue(rawValue),
				selectOptions: [],
				helpText: null,
				isRequired: false,
				isActive: true,
				sortOrder: 0
			});
		}
	}

	return {
		customFields: Object.keys(values).length > 0 ? values : null,
		inferredDefinitions
	};
}

function parseBooleanFlag(value, fallback = false) {
	if (typeof value === 'boolean') return value;
	const normalized = String(value || '').trim().toLowerCase();
	if (!normalized) return fallback;
	if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
	if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
	return fallback;
}

function parseDisplayName(value) {
	const fullName = toTrimmedString(value);
	if (!fullName) return { firstName: null, lastName: null };
	const parts = fullName.split(/\s+/).filter(Boolean);
	if (parts.length <= 1) {
		return { firstName: parts[0] || null, lastName: null };
	}
	return {
		firstName: parts[0] || null,
		lastName: parts.slice(1).join(' ') || null
	};
}

function contactNameKey(firstName, lastName) {
	return `${normalizeLookupKey(firstName)}|${normalizeLookupKey(lastName)}`;
}

function contactByClientNameKey(clientId, firstName, lastName) {
	if (!Number.isInteger(clientId)) return null;
	const nameKey = contactNameKey(firstName, lastName);
	if (nameKey === '|') return null;
	return `${clientId}|${nameKey}`;
}

function pickBullhornValue(row, aliases) {
	for (const alias of aliases) {
		const value = row[normalizeHeaderKey(alias)];
		if (value != null && String(value).trim() !== '') {
			return String(value).trim();
		}
	}
	return null;
}

function pickZohoValue(row, aliases) {
	return pickBullhornValue(row, aliases);
}

function inferCandidateAttachmentContentType(fileName) {
	const normalizedName = String(fileName || '').trim().toLowerCase();
	if (normalizedName.endsWith('.pdf')) return 'application/pdf';
	if (normalizedName.endsWith('.doc')) return 'application/msword';
	if (normalizedName.endsWith('.docx')) {
		return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
	}
	if (normalizedName.endsWith('.txt')) return 'text/plain';
	if (normalizedName.endsWith('.rtf')) return 'application/rtf';
	if (normalizedName.endsWith('.odt')) return 'application/vnd.oasis.opendocument.text';
	if (normalizedName.endsWith('.png')) return 'image/png';
	if (normalizedName.endsWith('.jpg') || normalizedName.endsWith('.jpeg')) return 'image/jpeg';
	return 'application/octet-stream';
}

function normalizeImportedCandidateAttachmentContentType(fileName, contentType) {
	const normalized = toTrimmedString(contentType).toLowerCase();
	if (!normalized || !normalized.includes('/')) {
		return inferCandidateAttachmentContentType(fileName);
	}
	return normalized;
}

function normalizeCandidateStatusValue(value) {
	const raw = String(value || '').trim();
	if (!raw) return 'new';
	const normalized = raw.toLowerCase().replace(/[\s-]+/g, '_');
	const aliases = {
		lead: 'new',
		active: 'in_review',
		screen: 'in_review',
		screening: 'in_review',
		review: 'in_review',
		inreview: 'in_review',
		shortlist: 'qualified',
		shortlisted: 'qualified',
		qualified: 'qualified',
		submission: 'submitted',
		submitted: 'submitted',
		interviewing: 'interview',
		interview: 'interview',
		offer: 'offered',
		offered: 'offered',
		placed: 'hired',
		hire: 'hired',
		hired: 'hired',
		reject: 'rejected',
		rejected: 'rejected',
		declined: 'rejected',
		inactive: 'rejected'
	};
	const mapped = aliases[normalized] || normalized;
	if (VALID_CANDIDATE_STATUSES.has(mapped)) {
		return mapped;
	}
	return 'new';
}

function normalizeClientStatusValue(value) {
	const raw = String(value || '').trim();
	if (!raw) return 'Prospect';
	const normalized = raw.toLowerCase();
	if (normalized.includes('verified')) return 'Active + Verified';
	if (normalized.includes('inactive') || normalized.includes('closed')) return 'Inactive';
	if (normalized.includes('active')) return 'Active';
	if (normalized.includes('prospect') || normalized.includes('lead')) return 'Prospect';
	return 'Prospect';
}

function normalizeEmploymentTypeValue(value) {
	const raw = String(value || '').trim();
	if (!raw) return null;
	const normalized = raw.toLowerCase();
	if (normalized.includes('perm') || normalized.includes('direct')) {
		return 'Permanent';
	}
	if (normalized.includes('1099')) {
		return 'Temporary - 1099';
	}
	if (normalized.includes('temp') || normalized.includes('contract') || normalized.includes('w2')) {
		return 'Temporary - W2';
	}
	return null;
}

function normalizeCurrencyCode(value) {
	const normalized = String(value || '').trim().toUpperCase();
	if (normalized === 'CAD') return 'CAD';
	return 'USD';
}

function mapBullhornClientRow(row, context = {}) {
	const name = pickBullhornValue(row, [
		'name',
		'client corporation',
		'client corporation name',
		'client name',
		'company',
		'company name',
		'corporation name'
	]);
	if (!name) return null;
	const { customFields } = collectBullhornCustomFields({
		entityKey: 'clients',
		row,
		headers: context.headers,
		definitionIndexes: context.definitionIndexes || buildBullhornCustomFieldDefinitionIndexes([])
	});
	return {
		id: toOptionalInt(
			pickBullhornValue(row, ['id', 'client corporation id', 'client id', 'company id', 'corporation id'])
		),
		name,
		industry: pickBullhornValue(row, ['industry', 'specialty']),
		status: normalizeClientStatusValue(pickBullhornValue(row, ['status', 'client status'])),
		phone: pickBullhornValue(row, ['phone', 'main phone', 'work phone']),
		address: pickBullhornValue(row, ['address', 'street', 'street address']),
		city: pickBullhornValue(row, ['city']),
		state: pickBullhornValue(row, ['state', 'state/province']),
		zipCode: normalizeZipCode(pickBullhornValue(row, ['zip', 'zip code', 'postal code'])),
		website: pickBullhornValue(row, ['website', 'url']),
		description: pickBullhornValue(row, ['description', 'notes']),
		customFields
	};
}

function mapBullhornContactRow(row, context = {}) {
	const parsedName = parseDisplayName(pickBullhornValue(row, ['name', 'full name', 'contact']));
	const firstName = pickBullhornValue(row, ['first name', 'firstname']) || parsedName.firstName;
	const lastName = pickBullhornValue(row, ['last name', 'lastname']) || parsedName.lastName;
	if (!firstName || !lastName) return null;
	const { customFields } = collectBullhornCustomFields({
		entityKey: 'contacts',
		row,
		headers: context.headers,
		definitionIndexes: context.definitionIndexes || buildBullhornCustomFieldDefinitionIndexes([])
	});
	const sourceValue = normalizeContactSourceValue(
		pickBullhornValue(row, ['source', 'source name', 'lead source'])
	);
	return {
		id: toOptionalInt(pickBullhornValue(row, ['id', 'contact id'])),
		firstName,
		lastName,
		email: pickBullhornValue(row, ['email', 'email address']),
		phone:
			pickBullhornValue(row, ['mobile', 'mobile phone']) ||
			pickBullhornValue(row, ['phone', 'work phone']),
		zipCode: normalizeZipCode(pickBullhornValue(row, ['zip', 'zip code', 'postal code'])),
		title: pickBullhornValue(row, ['title', 'job title']),
		department: pickBullhornValue(row, ['department']),
		linkedinUrl: pickBullhornValue(row, ['linkedin', 'linkedin url']),
		source: sourceValue || null,
		address: pickBullhornValue(row, ['address', 'street', 'street address']),
		clientId: toOptionalInt(
			pickBullhornValue(row, ['client corporation id', 'client id', 'company id', 'clientid'])
		),
		clientName: pickBullhornValue(row, ['client corporation', 'client name', 'company', 'company name']),
		customFields
	};
}

function mapBullhornCandidateRow(row, context = {}) {
	const parsedName = parseDisplayName(pickBullhornValue(row, ['name', 'full name', 'candidate']));
	const firstName = pickBullhornValue(row, ['first name', 'firstname']) || parsedName.firstName;
	const lastName = pickBullhornValue(row, ['last name', 'lastname']) || parsedName.lastName;
	const email = pickBullhornValue(row, ['email', 'email address']);
	if (!firstName || !lastName || !email) return null;
	const skillAliases = [
		'skills',
		'skill set',
		'primary skills',
		'secondary skills',
		'skill list',
		'skillNameList',
		'primarySkills',
		'secondarySkills',
		'skillList',
		...(Array.isArray(context.candidateSkillFieldNames) ? context.candidateSkillFieldNames : [])
	];
	const skillValue = pickBullhornValue(row, skillAliases);
	const { customFields } = collectBullhornCustomFields({
		entityKey: 'candidates',
		row,
		headers: context.headers,
		definitionIndexes: context.definitionIndexes || buildBullhornCustomFieldDefinitionIndexes([])
	});
	const sourceValue = normalizeCandidateSourceValue(
		pickBullhornValue(row, ['source', 'source name', 'lead source'])
	);
	return {
		id: toOptionalInt(pickBullhornValue(row, ['id', 'candidate id'])),
		firstName,
		lastName,
		email,
		phone: pickBullhornValue(row, ['phone', 'home phone', 'work phone']),
		mobile: pickBullhornValue(row, ['mobile', 'mobile phone']),
		status: normalizeCandidateStatusValue(
			pickBullhornValue(row, ['status', 'candidate status', 'pipeline status'])
		),
		source: sourceValue || null,
		currentJobTitle: pickBullhornValue(row, ['current job title', 'job title', 'title']),
		currentEmployer: pickBullhornValue(row, ['current employer', 'employer', 'company']),
		experienceYears: toOptionalNumber(pickBullhornValue(row, ['years experience', 'experience years'])),
		address: pickBullhornValue(row, ['address', 'street', 'street address']),
		city: pickBullhornValue(row, ['city']),
		state: pickBullhornValue(row, ['state', 'state/province']),
		zipCode: normalizeZipCode(pickBullhornValue(row, ['zip', 'zip code', 'postal code'])),
		website: pickBullhornValue(row, ['website', 'portfolio', 'url']),
		linkedinUrl: pickBullhornValue(row, ['linkedin', 'linkedin url']),
		skillSet: skillValue,
		parsedSkillNames: splitImportedSkillNames(skillValue),
		hasSkillData: headersContainAnyAlias(context.headers, skillAliases),
		summary: pickBullhornValue(row, ['summary', 'resume summary', 'resume text', 'notes']),
		customFields
	};
}

function mapBullhornJobOrderRow(row, context = {}) {
	const title = pickBullhornValue(row, ['title', 'job title', 'job']);
	if (!title) return null;
	const { customFields } = collectBullhornCustomFields({
		entityKey: 'jobOrders',
		row,
		headers: context.headers,
		definitionIndexes: context.definitionIndexes || buildBullhornCustomFieldDefinitionIndexes([])
	});
	return {
		id: toOptionalInt(pickBullhornValue(row, ['id', 'job order id', 'job id'])),
		title,
		description: pickBullhornValue(row, ['description', 'internal description', 'job description']),
		publicDescription: pickBullhornValue(row, ['public description', 'external description']),
		location: pickBullhornValue(row, ['location', 'address']),
		city: pickBullhornValue(row, ['city']),
		state: pickBullhornValue(row, ['state', 'state/province']),
		zipCode: normalizeZipCode(pickBullhornValue(row, ['zip', 'zip code', 'postal code'])),
		status: toJobOrderStatusValue(pickBullhornValue(row, ['status', 'job status'])),
		employmentType: normalizeEmploymentTypeValue(
			pickBullhornValue(row, ['employment type', 'type', 'job type'])
		),
		openings: toOptionalInt(pickBullhornValue(row, ['openings', 'number of openings', 'positions'])),
		currency: normalizeCurrencyCode(pickBullhornValue(row, ['currency'])),
		salaryMin: toOptionalNumber(
			pickBullhornValue(row, ['salary min', 'minimum salary', 'salary low', 'pay rate min'])
		),
		salaryMax: toOptionalNumber(
			pickBullhornValue(row, ['salary max', 'maximum salary', 'salary high', 'pay rate max'])
		),
		publishToCareerSite: parseBooleanFlag(
			pickBullhornValue(row, ['publish to career site', 'published', 'is published'])
		),
		clientId: toOptionalInt(
			pickBullhornValue(row, ['client corporation id', 'client id', 'company id', 'clientid'])
		),
		clientName: pickBullhornValue(row, ['client corporation', 'client name', 'company', 'company name']),
		contactId: toOptionalInt(pickBullhornValue(row, ['contact id', 'hiring manager id'])),
		contactEmail: pickBullhornValue(row, ['contact email', 'hiring manager email']),
		contactName: pickBullhornValue(row, ['contact name', 'hiring manager']),
		customFields
	};
}

function mapBullhornSubmissionRow(row, context = {}) {
	const candidateId = toOptionalInt(pickBullhornValue(row, ['candidate id']));
	const candidateEmail = pickBullhornValue(row, ['candidate email', 'email']);
	const jobOrderId = toOptionalInt(pickBullhornValue(row, ['job order id', 'job id']));
	const jobOrderTitle = pickBullhornValue(row, ['job order title', 'job title', 'title']);
	if ((!candidateId && !candidateEmail) || (!jobOrderId && !jobOrderTitle)) return null;
	const { customFields } = collectBullhornCustomFields({
		entityKey: 'submissions',
		row,
		headers: context.headers,
		definitionIndexes: context.definitionIndexes || buildBullhornCustomFieldDefinitionIndexes([])
	});
	return {
		id: toOptionalInt(pickBullhornValue(row, ['id', 'submission id', 'submittal id'])),
		candidateId,
		candidateEmail,
		jobOrderId,
		jobOrderTitle,
		status: toTrimmedString(pickBullhornValue(row, ['status', 'submission status', 'submittal status'])) || 'submitted',
		notes: pickBullhornValue(row, ['notes', 'comment', 'submission notes', 'submittal notes']),
		customFields
	};
}

function mapBullhornInterviewRow(row, context = {}) {
	const candidateId = toOptionalInt(pickBullhornValue(row, ['candidate id']));
	const candidateEmail = pickBullhornValue(row, ['candidate email', 'email']);
	const jobOrderId = toOptionalInt(pickBullhornValue(row, ['job order id', 'job id']));
	const jobOrderTitle = pickBullhornValue(row, ['job order title', 'job title', 'title']);
	if ((!candidateId && !candidateEmail) || (!jobOrderId && !jobOrderTitle)) return null;
	const { customFields } = collectBullhornCustomFields({
		entityKey: 'interviews',
		row,
		headers: context.headers,
		definitionIndexes: context.definitionIndexes || buildBullhornCustomFieldDefinitionIndexes([])
	});
	return {
		id: toOptionalInt(pickBullhornValue(row, ['id', 'interview id'])),
		candidateId,
		candidateEmail,
		jobOrderId,
		jobOrderTitle,
		subject: pickBullhornValue(row, ['subject', 'interview subject']),
		status: toTrimmedString(pickBullhornValue(row, ['status', 'interview status'])) || 'scheduled',
		interviewMode: toTrimmedString(pickBullhornValue(row, ['interview mode', 'type', 'interview type'])) || 'formal',
		interviewer: pickBullhornValue(row, ['interviewer', 'interviewer name']),
		interviewerEmail: pickBullhornValue(row, ['interviewer email']),
		startsAt: toOptionalDate(pickBullhornValue(row, ['starts at', 'start time', 'start date', 'scheduled start'])),
		endsAt: toOptionalDate(pickBullhornValue(row, ['ends at', 'end time', 'end date', 'scheduled end'])),
		location: pickBullhornValue(row, ['location']),
		videoLink: pickBullhornValue(row, ['video link', 'meeting link']),
		customFields
	};
}

function mapBullhornPlacementRow(row, context = {}) {
	const candidateId = toOptionalInt(pickBullhornValue(row, ['candidate id']));
	const candidateEmail = pickBullhornValue(row, ['candidate email', 'email']);
	const jobOrderId = toOptionalInt(pickBullhornValue(row, ['job order id', 'job id']));
	const jobOrderTitle = pickBullhornValue(row, ['job order title', 'job title', 'title']);
	if ((!candidateId && !candidateEmail) || (!jobOrderId && !jobOrderTitle)) return null;
	const { customFields } = collectBullhornCustomFields({
		entityKey: 'placements',
		row,
		headers: context.headers,
		definitionIndexes: context.definitionIndexes || buildBullhornCustomFieldDefinitionIndexes([])
	});
	return {
		id: toOptionalInt(pickBullhornValue(row, ['id', 'placement id', 'offer id'])),
		candidateId,
		candidateEmail,
		jobOrderId,
		jobOrderTitle,
		submissionId: toOptionalInt(pickBullhornValue(row, ['submission id', 'submittal id'])),
		status: toTrimmedString(pickBullhornValue(row, ['status', 'placement status', 'offer status'])) || 'accepted',
		placementType: toTrimmedString(pickBullhornValue(row, ['placement type', 'type'])) || 'temp',
		compensationType: toTrimmedString(pickBullhornValue(row, ['compensation type', 'rate type'])) || 'hourly',
		currency: normalizeCurrencyCode(pickBullhornValue(row, ['currency'])),
		offeredOn: toOptionalDate(pickBullhornValue(row, ['offered on', 'offer date'])),
		expectedJoinDate: toOptionalDate(pickBullhornValue(row, ['expected join date', 'start date'])),
		endDate: toOptionalDate(pickBullhornValue(row, ['end date'])),
		notes: pickBullhornValue(row, ['notes']),
		yearlyCompensation: toOptionalNumber(pickBullhornValue(row, ['yearly compensation', 'salary'])),
		hourlyRtBillRate: toOptionalNumber(pickBullhornValue(row, ['hourly rt bill rate', 'rt bill rate'])),
		hourlyRtPayRate: toOptionalNumber(pickBullhornValue(row, ['hourly rt pay rate', 'rt pay rate'])),
		hourlyOtBillRate: toOptionalNumber(pickBullhornValue(row, ['hourly ot bill rate', 'ot bill rate'])),
		hourlyOtPayRate: toOptionalNumber(pickBullhornValue(row, ['hourly ot pay rate', 'ot pay rate'])),
		dailyBillRate: toOptionalNumber(pickBullhornValue(row, ['daily bill rate'])),
		dailyPayRate: toOptionalNumber(pickBullhornValue(row, ['daily pay rate'])),
		customFields
	};
}

function mapBullhornCandidateNoteRow(row) {
	const id = toOptionalInt(pickBullhornValue(row, ['id', 'note id']));
	const candidateId = toOptionalInt(pickBullhornValue(row, ['candidate id']));
	const candidateEmail = toTrimmedString(pickBullhornValue(row, ['candidate email', 'email']));
	const content = toTrimmedString(pickBullhornValue(row, ['content', 'comments', 'note', 'body']));
	if ((!candidateId && !candidateEmail) || !content) return null;
	return {
		id,
		recordId: bullhornImportedRecordId('CandidateNote', id, pickBullhornValue(row, ['record id'])),
		candidateId,
		candidateEmail,
		content,
		noteType: toTrimmedString(pickBullhornValue(row, ['note type', 'action'])) || 'bullhorn',
		createdAt: toOptionalDate(pickBullhornValue(row, ['created at', 'date added', 'created'])),
		updatedAt: toOptionalDate(pickBullhornValue(row, ['updated at', 'date last modified', 'modified at']))
	};
}

function mapBullhornCandidateEducationRow(row) {
	const id = toOptionalInt(pickBullhornValue(row, ['id', 'education id']));
	const candidateId = toOptionalInt(pickBullhornValue(row, ['candidate id']));
	const candidateEmail = toTrimmedString(pickBullhornValue(row, ['candidate email', 'email']));
	const schoolName = toTrimmedString(pickBullhornValue(row, ['school name', 'school']));
	if ((!candidateId && !candidateEmail) || !schoolName) return null;
	return {
		id,
		recordId: bullhornImportedRecordId('CandidateEducation', id, pickBullhornValue(row, ['record id'])),
		candidateId,
		candidateEmail,
		schoolName,
		degree: toTrimmedString(pickBullhornValue(row, ['degree'])),
		fieldOfStudy: toTrimmedString(pickBullhornValue(row, ['field of study', 'major'])),
		startDate: toOptionalDate(pickBullhornValue(row, ['start date'])),
		endDate: toOptionalDate(pickBullhornValue(row, ['end date'])),
		isCurrent: parseBooleanFlag(pickBullhornValue(row, ['is current']), false),
		description: toTrimmedString(pickBullhornValue(row, ['description', 'comments']))
	};
}

function mapBullhornCandidateWorkExperienceRow(row) {
	const id = toOptionalInt(pickBullhornValue(row, ['id', 'work experience id', 'work history id']));
	const candidateId = toOptionalInt(pickBullhornValue(row, ['candidate id']));
	const candidateEmail = toTrimmedString(pickBullhornValue(row, ['candidate email', 'email']));
	const companyName = toTrimmedString(pickBullhornValue(row, ['company name', 'company']));
	if ((!candidateId && !candidateEmail) || !companyName) return null;
	return {
		id,
		recordId: bullhornImportedRecordId('CandidateWorkExperience', id, pickBullhornValue(row, ['record id'])),
		candidateId,
		candidateEmail,
		companyName,
		title: toTrimmedString(pickBullhornValue(row, ['title'])),
		location: toTrimmedString(pickBullhornValue(row, ['location'])),
		startDate: toOptionalDate(pickBullhornValue(row, ['start date'])),
		endDate: toOptionalDate(pickBullhornValue(row, ['end date'])),
		isCurrent: parseBooleanFlag(pickBullhornValue(row, ['is current']), false),
		description: toTrimmedString(pickBullhornValue(row, ['description', 'comments']))
	};
}

function mapBullhornContactNoteRow(row) {
	const id = toOptionalInt(pickBullhornValue(row, ['id', 'note id']));
	const contactId = toOptionalInt(pickBullhornValue(row, ['contact id']));
	const contactEmail = toTrimmedString(pickBullhornValue(row, ['contact email', 'email']));
	const content = toTrimmedString(pickBullhornValue(row, ['content', 'comments', 'note', 'body']));
	if ((!contactId && !contactEmail) || !content) return null;
	return {
		id,
		recordId: bullhornImportedRecordId('ContactNote', id, pickBullhornValue(row, ['record id'])),
		contactId,
		contactEmail,
		content,
		noteType: toTrimmedString(pickBullhornValue(row, ['note type', 'action'])) || 'bullhorn',
		createdAt: toOptionalDate(pickBullhornValue(row, ['created at', 'date added', 'created'])),
		updatedAt: toOptionalDate(pickBullhornValue(row, ['updated at', 'date last modified', 'modified at']))
	};
}

const BULLHORN_PROFILE_MAP = Object.freeze({
	customFieldDefinitions: {
		entityKey: 'customFieldDefinitions',
		mapRow: parseBullhornCustomFieldDefinitionRow
	},
	clients: {
		entityKey: 'clients',
		mapRow: mapBullhornClientRow
	},
	contacts: {
		entityKey: 'contacts',
		mapRow: mapBullhornContactRow
	},
	contactNotes: {
		entityKey: 'contactNotes',
		mapRow: mapBullhornContactNoteRow
	},
	candidates: {
		entityKey: 'candidates',
		mapRow: mapBullhornCandidateRow
	},
	candidateNotes: {
		entityKey: 'candidateNotes',
		mapRow: mapBullhornCandidateNoteRow
	},
	candidateEducations: {
		entityKey: 'candidateEducations',
		mapRow: mapBullhornCandidateEducationRow
	},
	candidateWorkExperiences: {
		entityKey: 'candidateWorkExperiences',
		mapRow: mapBullhornCandidateWorkExperienceRow
	},
	jobOrders: {
		entityKey: 'jobOrders',
		mapRow: mapBullhornJobOrderRow
	},
	submissions: {
		entityKey: 'submissions',
		mapRow: mapBullhornSubmissionRow
	},
	interviews: {
		entityKey: 'interviews',
		mapRow: mapBullhornInterviewRow
	},
	placements: {
		entityKey: 'placements',
		mapRow: mapBullhornPlacementRow
	}
});

function mapZohoClientRow(row) {
	const name = pickZohoValue(row, ['account name', 'client name', 'company', 'company name', 'name']);
	if (!name) return null;
	return {
		id: toOptionalInt(pickZohoValue(row, ['id', 'account id', 'client id'])),
		name,
		industry: pickZohoValue(row, ['industry']),
		status: normalizeClientStatusValue(pickZohoValue(row, ['status', 'account status', 'client status'])),
		phone: pickZohoValue(row, ['phone', 'main phone']),
		address: pickZohoValue(
			row,
			['billing street', 'street', 'address', 'mailing street', 'billing address']
		),
		city: pickZohoValue(row, ['billing city', 'city', 'mailing city']),
		state: pickZohoValue(row, ['billing state', 'state', 'mailing state', 'state/province']),
		zipCode: normalizeZipCode(
			pickZohoValue(row, ['billing code', 'billing zip', 'zip code', 'postal code', 'zip'])
		),
		website: pickZohoValue(row, ['website']),
		description: pickZohoValue(row, ['description', 'notes'])
	};
}

function mapZohoContactRow(row) {
	const parsedName = parseDisplayName(pickZohoValue(row, ['full name', 'name', 'contact name']));
	const firstName = pickZohoValue(row, ['first name', 'firstname']) || parsedName.firstName;
	const lastName = pickZohoValue(row, ['last name', 'lastname']) || parsedName.lastName;
	if (!firstName || !lastName) return null;
	const sourceValue = normalizeContactSourceValue(
		pickZohoValue(row, ['source', 'lead source', 'contact source'])
	);
	return {
		id: toOptionalInt(pickZohoValue(row, ['id', 'contact id'])),
		firstName,
		lastName,
		email: pickZohoValue(row, ['email']),
		phone:
			pickZohoValue(row, ['mobile', 'mobile phone']) ||
			pickZohoValue(row, ['phone', 'work phone']),
		zipCode: normalizeZipCode(
			pickZohoValue(row, ['mailing zip', 'mailing code', 'zip code', 'postal code', 'zip'])
		),
		title: pickZohoValue(row, ['title', 'job title', 'designation']),
		department: pickZohoValue(row, ['department']),
		linkedinUrl: pickZohoValue(row, ['linkedin', 'linkedin url']),
		source: sourceValue || null,
		address: pickZohoValue(row, ['mailing street', 'street', 'address']),
		clientId: toOptionalInt(pickZohoValue(row, ['account id', 'client id', 'company id'])),
		clientName: pickZohoValue(row, ['account name', 'client name', 'company', 'company name'])
	};
}

function mapZohoCandidateRow(row) {
	const parsedName = parseDisplayName(pickZohoValue(row, ['full name', 'name', 'candidate name']));
	const firstName = pickZohoValue(row, ['first name', 'firstname']) || parsedName.firstName;
	const lastName = pickZohoValue(row, ['last name', 'lastname']) || parsedName.lastName;
	const email = pickZohoValue(row, ['email']);
	if (!firstName || !lastName || !email) return null;
	const sourceValue = normalizeCandidateSourceValue(
		pickZohoValue(row, ['source', 'lead source', 'candidate source'])
	);
	return {
		id: toOptionalInt(pickZohoValue(row, ['id', 'candidate id'])),
		firstName,
		lastName,
		email,
		phone: pickZohoValue(row, ['phone', 'home phone', 'work phone']),
		mobile: pickZohoValue(row, ['mobile', 'mobile phone']),
		status: normalizeCandidateStatusValue(
			pickZohoValue(row, ['candidate status', 'status', 'pipeline stage'])
		),
		source: sourceValue || null,
		currentJobTitle: pickZohoValue(row, ['current job title', 'current title', 'job title']),
		currentEmployer: pickZohoValue(row, ['current employer', 'current company', 'employer']),
		experienceYears: toOptionalNumber(
			pickZohoValue(row, ['years of experience', 'experience in years', 'experience years'])
		),
		address: pickZohoValue(row, ['street', 'address', 'mailing street']),
		city: pickZohoValue(row, ['city', 'mailing city']),
		state: pickZohoValue(row, ['state', 'state/province', 'mailing state']),
		zipCode: normalizeZipCode(
			pickZohoValue(row, ['zip code', 'postal code', 'zip', 'mailing zip', 'mailing code'])
		),
		website: pickZohoValue(row, ['website']),
		linkedinUrl: pickZohoValue(row, ['linkedin', 'linkedin url']),
		skillSet: pickZohoValue(row, ['skill set', 'skills', 'key skills']),
		summary: pickZohoValue(row, ['resume', 'resume summary', 'summary', 'candidate profile'])
	};
}

function mapZohoJobOrderRow(row) {
	const title = pickZohoValue(row, ['posting title', 'job opening name', 'job title', 'title']);
	if (!title) return null;
	return {
		id: toOptionalInt(pickZohoValue(row, ['id', 'job opening id', 'job id'])),
		title,
		description: pickZohoValue(row, ['job description', 'description', 'internal description']),
		publicDescription: pickZohoValue(row, ['public description', 'career site description']),
		location: pickZohoValue(row, ['location', 'city']),
		city: pickZohoValue(row, ['city']),
		state: pickZohoValue(row, ['state', 'state/province']),
		zipCode: normalizeZipCode(pickZohoValue(row, ['zip', 'zip code', 'postal code'])),
		status: toJobOrderStatusValue(pickZohoValue(row, ['job opening status', 'status'])),
		employmentType: normalizeEmploymentTypeValue(
			pickZohoValue(row, ['job type', 'employment type', 'position type'])
		),
		openings: toOptionalInt(pickZohoValue(row, ['number of positions', 'positions', 'openings'])),
		currency: normalizeCurrencyCode(pickZohoValue(row, ['currency'])),
		salaryMin: toOptionalNumber(
			pickZohoValue(row, ['salary from', 'salary min', 'minimum salary', 'pay rate min'])
		),
		salaryMax: toOptionalNumber(
			pickZohoValue(row, ['salary to', 'salary max', 'maximum salary', 'pay rate max'])
		),
		publishToCareerSite: parseBooleanFlag(
			pickZohoValue(row, ['publish to career site', 'published', 'is published'])
		),
		clientId: toOptionalInt(pickZohoValue(row, ['account id', 'client id', 'company id'])),
		clientName: pickZohoValue(row, ['account name', 'client name', 'company', 'company name']),
		contactId: toOptionalInt(pickZohoValue(row, ['contact id', 'hiring manager id'])),
		contactEmail: pickZohoValue(row, ['contact email', 'hiring manager email']),
		contactName: pickZohoValue(row, ['contact name', 'hiring manager'])
	};
}

function mapZohoSubmissionRow(row) {
	const candidateId = toOptionalInt(pickZohoValue(row, ['candidate id']));
	const candidateEmail = pickZohoValue(row, ['candidate email', 'email']);
	const jobOrderId = toOptionalInt(pickZohoValue(row, ['job opening id', 'job order id', 'job id']));
	const jobOrderTitle = pickZohoValue(row, ['posting title', 'job opening name', 'job title', 'title']);
	if ((!candidateId && !candidateEmail) || (!jobOrderId && !jobOrderTitle)) return null;
	return {
		id: toOptionalInt(pickZohoValue(row, ['id', 'submission id'])),
		candidateId,
		candidateEmail,
		jobOrderId,
		jobOrderTitle,
		status: toTrimmedString(pickZohoValue(row, ['submission status', 'status'])) || 'submitted',
		notes: pickZohoValue(row, ['notes', 'submission notes', 'comments'])
	};
}

function mapZohoInterviewRow(row) {
	const candidateId = toOptionalInt(pickZohoValue(row, ['candidate id']));
	const candidateEmail = pickZohoValue(row, ['candidate email', 'email']);
	const jobOrderId = toOptionalInt(pickZohoValue(row, ['job opening id', 'job order id', 'job id']));
	const jobOrderTitle = pickZohoValue(row, ['posting title', 'job opening name', 'job title', 'title']);
	if ((!candidateId && !candidateEmail) || (!jobOrderId && !jobOrderTitle)) return null;
	return {
		id: toOptionalInt(pickZohoValue(row, ['id', 'interview id'])),
		candidateId,
		candidateEmail,
		jobOrderId,
		jobOrderTitle,
		subject: pickZohoValue(row, ['subject', 'interview subject']),
		status: toTrimmedString(pickZohoValue(row, ['interview status', 'status'])) || 'scheduled',
		interviewMode: toTrimmedString(pickZohoValue(row, ['interview type', 'type'])) || 'formal',
		interviewer: pickZohoValue(row, ['interviewer', 'interviewer name']),
		interviewerEmail: pickZohoValue(row, ['interviewer email']),
		startsAt: toOptionalDate(pickZohoValue(row, ['start time', 'start date', 'starts at'])),
		endsAt: toOptionalDate(pickZohoValue(row, ['end time', 'end date', 'ends at'])),
		location: pickZohoValue(row, ['location']),
		videoLink: pickZohoValue(row, ['meeting link', 'video link'])
	};
}

function mapZohoPlacementRow(row) {
	const candidateId = toOptionalInt(pickZohoValue(row, ['candidate id']));
	const candidateEmail = pickZohoValue(row, ['candidate email', 'email']);
	const jobOrderId = toOptionalInt(pickZohoValue(row, ['job opening id', 'job order id', 'job id']));
	const jobOrderTitle = pickZohoValue(row, ['posting title', 'job opening name', 'job title', 'title']);
	if ((!candidateId && !candidateEmail) || (!jobOrderId && !jobOrderTitle)) return null;
	return {
		id: toOptionalInt(pickZohoValue(row, ['id', 'placement id', 'offer id'])),
		candidateId,
		candidateEmail,
		jobOrderId,
		jobOrderTitle,
		submissionId: toOptionalInt(pickZohoValue(row, ['submission id'])),
		status: toTrimmedString(pickZohoValue(row, ['placement status', 'offer status', 'status'])) || 'accepted',
		placementType: toTrimmedString(pickZohoValue(row, ['placement type', 'type'])) || 'temp',
		compensationType: toTrimmedString(pickZohoValue(row, ['rate type', 'compensation type'])) || 'hourly',
		currency: normalizeCurrencyCode(pickZohoValue(row, ['currency'])),
		offeredOn: toOptionalDate(pickZohoValue(row, ['offer date', 'offered on'])),
		expectedJoinDate: toOptionalDate(pickZohoValue(row, ['start date', 'expected join date'])),
		endDate: toOptionalDate(pickZohoValue(row, ['end date'])),
		notes: pickZohoValue(row, ['notes']),
		yearlyCompensation: toOptionalNumber(pickZohoValue(row, ['salary', 'yearly compensation'])),
		hourlyRtBillRate: toOptionalNumber(pickZohoValue(row, ['rt bill rate', 'hourly rt bill rate'])),
		hourlyRtPayRate: toOptionalNumber(pickZohoValue(row, ['rt pay rate', 'hourly rt pay rate'])),
		hourlyOtBillRate: toOptionalNumber(pickZohoValue(row, ['ot bill rate', 'hourly ot bill rate'])),
		hourlyOtPayRate: toOptionalNumber(pickZohoValue(row, ['ot pay rate', 'hourly ot pay rate'])),
		dailyBillRate: toOptionalNumber(pickZohoValue(row, ['daily bill rate'])),
		dailyPayRate: toOptionalNumber(pickZohoValue(row, ['daily pay rate']))
	};
}

const ZOHO_PROFILE_MAP = Object.freeze({
	clients: {
		entityKey: 'clients',
		mapRow: mapZohoClientRow
	},
	contacts: {
		entityKey: 'contacts',
		mapRow: mapZohoContactRow
	},
	candidates: {
		entityKey: 'candidates',
		mapRow: mapZohoCandidateRow
	},
	jobOrders: {
		entityKey: 'jobOrders',
		mapRow: mapZohoJobOrderRow
	},
	submissions: {
		entityKey: 'submissions',
		mapRow: mapZohoSubmissionRow
	},
	interviews: {
		entityKey: 'interviews',
		mapRow: mapZohoInterviewRow
	},
	placements: {
		entityKey: 'placements',
		mapRow: mapZohoPlacementRow
	}
});

async function parseZipImport(buffer) {
	const zip = await JSZip.loadAsync(buffer);
	const normalized = createEmptyImportData();

	for (const [filePath, file] of Object.entries(zip.files)) {
		if (file.dir) continue;
		if (!filePath.startsWith('data/')) continue;
		if (!filePath.endsWith('.json')) continue;
		const entityKey = filePath.replace(/^data\//, '').replace(/\.json$/, '');
		if (!SUPPORTED_IMPORT_ENTITY_KEYS.includes(entityKey)) continue;
		const jsonText = await file.async('string');
		if (!jsonText.trim()) continue;
		const parsed = JSON.parse(jsonText);
		if (Array.isArray(parsed)) {
			normalized[entityKey] = parsed;
			continue;
		}
		if (parsed && typeof parsed === 'object') {
			normalized[entityKey] = [parsed];
		}
	}

	assertAtLeastOneEntity(normalized);
	return { format: 'zip', data: normalized };
}

function parseNdjsonImport(rawText) {
	const normalized = createEmptyImportData();
	const lines = String(rawText || '')
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean);

	for (const line of lines) {
		const parsed = JSON.parse(line);
		if (parsed?.type !== 'record') continue;
		const entity = toTrimmedString(parsed?.entity);
		if (!entity || !SUPPORTED_IMPORT_ENTITY_KEYS.includes(entity)) continue;
		if (!parsed.record || typeof parsed.record !== 'object') continue;
		normalized[entity].push(parsed.record);
	}

	assertAtLeastOneEntity(normalized);
	return { format: 'ndjson', data: normalized };
}

function parseJsonImport(rawText) {
	const parsed = JSON.parse(rawText);
	const normalized = normalizeImportData(parsed);
	assertAtLeastOneEntity(normalized);
	return { format: 'json', data: normalized };
}

async function parseUploadedHireGnomeImportFile(file) {
	if (!file || typeof file.arrayBuffer !== 'function') {
		throw new ImportValidationError('Upload a file to import.');
	}

	const buffer = Buffer.from(await file.arrayBuffer());
	if (!buffer || buffer.length <= 0) {
		throw new ImportValidationError('Import file is empty.');
	}

	const fileName = String(file.name || '').toLowerCase();
	const contentType = String(file.type || '').toLowerCase();
	if (fileName.endsWith('.zip') || contentType.includes('zip')) {
		return parseZipImport(buffer);
	}

	const rawText = buffer.toString('utf8');
	if (fileName.endsWith('.ndjson') || contentType.includes('x-ndjson')) {
		return parseNdjsonImport(rawText);
	}

	return parseJsonImport(rawText);
}

function parseGenericMapping(value) {
	if (!value) {
		throw new ImportValidationError('Map at least one CSV column before importing.');
	}
	let parsed;
	try {
		parsed = JSON.parse(String(value));
	} catch {
		throw new ImportValidationError('Generic CSV mapping payload is invalid.');
	}
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new ImportValidationError('Generic CSV mapping payload is invalid.');
	}
	const normalized = {};
	for (const [headerKey, fieldKey] of Object.entries(parsed)) {
		const normalizedHeader = normalizeHeaderKey(headerKey);
		const normalizedField = String(fieldKey || '').trim();
		if (!normalizedHeader || !normalizedField) continue;
		normalized[normalizedHeader] = normalizedField;
	}
	if (Object.keys(normalized).length <= 0) {
		throw new ImportValidationError('Map at least one CSV column before importing.');
	}
	return normalized;
}

function parseGenericBatchManifest(value) {
	if (!value) {
		throw new ImportValidationError('Add at least one generic CSV file before importing.');
	}
	let parsed;
	try {
		parsed = JSON.parse(String(value));
	} catch {
		throw new ImportValidationError('Generic CSV batch payload is invalid.');
	}
	if (!Array.isArray(parsed) || parsed.length <= 0) {
		throw new ImportValidationError('Add at least one generic CSV file before importing.');
	}
	return parsed.map((entry) => {
		const id = String(entry?.id || '').trim();
		const entity = parseGenericEntityProfile(entry?.entity);
		const mapping = parseGenericMapping(JSON.stringify(entry?.mapping || {}));
		const fileField = String(entry?.fileField || `genericFile:${id}`).trim();
		if (!id || !fileField) {
			throw new ImportValidationError('Generic CSV batch payload is invalid.');
		}
		return { id, entity, mapping, fileField };
	});
}

function parseBullhornBatchManifest(value) {
	if (!value) {
		throw new ImportValidationError('Add at least one Bullhorn CSV file before importing.');
	}
	let parsed;
	try {
		parsed = JSON.parse(String(value));
	} catch {
		throw new ImportValidationError('Bullhorn batch payload is invalid.');
	}
	if (!Array.isArray(parsed) || parsed.length <= 0) {
		throw new ImportValidationError('Add at least one Bullhorn CSV file before importing.');
	}
	return parsed.map((entry) => {
		const id = String(entry?.id || '').trim();
		const entity = parseBullhornEntityProfile(entry?.entity);
		const fileField = String(entry?.fileField || `bullhornFile:${id}`).trim();
		if (!id || !fileField) {
			throw new ImportValidationError('Bullhorn batch payload is invalid.');
		}
		return { id, entity, fileField };
	});
}

function parseZohoBatchManifest(value) {
	if (!value) {
		throw new ImportValidationError('Add at least one Zoho Recruit CSV file before importing.');
	}
	let parsed;
	try {
		parsed = JSON.parse(String(value));
	} catch {
		throw new ImportValidationError('Zoho Recruit batch payload is invalid.');
	}
	if (!Array.isArray(parsed) || parsed.length <= 0) {
		throw new ImportValidationError('Add at least one Zoho Recruit CSV file before importing.');
	}
	return parsed.map((entry) => {
		const id = String(entry?.id || '').trim();
		const entity = parseZohoEntityProfile(entry?.entity);
		const fileField = String(entry?.fileField || `zohoFile:${id}`).trim();
		if (!id || !fileField) {
			throw new ImportValidationError('Zoho Recruit batch payload is invalid.');
		}
		return { id, entity, fileField };
	});
}

async function parseUploadedGenericCsvEntries(entries, formData) {
	if (!Array.isArray(entries) || entries.length <= 0) {
		throw new ImportValidationError('Add at least one generic CSV file before importing.');
	}

	const normalized = createEmptyImportData();
	for (const entry of entries) {
		const file = formData.get(entry.fileField);
		if (!file || typeof file.arrayBuffer !== 'function') {
			throw new ImportValidationError(`Upload a CSV file for ${entry.entity}.`);
		}
		const profile = getGenericImportProfile(entry.entity);
		if (!profile) {
			throw new ImportValidationError('Unsupported generic CSV profile.');
		}
		const buffer = Buffer.from(await file.arrayBuffer());
		if (!buffer || buffer.length <= 0) {
			throw new ImportValidationError(`Import file for ${entry.entity} is empty.`);
		}
		const fileName = String(file.name || '').toLowerCase();
		const contentType = String(file.type || '').toLowerCase();
		if (!fileName.endsWith('.csv') && !contentType.includes('csv')) {
			throw new ImportValidationError(`Generic import for ${entry.entity} must use a CSV file.`);
		}

		let csvRows;
		try {
			({ rows: csvRows } = parseCsvText(buffer.toString('utf8')));
		} catch (error) {
			throw new ImportValidationError(error?.message || 'Failed to parse CSV file.');
		}
		for (const row of csvRows) {
			const mapped = mapGenericImportRow(entry.entity, row, entry.mapping);
			if (!mapped) continue;
			normalized[entry.entity].push(mapped);
		}
	}

	assertAtLeastOneEntity(normalized);
	return {
		format: 'csv',
		data: normalized
	};
}

async function parseUploadedBullhornCsvFile(file, bullhornProfile) {
	if (!file || typeof file.arrayBuffer !== 'function') {
		throw new ImportValidationError('Upload a CSV file to import.');
	}
	const profile = BULLHORN_PROFILE_MAP[bullhornProfile];
	if (!profile) {
		throw new ImportValidationError('Unsupported Bullhorn CSV profile.');
	}

	const buffer = Buffer.from(await file.arrayBuffer());
	if (!buffer || buffer.length <= 0) {
		throw new ImportValidationError('Import file is empty.');
	}

	const fileName = String(file.name || '').toLowerCase();
	const contentType = String(file.type || '').toLowerCase();
	if (!fileName.endsWith('.csv') && !contentType.includes('csv')) {
		throw new ImportValidationError('Bullhorn imports must use CSV files.');
	}

	const normalized = createEmptyImportData();
	let csvRows;
	let parsedHeaders;
	try {
		({ rows: csvRows, headers: parsedHeaders } = parseCsvText(buffer.toString('utf8')));
	} catch (error) {
		throw new ImportValidationError(error?.message || 'Failed to parse CSV file.');
	}
	if (bullhornProfile === 'customFieldDefinitions') {
		for (const row of csvRows) {
			const mapped = profile.mapRow(row);
			if (!mapped) continue;
			normalized.customFieldDefinitions.push(mapped);
		}
	} else {
		const explicitDefinitionIndexes = buildBullhornCustomFieldDefinitionIndexes([]);
		const inferredDefinitions = new Map();
		for (const row of csvRows) {
			const mapped = profile.mapRow(row, {
				headers: parsedHeaders,
				definitionIndexes: explicitDefinitionIndexes
			});
			if (!mapped) continue;
			normalized[profile.entityKey].push(mapped);
			const collected = collectBullhornCustomFields({
				entityKey: profile.entityKey,
				row,
				headers: parsedHeaders,
				definitionIndexes: explicitDefinitionIndexes
			});
			for (const definition of collected.inferredDefinitions) {
				const key = `${definition.moduleKey}|${definition.fieldKey}`;
				if (!inferredDefinitions.has(key)) inferredDefinitions.set(key, definition);
			}
		}
		normalized.customFieldDefinitions.push(...inferredDefinitions.values());
	}

	assertAtLeastOneEntity(normalized);
	return {
		format: 'csv',
		data: normalized
	};
}

async function parseUploadedBullhornCsvEntries(entries, formData) {
	if (!Array.isArray(entries) || entries.length <= 0) {
		throw new ImportValidationError('Add at least one Bullhorn CSV file before importing.');
	}

	const normalized = createEmptyImportData();
	const parsedEntries = [];
	for (const entry of entries) {
		const file = formData.get(entry.fileField);
		if (!file || typeof file.arrayBuffer !== 'function') {
			throw new ImportValidationError(`Upload a CSV file for ${entry.entity}.`);
		}
		const profile = BULLHORN_PROFILE_MAP[entry.entity];
		if (!profile) {
			throw new ImportValidationError('Unsupported Bullhorn CSV profile.');
		}

		const buffer = Buffer.from(await file.arrayBuffer());
		if (!buffer || buffer.length <= 0) {
			throw new ImportValidationError(`Import file for ${entry.entity} is empty.`);
		}

		const fileName = String(file.name || '').toLowerCase();
		const contentType = String(file.type || '').toLowerCase();
		if (!fileName.endsWith('.csv') && !contentType.includes('csv')) {
			throw new ImportValidationError(`Bullhorn import for ${entry.entity} must use a CSV file.`);
		}

		let csvRows;
		let headers;
		try {
			({ rows: csvRows, headers } = parseCsvText(buffer.toString('utf8')));
		} catch (error) {
			throw new ImportValidationError(error?.message || 'Failed to parse CSV file.');
		}
		parsedEntries.push({
			entry,
			profile,
			headers,
			rows: csvRows
		});
	}

	for (const parsedEntry of parsedEntries.filter((item) => item.profile.entityKey === 'customFieldDefinitions')) {
		for (const row of parsedEntry.rows) {
			const mapped = parsedEntry.profile.mapRow(row);
			if (!mapped) continue;
			normalized.customFieldDefinitions.push(mapped);
		}
	}

	const definitionIndexes = buildBullhornCustomFieldDefinitionIndexes(normalized.customFieldDefinitions);
	const inferredDefinitions = new Map();
	for (const parsedEntry of parsedEntries.filter((item) => item.profile.entityKey !== 'customFieldDefinitions')) {
		for (const row of parsedEntry.rows) {
			const mapped = parsedEntry.profile.mapRow(row, {
				headers: parsedEntry.headers,
				definitionIndexes
			});
			if (!mapped) continue;
			normalized[parsedEntry.profile.entityKey].push(mapped);
			const collected = collectBullhornCustomFields({
				entityKey: parsedEntry.profile.entityKey,
				row,
				headers: parsedEntry.headers,
				definitionIndexes
			});
			for (const definition of collected.inferredDefinitions) {
				const key = `${definition.moduleKey}|${definition.fieldKey}`;
				if (!definitionIndexes.byModuleAndFieldKey.has(key) && !inferredDefinitions.has(key)) {
					inferredDefinitions.set(key, definition);
				}
			}
		}
	}

	normalized.customFieldDefinitions.push(...inferredDefinitions.values());

	assertAtLeastOneEntity(normalized);
	return {
		format: 'csv',
		data: normalized
	};
}

async function parseBullhornCandidateFilesFromZip(zipFile) {
	if (!zipFile || typeof zipFile.arrayBuffer !== 'function') return [];
	const buffer = Buffer.from(await zipFile.arrayBuffer());
	if (!buffer || buffer.length <= 0) return [];

	const zip = await JSZip.loadAsync(buffer);
	const manifestEntry =
		zip.file(BULLHORN_CANDIDATE_FILES_MANIFEST_NAME) ||
		BULLHORN_CANDIDATE_FILES_MANIFEST_LEGACY_NAMES
			.map((fileName) => zip.file(fileName))
			.find(Boolean);
	if (!manifestEntry) return [];

	let manifestRows;
	try {
		({ rows: manifestRows } = parseCsvText(await manifestEntry.async('string')));
	} catch (error) {
		throw new ImportValidationError(error?.message || 'Failed to parse Bullhorn candidate files manifest.');
	}

	const attachments = [];
	for (const row of manifestRows) {
		const zipPath = toTrimmedString(row?.[normalizeHeaderKey('ZIP Path')]);
		const fileName = toTrimmedString(row?.[normalizeHeaderKey('File Name')]);
		if (!zipPath || !fileName) continue;
		if (!isAllowedCandidateAttachmentFileName(fileName)) continue;
		const zipFileEntry = zip.file(zipPath);
		if (!zipFileEntry) continue;
		const contentType = normalizeImportedCandidateAttachmentContentType(
			fileName,
			row?.[normalizeHeaderKey('Content Type')]
		);
		if (!isAllowedCandidateAttachmentContentType(fileName, contentType)) continue;

		const fileBuffer = await zipFileEntry.async('nodebuffer');
		if (!fileBuffer || fileBuffer.length <= 0) continue;

		attachments.push({
			candidateId: toOptionalInt(row?.[normalizeHeaderKey('Candidate ID')]),
			candidateEmail: toTrimmedString(row?.[normalizeHeaderKey('Candidate Email')]),
			fileName,
			contentType,
			description: toTrimmedString(row?.[normalizeHeaderKey('Description')]),
			isResume: parseBooleanFlag(row?.[normalizeHeaderKey('Is Resume')], false),
			buffer: fileBuffer
		});
	}

	return attachments;
}

async function parseBullhornCandidateAttachmentsFromFormData(manifestValue, formData) {
	if (!manifestValue) return [];
	let manifest;
	try {
		manifest = JSON.parse(String(manifestValue || '[]'));
	} catch {
		throw new ImportValidationError('Bullhorn candidate attachment manifest is invalid.');
	}
	if (!Array.isArray(manifest) || manifest.length <= 0) return [];

	const attachments = [];
	for (const item of manifest) {
		const fileField = toTrimmedString(item?.fileField);
		const uploadedFile = fileField ? formData.get(fileField) : null;
		if (!uploadedFile || typeof uploadedFile.arrayBuffer !== 'function') continue;
		const fileName = toTrimmedString(item?.fileName) || toTrimmedString(uploadedFile?.name);
		if (!fileName) continue;
		const contentType = normalizeImportedCandidateAttachmentContentType(
			fileName,
			item?.contentType || uploadedFile?.type
		);
		if (!isAllowedCandidateAttachmentFileName(fileName)) continue;
		if (!isAllowedCandidateAttachmentContentType(fileName, contentType)) continue;
		const buffer = Buffer.from(await uploadedFile.arrayBuffer());
		if (!buffer || buffer.length <= 0) continue;

		attachments.push({
			candidateId: toOptionalInt(item?.candidateId),
			candidateEmail: toTrimmedString(item?.candidateEmail),
			fileName,
			contentType,
			description: toTrimmedString(item?.description),
			isResume: parseBooleanFlag(item?.isResume, false),
			buffer
		});
	}

	return attachments;
}

async function parseUploadedZohoCsvFile(file, zohoProfile) {
	if (!file || typeof file.arrayBuffer !== 'function') {
		throw new ImportValidationError('Upload a CSV file to import.');
	}
	const profile = ZOHO_PROFILE_MAP[zohoProfile];
	if (!profile) {
		throw new ImportValidationError('Unsupported Zoho Recruit CSV profile.');
	}

	const buffer = Buffer.from(await file.arrayBuffer());
	if (!buffer || buffer.length <= 0) {
		throw new ImportValidationError('Import file is empty.');
	}

	const fileName = String(file.name || '').toLowerCase();
	const contentType = String(file.type || '').toLowerCase();
	if (!fileName.endsWith('.csv') && !contentType.includes('csv')) {
		throw new ImportValidationError('Zoho Recruit imports must use CSV files.');
	}

	const normalized = createEmptyImportData();
	let csvRows;
	try {
		({ rows: csvRows } = parseCsvText(buffer.toString('utf8')));
	} catch (error) {
		throw new ImportValidationError(error?.message || 'Failed to parse CSV file.');
	}
	for (const row of csvRows) {
		const mapped = profile.mapRow(row);
		if (!mapped) continue;
		normalized[profile.entityKey].push(mapped);
	}

	assertAtLeastOneEntity(normalized);
	return {
		format: 'csv',
		data: normalized
	};
}

async function parseUploadedZohoCsvEntries(entries, formData) {
	if (!Array.isArray(entries) || entries.length <= 0) {
		throw new ImportValidationError('Add at least one Zoho Recruit CSV file before importing.');
	}

	const normalized = createEmptyImportData();
	for (const entry of entries) {
		const file = formData.get(entry.fileField);
		if (!file || typeof file.arrayBuffer !== 'function') {
			throw new ImportValidationError(`Upload a CSV file for ${entry.entity}.`);
		}
		const profile = ZOHO_PROFILE_MAP[entry.entity];
		if (!profile) {
			throw new ImportValidationError('Unsupported Zoho Recruit CSV profile.');
		}

		const buffer = Buffer.from(await file.arrayBuffer());
		if (!buffer || buffer.length <= 0) {
			throw new ImportValidationError(`Import file for ${entry.entity} is empty.`);
		}

		const fileName = String(file.name || '').toLowerCase();
		const contentType = String(file.type || '').toLowerCase();
		if (!fileName.endsWith('.csv') && !contentType.includes('csv')) {
			throw new ImportValidationError(`Zoho Recruit import for ${entry.entity} must use a CSV file.`);
		}

		let csvRows;
		try {
			({ rows: csvRows } = parseCsvText(buffer.toString('utf8')));
		} catch (error) {
			throw new ImportValidationError(error?.message || 'Failed to parse CSV file.');
		}
		for (const row of csvRows) {
			const mapped = profile.mapRow(row);
			if (!mapped) continue;
			normalized[profile.entityKey].push(mapped);
		}
	}

	assertAtLeastOneEntity(normalized);
	return {
		format: 'csv',
		data: normalized
	};
}

function buildPreviewSummary(data) {
	return {
		customFieldDefinitions: data.customFieldDefinitions.length,
		clients: data.clients.length,
		contacts: data.contacts.length,
		contactNotes: data.contactNotes.length,
		candidates: data.candidates.length,
		candidateNotes: data.candidateNotes.length,
		candidateEducations: data.candidateEducations.length,
		candidateWorkExperiences: data.candidateWorkExperiences.length,
		jobOrders: data.jobOrders.length,
		submissions: data.submissions.length,
		interviews: data.interviews.length,
		placements: data.placements.length
	};
}

function createEmptyPreviewEntity() {
	return {
		incoming: 0,
		create: 0,
		update: 0,
		skip: 0,
		warnings: [],
		rows: []
	};
}

function createEmptyPreviewDetails() {
	return {
		customFieldDefinitions: createEmptyPreviewEntity(),
		clients: createEmptyPreviewEntity(),
		contacts: createEmptyPreviewEntity(),
		contactNotes: createEmptyPreviewEntity(),
		candidates: createEmptyPreviewEntity(),
		candidateNotes: createEmptyPreviewEntity(),
		candidateEducations: createEmptyPreviewEntity(),
		candidateWorkExperiences: createEmptyPreviewEntity(),
		jobOrders: createEmptyPreviewEntity(),
		submissions: createEmptyPreviewEntity(),
		interviews: createEmptyPreviewEntity(),
		placements: createEmptyPreviewEntity()
	};
}

function previewRowLabel(entityKey, row) {
	switch (entityKey) {
		case 'customFieldDefinitions':
			return toTrimmedString(row?.label) || 'Unnamed custom field';
		case 'clients':
			return toTrimmedString(row?.name) || 'Unnamed client';
		case 'contacts':
			return [toTrimmedString(row?.firstName), toTrimmedString(row?.lastName)].filter(Boolean).join(' ') || 'Unnamed contact';
		case 'contactNotes':
			return [toTrimmedString(row?.contactFirstName), toTrimmedString(row?.contactLastName)].filter(Boolean).join(' ') || toTrimmedString(row?.contactEmail) || 'Contact note';
		case 'candidates':
			return [toTrimmedString(row?.firstName), toTrimmedString(row?.lastName)].filter(Boolean).join(' ') || toTrimmedString(row?.email) || 'Unnamed candidate';
		case 'candidateNotes':
			return toTrimmedString(row?.candidateEmail) || 'Candidate note';
		case 'candidateEducations':
			return toTrimmedString(row?.schoolName) || 'Candidate education';
		case 'candidateWorkExperiences':
			return toTrimmedString(row?.companyName) || 'Candidate work experience';
		case 'jobOrders':
			return toTrimmedString(row?.title) || 'Untitled job order';
		case 'submissions':
			return toTrimmedString(row?.jobOrderTitle) || toTrimmedString(row?.jobOrderExternalId) || 'Submission';
		case 'interviews':
			return toTrimmedString(row?.subject) || toTrimmedString(row?.jobOrderTitle) || 'Interview';
		case 'placements':
			return toTrimmedString(row?.jobOrderTitle) || toTrimmedString(row?.submissionExternalId) || 'Placement';
		default:
			return 'Record';
	}
}

function pushPreviewWarning(details, entityKey, message) {
	const bucket = details[entityKey];
	if (!bucket) return;
	if (bucket.warnings.length < 20) {
		bucket.warnings.push(message);
	}
}

function pushPreviewRow(details, entityKey, row) {
	const bucket = details[entityKey];
	if (!bucket) return;
	if (bucket.rows.length < 20) {
		bucket.rows.push(row);
	}
}

function describeImportMatchReason(reason) {
	switch (String(reason || '').trim()) {
		case 'record_id':
			return 'record ID';
		case 'module_field_key':
			return 'module + field key';
		case 'name':
			return 'name';
		case 'email':
			return 'email';
		case 'client_name':
			return 'client + name';
		case 'client_title':
			return 'client + title';
		case 'candidate_job':
			return 'candidate + job order';
		default:
			return '';
	}
}

function buildImportRow(action, label, note, matchReason = '') {
	return {
		label,
		action,
		note,
		matchReason: describeImportMatchReason(matchReason)
	};
}

async function buildImportPreview(db, data, actingUser) {
	const summary = buildPreviewSummary(data);
	const details = createEmptyPreviewDetails();
	const sourceClientIdToRecordId = sourceIdRecordIdMap(data.clients);
	const sourceContactIdToRecordId = sourceIdRecordIdMap(data.contacts);
	const sourceCandidateIdToRecordId = sourceIdRecordIdMap(data.candidates);
	const sourceJobOrderIdToRecordId = sourceIdRecordIdMap(data.jobOrders);
	const sourceSubmissionIdToRecordId = sourceIdRecordIdMap(data.submissions);
	const sourceClientExternalIdToRecordId = sourceExternalIdRecordIdMap(data.clients);
	const sourceContactExternalIdToRecordId = sourceExternalIdRecordIdMap(data.contacts);
	const sourceCandidateExternalIdToRecordId = sourceExternalIdRecordIdMap(data.candidates);
	const sourceJobOrderExternalIdToRecordId = sourceExternalIdRecordIdMap(data.jobOrders);
	const sourceSubmissionExternalIdToRecordId = sourceExternalIdRecordIdMap(data.submissions);
	for (const [entityKey, count] of Object.entries(summary)) {
		if (details[entityKey]) {
			details[entityKey].incoming = Number(count || 0);
		}
	}

	const clientIdBySourceId = new Map();
	const clientIdByRecordId = new Map();
	const clientIdByExternalId = new Map();
	const clientIdByName = new Map();
	const contactIdBySourceId = new Map();
	const contactIdByRecordId = new Map();
	const contactIdByExternalId = new Map();
	const contactIdByEmail = new Map();
	const contactIdByClientName = new Map();
	const candidateIdBySourceId = new Map();
	const candidateIdByRecordId = new Map();
	const candidateIdByExternalId = new Map();
	const candidateIdByEmail = new Map();
	const jobOrderIdBySourceId = new Map();
	const jobOrderIdByRecordId = new Map();
	const jobOrderIdByExternalId = new Map();
	const jobOrderIdByTitle = new Map();
	const submissionIdBySourceId = new Map();
	const submissionIdByRecordId = new Map();
	const submissionIdByExternalId = new Map();
	let syntheticId = -1;
	const nextSyntheticId = () => syntheticId--;

	function cacheClient({ id, recordId, externalId, name }) {
		if (!Number.isInteger(id)) return;
		if (recordId) clientIdByRecordId.set(recordId, id);
		if (externalId) clientIdByExternalId.set(externalId, id);
		const nameKey = normalizeLookupKey(name);
		if (nameKey && !clientIdByName.has(nameKey)) clientIdByName.set(nameKey, id);
	}

	function cacheContact({ id, recordId, externalId, email, firstName, lastName, clientId }) {
		if (!Number.isInteger(id)) return;
		if (recordId) contactIdByRecordId.set(recordId, id);
		if (externalId) contactIdByExternalId.set(externalId, id);
		const emailKey = normalizeLookupKey(email);
		if (emailKey && !contactIdByEmail.has(emailKey)) contactIdByEmail.set(emailKey, id);
		const byClientKey = contactByClientNameKey(clientId, firstName, lastName);
		if (byClientKey && !contactIdByClientName.has(byClientKey)) contactIdByClientName.set(byClientKey, id);
	}

	function cacheCandidate({ id, recordId, externalId, email }) {
		if (!Number.isInteger(id)) return;
		if (recordId) candidateIdByRecordId.set(recordId, id);
		if (externalId) candidateIdByExternalId.set(externalId, id);
		const emailKey = normalizeLookupKey(email);
		if (emailKey && !candidateIdByEmail.has(emailKey)) candidateIdByEmail.set(emailKey, id);
	}

	function cacheJobOrder({ id, recordId, externalId, title }) {
		if (!Number.isInteger(id)) return;
		if (recordId) jobOrderIdByRecordId.set(recordId, id);
		if (externalId) jobOrderIdByExternalId.set(externalId, id);
		const titleKey = normalizeLookupKey(title);
		if (titleKey && !jobOrderIdByTitle.has(titleKey)) jobOrderIdByTitle.set(titleKey, id);
	}

	function cacheSubmission({ id, recordId, externalId }) {
		if (!Number.isInteger(id)) return;
		if (recordId) submissionIdByRecordId.set(recordId, id);
		if (externalId) submissionIdByExternalId.set(externalId, id);
	}

	function resolveClientIdFromRow(row) {
		const bySource = resolveTargetIdFromSource({
			sourceId: row?.clientId,
			externalId: row?.clientExternalId,
			sourceIdToRecordId: sourceClientIdToRecordId,
			externalIdToRecordId: sourceClientExternalIdToRecordId,
			targetIdBySourceId: clientIdBySourceId,
			targetIdByExternalId: clientIdByExternalId,
			targetIdByRecordId: clientIdByRecordId
		});
		if (bySource) return bySource;
		const clientRecordId = toTrimmedString(row?.clientRecordId);
		if (clientRecordId && clientIdByRecordId.has(clientRecordId)) return clientIdByRecordId.get(clientRecordId);
		const clientName = toTrimmedString(row?.clientName) || toTrimmedString(row?.client);
		if (clientName) {
			const key = normalizeLookupKey(clientName);
			if (key && clientIdByName.has(key)) return clientIdByName.get(key);
		}
		return null;
	}

	function resolveContactIdFromRow(row, clientId) {
		const bySource = resolveTargetIdFromSource({
			sourceId: row?.contactId,
			externalId: row?.contactExternalId,
			sourceIdToRecordId: sourceContactIdToRecordId,
			externalIdToRecordId: sourceContactExternalIdToRecordId,
			targetIdBySourceId: contactIdBySourceId,
			targetIdByExternalId: contactIdByExternalId,
			targetIdByRecordId: contactIdByRecordId
		});
		if (bySource) return bySource;
		const contactRecordId = toTrimmedString(row?.contactRecordId);
		if (contactRecordId && contactIdByRecordId.has(contactRecordId)) return contactIdByRecordId.get(contactRecordId);
		const contactEmail = toTrimmedString(row?.contactEmail);
		if (contactEmail) {
			const key = normalizeLookupKey(contactEmail);
			if (key && contactIdByEmail.has(key)) return contactIdByEmail.get(key);
		}
		const parsed = parseDisplayName(row?.contactName);
		const firstName = toTrimmedString(row?.contactFirstName) || parsed.firstName;
		const lastName = toTrimmedString(row?.contactLastName) || parsed.lastName;
		const byClientKey = contactByClientNameKey(clientId, firstName, lastName);
		if (byClientKey && contactIdByClientName.has(byClientKey)) return contactIdByClientName.get(byClientKey);
		return null;
	}

	const existingClients = await db.client.findMany({ select: { id: true, recordId: true, name: true } });
	for (const existingClient of existingClients) cacheClient(existingClient);

	const existingContacts = await db.contact.findMany({
		select: { id: true, recordId: true, email: true, firstName: true, lastName: true, clientId: true }
	});
	for (const existingContact of existingContacts) cacheContact(existingContact);

	const existingCandidates = await db.candidate.findMany({ select: { id: true, recordId: true, email: true } });
	for (const existingCandidate of existingCandidates) cacheCandidate(existingCandidate);

	const existingJobOrders = await db.jobOrder.findMany({ select: { id: true, recordId: true, title: true } });
	for (const existingJobOrder of existingJobOrders) cacheJobOrder(existingJobOrder);

	const existingSubmissions = await db.submission.findMany({ select: { id: true, recordId: true } });
	for (const existingSubmission of existingSubmissions) cacheSubmission(existingSubmission);

	for (const row of data.customFieldDefinitions) {
		details.customFieldDefinitions.incoming += 1;
		const moduleKey = normalizeCustomFieldModuleKey(row?.moduleKey);
		const label = toTrimmedString(row?.label);
		const fieldKey = normalizeCustomFieldKey(row?.fieldKey || label);
		if (!moduleKey || !label || !fieldKey) {
			details.customFieldDefinitions.skip += 1;
			pushPreviewWarning(details, 'customFieldDefinitions', `Skip "${label || 'Unnamed field'}": missing module, label, or field key.`);
			pushPreviewRow(details, 'customFieldDefinitions', { label: label || 'Unnamed field', action: 'skip', note: 'Missing module, label, or field key.' });
			continue;
		}
		const fieldType = normalizeCustomFieldType(row?.fieldType);
		const selectOptions = normalizeCustomFieldSelectOptions(row?.selectOptions);
		if (fieldType === 'select' && selectOptions.length <= 0) {
			details.customFieldDefinitions.skip += 1;
			pushPreviewWarning(details, 'customFieldDefinitions', `Skip "${label}": select fields require options.`);
			pushPreviewRow(details, 'customFieldDefinitions', { label, action: 'skip', note: 'Select field requires options.' });
			continue;
		}
		const recordId = toTrimmedString(row?.recordId);
		let existing = null;
		let matchReason = '';
		if (recordId) {
			existing = await db.customFieldDefinition.findUnique({ where: { recordId }, select: { id: true } });
			if (existing) matchReason = 'record_id';
		}
		if (!existing) {
			existing = await db.customFieldDefinition.findUnique({
				where: { moduleKey_fieldKey: { moduleKey, fieldKey } },
				select: { id: true }
			});
			if (existing) matchReason = 'module_field_key';
		}
		if (existing) details.customFieldDefinitions.update += 1;
		else details.customFieldDefinitions.create += 1;
		pushPreviewRow(
			details,
			'customFieldDefinitions',
			buildImportRow(
				existing ? 'update' : 'create',
				label,
				existing ? `Will update existing field definition matched by ${describeImportMatchReason(matchReason)}.` : 'Will create new field definition.',
				matchReason
			)
		);
	}

	for (const row of data.clients) {
		details.clients.incoming += 1;
		const name = toTrimmedString(row?.name);
		const label = previewRowLabel('clients', row);
		if (!name) {
			details.clients.skip += 1;
			pushPreviewWarning(details, 'clients', 'Skip client row: missing name.');
			pushPreviewRow(details, 'clients', { label, action: 'skip', note: 'Missing client name.' });
			continue;
		}
		const recordId = toTrimmedString(row?.recordId);
		let existing = null;
		let matchReason = '';
		if (recordId) {
			existing = await db.client.findUnique({ where: { recordId }, select: { id: true, recordId: true } });
			if (existing) matchReason = 'record_id';
		}
		if (!existing) {
			existing = await db.client.findFirst({ where: { name }, select: { id: true, recordId: true } });
			if (existing) matchReason = 'name';
		}
		const id = existing?.id || nextSyntheticId();
		const externalId = toTrimmedString(row?.externalId);
		if (existing) details.clients.update += 1;
		else details.clients.create += 1;
		cacheClient({ id, recordId: existing?.recordId || recordId || `preview-client-${Math.abs(id)}`, externalId, name });
		if (Number.isInteger(toOptionalInt(row?.id))) clientIdBySourceId.set(toOptionalInt(row?.id), id);
		pushPreviewRow(
			details,
			'clients',
			buildImportRow(
				existing ? 'update' : 'create',
				label,
				existing ? `Will update existing client matched by ${describeImportMatchReason(matchReason)}.` : 'Will create new client.',
				matchReason
			)
		);
	}

	for (const row of data.contacts) {
		details.contacts.incoming += 1;
		const firstName = toTrimmedString(row?.firstName);
		const lastName = toTrimmedString(row?.lastName);
		const label = previewRowLabel('contacts', row);
		if (!firstName || !lastName) {
			details.contacts.skip += 1;
			pushPreviewWarning(details, 'contacts', `Skip ${label}: missing first or last name.`);
			pushPreviewRow(details, 'contacts', { label, action: 'skip', note: 'Missing first or last name.' });
			continue;
		}
		const clientId = resolveClientIdFromRow(row);
		if (!clientId) {
			details.contacts.skip += 1;
			pushPreviewWarning(details, 'contacts', `Skip ${label}: related client could not be resolved.`);
			pushPreviewRow(details, 'contacts', { label, action: 'skip', note: 'Related client could not be resolved.' });
			continue;
		}
		const recordId = toTrimmedString(row?.recordId);
		const email = toTrimmedString(row?.email);
		const contactMatchClauses = [{ firstName, lastName }];
		if (email) contactMatchClauses.unshift({ email });
		let existing = null;
		let matchReason = '';
		if (recordId) {
			existing = await db.contact.findUnique({ where: { recordId }, select: { id: true, recordId: true } });
			if (existing) matchReason = 'record_id';
		}
		if (!existing && email) {
			existing = await db.contact.findFirst({
				where: { clientId, email },
				select: { id: true, recordId: true }
			});
			if (existing) matchReason = 'email';
		}
		if (!existing) {
			existing = await db.contact.findFirst({
				where: { clientId, firstName, lastName },
				select: { id: true, recordId: true }
			});
			if (existing) matchReason = 'client_name';
		}
		const id = existing?.id || nextSyntheticId();
		const externalId = toTrimmedString(row?.externalId);
		if (existing) details.contacts.update += 1;
		else details.contacts.create += 1;
		cacheContact({ id, recordId: existing?.recordId || recordId || `preview-contact-${Math.abs(id)}`, externalId, email, firstName, lastName, clientId });
		if (Number.isInteger(toOptionalInt(row?.id))) contactIdBySourceId.set(toOptionalInt(row?.id), id);
		pushPreviewRow(
			details,
			'contacts',
			buildImportRow(
				existing ? 'update' : 'create',
				label,
				existing ? `Will update existing contact matched by ${describeImportMatchReason(matchReason)}.` : 'Will create and link to resolved client.',
				matchReason
			)
		);
	}

	for (const row of data.contactNotes) {
		details.contactNotes.incoming += 1;
		const label = previewRowLabel('contactNotes', row);
		const contactId = resolveTargetIdFromSource({
			sourceId: row?.contactId,
			externalId: row?.contactExternalId,
			sourceIdToRecordId: sourceContactIdToRecordId,
			externalIdToRecordId: sourceContactExternalIdToRecordId,
			targetIdBySourceId: contactIdBySourceId,
			targetIdByExternalId: contactIdByExternalId,
			targetIdByRecordId: contactIdByRecordId
		}) || (toTrimmedString(row?.contactEmail) ? contactIdByEmail.get(normalizeLookupKey(row?.contactEmail)) : null);
		if (!contactId) {
			details.contactNotes.skip += 1;
			pushPreviewWarning(details, 'contactNotes', `Skip ${label}: related contact could not be resolved.`);
			pushPreviewRow(details, 'contactNotes', { label, action: 'skip', note: 'Related contact could not be resolved.' });
			continue;
		}
		const recordId = toTrimmedString(row?.recordId);
		const existing = recordId
			? await db.contactNote.findUnique({ where: { recordId }, select: { id: true } })
			: null;
		if (existing) details.contactNotes.update += 1;
		else details.contactNotes.create += 1;
		pushPreviewRow(
			details,
			'contactNotes',
			buildImportRow(
				existing ? 'update' : 'create',
				label,
				existing ? 'Will update existing contact note matched by record ID.' : 'Will create and link to resolved contact.',
				existing ? 'record_id' : ''
			)
		);
	}

	for (const row of data.candidates) {
		details.candidates.incoming += 1;
		const email = toTrimmedString(row?.email);
		const firstName = toTrimmedString(row?.firstName);
		const lastName = toTrimmedString(row?.lastName);
		const label = previewRowLabel('candidates', row);
		if (!email || !firstName || !lastName) {
			details.candidates.skip += 1;
			pushPreviewWarning(details, 'candidates', `Skip ${label}: missing first name, last name, or email.`);
			pushPreviewRow(details, 'candidates', { label, action: 'skip', note: 'Missing first name, last name, or email.' });
			continue;
		}
		const recordId = toTrimmedString(row?.recordId);
		const existingCandidateClauses = [{ email }];
		if (recordId) {
			existingCandidateClauses.unshift({ recordId });
		}
		let existing = null;
		let matchReason = '';
		if (recordId) {
			existing = await db.candidate.findUnique({
				where: { recordId },
				select: { id: true, recordId: true }
			});
			if (existing) matchReason = 'record_id';
		}
		if (!existing) {
			existing = await db.candidate.findFirst({
				where: { email },
				select: { id: true, recordId: true }
			});
			if (existing) matchReason = 'email';
		}
		const id = existing?.id || nextSyntheticId();
		const externalId = toTrimmedString(row?.externalId);
		if (existing) details.candidates.update += 1;
		else details.candidates.create += 1;
		cacheCandidate({ id, recordId: existing?.recordId || recordId || `preview-candidate-${Math.abs(id)}`, externalId, email });
		if (Number.isInteger(toOptionalInt(row?.id))) candidateIdBySourceId.set(toOptionalInt(row?.id), id);
		pushPreviewRow(
			details,
			'candidates',
			buildImportRow(
				existing ? 'update' : 'create',
				label,
				existing ? `Will update existing candidate matched by ${describeImportMatchReason(matchReason)}.` : 'Will create new candidate.',
				matchReason
			)
		);
	}

	for (const row of data.candidateNotes) {
		details.candidateNotes.incoming += 1;
		const label = previewRowLabel('candidateNotes', row);
		const candidateId = resolveTargetIdFromSource({
			sourceId: row?.candidateId,
			externalId: row?.candidateExternalId,
			sourceIdToRecordId: sourceCandidateIdToRecordId,
			externalIdToRecordId: sourceCandidateExternalIdToRecordId,
			targetIdBySourceId: candidateIdBySourceId,
			targetIdByExternalId: candidateIdByExternalId,
			targetIdByRecordId: candidateIdByRecordId
		}) || (toTrimmedString(row?.candidateEmail) ? candidateIdByEmail.get(normalizeLookupKey(row?.candidateEmail)) : null);
		if (!candidateId) {
			details.candidateNotes.skip += 1;
			pushPreviewWarning(details, 'candidateNotes', `Skip ${label}: related candidate could not be resolved.`);
			pushPreviewRow(details, 'candidateNotes', { label, action: 'skip', note: 'Related candidate could not be resolved.' });
			continue;
		}
		const recordId = toTrimmedString(row?.recordId);
		const existing = recordId
			? await db.candidateNote.findUnique({ where: { recordId }, select: { id: true } })
			: null;
		if (existing) details.candidateNotes.update += 1;
		else details.candidateNotes.create += 1;
		pushPreviewRow(
			details,
			'candidateNotes',
			buildImportRow(
				existing ? 'update' : 'create',
				label,
				existing ? 'Will update existing candidate note matched by record ID.' : 'Will create and link to resolved candidate.',
				existing ? 'record_id' : ''
			)
		);
	}

	for (const row of data.candidateEducations) {
		details.candidateEducations.incoming += 1;
		const label = previewRowLabel('candidateEducations', row);
		const candidateId = resolveTargetIdFromSource({
			sourceId: row?.candidateId,
			externalId: row?.candidateExternalId,
			sourceIdToRecordId: sourceCandidateIdToRecordId,
			externalIdToRecordId: sourceCandidateExternalIdToRecordId,
			targetIdBySourceId: candidateIdBySourceId,
			targetIdByExternalId: candidateIdByExternalId,
			targetIdByRecordId: candidateIdByRecordId
		}) || (toTrimmedString(row?.candidateEmail) ? candidateIdByEmail.get(normalizeLookupKey(row?.candidateEmail)) : null);
		if (!candidateId) {
			details.candidateEducations.skip += 1;
			pushPreviewWarning(details, 'candidateEducations', `Skip ${label}: related candidate could not be resolved.`);
			pushPreviewRow(details, 'candidateEducations', { label, action: 'skip', note: 'Related candidate could not be resolved.' });
			continue;
		}
		const recordId = toTrimmedString(row?.recordId);
		const existing = recordId
			? await db.candidateEducation.findUnique({ where: { recordId }, select: { id: true } })
			: null;
		if (existing) details.candidateEducations.update += 1;
		else details.candidateEducations.create += 1;
		pushPreviewRow(
			details,
			'candidateEducations',
			buildImportRow(
				existing ? 'update' : 'create',
				label,
				existing ? 'Will update existing education row matched by record ID.' : 'Will create and link to resolved candidate.',
				existing ? 'record_id' : ''
			)
		);
	}

	for (const row of data.candidateWorkExperiences) {
		details.candidateWorkExperiences.incoming += 1;
		const label = previewRowLabel('candidateWorkExperiences', row);
		const candidateId = resolveTargetIdFromSource({
			sourceId: row?.candidateId,
			externalId: row?.candidateExternalId,
			sourceIdToRecordId: sourceCandidateIdToRecordId,
			externalIdToRecordId: sourceCandidateExternalIdToRecordId,
			targetIdBySourceId: candidateIdBySourceId,
			targetIdByExternalId: candidateIdByExternalId,
			targetIdByRecordId: candidateIdByRecordId
		}) || (toTrimmedString(row?.candidateEmail) ? candidateIdByEmail.get(normalizeLookupKey(row?.candidateEmail)) : null);
		if (!candidateId) {
			details.candidateWorkExperiences.skip += 1;
			pushPreviewWarning(details, 'candidateWorkExperiences', `Skip ${label}: related candidate could not be resolved.`);
			pushPreviewRow(details, 'candidateWorkExperiences', { label, action: 'skip', note: 'Related candidate could not be resolved.' });
			continue;
		}
		const recordId = toTrimmedString(row?.recordId);
		const existing = recordId
			? await db.candidateWorkExperience.findUnique({ where: { recordId }, select: { id: true } })
			: null;
		if (existing) details.candidateWorkExperiences.update += 1;
		else details.candidateWorkExperiences.create += 1;
		pushPreviewRow(
			details,
			'candidateWorkExperiences',
			buildImportRow(
				existing ? 'update' : 'create',
				label,
				existing ? 'Will update existing work history row matched by record ID.' : 'Will create and link to resolved candidate.',
				existing ? 'record_id' : ''
			)
		);
	}

	for (const row of data.jobOrders) {
		details.jobOrders.incoming += 1;
		const title = toTrimmedString(row?.title);
		const label = previewRowLabel('jobOrders', row);
		if (!title) {
			details.jobOrders.skip += 1;
			pushPreviewWarning(details, 'jobOrders', 'Skip job order row: missing title.');
			pushPreviewRow(details, 'jobOrders', { label, action: 'skip', note: 'Missing title.' });
			continue;
		}
		const clientId = resolveClientIdFromRow(row);
		if (!clientId) {
			details.jobOrders.skip += 1;
			pushPreviewWarning(details, 'jobOrders', `Skip ${label}: related client could not be resolved.`);
			pushPreviewRow(details, 'jobOrders', { label, action: 'skip', note: 'Related client could not be resolved.' });
			continue;
		}
		const contactId = resolveContactIdFromRow(row, clientId);
		const recordId = toTrimmedString(row?.recordId);
		let existing = null;
		let matchReason = '';
		if (recordId) {
			existing = await db.jobOrder.findUnique({ where: { recordId }, select: { id: true, recordId: true } });
			if (existing) matchReason = 'record_id';
		}
		if (!existing) {
			existing = await db.jobOrder.findFirst({ where: { clientId, title }, select: { id: true, recordId: true } });
			if (existing) matchReason = 'client_title';
		}
		const id = existing?.id || nextSyntheticId();
		const externalId = toTrimmedString(row?.externalId);
		if (existing) details.jobOrders.update += 1;
		else details.jobOrders.create += 1;
		cacheJobOrder({ id, recordId: existing?.recordId || recordId || `preview-job-${Math.abs(id)}`, externalId, title });
		if (Number.isInteger(toOptionalInt(row?.id))) jobOrderIdBySourceId.set(toOptionalInt(row?.id), id);
		const note = contactId
			? (existing ? 'Will update and keep resolved client/contact links.' : 'Will create and link to resolved client/contact.')
			: (existing ? 'Will update and link to resolved client. Contact was not resolved.' : 'Will create and link to resolved client. Contact was not resolved.');
		if (!contactId) pushPreviewWarning(details, 'jobOrders', `${label}: hiring contact was not resolved. Job order can still import without it.`);
		pushPreviewRow(
			details,
			'jobOrders',
			buildImportRow(
				existing ? 'update' : 'create',
				label,
				existing
					? `${note} Matched by ${describeImportMatchReason(matchReason)}.`
					: note,
				matchReason
			)
		);
	}

	for (const row of data.submissions) {
		details.submissions.incoming += 1;
		const label = previewRowLabel('submissions', row);
		const candidateId = resolveTargetIdFromSource({
			sourceId: row?.candidateId,
			externalId: row?.candidateExternalId,
			sourceIdToRecordId: sourceCandidateIdToRecordId,
			externalIdToRecordId: sourceCandidateExternalIdToRecordId,
			targetIdBySourceId: candidateIdBySourceId,
			targetIdByExternalId: candidateIdByExternalId,
			targetIdByRecordId: candidateIdByRecordId
		}) || (toTrimmedString(row?.candidateEmail) ? candidateIdByEmail.get(normalizeLookupKey(row?.candidateEmail)) : null);
		const jobOrderId = resolveTargetIdFromSource({
			sourceId: row?.jobOrderId,
			externalId: row?.jobOrderExternalId,
			sourceIdToRecordId: sourceJobOrderIdToRecordId,
			externalIdToRecordId: sourceJobOrderExternalIdToRecordId,
			targetIdBySourceId: jobOrderIdBySourceId,
			targetIdByExternalId: jobOrderIdByExternalId,
			targetIdByRecordId: jobOrderIdByRecordId
		}) || (toTrimmedString(row?.jobOrderTitle) ? jobOrderIdByTitle.get(normalizeLookupKey(row?.jobOrderTitle)) : null);
		if (!candidateId || !jobOrderId) {
			details.submissions.skip += 1;
			pushPreviewWarning(details, 'submissions', `Skip ${label}: related candidate or job order could not be resolved.`);
			pushPreviewRow(details, 'submissions', { label, action: 'skip', note: 'Related candidate or job order could not be resolved.' });
			continue;
		}
		const recordId = toTrimmedString(row?.recordId);
		const existingSubmissionClauses = [{ AND: [{ candidateId }, { jobOrderId }] }];
		if (recordId) {
			existingSubmissionClauses.unshift({ recordId });
		}
		let existing = null;
		let matchReason = '';
		if (recordId) {
			existing = await db.submission.findFirst({
				where: { recordId },
				select: { id: true }
			});
			if (existing) matchReason = 'record_id';
		}
		if (!existing) {
			existing = await db.submission.findFirst({
				where: { AND: [{ candidateId }, { jobOrderId }] },
				select: { id: true }
			});
			if (existing) matchReason = 'candidate_job';
		}
		const id = existing?.id || nextSyntheticId();
		const externalId = toTrimmedString(row?.externalId);
		if (existing) details.submissions.update += 1;
		else details.submissions.create += 1;
		cacheSubmission({ id, recordId: recordId || `preview-submission-${Math.abs(id)}`, externalId });
		if (Number.isInteger(toOptionalInt(row?.id))) submissionIdBySourceId.set(toOptionalInt(row?.id), id);
		pushPreviewRow(
			details,
			'submissions',
			buildImportRow(
				existing ? 'update' : 'create',
				label,
				existing
					? `Will update existing submission matched by ${describeImportMatchReason(matchReason)}.`
					: 'Will create and link to resolved candidate/job order.',
				matchReason
			)
		);
	}

	for (const row of data.interviews) {
		details.interviews.incoming += 1;
		const label = previewRowLabel('interviews', row);
		const candidateId = resolveTargetIdFromSource({
			sourceId: row?.candidateId,
			externalId: row?.candidateExternalId,
			sourceIdToRecordId: sourceCandidateIdToRecordId,
			externalIdToRecordId: sourceCandidateExternalIdToRecordId,
			targetIdBySourceId: candidateIdBySourceId,
			targetIdByExternalId: candidateIdByExternalId,
			targetIdByRecordId: candidateIdByRecordId
		}) || (toTrimmedString(row?.candidateEmail) ? candidateIdByEmail.get(normalizeLookupKey(row?.candidateEmail)) : null);
		const jobOrderId = resolveTargetIdFromSource({
			sourceId: row?.jobOrderId,
			externalId: row?.jobOrderExternalId,
			sourceIdToRecordId: sourceJobOrderIdToRecordId,
			externalIdToRecordId: sourceJobOrderExternalIdToRecordId,
			targetIdBySourceId: jobOrderIdBySourceId,
			targetIdByExternalId: jobOrderIdByExternalId,
			targetIdByRecordId: jobOrderIdByRecordId
		}) || (toTrimmedString(row?.jobOrderTitle) ? jobOrderIdByTitle.get(normalizeLookupKey(row?.jobOrderTitle)) : null);
		if (!candidateId || !jobOrderId) {
			details.interviews.skip += 1;
			pushPreviewWarning(details, 'interviews', `Skip ${label}: related candidate or job order could not be resolved.`);
			pushPreviewRow(details, 'interviews', { label, action: 'skip', note: 'Related candidate or job order could not be resolved.' });
			continue;
		}
		const recordId = toTrimmedString(row?.recordId);
		const existing = recordId ? await db.interview.findUnique({ where: { recordId }, select: { id: true } }) : null;
		if (existing) details.interviews.update += 1;
		else details.interviews.create += 1;
		pushPreviewRow(
			details,
			'interviews',
			buildImportRow(
				existing ? 'update' : 'create',
				label,
				existing ? 'Will update existing interview matched by record ID.' : 'Will create and link to resolved candidate/job order.',
				existing ? 'record_id' : ''
			)
		);
	}

	for (const row of data.placements) {
		details.placements.incoming += 1;
		const label = previewRowLabel('placements', row);
		const candidateId = resolveTargetIdFromSource({
			sourceId: row?.candidateId,
			externalId: row?.candidateExternalId,
			sourceIdToRecordId: sourceCandidateIdToRecordId,
			externalIdToRecordId: sourceCandidateExternalIdToRecordId,
			targetIdBySourceId: candidateIdBySourceId,
			targetIdByExternalId: candidateIdByExternalId,
			targetIdByRecordId: candidateIdByRecordId
		}) || (toTrimmedString(row?.candidateEmail) ? candidateIdByEmail.get(normalizeLookupKey(row?.candidateEmail)) : null);
		const jobOrderId = resolveTargetIdFromSource({
			sourceId: row?.jobOrderId,
			externalId: row?.jobOrderExternalId,
			sourceIdToRecordId: sourceJobOrderIdToRecordId,
			externalIdToRecordId: sourceJobOrderExternalIdToRecordId,
			targetIdBySourceId: jobOrderIdBySourceId,
			targetIdByExternalId: jobOrderIdByExternalId,
			targetIdByRecordId: jobOrderIdByRecordId
		}) || (toTrimmedString(row?.jobOrderTitle) ? jobOrderIdByTitle.get(normalizeLookupKey(row?.jobOrderTitle)) : null);
		if (!candidateId || !jobOrderId) {
			details.placements.skip += 1;
			pushPreviewWarning(details, 'placements', `Skip ${label}: related candidate or job order could not be resolved.`);
			pushPreviewRow(details, 'placements', { label, action: 'skip', note: 'Related candidate or job order could not be resolved.' });
			continue;
		}
		const submissionId = resolveTargetIdFromSource({
			sourceId: row?.submissionId,
			externalId: row?.submissionExternalId,
			sourceIdToRecordId: sourceSubmissionIdToRecordId,
			externalIdToRecordId: sourceSubmissionExternalIdToRecordId,
			targetIdBySourceId: submissionIdBySourceId,
			targetIdByExternalId: submissionIdByExternalId,
			targetIdByRecordId: submissionIdByRecordId
		});
		const recordId = toTrimmedString(row?.recordId);
		const existing = recordId ? await db.offer.findUnique({ where: { recordId }, select: { id: true } }) : null;
		if (existing) details.placements.update += 1;
		else details.placements.create += 1;
		if (!submissionId && (toTrimmedString(row?.submissionExternalId) || toTrimmedString(row?.submissionId) || toTrimmedString(row?.submissionRecordId))) {
			pushPreviewWarning(details, 'placements', `${label}: submission could not be resolved. Placement can still import without it.`);
		}
		pushPreviewRow(
			details,
			'placements',
			buildImportRow(
				existing ? 'update' : 'create',
				label,
				existing
					? `Will update existing placement matched by record ID. ${submissionId ? 'Resolved submission will stay linked if present.' : 'Submission was not resolved.'}`
					: (submissionId ? 'Will link to candidate, job order, and resolved submission.' : 'Will link to candidate and job order. Submission was not resolved.'),
				existing ? 'record_id' : ''
			)
		);
	}

	return {
		summary,
		details
	};
}

function sourceIdRecordIdMap(rows) {
	return new Map(
		rows
			.map((row) => [toOptionalInt(row?.id), toTrimmedString(row?.recordId)])
			.filter(([id, recordId]) => Number.isInteger(id) && Boolean(recordId))
	);
}

function sourceExternalIdRecordIdMap(rows) {
	return new Map(
		rows
			.map((row) => [toTrimmedString(row?.externalId), toTrimmedString(row?.recordId)])
			.filter(([externalId]) => Boolean(externalId))
	);
}

function resolveTargetIdFromSource({
	sourceId,
	externalId,
	sourceIdToRecordId,
	externalIdToRecordId,
	targetIdBySourceId,
	targetIdByExternalId,
	targetIdByRecordId
}) {
	const normalizedSourceId = toOptionalInt(sourceId);
	if (Number.isInteger(normalizedSourceId) && targetIdBySourceId.has(normalizedSourceId)) {
		return targetIdBySourceId.get(normalizedSourceId);
	}
	if (Number.isInteger(normalizedSourceId) && sourceIdToRecordId.has(normalizedSourceId)) {
		const recordId = sourceIdToRecordId.get(normalizedSourceId);
		if (recordId && targetIdByRecordId.has(recordId)) {
			return targetIdByRecordId.get(recordId);
		}
	}
	const normalizedExternalId = toTrimmedString(externalId);
	if (normalizedExternalId && targetIdByExternalId.has(normalizedExternalId)) {
		return targetIdByExternalId.get(normalizedExternalId);
	}
	if (normalizedExternalId && externalIdToRecordId.has(normalizedExternalId)) {
		const recordId = externalIdToRecordId.get(normalizedExternalId);
		if (recordId && targetIdByRecordId.has(recordId)) {
			return targetIdByRecordId.get(recordId);
		}
	}
	return null;
}

async function importData(tx, data, actingUser) {
	const summary = {
		created: {
			customFieldDefinitions: 0,
			clients: 0,
			contacts: 0,
			contactNotes: 0,
			candidates: 0,
			candidateNotes: 0,
			candidateEducations: 0,
			candidateWorkExperiences: 0,
			jobOrders: 0,
			submissions: 0,
			interviews: 0,
			placements: 0
		},
		updated: {
			customFieldDefinitions: 0,
			clients: 0,
			contacts: 0,
			contactNotes: 0,
			candidates: 0,
			candidateNotes: 0,
			candidateEducations: 0,
			candidateWorkExperiences: 0,
			jobOrders: 0,
			submissions: 0,
			interviews: 0,
			placements: 0
		},
		skipped: {
			customFieldDefinitions: 0,
			clients: 0,
			contacts: 0,
			contactNotes: 0,
			candidates: 0,
			candidateNotes: 0,
			candidateEducations: 0,
			candidateWorkExperiences: 0,
			jobOrders: 0,
			submissions: 0,
			interviews: 0,
			placements: 0
		},
		details: createEmptyPreviewDetails(),
		errors: [],
		_attachmentContext: {
			candidateIdBySourceId: {},
			candidateIdByEmail: {}
		}
	};

	const sourceClientIdToRecordId = sourceIdRecordIdMap(data.clients);
	const sourceContactIdToRecordId = sourceIdRecordIdMap(data.contacts);
	const sourceCandidateIdToRecordId = sourceIdRecordIdMap(data.candidates);
	const sourceJobOrderIdToRecordId = sourceIdRecordIdMap(data.jobOrders);
	const sourceSubmissionIdToRecordId = sourceIdRecordIdMap(data.submissions);
	const sourceClientExternalIdToRecordId = sourceExternalIdRecordIdMap(data.clients);
	const sourceContactExternalIdToRecordId = sourceExternalIdRecordIdMap(data.contacts);
	const sourceCandidateExternalIdToRecordId = sourceExternalIdRecordIdMap(data.candidates);
	const sourceJobOrderExternalIdToRecordId = sourceExternalIdRecordIdMap(data.jobOrders);
	const sourceSubmissionExternalIdToRecordId = sourceExternalIdRecordIdMap(data.submissions);

	const clientIdBySourceId = new Map();
	const clientIdByRecordId = new Map();
	const clientIdByExternalId = new Map();
	const clientIdByName = new Map();
	const contactIdBySourceId = new Map();
	const contactIdByRecordId = new Map();
	const contactIdByExternalId = new Map();
	const contactIdByEmail = new Map();
	const contactIdByClientName = new Map();
	const candidateIdBySourceId = new Map();
	const candidateIdByRecordId = new Map();
	const candidateIdByExternalId = new Map();
	const candidateIdByEmail = new Map();
	const jobOrderIdBySourceId = new Map();
	const jobOrderIdByRecordId = new Map();
	const jobOrderIdByExternalId = new Map();
	const jobOrderIdByTitle = new Map();
	const submissionIdBySourceId = new Map();
	const submissionIdByRecordId = new Map();
	const submissionIdByExternalId = new Map();

	function pushError(message) {
		if (summary.errors.length < 200) {
			summary.errors.push(message);
		}
	}

	function pushEntityWarning(entityKey, message) {
		pushPreviewWarning(summary.details, entityKey, message);
		pushError(message);
	}

	function cacheClient({ id, recordId, name }) {
		if (!Number.isInteger(id)) return;
		if (recordId) {
			clientIdByRecordId.set(recordId, id);
		}
		const nameKey = normalizeLookupKey(name);
		if (nameKey && !clientIdByName.has(nameKey)) {
			clientIdByName.set(nameKey, id);
		}
	}

	function cacheContact({ id, recordId, email, firstName, lastName, clientId }) {
		if (!Number.isInteger(id)) return;
		if (recordId) {
			contactIdByRecordId.set(recordId, id);
		}
		const emailKey = normalizeLookupKey(email);
		if (emailKey && !contactIdByEmail.has(emailKey)) {
			contactIdByEmail.set(emailKey, id);
		}
		const byClientKey = contactByClientNameKey(clientId, firstName, lastName);
		if (byClientKey && !contactIdByClientName.has(byClientKey)) {
			contactIdByClientName.set(byClientKey, id);
		}
	}

	function cacheCandidate({ id, recordId, externalId, email }) {
		if (!Number.isInteger(id)) return;
		if (recordId) {
			candidateIdByRecordId.set(recordId, id);
		}
		if (externalId) {
			candidateIdByExternalId.set(externalId, id);
		}
		const emailKey = normalizeLookupKey(email);
		if (emailKey && !candidateIdByEmail.has(emailKey)) {
			candidateIdByEmail.set(emailKey, id);
		}
		if (emailKey) {
			summary._attachmentContext.candidateIdByEmail[emailKey] = id;
		}
	}

	function cacheJobOrder({ id, recordId, externalId, title }) {
		if (!Number.isInteger(id)) return;
		if (recordId) {
			jobOrderIdByRecordId.set(recordId, id);
		}
		if (externalId) {
			jobOrderIdByExternalId.set(externalId, id);
		}
		const titleKey = normalizeLookupKey(title);
		if (titleKey && !jobOrderIdByTitle.has(titleKey)) {
			jobOrderIdByTitle.set(titleKey, id);
		}
	}

	function cacheSubmission({ id, recordId, externalId }) {
		if (!Number.isInteger(id)) return;
		if (recordId) {
			submissionIdByRecordId.set(recordId, id);
		}
		if (externalId) {
			submissionIdByExternalId.set(externalId, id);
		}
	}

	function resolveClientIdFromRow(row) {
		const bySource = resolveTargetIdFromSource({
			sourceId: row?.clientId,
			externalId: row?.clientExternalId,
			sourceIdToRecordId: sourceClientIdToRecordId,
			externalIdToRecordId: sourceClientExternalIdToRecordId,
			targetIdBySourceId: clientIdBySourceId,
			targetIdByExternalId: clientIdByExternalId,
			targetIdByRecordId: clientIdByRecordId
		});
		if (bySource) return bySource;

		const clientRecordId = toTrimmedString(row?.clientRecordId);
		if (clientRecordId && clientIdByRecordId.has(clientRecordId)) {
			return clientIdByRecordId.get(clientRecordId);
		}

		const clientName = toTrimmedString(row?.clientName) || toTrimmedString(row?.client);
		if (clientName) {
			const clientNameKey = normalizeLookupKey(clientName);
			if (clientNameKey && clientIdByName.has(clientNameKey)) {
				return clientIdByName.get(clientNameKey);
			}
		}

		return null;
	}

	function resolveContactIdFromRow(row, clientId) {
		const bySource = resolveTargetIdFromSource({
			sourceId: row?.contactId,
			externalId: row?.contactExternalId,
			sourceIdToRecordId: sourceContactIdToRecordId,
			externalIdToRecordId: sourceContactExternalIdToRecordId,
			targetIdBySourceId: contactIdBySourceId,
			targetIdByExternalId: contactIdByExternalId,
			targetIdByRecordId: contactIdByRecordId
		});
		if (bySource) return bySource;

		const contactRecordId = toTrimmedString(row?.contactRecordId);
		if (contactRecordId && contactIdByRecordId.has(contactRecordId)) {
			return contactIdByRecordId.get(contactRecordId);
		}

		const contactEmail = toTrimmedString(row?.contactEmail);
		if (contactEmail) {
			const contactEmailKey = normalizeLookupKey(contactEmail);
			if (contactEmailKey && contactIdByEmail.has(contactEmailKey)) {
				return contactIdByEmail.get(contactEmailKey);
			}
		}

		const contactName = parseDisplayName(row?.contactName);
		const contactFirstName = toTrimmedString(row?.contactFirstName) || contactName.firstName;
		const contactLastName = toTrimmedString(row?.contactLastName) || contactName.lastName;
		const byClientNameKey = contactByClientNameKey(clientId, contactFirstName, contactLastName);
		if (byClientNameKey && contactIdByClientName.has(byClientNameKey)) {
			return contactIdByClientName.get(byClientNameKey);
		}

		return null;
	}

	for (const row of data.customFieldDefinitions) {
		const moduleKey = normalizeCustomFieldModuleKey(row?.moduleKey);
		const label = toTrimmedString(row?.label) || previewRowLabel('customFieldDefinitions', row);
		const fieldKey = normalizeCustomFieldKey(row?.fieldKey || label);
		if (!moduleKey || !label || !fieldKey) {
			summary.skipped.customFieldDefinitions += 1;
			pushEntityWarning('customFieldDefinitions', `Skipped ${label || 'custom field definition'}: missing module, label, or field key.`);
			pushPreviewRow(summary.details, 'customFieldDefinitions', buildImportRow('skip', label || 'Unnamed custom field', 'Missing module, label, or field key.'));
			continue;
		}

		const fieldType = normalizeCustomFieldType(row?.fieldType);
		const selectOptions = normalizeCustomFieldSelectOptions(row?.selectOptions);
		if (fieldType === 'select' && selectOptions.length <= 0) {
			summary.skipped.customFieldDefinitions += 1;
			pushEntityWarning('customFieldDefinitions', `Skipped ${label}: select fields require options.`);
			pushPreviewRow(summary.details, 'customFieldDefinitions', buildImportRow('skip', label, 'Select field requires options.'));
			continue;
		}

		const recordId = toTrimmedString(row?.recordId) || createRecordId('CFD');
		const existingByRecordId = recordId
			? await tx.customFieldDefinition.findUnique({
				where: { recordId },
				select: { id: true }
			})
			: null;
		const existingByKey = existingByRecordId
			? null
			: await tx.customFieldDefinition.findUnique({
				where: {
					moduleKey_fieldKey: {
						moduleKey,
						fieldKey
					}
				},
				select: { id: true }
			});
		const existing = existingByRecordId || existingByKey;
		const matchReason = existingByRecordId ? 'record_id' : existingByKey ? 'module_field_key' : '';

		const payload = {
			moduleKey,
			fieldKey,
			label,
			fieldType,
			selectOptions: fieldType === 'select' ? selectOptions : [],
			placeholder: toTrimmedString(row?.placeholder),
			helpText: toTrimmedString(row?.helpText),
			isRequired: parseBooleanFlag(row?.isRequired, false),
			isActive: parseBooleanFlag(row?.isActive, true),
			sortOrder: toOptionalInt(row?.sortOrder, 0) || 0
		};

		if (existing) {
			await tx.customFieldDefinition.update({
				where: { id: existing.id },
				data: payload
			});
			summary.updated.customFieldDefinitions += 1;
			pushPreviewRow(summary.details, 'customFieldDefinitions', buildImportRow('update', label, `Updated existing field definition matched by ${describeImportMatchReason(matchReason)}.`, matchReason));
		} else {
			await tx.customFieldDefinition.create({
				data: {
					recordId,
					...payload
				}
			});
			summary.created.customFieldDefinitions += 1;
			pushPreviewRow(summary.details, 'customFieldDefinitions', buildImportRow('create', label, 'Created new field definition.'));
		}
	}

	const existingClients = await tx.client.findMany({
		select: {
			id: true,
			recordId: true,
			name: true
		}
	});
	for (const existingClient of existingClients) {
		cacheClient(existingClient);
	}

	const existingContacts = await tx.contact.findMany({
		select: {
			id: true,
			recordId: true,
			email: true,
			firstName: true,
			lastName: true,
			clientId: true
		}
	});
	for (const existingContact of existingContacts) {
		cacheContact(existingContact);
	}

	const existingCandidates = await tx.candidate.findMany({
		select: {
			id: true,
			recordId: true,
			email: true
		}
	});
	for (const existingCandidate of existingCandidates) {
		cacheCandidate(existingCandidate);
	}

	const existingSkills = await tx.skill.findMany({
		select: {
			id: true,
			name: true
		}
	});
	const skillCache = {
		skillIdByKey: new Map(
			existingSkills.map((skill) => [normalizeImportedSkillKey(skill.name), skill.id])
		)
	};

	const existingJobOrders = await tx.jobOrder.findMany({
		select: {
			id: true,
			recordId: true,
			title: true
		}
	});
	for (const existingJobOrder of existingJobOrders) {
		cacheJobOrder(existingJobOrder);
	}

	const existingSubmissions = await tx.submission.findMany({
		select: {
			id: true,
			recordId: true
		}
	});
	for (const existingSubmission of existingSubmissions) {
		cacheSubmission(existingSubmission);
	}

	for (const row of data.clients) {
		const name = toTrimmedString(row?.name);
		const label = previewRowLabel('clients', row);
		if (!name) {
			summary.skipped.clients += 1;
			pushEntityWarning('clients', 'Skipped client row with missing `name`.');
			pushPreviewRow(summary.details, 'clients', buildImportRow('skip', label, 'Missing client name.'));
			continue;
		}
		const recordId = toTrimmedString(row?.recordId);
		let existing = null;
		let matchReason = '';
		if (recordId) {
			existing = await tx.client.findUnique({
				where: { recordId },
				select: { id: true, recordId: true }
			});
			if (existing) matchReason = 'record_id';
		}
		if (!existing) {
			existing = await tx.client.findFirst({
				where: { name },
				select: { id: true, recordId: true }
			});
			if (existing) matchReason = 'name';
		}
		const createdRecordId = recordId || createRecordId('Client');
		const payload = {
			name,
			industry: toTrimmedString(row?.industry),
			status: normalizeClientStatusValue(toTrimmedString(row?.status)),
			phone: toTrimmedString(row?.phone),
			address: toTrimmedString(row?.address),
			city: toTrimmedString(row?.city),
			state: toTrimmedString(row?.state),
			zipCode: normalizeZipCode(row?.zipCode),
			website: toTrimmedString(row?.website),
			description: toTrimmedString(row?.description),
			customFields: normalizeCustomFieldValues(row?.customFields),
			ownerId: actingUser.id,
			divisionId: actingUser.divisionId || null
		};

		const saved = existing
			? await tx.client.update({
				where: { id: existing.id },
				data: payload,
				select: { id: true }
				})
			: await tx.client.create({
				data: {
					recordId: createdRecordId,
					...payload
				},
				select: { id: true, recordId: true }
			});

		if (existing) summary.updated.clients += 1;
		else summary.created.clients += 1;
		pushPreviewRow(
			summary.details,
			'clients',
			buildImportRow(
				existing ? 'update' : 'create',
				label,
				existing ? `Updated existing client matched by ${describeImportMatchReason(matchReason)}.` : 'Created new client.',
				matchReason
			)
		);

		const sourceId = toOptionalInt(row?.id);
		const externalId = toTrimmedString(row?.externalId);
		if (Number.isInteger(sourceId)) {
			clientIdBySourceId.set(sourceId, saved.id);
		}
		if (externalId) {
			clientIdByExternalId.set(externalId, saved.id);
		}
		const mappedRecordId = existing?.recordId || saved.recordId || createdRecordId;
		if (mappedRecordId) {
			clientIdByRecordId.set(mappedRecordId, saved.id);
		}
		cacheClient({
			id: saved.id,
			recordId: mappedRecordId,
			name
		});
	}

	for (const row of data.contacts) {
		const firstName = toTrimmedString(row?.firstName);
		const lastName = toTrimmedString(row?.lastName);
		const label = previewRowLabel('contacts', row);
		if (!firstName || !lastName) {
			summary.skipped.contacts += 1;
			pushEntityWarning('contacts', `Skipped ${label}: missing first or last name.`);
			pushPreviewRow(summary.details, 'contacts', buildImportRow('skip', label, 'Missing first or last name.'));
			continue;
		}

		const clientId = resolveClientIdFromRow(row);
		if (!clientId) {
			summary.skipped.contacts += 1;
			pushEntityWarning('contacts', `Skipped ${label}: related client could not be resolved.`);
			pushPreviewRow(summary.details, 'contacts', buildImportRow('skip', label, 'Related client could not be resolved.'));
			continue;
		}

		const recordId = toTrimmedString(row?.recordId);
		const email = toTrimmedString(row?.email);
		const contactMatchClauses = [{ firstName, lastName }];
		if (email) {
			contactMatchClauses.unshift({ email });
		}
		let existing = null;
		let matchReason = '';
		if (recordId) {
			existing = await tx.contact.findUnique({
				where: { recordId },
				select: { id: true, recordId: true }
			});
			if (existing) matchReason = 'record_id';
		}
		if (!existing && email) {
			existing = await tx.contact.findFirst({
				where: { clientId, email },
				select: { id: true, recordId: true }
			});
			if (existing) matchReason = 'email';
		}
		if (!existing) {
			existing = await tx.contact.findFirst({
				where: { clientId, firstName, lastName },
				select: { id: true, recordId: true }
			});
			if (existing) matchReason = 'client_name';
		}
		const createdRecordId = recordId || createRecordId('Contact');
		const payload = {
			firstName,
			lastName,
			email,
			phone: toTrimmedString(row?.phone),
			zipCode: normalizeZipCode(row?.zipCode),
			title: toTrimmedString(row?.title),
			department: toTrimmedString(row?.department),
			linkedinUrl: toTrimmedString(row?.linkedinUrl),
			source: normalizeContactSourceValue(toTrimmedString(row?.source)) || null,
			address: toTrimmedString(row?.address),
			customFields: normalizeCustomFieldValues(row?.customFields),
			ownerId: actingUser.id,
			divisionId: actingUser.divisionId || null,
			clientId
		};

		const saved = existing
			? await tx.contact.update({
				where: { id: existing.id },
				data: payload,
				select: { id: true }
				})
			: await tx.contact.create({
				data: {
					recordId: createdRecordId,
					...payload
				},
				select: { id: true, recordId: true }
			});

		if (existing) summary.updated.contacts += 1;
		else summary.created.contacts += 1;
		pushPreviewRow(
			summary.details,
			'contacts',
			buildImportRow(
				existing ? 'update' : 'create',
				label,
				existing ? `Updated existing contact matched by ${describeImportMatchReason(matchReason)}.` : 'Created contact and linked it to the resolved client.',
				matchReason
			)
		);

		const sourceId = toOptionalInt(row?.id);
		const externalId = toTrimmedString(row?.externalId);
		if (Number.isInteger(sourceId)) {
			contactIdBySourceId.set(sourceId, saved.id);
		}
		if (externalId) {
			contactIdByExternalId.set(externalId, saved.id);
		}
		const mappedRecordId = existing?.recordId || saved.recordId || createdRecordId;
		if (mappedRecordId) {
			contactIdByRecordId.set(mappedRecordId, saved.id);
		}
		cacheContact({
			id: saved.id,
			recordId: mappedRecordId,
			email,
			firstName,
			lastName,
			clientId
		});
	}

	for (const row of data.contactNotes) {
		const label = previewRowLabel('contactNotes', row);
		const contactId = resolveTargetIdFromSource({
			sourceId: row?.contactId,
			externalId: row?.contactExternalId,
			sourceIdToRecordId: sourceContactIdToRecordId,
			externalIdToRecordId: sourceContactExternalIdToRecordId,
			targetIdBySourceId: contactIdBySourceId,
			targetIdByExternalId: contactIdByExternalId,
			targetIdByRecordId: contactIdByRecordId
		}) || (toTrimmedString(row?.contactEmail) ? contactIdByEmail.get(normalizeLookupKey(row?.contactEmail)) : null);
		if (!contactId) {
			summary.skipped.contactNotes += 1;
			pushEntityWarning('contactNotes', `Skipped ${label}: related contact could not be resolved.`);
			pushPreviewRow(summary.details, 'contactNotes', buildImportRow('skip', label, 'Related contact could not be resolved.'));
			continue;
		}

		const recordId = toTrimmedString(row?.recordId) || createRecordId('ContactNote');
		const existing = await tx.contactNote.findUnique({
			where: { recordId },
			select: { id: true }
		});
		const payload = {
			noteType: toTrimmedString(row?.noteType) || 'bullhorn',
			content: toTrimmedString(row?.content),
			contactId,
			createdByUserId: actingUser.id
		};
		if (!payload.content) {
			summary.skipped.contactNotes += 1;
			pushEntityWarning('contactNotes', `Skipped ${label}: missing note content.`);
			pushPreviewRow(summary.details, 'contactNotes', buildImportRow('skip', label, 'Missing note content.'));
			continue;
		}

		if (existing) {
			await tx.contactNote.update({
				where: { id: existing.id },
				data: payload
			});
			summary.updated.contactNotes += 1;
			pushPreviewRow(summary.details, 'contactNotes', buildImportRow('update', label, 'Updated existing contact note matched by record ID.', 'record_id'));
		} else {
			await tx.contactNote.create({
				data: {
					recordId,
					createdAt: row?.createdAt || undefined,
					...payload
				}
			});
			summary.created.contactNotes += 1;
			pushPreviewRow(summary.details, 'contactNotes', buildImportRow('create', label, 'Created contact note and linked it to the resolved contact.'));
		}
	}

	for (const row of data.candidates) {
		const email = toTrimmedString(row?.email);
		const firstName = toTrimmedString(row?.firstName);
		const lastName = toTrimmedString(row?.lastName);
		const label = previewRowLabel('candidates', row);
		if (!email || !firstName || !lastName) {
			summary.skipped.candidates += 1;
			pushEntityWarning('candidates', `Skipped ${label}: missing first name, last name, or email.`);
			pushPreviewRow(summary.details, 'candidates', buildImportRow('skip', label, 'Missing first name, last name, or email.'));
			continue;
		}

		const recordId = toTrimmedString(row?.recordId) || createRecordId('Candidate');
		let existing = await tx.candidate.findFirst({
			where: { recordId },
			select: { id: true }
		});
		let matchReason = existing ? 'record_id' : '';
		if (!existing) {
			existing = await tx.candidate.findFirst({
				where: { email },
				select: { id: true }
			});
			if (existing) matchReason = 'email';
		}
		const payload = {
			firstName,
			lastName,
			email,
			phone: toTrimmedString(row?.phone),
			mobile: toTrimmedString(row?.mobile) || toTrimmedString(row?.phone),
			status: normalizeCandidateStatusValue(row?.status),
			source: normalizeCandidateSourceValue(toTrimmedString(row?.source)) || null,
			currentJobTitle: toTrimmedString(row?.currentJobTitle),
			currentEmployer: toTrimmedString(row?.currentEmployer),
			address: toTrimmedString(row?.address),
			city: toTrimmedString(row?.city),
			state: toTrimmedString(row?.state),
			zipCode: normalizeZipCode(row?.zipCode),
			website: toTrimmedString(row?.website),
			linkedinUrl: toTrimmedString(row?.linkedinUrl),
			skillSet: toTrimmedString(row?.skillSet),
			summary: toTrimmedString(row?.summary),
			customFields: normalizeCustomFieldValues(row?.customFields),
			experienceYears: toOptionalNumber(row?.experienceYears),
			ownerId: actingUser.id,
			divisionId: actingUser.divisionId || null
		};
		const importedSkillNames = splitImportedSkillNames(
			Array.isArray(row?.parsedSkillNames) && row.parsedSkillNames.length > 0
				? row.parsedSkillNames
				: row?.skillSet
		);
		const hasImportedSkillData = row?.hasSkillData === true || importedSkillNames.length > 0;

		const saved = existing
			? await tx.candidate.update({
				where: { id: existing.id },
				data: payload,
				select: { id: true }
			})
			: await tx.candidate.create({
				data: {
					recordId,
					...payload
				},
				select: { id: true }
			});

		if (existing) summary.updated.candidates += 1;
		else summary.created.candidates += 1;
		pushPreviewRow(
			summary.details,
			'candidates',
			buildImportRow(
				existing ? 'update' : 'create',
				label,
				existing ? `Updated existing candidate matched by ${describeImportMatchReason(matchReason)}.` : 'Created new candidate.',
				matchReason
			)
		);

		const sourceId = toOptionalInt(row?.id);
		const externalId = toTrimmedString(row?.externalId);
		if (Number.isInteger(sourceId)) {
			candidateIdBySourceId.set(sourceId, saved.id);
			summary._attachmentContext.candidateIdBySourceId[String(sourceId)] = saved.id;
		}
		cacheCandidate({
			id: saved.id,
			recordId,
			externalId,
			email
		});

		if (hasImportedSkillData) {
			const importedSkillIds = await resolveImportedSkillIds(tx, importedSkillNames, skillCache);
			await syncCandidateImportedSkills(tx, saved.id, importedSkillIds);
		}
	}

	for (const row of data.candidateNotes) {
		const label = previewRowLabel('candidateNotes', row);
		const candidateId = resolveTargetIdFromSource({
			sourceId: row?.candidateId,
			externalId: row?.candidateExternalId,
			sourceIdToRecordId: sourceCandidateIdToRecordId,
			externalIdToRecordId: sourceCandidateExternalIdToRecordId,
			targetIdBySourceId: candidateIdBySourceId,
			targetIdByExternalId: candidateIdByExternalId,
			targetIdByRecordId: candidateIdByRecordId
		}) || (toTrimmedString(row?.candidateEmail) ? candidateIdByEmail.get(normalizeLookupKey(row?.candidateEmail)) : null);
		if (!candidateId) {
			summary.skipped.candidateNotes += 1;
			pushEntityWarning('candidateNotes', `Skipped ${label}: related candidate could not be resolved.`);
			pushPreviewRow(summary.details, 'candidateNotes', buildImportRow('skip', label, 'Related candidate could not be resolved.'));
			continue;
		}

		const recordId = toTrimmedString(row?.recordId) || createRecordId('CandidateNote');
		const existing = await tx.candidateNote.findUnique({
			where: { recordId },
			select: { id: true }
		});
		const payload = {
			noteType: toTrimmedString(row?.noteType) || 'bullhorn',
			content: toTrimmedString(row?.content),
			candidateId,
			createdByUserId: actingUser.id
		};
		if (!payload.content) {
			summary.skipped.candidateNotes += 1;
			pushEntityWarning('candidateNotes', `Skipped ${label}: missing note content.`);
			pushPreviewRow(summary.details, 'candidateNotes', buildImportRow('skip', label, 'Missing note content.'));
			continue;
		}

		if (existing) {
			await tx.candidateNote.update({
				where: { id: existing.id },
				data: payload
			});
			summary.updated.candidateNotes += 1;
			pushPreviewRow(summary.details, 'candidateNotes', buildImportRow('update', label, 'Updated existing candidate note matched by record ID.', 'record_id'));
		} else {
			await tx.candidateNote.create({
				data: {
					recordId,
					createdAt: row?.createdAt || undefined,
					...payload
				}
			});
			summary.created.candidateNotes += 1;
			pushPreviewRow(summary.details, 'candidateNotes', buildImportRow('create', label, 'Created candidate note and linked it to the resolved candidate.'));
		}
	}

	for (const row of data.candidateEducations) {
		const label = previewRowLabel('candidateEducations', row);
		const candidateId = resolveTargetIdFromSource({
			sourceId: row?.candidateId,
			externalId: row?.candidateExternalId,
			sourceIdToRecordId: sourceCandidateIdToRecordId,
			externalIdToRecordId: sourceCandidateExternalIdToRecordId,
			targetIdBySourceId: candidateIdBySourceId,
			targetIdByExternalId: candidateIdByExternalId,
			targetIdByRecordId: candidateIdByRecordId
		}) || (toTrimmedString(row?.candidateEmail) ? candidateIdByEmail.get(normalizeLookupKey(row?.candidateEmail)) : null);
		if (!candidateId) {
			summary.skipped.candidateEducations += 1;
			pushEntityWarning('candidateEducations', `Skipped ${label}: related candidate could not be resolved.`);
			pushPreviewRow(summary.details, 'candidateEducations', buildImportRow('skip', label, 'Related candidate could not be resolved.'));
			continue;
		}

		const schoolName = toTrimmedString(row?.schoolName);
		if (!schoolName) {
			summary.skipped.candidateEducations += 1;
			pushEntityWarning('candidateEducations', `Skipped ${label}: missing school name.`);
			pushPreviewRow(summary.details, 'candidateEducations', buildImportRow('skip', label, 'Missing school name.'));
			continue;
		}

		const recordId = toTrimmedString(row?.recordId) || createRecordId('CandidateEducation');
		const existing = await tx.candidateEducation.findUnique({
			where: { recordId },
			select: { id: true }
		});
		const payload = {
			schoolName,
			degree: toTrimmedString(row?.degree),
			fieldOfStudy: toTrimmedString(row?.fieldOfStudy),
			startDate: toOptionalDate(row?.startDate),
			endDate: toOptionalDate(row?.endDate),
			isCurrent: parseBooleanFlag(row?.isCurrent, false),
			description: toTrimmedString(row?.description),
			candidateId
		};

		if (existing) {
			await tx.candidateEducation.update({
				where: { id: existing.id },
				data: payload
			});
			summary.updated.candidateEducations += 1;
			pushPreviewRow(summary.details, 'candidateEducations', buildImportRow('update', label, 'Updated existing candidate education matched by record ID.', 'record_id'));
		} else {
			await tx.candidateEducation.create({
				data: {
					recordId,
					...payload
				}
			});
			summary.created.candidateEducations += 1;
			pushPreviewRow(summary.details, 'candidateEducations', buildImportRow('create', label, 'Created candidate education and linked it to the resolved candidate.'));
		}
	}

	for (const row of data.candidateWorkExperiences) {
		const label = previewRowLabel('candidateWorkExperiences', row);
		const candidateId = resolveTargetIdFromSource({
			sourceId: row?.candidateId,
			externalId: row?.candidateExternalId,
			sourceIdToRecordId: sourceCandidateIdToRecordId,
			externalIdToRecordId: sourceCandidateExternalIdToRecordId,
			targetIdBySourceId: candidateIdBySourceId,
			targetIdByExternalId: candidateIdByExternalId,
			targetIdByRecordId: candidateIdByRecordId
		}) || (toTrimmedString(row?.candidateEmail) ? candidateIdByEmail.get(normalizeLookupKey(row?.candidateEmail)) : null);
		if (!candidateId) {
			summary.skipped.candidateWorkExperiences += 1;
			pushEntityWarning('candidateWorkExperiences', `Skipped ${label}: related candidate could not be resolved.`);
			pushPreviewRow(summary.details, 'candidateWorkExperiences', buildImportRow('skip', label, 'Related candidate could not be resolved.'));
			continue;
		}

		const companyName = toTrimmedString(row?.companyName);
		if (!companyName) {
			summary.skipped.candidateWorkExperiences += 1;
			pushEntityWarning('candidateWorkExperiences', `Skipped ${label}: missing company name.`);
			pushPreviewRow(summary.details, 'candidateWorkExperiences', buildImportRow('skip', label, 'Missing company name.'));
			continue;
		}

		const recordId = toTrimmedString(row?.recordId) || createRecordId('CandidateWorkExperience');
		const existing = await tx.candidateWorkExperience.findUnique({
			where: { recordId },
			select: { id: true }
		});
		const payload = {
			companyName,
			title: toTrimmedString(row?.title),
			location: toTrimmedString(row?.location),
			startDate: toOptionalDate(row?.startDate),
			endDate: toOptionalDate(row?.endDate),
			isCurrent: parseBooleanFlag(row?.isCurrent, false),
			description: toTrimmedString(row?.description),
			candidateId
		};

		if (existing) {
			await tx.candidateWorkExperience.update({
				where: { id: existing.id },
				data: payload
			});
			summary.updated.candidateWorkExperiences += 1;
			pushPreviewRow(summary.details, 'candidateWorkExperiences', buildImportRow('update', label, 'Updated existing candidate work history matched by record ID.', 'record_id'));
		} else {
			await tx.candidateWorkExperience.create({
				data: {
					recordId,
					...payload
				}
			});
			summary.created.candidateWorkExperiences += 1;
			pushPreviewRow(summary.details, 'candidateWorkExperiences', buildImportRow('create', label, 'Created candidate work history and linked it to the resolved candidate.'));
		}
	}

	for (const row of data.jobOrders) {
		const title = toTrimmedString(row?.title);
		const label = previewRowLabel('jobOrders', row);
		if (!title) {
			summary.skipped.jobOrders += 1;
			pushEntityWarning('jobOrders', `Skipped ${label}: missing title.`);
			pushPreviewRow(summary.details, 'jobOrders', buildImportRow('skip', label, 'Missing title.'));
			continue;
		}

		const clientId = resolveClientIdFromRow(row);
		if (!clientId) {
			summary.skipped.jobOrders += 1;
			pushEntityWarning('jobOrders', `Skipped ${label}: related client could not be resolved.`);
			pushPreviewRow(summary.details, 'jobOrders', buildImportRow('skip', label, 'Related client could not be resolved.'));
			continue;
		}

		const contactId = resolveContactIdFromRow(row, clientId);

		const recordId = toTrimmedString(row?.recordId);
		const openings = toOptionalInt(row?.openings, 1);
		let existing = null;
		let matchReason = '';
		if (recordId) {
			existing = await tx.jobOrder.findUnique({
				where: { recordId },
				select: { id: true, recordId: true }
			});
			if (existing) matchReason = 'record_id';
		}
		if (!existing) {
			existing = await tx.jobOrder.findFirst({
				where: {
					clientId,
					title
				},
				select: { id: true, recordId: true }
			});
			if (existing) matchReason = 'client_title';
		}
		const createdRecordId = recordId || createRecordId('JobOrder');
		const payload = {
			title,
			description: toTrimmedString(row?.description),
			publicDescription: toTrimmedString(row?.publicDescription),
			location: toTrimmedString(row?.location),
			city: toTrimmedString(row?.city),
			state: toTrimmedString(row?.state),
			zipCode: normalizeZipCode(row?.zipCode),
			status: toJobOrderStatusValue(row?.status),
			employmentType: toTrimmedString(row?.employmentType),
			openings: openings && openings > 0 ? openings : 1,
			currency: normalizeCurrencyCode(row?.currency),
			salaryMin: toOptionalNumber(row?.salaryMin),
			salaryMax: toOptionalNumber(row?.salaryMax),
			publishToCareerSite: parseBooleanFlag(row?.publishToCareerSite),
			customFields: normalizeCustomFieldValues(row?.customFields),
			ownerId: actingUser.id,
			divisionId: actingUser.divisionId || null,
			clientId,
			contactId: contactId || null
		};

		const saved = existing
			? await tx.jobOrder.update({
				where: { id: existing.id },
				data: payload,
				select: { id: true }
				})
			: await tx.jobOrder.create({
				data: {
					recordId: createdRecordId,
					...payload
				},
				select: { id: true, recordId: true }
			});

		if (existing) summary.updated.jobOrders += 1;
		else summary.created.jobOrders += 1;
		pushPreviewRow(
			summary.details,
			'jobOrders',
			buildImportRow(
				existing ? 'update' : 'create',
				label,
				existing ? `Updated existing job order matched by ${describeImportMatchReason(matchReason)}.` : 'Created job order and linked resolved client/contact.',
				matchReason
			)
		);

		const sourceId = toOptionalInt(row?.id);
		const externalId = toTrimmedString(row?.externalId);
		if (Number.isInteger(sourceId)) {
			jobOrderIdBySourceId.set(sourceId, saved.id);
		}
		if (externalId) {
			jobOrderIdByExternalId.set(externalId, saved.id);
		}
		const mappedRecordId = existing?.recordId || saved.recordId || createdRecordId;
		cacheJobOrder({
			id: saved.id,
			recordId: mappedRecordId,
			externalId,
			title
		});
	}

	for (const row of data.submissions) {
		const label = previewRowLabel('submissions', row);
		const candidateId = resolveTargetIdFromSource({
			sourceId: row?.candidateId,
			externalId: row?.candidateExternalId,
			sourceIdToRecordId: sourceCandidateIdToRecordId,
			externalIdToRecordId: sourceCandidateExternalIdToRecordId,
			targetIdBySourceId: candidateIdBySourceId,
			targetIdByExternalId: candidateIdByExternalId,
			targetIdByRecordId: candidateIdByRecordId
		}) || (toTrimmedString(row?.candidateEmail) ? candidateIdByEmail.get(normalizeLookupKey(row?.candidateEmail)) : null);
		const jobOrderId = resolveTargetIdFromSource({
			sourceId: row?.jobOrderId,
			externalId: row?.jobOrderExternalId,
			sourceIdToRecordId: sourceJobOrderIdToRecordId,
			externalIdToRecordId: sourceJobOrderExternalIdToRecordId,
			targetIdBySourceId: jobOrderIdBySourceId,
			targetIdByExternalId: jobOrderIdByExternalId,
			targetIdByRecordId: jobOrderIdByRecordId
		}) || (toTrimmedString(row?.jobOrderTitle) ? jobOrderIdByTitle.get(normalizeLookupKey(row?.jobOrderTitle)) : null);

		if (!candidateId || !jobOrderId) {
			summary.skipped.submissions += 1;
			pushEntityWarning('submissions', `Skipped ${label}: related candidate or job order could not be resolved.`);
			pushPreviewRow(summary.details, 'submissions', buildImportRow('skip', label, 'Related candidate or job order could not be resolved.'));
			continue;
		}

		const recordId = toTrimmedString(row?.recordId) || createRecordId('Submission');
		let existing = null;
		let matchReason = '';
		if (recordId) {
			existing = await tx.submission.findFirst({
				where: { recordId },
				select: { id: true }
			});
			if (existing) matchReason = 'record_id';
		}
		if (!existing) {
			existing = await tx.submission.findFirst({
				where: { AND: [{ candidateId }, { jobOrderId }] },
				select: { id: true }
			});
			if (existing) matchReason = 'candidate_job';
		}
		const payload = {
			status: toTrimmedString(row?.status) || 'submitted',
			notes: toTrimmedString(row?.notes),
			customFields: normalizeCustomFieldValues(row?.customFields),
			candidateId,
			jobOrderId,
			createdByUserId: actingUser.id
		};

		const saved = existing
			? await tx.submission.update({
				where: { id: existing.id },
				data: payload,
				select: { id: true }
			})
			: await tx.submission.create({
				data: {
					recordId,
					...payload
				},
				select: { id: true }
			});

		if (existing) summary.updated.submissions += 1;
		else summary.created.submissions += 1;
		pushPreviewRow(
			summary.details,
			'submissions',
			buildImportRow(
				existing ? 'update' : 'create',
				label,
				existing ? `Updated existing submission matched by ${describeImportMatchReason(matchReason)}.` : 'Created submission and linked resolved candidate/job order.',
				matchReason
			)
		);

		const sourceId = toOptionalInt(row?.id);
		const externalId = toTrimmedString(row?.externalId);
		if (Number.isInteger(sourceId)) {
			submissionIdBySourceId.set(sourceId, saved.id);
		}
		cacheSubmission({
			id: saved.id,
			recordId,
			externalId
		});
	}

	for (const row of data.interviews) {
		const label = previewRowLabel('interviews', row);
		const candidateId = resolveTargetIdFromSource({
			sourceId: row?.candidateId,
			externalId: row?.candidateExternalId,
			sourceIdToRecordId: sourceCandidateIdToRecordId,
			externalIdToRecordId: sourceCandidateExternalIdToRecordId,
			targetIdBySourceId: candidateIdBySourceId,
			targetIdByExternalId: candidateIdByExternalId,
			targetIdByRecordId: candidateIdByRecordId
		}) || (toTrimmedString(row?.candidateEmail) ? candidateIdByEmail.get(normalizeLookupKey(row?.candidateEmail)) : null);
		const jobOrderId = resolveTargetIdFromSource({
			sourceId: row?.jobOrderId,
			externalId: row?.jobOrderExternalId,
			sourceIdToRecordId: sourceJobOrderIdToRecordId,
			externalIdToRecordId: sourceJobOrderExternalIdToRecordId,
			targetIdBySourceId: jobOrderIdBySourceId,
			targetIdByExternalId: jobOrderIdByExternalId,
			targetIdByRecordId: jobOrderIdByRecordId
		}) || (toTrimmedString(row?.jobOrderTitle) ? jobOrderIdByTitle.get(normalizeLookupKey(row?.jobOrderTitle)) : null);
		if (!candidateId || !jobOrderId) {
			summary.skipped.interviews += 1;
			pushEntityWarning('interviews', `Skipped ${label}: related candidate or job order could not be resolved.`);
			pushPreviewRow(summary.details, 'interviews', buildImportRow('skip', label, 'Related candidate or job order could not be resolved.'));
			continue;
		}

		const recordId = toTrimmedString(row?.recordId) || createRecordId('Interview');
		const existing = await tx.interview.findUnique({
			where: { recordId },
			select: { id: true }
		});
		const payload = {
			interviewMode: toTrimmedString(row?.interviewMode) || 'formal',
			status: toTrimmedString(row?.status) || 'scheduled',
			subject: toTrimmedString(row?.subject) || `Interview - ${new Date().toISOString()}`,
			interviewer: toTrimmedString(row?.interviewer),
			interviewerEmail: toTrimmedString(row?.interviewerEmail),
			startsAt: toOptionalDate(row?.startsAt),
			endsAt: toOptionalDate(row?.endsAt),
			location: toTrimmedString(row?.location),
			videoLink: toTrimmedString(row?.videoLink),
			customFields: normalizeCustomFieldValues(row?.customFields),
			candidateId,
			jobOrderId
		};

		if (existing) {
			await tx.interview.update({
				where: { id: existing.id },
				data: payload
			});
			summary.updated.interviews += 1;
			pushPreviewRow(summary.details, 'interviews', buildImportRow('update', label, 'Updated existing interview matched by record ID.', 'record_id'));
		} else {
			await tx.interview.create({
				data: {
					recordId,
					...payload
				}
			});
			summary.created.interviews += 1;
			pushPreviewRow(summary.details, 'interviews', buildImportRow('create', label, 'Created interview and linked resolved candidate/job order.'));
		}
	}

	for (const row of data.placements) {
		const label = previewRowLabel('placements', row);
		const candidateId = resolveTargetIdFromSource({
			sourceId: row?.candidateId,
			externalId: row?.candidateExternalId,
			sourceIdToRecordId: sourceCandidateIdToRecordId,
			externalIdToRecordId: sourceCandidateExternalIdToRecordId,
			targetIdBySourceId: candidateIdBySourceId,
			targetIdByExternalId: candidateIdByExternalId,
			targetIdByRecordId: candidateIdByRecordId
		}) || (toTrimmedString(row?.candidateEmail) ? candidateIdByEmail.get(normalizeLookupKey(row?.candidateEmail)) : null);
		const jobOrderId = resolveTargetIdFromSource({
			sourceId: row?.jobOrderId,
			externalId: row?.jobOrderExternalId,
			sourceIdToRecordId: sourceJobOrderIdToRecordId,
			externalIdToRecordId: sourceJobOrderExternalIdToRecordId,
			targetIdBySourceId: jobOrderIdBySourceId,
			targetIdByExternalId: jobOrderIdByExternalId,
			targetIdByRecordId: jobOrderIdByRecordId
		}) || (toTrimmedString(row?.jobOrderTitle) ? jobOrderIdByTitle.get(normalizeLookupKey(row?.jobOrderTitle)) : null);
		if (!candidateId || !jobOrderId) {
			summary.skipped.placements += 1;
			pushEntityWarning('placements', `Skipped ${label}: related candidate or job order could not be resolved.`);
			pushPreviewRow(summary.details, 'placements', buildImportRow('skip', label, 'Related candidate or job order could not be resolved.'));
			continue;
		}

		const submissionId = resolveTargetIdFromSource({
			sourceId: row?.submissionId,
			externalId: row?.submissionExternalId,
			sourceIdToRecordId: sourceSubmissionIdToRecordId,
			externalIdToRecordId: sourceSubmissionExternalIdToRecordId,
			targetIdBySourceId: submissionIdBySourceId,
			targetIdByExternalId: submissionIdByExternalId,
			targetIdByRecordId: submissionIdByRecordId
		});
		const recordId = toTrimmedString(row?.recordId) || createRecordId('Offer');
		const existing = await tx.offer.findUnique({
			where: { recordId },
			select: { id: true }
		});
		const payload = {
			status: toTrimmedString(row?.status) || 'planned',
			placementType: toTrimmedString(row?.placementType) || 'temp',
			compensationType: toTrimmedString(row?.compensationType) || 'hourly',
			currency: toTrimmedString(row?.currency) || 'USD',
			offeredOn: toOptionalDate(row?.offeredOn),
			expectedJoinDate: toOptionalDate(row?.expectedJoinDate),
			endDate: toOptionalDate(row?.endDate),
			notes: toTrimmedString(row?.notes),
			yearlyCompensation: toOptionalNumber(row?.yearlyCompensation),
			hourlyRtBillRate: toOptionalNumber(row?.hourlyRtBillRate),
			hourlyRtPayRate: toOptionalNumber(row?.hourlyRtPayRate),
			hourlyOtBillRate: toOptionalNumber(row?.hourlyOtBillRate),
			hourlyOtPayRate: toOptionalNumber(row?.hourlyOtPayRate),
			dailyBillRate: toOptionalNumber(row?.dailyBillRate),
			dailyPayRate: toOptionalNumber(row?.dailyPayRate),
			customFields: normalizeCustomFieldValues(row?.customFields),
			candidateId,
			jobOrderId,
			submissionId: submissionId || null
		};

		if (existing) {
			await tx.offer.update({
				where: { id: existing.id },
				data: payload
			});
			summary.updated.placements += 1;
			pushPreviewRow(summary.details, 'placements', buildImportRow('update', label, 'Updated existing placement matched by record ID.', 'record_id'));
		} else {
			await tx.offer.create({
				data: {
					recordId,
					...payload
				}
			});
			summary.created.placements += 1;
			pushPreviewRow(summary.details, 'placements', buildImportRow('create', label, 'Created placement and linked resolved candidate/job order/submission.'));
		}
	}

	return summary;
}

async function importCandidateAttachments(db, candidateAttachments, actingUser, attachmentContext = null) {
	const summary = {
		created: 0,
		skipped: 0,
		errors: []
	};

	if (!Array.isArray(candidateAttachments) || candidateAttachments.length <= 0) {
		return summary;
	}

	const candidateIdBySourceId = new Map(
		Object.entries(attachmentContext?.candidateIdBySourceId || {})
			.map(([key, value]) => [Number(key), Number(value)])
			.filter(([sourceId, candidateId]) => Number.isInteger(sourceId) && Number.isInteger(candidateId))
	);
	const candidateIdByEmail = new Map(
		Object.entries(attachmentContext?.candidateIdByEmail || {})
			.map(([key, value]) => [normalizeLookupKey(key), Number(value)])
			.filter(([emailKey, candidateId]) => Boolean(emailKey) && Number.isInteger(candidateId))
	);

	const candidateEmails = Array.from(
		new Set(candidateAttachments.map((item) => normalizeLookupKey(item?.candidateEmail)).filter(Boolean))
	);
	const candidates = candidateEmails.length > 0
		? await db.candidate.findMany({
			where: {
				email: {
					in: candidateAttachments.map((item) => toTrimmedString(item?.candidateEmail)).filter(Boolean)
				}
			},
			select: { id: true, email: true }
		})
		: [];
	for (const candidate of candidates) {
		const emailKey = normalizeLookupKey(candidate.email);
		if (emailKey && !candidateIdByEmail.has(emailKey)) {
			candidateIdByEmail.set(emailKey, candidate.id);
		}
	}

	for (const attachment of candidateAttachments) {
		const sourceCandidateId = toOptionalInt(attachment?.candidateId);
		const emailKey = normalizeLookupKey(attachment?.candidateEmail);
		const candidateId =
			(Number.isInteger(sourceCandidateId) ? candidateIdBySourceId.get(sourceCandidateId) : null)
			|| (emailKey ? candidateIdByEmail.get(emailKey) : null);
		if (!candidateId) {
			summary.skipped += 1;
			if (summary.errors.length < 200) {
				summary.errors.push(
					`Skipped candidate attachment "${attachment?.fileName || 'Unnamed file'}": candidate could not be resolved by Bullhorn candidate ID or email.`
				);
			}
			continue;
		}

		const fileName = toTrimmedString(attachment?.fileName);
		if (!fileName || !isAllowedCandidateAttachmentFileName(fileName)) {
			summary.skipped += 1;
			continue;
		}
		const contentType = toTrimmedString(attachment?.contentType) || 'application/octet-stream';
		if (!isAllowedCandidateAttachmentContentType(fileName, contentType)) {
			summary.skipped += 1;
			continue;
		}

		const existing = await db.candidateAttachment.findFirst({
			where: {
				candidateId,
				fileName
			},
			select: { id: true }
		});
		if (existing) {
			summary.skipped += 1;
			continue;
		}

		try {
			const storageKey = buildCandidateAttachmentStorageKey(candidateId, fileName);
			const uploaded = await uploadObjectBuffer({
				key: storageKey,
				body: attachment.buffer,
				contentType
			});
			const resumeSearchText = attachment.isResume
				? await deriveResumeSearchTextFromBuffer({
					buffer: attachment.buffer,
					fileName,
					contentType
				})
				: '';

			await db.$transaction(async (tx) => {
				if (attachment.isResume) {
					await tx.candidateAttachment.updateMany({
						where: {
							candidateId,
							isResume: true
						},
						data: { isResume: false }
					});
				}

				await tx.candidateAttachment.create({
					data: {
						recordId: createRecordId('CandidateAttachment'),
						candidateId,
						fileName,
						isResume: Boolean(attachment.isResume),
						contentType,
						sizeBytes: Number(attachment.buffer?.length || 0),
						storageProvider: uploaded.storageProvider,
						storageBucket: uploaded.storageBucket,
						storageKey: uploaded.storageKey,
						uploadedByUserId: actingUser?.id || null
					}
				});

				if (attachment.isResume) {
					await tx.candidate.update({
						where: { id: candidateId },
						data: { resumeSearchText: resumeSearchText || null }
					});
				}
			});

			summary.created += 1;
		} catch (error) {
			summary.skipped += 1;
			if (summary.errors.length < 200) {
				summary.errors.push(
					`Skipped candidate attachment "${fileName}": ${error?.message || 'upload failed.'}`
				);
			}
		}
	}

	return summary;
}

function handleError(error) {
	if (error instanceof AccessControlError) {
		return NextResponse.json({ error: error.message }, { status: error.status });
	}
	if (error instanceof ImportValidationError) {
		return NextResponse.json({ error: error.message }, { status: error.status || 400 });
	}
	return NextResponse.json({ error: 'Failed to import data.' }, { status: 500 });
}

export async function runAdminDataImportWithFormData({ req, actingUser, formData, throttleKey = 'admin.data_import.post' }) {
	if (actingUser?.role !== 'ADMINISTRATOR') {
		throw new AccessControlError('Only administrators can import data.', 403);
	}

	const mode = parseMode(formData.get('mode'));
	const file = formData.get('file');
	const sourceType = parseSourceType(formData.get('sourceType'));
	const isGenericCsvSource =
		sourceType === 'generic_csv' ||
		sourceType === 'generic_csv_manual' ||
		sourceType === 'generic_csv_zip';
	const isBullhornBatchSource =
		sourceType === 'bullhorn_csv_manual' ||
		sourceType === 'bullhorn_csv_zip';
	const isZohoBatchSource =
		sourceType === 'zoho_recruit_manual' ||
		sourceType === 'zoho_recruit_zip';
	const genericBatch = isGenericCsvSource && formData.get('genericBatch')
		? parseGenericBatchManifest(formData.get('genericBatch'))
		: null;
	const genericEntity = isGenericCsvSource && !genericBatch
		? parseGenericEntityProfile(formData.get('genericEntity'))
		: null;
	const genericMapping = isGenericCsvSource && !genericBatch
		? parseGenericMapping(formData.get('genericMapping'))
		: null;
	const bullhornBatch = isBullhornBatchSource && formData.get('bullhornBatch')
		? parseBullhornBatchManifest(formData.get('bullhornBatch'))
		: null;
	const zohoBatch = isZohoBatchSource && formData.get('zohoBatch')
		? parseZohoBatchManifest(formData.get('zohoBatch'))
		: null;
	const bullhornEntity = sourceType === 'bullhorn_csv'
		? parseBullhornEntityProfile(formData.get('bullhornEntity'))
		: null;
	const zohoEntity = sourceType === 'zoho_recruit_csv'
		? parseZohoEntityProfile(formData.get('zohoEntity'))
		: null;
	let parsedImport;
	let candidateAttachments = [];
	if (isGenericCsvSource) {
		parsedImport = genericBatch
			? await parseUploadedGenericCsvEntries(genericBatch, formData)
			: await parseUploadedGenericCsvEntries(
				[
					{
						id: 'legacy',
						entity: genericEntity,
						mapping: genericMapping,
						fileField: 'file'
					}
				],
				formData
			);
	} else if (isBullhornBatchSource) {
		parsedImport = await parseUploadedBullhornCsvEntries(bullhornBatch, formData);
		if (sourceType === 'bullhorn_csv_zip') {
			if (formData.get('bullhornCandidateAttachments')) {
				candidateAttachments = await parseBullhornCandidateAttachmentsFromFormData(
					formData.get('bullhornCandidateAttachments'),
					formData
				);
			} else if (formData.get('bullhornZipFile')) {
				candidateAttachments = await parseBullhornCandidateFilesFromZip(formData.get('bullhornZipFile'));
			}
		}
	} else if (sourceType === 'bullhorn_csv') {
		parsedImport = await parseUploadedBullhornCsvFile(file, bullhornEntity);
	} else if (isZohoBatchSource) {
		parsedImport = await parseUploadedZohoCsvEntries(zohoBatch, formData);
	} else if (sourceType === 'zoho_recruit_csv') {
		parsedImport = await parseUploadedZohoCsvFile(file, zohoEntity);
	} else {
		parsedImport = await parseUploadedHireGnomeImportFile(file);
	}
	const preview = await buildImportPreview(prisma, parsedImport.data, actingUser);
	if (mode === 'preview') {
		return NextResponse.json({
			mode,
			sourceType,
			genericEntity,
			bullhornEntity,
			zohoEntity,
			format: parsedImport.format,
			preview
		});
	}

	if (throttleKey) {
		const mutationThrottleResponse = await enforceMutationThrottle(req, throttleKey);
		if (mutationThrottleResponse) {
			return mutationThrottleResponse;
		}
	}

	const imported = await prisma.$transaction((tx) => importData(tx, parsedImport.data, actingUser));
	const attachmentContext = imported?._attachmentContext || null;
	// Keep response payload clean; this is only needed for same-request attachment resolution.
	delete imported._attachmentContext;
	if (candidateAttachments.length > 0) {
		imported.files = {
			candidateAttachments: await importCandidateAttachments(prisma, candidateAttachments, actingUser, attachmentContext)
		};
		if (Array.isArray(imported.files.candidateAttachments?.errors) && imported.files.candidateAttachments.errors.length > 0) {
			imported.errors = [...(imported.errors || []), ...imported.files.candidateAttachments.errors];
		}
	}
	return NextResponse.json({
		mode,
		sourceType,
		genericEntity,
		bullhornEntity,
		zohoEntity,
		format: parsedImport.format,
		preview,
		result: imported
	});
}

async function postAdmin_data_importHandler(req) {
	const actingUser = await getActingUser(req, { allowFallback: false });
	const formData = await req.formData();
	return runAdminDataImportWithFormData({
		req,
		actingUser,
		formData,
		throttleKey: 'admin.data_import.post'
	});
}

async function routeHandler(req) {
	try {
		return await postAdmin_data_importHandler(req);
	} catch (error) {
		return handleError(error);
	}
}

export const POST = withApiLogging('admin.data_import.post', routeHandler);
