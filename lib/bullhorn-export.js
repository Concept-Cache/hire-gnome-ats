import path from 'node:path';
import JSZip from 'jszip';
import {
	CANDIDATE_ATTACHMENT_ALLOWED_EXTENSIONS,
	CANDIDATE_ATTACHMENT_MAX_BYTES,
	RESUME_UPLOAD_ALLOWED_EXTENSIONS
} from '@/lib/candidate-attachment-options';

const AUTHORIZE_URL = 'https://auth.bullhornstaffing.com/oauth/authorize';
const TOKEN_URL = 'https://auth.bullhornstaffing.com/oauth/token';
const REST_LOGIN_URL = 'https://rest.bullhornstaffing.com/rest-services/login';
const DEFAULT_SAMPLE_LIMIT = 10;
const MAX_SAMPLE_LIMIT = 100;

const BULLHORN_CORE_ENTITY_ORDER = Object.freeze([
	'clients',
	'contacts',
	'candidates',
	'jobOrders',
	'submissions',
	'interviews',
	'placements'
]);

const BULLHORN_METADATA_ENTITY_ORDER = Object.freeze([
	'candidateNotes',
	'candidateEducations',
	'candidateWorkExperiences',
	'contactNotes'
]);

export const BULLHORN_EXPORT_ENTITY_ORDER = Object.freeze([
	...BULLHORN_CORE_ENTITY_ORDER,
	...BULLHORN_METADATA_ENTITY_ORDER
]);

export const BULLHORN_EXPORT_ALL_ENTITY_ORDER = Object.freeze([
	'customFieldDefinitions',
	...BULLHORN_EXPORT_ENTITY_ORDER
]);

export const BULLHORN_CANDIDATE_FILES_MANIFEST_NAME = '12-candidate-files.csv';
export const BULLHORN_CANDIDATE_FILES_MANIFEST_LEGACY_NAMES = Object.freeze([
	'08-candidate-files.csv',
	BULLHORN_CANDIDATE_FILES_MANIFEST_NAME
]);

const ENTITY_FILE_NAMES = Object.freeze({
	customFieldDefinitions: '00-custom-field-definitions.csv',
	clients: '01-clients.csv',
	contacts: '02-contacts.csv',
	candidates: '03-candidates.csv',
	jobOrders: '04-job-orders.csv',
	submissions: '05-submissions.csv',
	interviews: '06-interviews.csv',
	placements: '07-placements.csv',
	candidateNotes: '08-candidate-notes.csv',
	candidateEducations: '09-candidate-educations.csv',
	candidateWorkExperiences: '10-candidate-work-experiences.csv',
	contactNotes: '11-contact-notes.csv'
});

const CANDIDATE_ATTACHMENT_ALLOWED_EXTENSION_SET = new Set(
	CANDIDATE_ATTACHMENT_ALLOWED_EXTENSIONS.map((value) => String(value || '').toLowerCase())
);
const RESUME_ALLOWED_EXTENSION_SET = new Set(
	RESUME_UPLOAD_ALLOWED_EXTENSIONS.map((value) => String(value || '').toLowerCase())
);

const BASE_QUERY_FIELDS = Object.freeze({
	clients: 'id,name,dateAdded,dateLastModified',
	contacts: 'id,firstName,lastName,email,phone,clientCorporation(id,name)',
	candidates: 'id,firstName,lastName,email,phone,mobile,status,occupation,dateAdded,dateLastModified',
	jobOrders: 'id,title,status,employmentType,numOpenings,dateAdded,dateLastModified,clientCorporation(id,name),clientContact(id,firstName,lastName,email)',
	submissions: 'id,status,dateAdded,dateLastModified,candidate(id,firstName,lastName,email),jobOrder(id,title,clientCorporation(id,name),clientContact(id,firstName,lastName,email))',
	interviews: 'id,type,dateAdded,dateLastModified,dateBegin,dateEnd,description,jobSubmission(id,candidate(id,firstName,lastName,email),jobOrder(id,title,clientCorporation(id,name),clientContact(id,firstName,lastName,email)))',
	placements: 'id,status,dateAdded,dateLastModified,candidate(id,firstName,lastName,email),jobOrder(id,title,clientCorporation(id,name),clientContact(id,firstName,lastName,email)),jobSubmission(id),employmentType,salary',
	candidateEducations: 'id,school,degree,major,startDate,endDate,comments,candidate(id,firstName,lastName,email)',
	candidateWorkExperiences: 'id,companyName,title,startDate,endDate,comments,candidate(id,firstName,lastName,email)'
});

const ENTITY_ENDPOINTS = Object.freeze({
	clients: 'ClientCorporation',
	contacts: 'ClientContact',
	candidates: 'Candidate',
	jobOrders: 'JobOrder',
	submissions: 'JobSubmission',
	interviews: 'Appointment',
	placements: 'Placement',
	candidateEducations: 'CandidateEducation',
	candidateWorkExperiences: 'CandidateWorkHistory'
});

const MODULE_KEY_BY_ENTITY = Object.freeze({
	clients: 'clients',
	contacts: 'contacts',
	candidates: 'candidates',
	jobOrders: 'jobOrders',
	submissions: 'submissions',
	interviews: 'interviews',
	placements: 'placements'
});

export class BullhornExportValidationError extends Error {
	constructor(message, status = 400) {
		super(message);
		this.name = 'BullhornExportValidationError';
		this.status = status;
	}
}

export class BullhornExportCancelledError extends Error {
	constructor(message = 'Bullhorn export was cancelled.') {
		super(message);
		this.name = 'BullhornExportCancelledError';
	}
}

function toTrimmedString(value) {
	const normalized = String(value ?? '').trim();
	return normalized || '';
}

function parseDateInput(value, label) {
	const raw = String(value || '').trim();
	if (!raw) {
		throw new BullhornExportValidationError(`${label} is required.`);
	}
	const parsed = new Date(raw);
	if (Number.isNaN(parsed.getTime())) {
		throw new BullhornExportValidationError(`${label} is invalid.`);
	}
	return parsed;
}

function parsePositiveInt(value, fallback = DEFAULT_SAMPLE_LIMIT) {
	if (value == null || value === '') return fallback;
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed <= 0) {
		throw new BullhornExportValidationError('Sample limit must be a positive whole number.');
	}
	return Math.min(parsed, MAX_SAMPLE_LIMIT);
}

function normalizeCustomFieldKey(value) {
	return String(value || '')
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '')
		.slice(0, 64);
}

function makeUniqueFieldKey(candidate, usedKeys, fallbackBase = 'custom_field') {
	const base = normalizeCustomFieldKey(candidate) || fallbackBase;
	let nextKey = base;
	let index = 2;
	while (usedKeys.has(nextKey)) {
		nextKey = `${base}_${index}`;
		index += 1;
	}
	usedKeys.add(nextKey);
	return nextKey;
}

function isBullhornCustomFieldName(value) {
	return String(value || '').trim().toLowerCase().startsWith('custom');
}

function normalizeBullhornCustomFieldType(field) {
	const dataType = String(field?.dataType || '').trim().toLowerCase();
	if (Array.isArray(field?.options) && field.options.length > 0) return 'select';
	if (dataType.includes('timestamp') || dataType.includes('date')) return 'date';
	if (dataType.includes('boolean')) return 'boolean';
	if (
		dataType.includes('int') ||
		dataType.includes('long') ||
		dataType.includes('double') ||
		dataType.includes('decimal') ||
		dataType.includes('bigdecimal')
	) {
		return 'number';
	}
	if (dataType.includes('string') && Number(field?.maxLength || 0) > 255) return 'textarea';
	return 'text';
}

function isMeaningfulBullhornCustomFieldLabel(field) {
	const name = String(field?.name || '').trim();
	const label = String(field?.label || '').trim();
	if (!label) return false;
	const normalizedLabel = label.toLowerCase();
	const normalizedName = name.toLowerCase();
	if (normalizedLabel === normalizedName) return false;
	if (/^custom(?:\s|_)*(text|int|integer|float|double|date|bool|boolean|encrypted text|bill rate|pay rate)\b/i.test(label)) {
		return false;
	}
	return true;
}

function coerceBullhornCustomFieldValue(field, value) {
	if (value == null) return '';
	if (Array.isArray(value)) {
		return value
			.map((item) => coerceBullhornCustomFieldValue(field, item))
			.filter(Boolean)
			.join('; ');
	}
	if (typeof value === 'object') {
		return firstNonEmpty(value.label, value.name, value.value, value.id);
	}
	if (typeof value === 'boolean') return value ? 'true' : 'false';
	const fieldType = normalizeBullhornCustomFieldType(field);
	if (fieldType === 'date') {
		const numericValue = Number(value);
		if (Number.isFinite(numericValue)) {
			return compactIso(numericValue) || dateOnly(numericValue) || String(value);
		}
		return compactIso(value) || dateOnly(value) || String(value);
	}
	return String(value).trim();
}

function buildCustomColumnLabel(definition) {
	return `Custom: ${definition.label} [${definition.fieldKey}]`;
}

function encodeCsvValue(value) {
	const raw = value == null ? '' : String(value);
	if (/[",\n]/.test(raw)) {
		return `"${raw.replace(/"/g, '""')}"`;
	}
	return raw;
}

function buildCsv(rows) {
	if (!rows.length) return '';
	const headers = Object.keys(rows[0]);
	const lines = [headers.map(encodeCsvValue).join(',')];
	for (const row of rows) {
		lines.push(headers.map((header) => encodeCsvValue(row[header])).join(','));
	}
	return `${lines.join('\n')}\n`;
}

function compactIso(value) {
	if (!value) return '';
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return '';
	return parsed.toISOString().replace('.000Z', 'Z');
}

function dateOnly(value) {
	if (!value) return '';
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return '';
	return parsed.toISOString().slice(0, 10);
}

function toEpochMs(date) {
	return new Date(date).getTime();
}

function uniqueById(records) {
	const map = new Map();
	for (const record of records) {
		if (record?.id == null) continue;
		map.set(Number(record.id), record);
	}
	return [...map.values()];
}

function mergeRecordIntoMap(map, record) {
	if (!record?.id && record?.id !== 0) return;
	map.set(Number(record.id), record);
}

function cleanZipPathSegment(value, fallback = 'file') {
	return (
		String(value || '')
			.trim()
			.replace(/[^a-zA-Z0-9._-]+/g, '-')
			.replace(/-+/g, '-')
			.replace(/^-|-$/g, '') || fallback
	);
}

function attachmentExtension(name, fileExtension = '') {
	const parsedExtension = path.extname(String(name || '')).toLowerCase();
	if (parsedExtension) return parsedExtension;
	const normalized = String(fileExtension || '').trim().toLowerCase().replace(/^\.+/, '');
	return normalized ? `.${normalized}` : '';
}

function attachmentDisplayName(attachment) {
	const name = String(attachment?.name || '').trim();
	if (name) return name;
	const extension = attachmentExtension('', attachment?.fileExtension);
	return `attachment-${attachment?.id || 'file'}${extension || '.bin'}`;
}

function inferExportAttachmentContentType(fileName) {
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

function normalizeExportAttachmentContentType(fileName, ...candidates) {
	for (const candidate of candidates) {
		const normalized = String(candidate || '').trim().toLowerCase();
		if (normalized && normalized.includes('/')) {
			return normalized;
		}
	}
	return inferExportAttachmentContentType(fileName);
}

function isAllowedCandidateAttachment(attachment) {
	const extension = attachmentExtension(attachment?.name, attachment?.fileExtension);
	return CANDIDATE_ATTACHMENT_ALLOWED_EXTENSION_SET.has(extension);
}

function isLikelyResumeAttachment(attachment) {
	const name = attachmentDisplayName(attachment).toLowerCase();
	const extension = attachmentExtension(attachment?.name, attachment?.fileExtension);
	if (/\b(resume|résumé|cv|curriculum-vitae|curriculum vitae)\b/.test(name)) return true;
	return RESUME_ALLOWED_EXTENSION_SET.has(extension);
}

function compareAttachmentPriority(a, b) {
	const aResume = isLikelyResumeAttachment(a) ? 1 : 0;
	const bResume = isLikelyResumeAttachment(b) ? 1 : 0;
	if (aResume !== bResume) return bResume - aResume;
	const aUpdated = new Date(a?.dateLastModified || a?.dateAdded || 0).getTime();
	const bUpdated = new Date(b?.dateLastModified || b?.dateAdded || 0).getTime();
	if (aUpdated !== bUpdated) return bUpdated - aUpdated;
	return Number(b?.id || 0) - Number(a?.id || 0);
}

function firstNonEmpty(...values) {
	for (const value of values) {
		if (value == null) continue;
		const normalized = String(value).trim();
		if (normalized) return normalized;
	}
	return '';
}

function employmentTypeToPlacementType(value) {
	const normalized = String(value || '').trim().toLowerCase();
	if (!normalized) return '';
	if (normalized.includes('perm')) return 'Perm';
	if (normalized.includes('direct')) return 'Perm';
	if (normalized.includes('contract')) return 'Contract';
	if (normalized.includes('temp')) return 'Temp';
	return value;
}

function placementCompType(placement) {
	const salary = Number(placement?.salary || 0);
	if (Number.isFinite(salary) && salary > 0) return 'Salary';
	return 'Hourly';
}

function bullhornMetadataRecordId(prefix, value) {
	const normalized = Number(value);
	if (!Number.isFinite(normalized) || normalized <= 0) return '';
	return `BH-${prefix}-${normalized}`;
}

function exportFileName(dateTo) {
	const stamp = new Date(dateTo).toISOString().replace(/[:.]/g, '-');
	return `bullhorn-export-${stamp}.zip`;
}

function normalizeRestUrl(restUrl) {
	return String(restUrl || '').endsWith('/') ? String(restUrl) : `${restUrl}/`;
}

async function parseJsonResponse(response, context) {
	if (!response.ok) {
		const text = await response.text().catch(() => '');
		throw new Error(`${context} failed (${response.status}): ${text || response.statusText}`);
	}
	return response.json();
}

async function authorizeBullhorn({ username, password, clientId, clientSecret }) {
	const authorize = new URL(AUTHORIZE_URL);
	authorize.searchParams.set('client_id', clientId);
	authorize.searchParams.set('response_type', 'code');
	authorize.searchParams.set('username', username);
	authorize.searchParams.set('password', password);
	authorize.searchParams.set('action', 'Login');

	const authorizeRes = await fetch(authorize, { redirect: 'follow', cache: 'no-store' });
	const location = authorizeRes.headers.get('location') || authorizeRes.url || '';
	const code = new URL(location, 'https://bullhorn.local').searchParams.get('code');
	if (!code) {
		throw new BullhornExportValidationError('Bullhorn authorization failed. Could not obtain an authorization code.', 502);
	}

	const token = new URL(TOKEN_URL);
	token.searchParams.set('grant_type', 'authorization_code');
	token.searchParams.set('code', code);
	token.searchParams.set('client_id', clientId);
	token.searchParams.set('client_secret', clientSecret);
	const tokenRes = await fetch(token, { method: 'POST', cache: 'no-store' });
	const tokenJson = await parseJsonResponse(tokenRes, 'Bullhorn token exchange');

	const restLogin = new URL(REST_LOGIN_URL);
	restLogin.searchParams.set('version', '*');
	restLogin.searchParams.set('access_token', tokenJson.access_token);
	const loginRes = await fetch(restLogin, { cache: 'no-store' });
	const loginJson = await parseJsonResponse(loginRes, 'Bullhorn REST login');

	return {
		restUrl: normalizeRestUrl(loginJson.restUrl),
		bhRestToken: loginJson.BhRestToken
	};
}

async function bullhornGet(session, path, params = {}) {
	const url = new URL(path, session.restUrl);
	url.searchParams.set('BhRestToken', session.bhRestToken);
	for (const [key, value] of Object.entries(params)) {
		if (value == null || value === '') continue;
		url.searchParams.set(key, String(value));
	}
	const response = await fetch(url, { cache: 'no-store' });
	return parseJsonResponse(response, `Bullhorn request ${path}`);
}

async function bullhornDownloadBuffer(session, path) {
	const url = new URL(path, session.restUrl);
	url.searchParams.set('BhRestToken', session.bhRestToken);
	const response = await fetch(url, { cache: 'no-store' });
	if (!response.ok) {
		const text = await response.text().catch(() => '');
		throw new Error(`${path} failed (${response.status}): ${text || response.statusText}`);
	}
	return {
		buffer: Buffer.from(await response.arrayBuffer()),
		contentType: response.headers.get('content-type') || 'application/octet-stream'
	};
}

async function fetchEntityMetadata(session, entityKey) {
	const entityName = ENTITY_ENDPOINTS[entityKey];
	const payload = await bullhornGet(session, `meta/${entityName}`, {
		fields: '*'
	});
	return Array.isArray(payload?.fields) ? payload.fields : [];
}

async function listCandidateFileAttachments(session, candidateId) {
	if (!candidateId) return [];
	const fields = 'id,name,fileExtension,type,description,contentType,dateAdded,dateLastModified';
	try {
		const payload = await bullhornGet(session, `entity/Candidate/${candidateId}/fileAttachments`, { fields });
		return (
			(Array.isArray(payload?.data) && payload.data) ||
			(Array.isArray(payload?.fileAttachments) && payload.fileAttachments) ||
			(Array.isArray(payload) && payload) ||
			[]
		);
	} catch {
		try {
			const payload = await bullhornGet(session, `entityFiles/Candidate/${candidateId}`, { fields });
			return (
				(Array.isArray(payload?.data) && payload.data) ||
				(Array.isArray(payload?.EntityFiles) && payload.EntityFiles) ||
				(Array.isArray(payload) && payload) ||
				[]
			);
		} catch {
			return [];
		}
	}
}

function buildCustomFieldDefinitions(entityKey, fields) {
	const moduleKey = MODULE_KEY_BY_ENTITY[entityKey];
	if (!moduleKey) return [];
	const usedKeys = new Set();
	return fields
		.filter((field) => isBullhornCustomFieldName(field?.name))
		.map((field) => {
			const name = String(field?.name || '').trim();
			const label = String(field?.label || '').trim() || name;
			return {
				moduleKey,
				bullhornFieldName: name,
				label,
				fieldKey: makeUniqueFieldKey(label, usedKeys, normalizeCustomFieldKey(name) || 'custom_field'),
				fieldType: normalizeBullhornCustomFieldType(field),
				selectOptions: Array.isArray(field?.options)
					? field.options.map((option) => String(option?.label || option?.value || '').trim()).filter(Boolean)
					: [],
				helpText: `Bullhorn field ${name}${field?.confidential ? ' (confidential)' : ''}`.trim(),
				isRequired: false,
				isActive: true,
				sortOrder: 0,
				labelIsMeaningful: isMeaningfulBullhornCustomFieldLabel(field)
			};
		});
}

function buildCandidateSkillFieldNames(fields) {
	const prioritized = ['skillNameList', 'primarySkills', 'secondarySkills', 'skills', 'skillList'];
	const allFields = Array.isArray(fields) ? fields : [];
	const names = new Set(allFields.map((field) => String(field?.name || '').trim()).filter(Boolean));
	const prioritizedMatches = prioritized.filter((name) => names.has(name));
	const additionalMatches = allFields
		.filter((field) => {
			const name = String(field?.name || '').trim();
			const label = String(field?.label || '').trim();
			if (!name) return false;
			if (prioritized.includes(name)) return false;
			return /skill/i.test(name) || /skill/i.test(label);
		})
		.map((field) => String(field?.name || '').trim())
		.filter(Boolean);
	return uniqueSkillValues([...prioritizedMatches, ...additionalMatches]);
}

function normalizeSkillToken(value) {
	return String(value || '').trim();
}

function normalizeSkillLookupKey(value) {
	return normalizeSkillToken(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function uniqueSkillValues(values) {
	const seen = new Set();
	const result = [];
	for (const rawValue of Array.isArray(values) ? values : []) {
		const value = normalizeSkillToken(rawValue);
		if (!value) continue;
		const key = normalizeSkillLookupKey(value);
		if (!key || seen.has(key)) continue;
		seen.add(key);
		result.push(value);
	}
	return result;
}

function splitSkillText(value) {
	const normalized = normalizeSkillToken(value);
	if (!normalized) return [];
	return normalized.split(/[,;|\n/]+/).map((item) => normalizeSkillToken(item)).filter(Boolean);
}

function coerceBullhornSkillValues(value) {
	if (value == null) return [];
	if (Array.isArray(value)) {
		return value.flatMap((item) => coerceBullhornSkillValues(item));
	}
	if (typeof value === 'object') {
		return coerceBullhornSkillValues(firstNonEmpty(value.label, value.name, value.value));
	}
	return splitSkillText(value);
}

function buildBullhornCandidateSkillValue(candidate) {
	const fieldNames = Array.isArray(candidate?.__candidateSkillFieldNames)
		? candidate.__candidateSkillFieldNames
		: [];
	const values = uniqueSkillValues(
		fieldNames.flatMap((fieldName) => coerceBullhornSkillValues(candidate?.[fieldName]))
	);
	return values.join('; ');
}

function buildQueryFields(entityKey, customDefinitions, additionalFields = []) {
	const baseFields = BASE_QUERY_FIELDS[entityKey];
	const customFieldNames = customDefinitions
		.map((definition) => definition.bullhornFieldName)
		.filter(Boolean);
	const extraNames = Array.isArray(additionalFields) ? additionalFields.filter(Boolean) : [];
	return uniqueSkillValues([baseFields, ...customFieldNames, ...extraNames]).join(',');
}

async function fetchQueryRecords(session, entityName, where, fields, count) {
	const payload = await bullhornGet(session, `query/${entityName}`, {
		where,
		fields,
		count,
		start: 0
	});
	return Array.isArray(payload?.data) ? payload.data : [];
}

async function fetchSearchRecords(session, entityName, query, fields, count) {
	return fetchSearchRecordsPaged(session, entityName, query, fields, count, 0);
}

async function fetchSearchRecordsPaged(session, entityName, query, fields, count, start = 0) {
	const payload = await bullhornGet(session, `search/${entityName}`, {
		query,
		fields,
		count,
		start
	});
	return Array.isArray(payload?.data) ? payload.data : [];
}

async function fetchChangedQueryEntity(session, entityKey, { fromDate, toDate, extraWhere = '' }, limit, fields) {
	const fromMs = toEpochMs(fromDate);
	const toMs = toEpochMs(toDate);
	const entityName = ENTITY_ENDPOINTS[entityKey];
	const wherePrefix = extraWhere ? `${extraWhere} AND ` : '';
	const [added, modified] = await Promise.all([
		fetchQueryRecords(session, entityName, `${wherePrefix}dateAdded>=${fromMs} AND dateAdded<=${toMs}`, fields, limit),
		fetchQueryRecords(session, entityName, `${wherePrefix}dateLastModified>=${fromMs} AND dateLastModified<=${toMs}`, fields, limit)
	]);
	return uniqueById([...added, ...modified]).slice(0, limit);
}

async function fetchChangedCandidates(session, { fromDate, toDate }, limit, fields) {
	const fromMs = toEpochMs(fromDate);
	const toMs = toEpochMs(toDate);
	const [added, modified] = await Promise.all([
		fetchSearchRecords(session, 'Candidate', `dateAdded:[${fromMs} TO ${toMs}]`, fields, limit),
		fetchSearchRecords(session, 'Candidate', `dateLastModified:[${fromMs} TO ${toMs}]`, fields, limit)
	]);
	return uniqueById([...added, ...modified]).slice(0, limit);
}

async function fetchChangedNotes(session, { fromDate, toDate }, limit) {
	const fromMs = toEpochMs(fromDate);
	const toMs = toEpochMs(toDate);
	const fields = [
		'id',
		'comments',
		'action',
		'dateAdded',
		'dateLastModified',
		'candidates(id,firstName,lastName,email)',
		'clientContacts(id,firstName,lastName,email)'
	].join(',');
	const pageSize = Math.max(Math.min(limit * 6, 200), 50);
	const noteMap = new Map();

	for (const query of [`dateAdded:[${fromMs} TO ${toMs}]`, `dateLastModified:[${fromMs} TO ${toMs}]`]) {
		let start = 0;
		for (let page = 0; page < 5; page += 1) {
			const records = await fetchSearchRecordsPaged(session, 'Note', query, fields, pageSize, start);
			if (!Array.isArray(records) || records.length <= 0) break;
			for (const record of records) {
				if (record?.id != null) {
					noteMap.set(Number(record.id), record);
				}
			}
			if (records.length < pageSize) break;
			start += pageSize;
		}
	}

	return [...noteMap.values()];
}

async function fetchEntityById(session, entityKey, id, fields) {
	if (!id && id !== 0) return null;
	const entityName = ENTITY_ENDPOINTS[entityKey];
	const payload = await bullhornGet(session, `entity/${entityName}/${id}`, { fields });
	const record = payload?.data && typeof payload.data === 'object' ? payload.data : payload;
	return record?.id == null ? null : record;
}

function buildMaps(changed) {
	return {
		clients: new Map((changed.clients || []).map((record) => [Number(record.id), record])),
		contacts: new Map((changed.contacts || []).map((record) => [Number(record.id), record])),
		candidates: new Map((changed.candidates || []).map((record) => [Number(record.id), record])),
		jobOrders: new Map((changed.jobOrders || []).map((record) => [Number(record.id), record])),
		submissions: new Map((changed.submissions || []).map((record) => [Number(record.id), record])),
		interviews: new Map((changed.interviews || []).map((record) => [Number(record.id), record])),
		placements: new Map((changed.placements || []).map((record) => [Number(record.id), record]))
	};
}

async function expandDependencies(session, maps, fieldsByEntity) {
	const inflight = {
		clients: new Map(),
		contacts: new Map(),
		candidates: new Map(),
		jobOrders: new Map(),
		submissions: new Map()
	};

	async function ensureClient(id) {
		const numericId = Number(id);
		if (!Number.isFinite(numericId)) return null;
		if (maps.clients.has(numericId)) return maps.clients.get(numericId);
		if (inflight.clients.has(numericId)) return inflight.clients.get(numericId);
		const promise = fetchEntityById(session, 'clients', numericId, fieldsByEntity.clients).then((record) => {
			if (record) mergeRecordIntoMap(maps.clients, record);
			return record;
		});
		inflight.clients.set(numericId, promise);
		const result = await promise;
		inflight.clients.delete(numericId);
		return result;
	}

	async function ensureContact(id) {
		const numericId = Number(id);
		if (!Number.isFinite(numericId)) return null;
		if (maps.contacts.has(numericId)) return maps.contacts.get(numericId);
		if (inflight.contacts.has(numericId)) return inflight.contacts.get(numericId);
		const promise = fetchEntityById(session, 'contacts', numericId, fieldsByEntity.contacts).then(async (record) => {
			if (record) {
				mergeRecordIntoMap(maps.contacts, record);
				await ensureClient(record?.clientCorporation?.id);
			}
			return record;
		});
		inflight.contacts.set(numericId, promise);
		const result = await promise;
		inflight.contacts.delete(numericId);
		return result;
	}

	async function ensureCandidate(id) {
		const numericId = Number(id);
		if (!Number.isFinite(numericId)) return null;
		if (maps.candidates.has(numericId)) return maps.candidates.get(numericId);
		if (inflight.candidates.has(numericId)) return inflight.candidates.get(numericId);
		const promise = fetchEntityById(session, 'candidates', numericId, fieldsByEntity.candidates).then((record) => {
			if (record) mergeRecordIntoMap(maps.candidates, record);
			return record;
		});
		inflight.candidates.set(numericId, promise);
		const result = await promise;
		inflight.candidates.delete(numericId);
		return result;
	}

	async function ensureJobOrder(id) {
		const numericId = Number(id);
		if (!Number.isFinite(numericId)) return null;
		if (maps.jobOrders.has(numericId)) return maps.jobOrders.get(numericId);
		if (inflight.jobOrders.has(numericId)) return inflight.jobOrders.get(numericId);
		const promise = fetchEntityById(session, 'jobOrders', numericId, fieldsByEntity.jobOrders).then(async (record) => {
			if (record) {
				mergeRecordIntoMap(maps.jobOrders, record);
				await ensureClient(record?.clientCorporation?.id);
				await ensureContact(record?.clientContact?.id);
			}
			return record;
		});
		inflight.jobOrders.set(numericId, promise);
		const result = await promise;
		inflight.jobOrders.delete(numericId);
		return result;
	}

	async function ensureSubmission(id) {
		const numericId = Number(id);
		if (!Number.isFinite(numericId)) return null;
		if (maps.submissions.has(numericId)) return maps.submissions.get(numericId);
		if (inflight.submissions.has(numericId)) return inflight.submissions.get(numericId);
		const promise = fetchEntityById(session, 'submissions', numericId, fieldsByEntity.submissions).then(async (record) => {
			if (record) {
				mergeRecordIntoMap(maps.submissions, record);
				await ensureCandidate(record?.candidate?.id);
				await ensureJobOrder(record?.jobOrder?.id);
			}
			return record;
		});
		inflight.submissions.set(numericId, promise);
		const result = await promise;
		inflight.submissions.delete(numericId);
		return result;
	}

	return {
		maps,
		ensureClient,
		ensureContact,
		ensureCandidate,
		ensureJobOrder,
		ensureSubmission
	};
}

async function populateMetadataDependencies(expanded, metadata) {
	const { ensureCandidate, ensureContact } = expanded;

	for (const education of metadata.candidateEducations || []) {
		await ensureCandidate(education?.candidate?.id);
	}
	for (const workExperience of metadata.candidateWorkExperiences || []) {
		await ensureCandidate(workExperience?.candidate?.id);
	}
	for (const note of metadata.notes || []) {
		for (const candidate of Array.isArray(note?.candidates) ? note.candidates : []) {
			await ensureCandidate(candidate?.id);
		}
		for (const contact of Array.isArray(note?.clientContacts) ? note.clientContacts : []) {
			await ensureContact(contact?.id);
		}
	}
}

async function expandCoreDependencies(session, maps, fieldsByEntity) {
	const expanded = await expandDependencies(session, maps, fieldsByEntity);
	for (const contact of expanded.maps.contacts.values()) {
		await expanded.ensureClient(contact?.clientCorporation?.id);
	}
	for (const candidate of expanded.maps.candidates.values()) {
		void candidate;
	}
	for (const job of expanded.maps.jobOrders.values()) {
		await expanded.ensureClient(job?.clientCorporation?.id);
		await expanded.ensureContact(job?.clientContact?.id);
	}
	for (const submission of expanded.maps.submissions.values()) {
		await expanded.ensureCandidate(submission?.candidate?.id);
		await expanded.ensureJobOrder(submission?.jobOrder?.id);
	}
	for (const interview of expanded.maps.interviews.values()) {
		const jobSubmissionId = interview?.jobSubmission?.id;
		if (jobSubmissionId) {
			const submission = await expanded.ensureSubmission(jobSubmissionId);
			if (submission) continue;
		}
		await expanded.ensureCandidate(interview?.jobSubmission?.candidate?.id);
		await expanded.ensureJobOrder(interview?.jobSubmission?.jobOrder?.id);
	}
	for (const placement of expanded.maps.placements.values()) {
		await expanded.ensureCandidate(placement?.candidate?.id);
		await expanded.ensureJobOrder(placement?.jobOrder?.id);
		await expanded.ensureSubmission(placement?.jobSubmission?.id);
	}
	return expanded;
}

function clientRows(records, customDefinitions = []) {
	return records.map((client) => withCustomColumns({
		ID: client.id ?? '',
		Name: firstNonEmpty(client.name),
		Industry: '',
		Status: '',
		Phone: '',
		Address: '',
		City: '',
		State: '',
		Zip: '',
		Website: '',
		Description: ''
	}, client, customDefinitions));
}

function filterUsedCustomDefinitions(records, definitions) {
	return definitions.filter((definition) =>
		records.some((record) => {
			const value = record?.[definition.bullhornFieldName];
			return coerceBullhornCustomFieldValue(definition, value) !== '';
		})
	);
}

function withCustomColumns(baseRow, record, customDefinitions) {
	const nextRow = { ...baseRow };
	for (const definition of customDefinitions) {
		nextRow[buildCustomColumnLabel(definition)] = coerceBullhornCustomFieldValue(
			definition,
			record?.[definition.bullhornFieldName]
		);
	}
	return nextRow;
}

function buildCustomFieldDefinitionRows(customDefinitionsByEntity) {
	const rows = [];
	for (const entityKey of BULLHORN_CORE_ENTITY_ORDER) {
		for (const definition of customDefinitionsByEntity[entityKey] || []) {
			rows.push({
				'Module Key': definition.moduleKey,
				'Field Key': definition.fieldKey,
				Label: definition.label,
				'Field Type': definition.fieldType,
				'Select Options': (definition.selectOptions || []).join(', '),
				'Help Text': definition.helpText || '',
				'Bullhorn Field Name': definition.bullhornFieldName
			});
		}
	}
	return rows;
}

function candidateEducationRows(records) {
	return records.map((education) => ({
		ID: education.id ?? '',
		'Record ID': bullhornMetadataRecordId('CandidateEducation', education?.id),
		'Candidate ID': education?.candidate?.id ?? '',
		'Candidate Email': firstNonEmpty(education?.candidate?.email),
		'School Name': firstNonEmpty(education?.school),
		Degree: firstNonEmpty(education?.degree),
		'Field Of Study': firstNonEmpty(education?.major),
		'Start Date': dateOnly(education?.startDate),
		'End Date': dateOnly(education?.endDate),
		'Is Current': '',
		Description: firstNonEmpty(education?.comments)
	}));
}

function candidateWorkExperienceRows(records) {
	return records.map((workExperience) => ({
		ID: workExperience.id ?? '',
		'Record ID': bullhornMetadataRecordId('CandidateWorkExperience', workExperience?.id),
		'Candidate ID': workExperience?.candidate?.id ?? '',
		'Candidate Email': firstNonEmpty(workExperience?.candidate?.email),
		'Company Name': firstNonEmpty(workExperience?.companyName),
		Title: firstNonEmpty(workExperience?.title),
		Location: '',
		'Start Date': dateOnly(workExperience?.startDate),
		'End Date': dateOnly(workExperience?.endDate),
		'Is Current': '',
		Description: firstNonEmpty(workExperience?.comments)
	}));
}

function candidateNoteRows(records) {
	const rows = [];
	for (const note of records) {
		for (const candidate of Array.isArray(note?.candidates) ? note.candidates : []) {
			rows.push({
				ID: note?.id ?? '',
				'Record ID': bullhornMetadataRecordId(`CandidateNote-${candidate?.id || 'candidate'}`, note?.id),
				'Candidate ID': candidate?.id ?? '',
				'Candidate Email': firstNonEmpty(candidate?.email),
				Content: firstNonEmpty(note?.comments),
				'Note Type': firstNonEmpty(note?.action, 'bullhorn'),
				'Created At': compactIso(note?.dateAdded),
				'Updated At': compactIso(note?.dateLastModified)
			});
		}
	}
	return rows;
}

function contactNoteRows(records) {
	const rows = [];
	for (const note of records) {
		for (const contact of Array.isArray(note?.clientContacts) ? note.clientContacts : []) {
			rows.push({
				ID: note?.id ?? '',
				'Record ID': bullhornMetadataRecordId(`ContactNote-${contact?.id || 'contact'}`, note?.id),
				'Contact ID': contact?.id ?? '',
				'Contact Email': firstNonEmpty(contact?.email),
				Content: firstNonEmpty(note?.comments),
				'Note Type': firstNonEmpty(note?.action, 'bullhorn'),
				'Created At': compactIso(note?.dateAdded),
				'Updated At': compactIso(note?.dateLastModified)
			});
		}
	}
	return rows;
}

async function buildCandidateFileExport(session, candidates, { assertNotCancelled } = {}) {
	const rows = [];
	const files = [];
	const diagnostics = {
		candidatesConsidered: candidates.length,
		candidatesWithAnyAttachments: 0,
		candidatesWithoutAttachments: 0,
		candidatesWithoutAllowedAttachments: 0,
		selectedResumeFiles: 0,
		selectedNonResumeFiles: 0,
		exportedFiles: 0,
		skippedDownloadErrors: 0,
		skippedEmptyDownloads: 0,
		skippedOversizeDownloads: 0,
		sampleReasons: []
	};

	function pushSampleReason(candidate, reason) {
		if (diagnostics.sampleReasons.length >= 8) return;
		const candidateLabel = `${firstNonEmpty(candidate?.firstName)} ${firstNonEmpty(candidate?.lastName)}`.trim()
			|| firstNonEmpty(candidate?.email)
			|| `Candidate ${candidate?.id || ''}`.trim();
		diagnostics.sampleReasons.push(`${candidateLabel}: ${reason}`);
	}

	for (const candidate of candidates) {
		if (assertNotCancelled) {
			await assertNotCancelled();
		}
		const candidateId = Number(candidate?.id || 0);
		if (!Number.isFinite(candidateId) || candidateId <= 0) continue;

		const availableAttachments = await listCandidateFileAttachments(session, candidateId);
		if (availableAttachments.length <= 0) {
			diagnostics.candidatesWithoutAttachments += 1;
			pushSampleReason(candidate, 'no Bullhorn attachments exposed');
			continue;
		}
		diagnostics.candidatesWithAnyAttachments += 1;

		const attachments = availableAttachments
			.filter(isAllowedCandidateAttachment)
			.sort(compareAttachmentPriority);
		if (attachments.length <= 0) {
			diagnostics.candidatesWithoutAllowedAttachments += 1;
			pushSampleReason(candidate, 'attachments found but none matched allowed file types');
			continue;
		}

		const selectedAttachment = attachments[0];
		if (isLikelyResumeAttachment(selectedAttachment)) {
			diagnostics.selectedResumeFiles += 1;
		} else {
			diagnostics.selectedNonResumeFiles += 1;
			pushSampleReason(
				candidate,
				`best attachment selected was not resume-like (${attachmentDisplayName(selectedAttachment)})`
			);
		}
		const attachmentId = Number(selectedAttachment?.id || 0);
		if (!Number.isFinite(attachmentId) || attachmentId <= 0) continue;

		const fileName = attachmentDisplayName(selectedAttachment);
		const zipPath = `files/candidates/${cleanZipPathSegment(candidateId, 'candidate')}/${attachmentId}-${cleanZipPathSegment(fileName, 'file')}`;

		try {
			const downloaded = await bullhornDownloadBuffer(
				session,
				`file/Candidate/${candidateId}/${attachmentId}/raw`
			);
			if (assertNotCancelled) {
				await assertNotCancelled();
			}
			if (!downloaded?.buffer || downloaded.buffer.length <= 0) {
				diagnostics.skippedEmptyDownloads += 1;
				pushSampleReason(candidate, `selected attachment downloaded empty (${fileName})`);
				continue;
			}
			if (downloaded.buffer.length > CANDIDATE_ATTACHMENT_MAX_BYTES) {
				diagnostics.skippedOversizeDownloads += 1;
				pushSampleReason(candidate, `selected attachment exceeded max size (${fileName})`);
				continue;
			}

			rows.push({
				'Candidate ID': candidateId,
				'Candidate Email': firstNonEmpty(candidate?.email),
				'Candidate First Name': firstNonEmpty(candidate?.firstName),
				'Candidate Last Name': firstNonEmpty(candidate?.lastName),
				'Attachment ID': attachmentId,
				'File Name': fileName,
				'Content Type': normalizeExportAttachmentContentType(
					fileName,
					downloaded.contentType,
					selectedAttachment?.contentType
				),
				Description: firstNonEmpty(selectedAttachment?.description),
				'Is Resume': isLikelyResumeAttachment(selectedAttachment) ? 'true' : 'false',
				'ZIP Path': zipPath
			});
			files.push({
				zipPath,
				buffer: downloaded.buffer
			});
			diagnostics.exportedFiles += 1;
		} catch {
			diagnostics.skippedDownloadErrors += 1;
			pushSampleReason(candidate, `selected attachment could not be downloaded (${fileName})`);
			// Skip unreadable attachments without failing the export batch.
		}
	}

	return { rows, files, diagnostics };
}

function contactRows(records, customDefinitions = []) {
	return records.map((contact) => withCustomColumns({
		ID: contact.id ?? '',
		'First Name': firstNonEmpty(contact.firstName),
		'Last Name': firstNonEmpty(contact.lastName),
		Email: firstNonEmpty(contact.email),
		Mobile: firstNonEmpty(contact.phone),
		Title: '',
		Department: '',
		Source: '',
		Address: '',
		Zip: '',
		'Client Corporation ID': contact?.clientCorporation?.id ?? '',
		'Client Corporation': firstNonEmpty(contact?.clientCorporation?.name)
	}, contact, customDefinitions));
}

function candidateRows(records, customDefinitions = []) {
	return records.map((candidate) => withCustomColumns({
		ID: candidate.id ?? '',
		'First Name': firstNonEmpty(candidate.firstName),
		'Last Name': firstNonEmpty(candidate.lastName),
		Email: firstNonEmpty(candidate.email),
		Mobile: firstNonEmpty(candidate.mobile),
		Phone: firstNonEmpty(candidate.phone),
		Status: firstNonEmpty(candidate.status),
		Source: '',
		'Current Job Title': firstNonEmpty(candidate.occupation),
		'Current Employer': '',
		'Years Experience': '',
		Address: '',
		City: '',
		State: '',
		Zip: '',
		LinkedIn: '',
		Website: '',
		Skills: buildBullhornCandidateSkillValue(candidate),
		Summary: ''
	}, candidate, customDefinitions));
}

function jobOrderRows(records, customDefinitions = []) {
	return records.map((job) => withCustomColumns({
		ID: job.id ?? '',
		Title: firstNonEmpty(job.title),
		Status: firstNonEmpty(job.status),
		'Employment Type': firstNonEmpty(job.employmentType),
		Currency: '',
		'Salary Min': '',
		'Salary Max': '',
		Openings: job.numOpenings ?? '',
		Description: '',
		'Public Description': '',
		Location: '',
		City: '',
		State: '',
		Zip: '',
		'Publish To Career Site': '',
		'Client Corporation ID': job?.clientCorporation?.id ?? '',
		'Client Corporation': firstNonEmpty(job?.clientCorporation?.name),
		'Contact ID': job?.clientContact?.id ?? '',
		'Contact Email': firstNonEmpty(job?.clientContact?.email),
		'Contact Name': firstNonEmpty(
			[job?.clientContact?.firstName, job?.clientContact?.lastName].filter(Boolean).join(' ')
		)
	}, job, customDefinitions));
}

function submissionRows(records, customDefinitions = []) {
	return records.map((submission) => withCustomColumns({
		ID: submission.id ?? '',
		'Candidate ID': submission?.candidate?.id ?? '',
		'Candidate Email': firstNonEmpty(submission?.candidate?.email),
		'Job Order ID': submission?.jobOrder?.id ?? '',
		'Job Order Title': firstNonEmpty(submission?.jobOrder?.title),
		Status: firstNonEmpty(submission.status),
		Notes: ''
	}, submission, customDefinitions));
}

function interviewStatus(interview) {
	if (!interview?.dateEnd) return 'Scheduled';
	const end = new Date(interview.dateEnd).getTime();
	if (Number.isFinite(end) && end < Date.now()) return 'Completed';
	return 'Scheduled';
}

function interviewRows(records, customDefinitions = []) {
	return records.map((interview) => withCustomColumns({
		ID: interview.id ?? '',
		'Candidate ID': interview?.jobSubmission?.candidate?.id ?? '',
		'Candidate Email': firstNonEmpty(interview?.jobSubmission?.candidate?.email),
		'Job Order ID': interview?.jobSubmission?.jobOrder?.id ?? '',
		'Job Order Title': firstNonEmpty(interview?.jobSubmission?.jobOrder?.title),
		Subject: firstNonEmpty(interview.description, 'Interview'),
		Status: interviewStatus(interview),
		'Interview Mode': '',
		Interviewer: '',
		'Interviewer Email': '',
		'Starts At': compactIso(interview.dateBegin),
		'Ends At': compactIso(interview.dateEnd),
		Location: '',
		'Video Link': ''
	}, interview, customDefinitions));
}

function placementRows(records, customDefinitions = []) {
	return records.map((placement) => withCustomColumns({
		ID: placement.id ?? '',
		'Candidate ID': placement?.candidate?.id ?? '',
		'Candidate Email': firstNonEmpty(placement?.candidate?.email),
		'Job Order ID': placement?.jobOrder?.id ?? '',
		'Job Order Title': firstNonEmpty(placement?.jobOrder?.title),
		'Submission ID': placement?.jobSubmission?.id ?? '',
		Status: firstNonEmpty(placement.status),
		'Placement Type': firstNonEmpty(employmentTypeToPlacementType(placement.employmentType)),
		'Compensation Type': placementCompType(placement),
		Currency: salaryCurrency(placement),
		'Offered On': dateOnly(placement.dateAdded),
		'Expected Join Date': '',
		'End Date': '',
		Notes: '',
		'Hourly RT Pay Rate': '',
		'Hourly RT Bill Rate': '',
		'Hourly OT Pay Rate': '',
		'Hourly OT Bill Rate': '',
		'Daily Pay Rate': '',
		'Daily Bill Rate': '',
		'Yearly Compensation': yearlyCompensation(placement)
	}, placement, customDefinitions));
}

function salaryCurrency(placement) {
	return placement?.salary ? 'USD' : '';
}

function yearlyCompensation(placement) {
	const salary = Number(placement?.salary || 0);
	if (!Number.isFinite(salary) || salary <= 0) return '';
	return salary;
}

function sortById(records) {
	return [...records].sort((a, b) => {
		const left = Number(a?.id ?? a?.ID ?? 0);
		const right = Number(b?.id ?? b?.ID ?? 0);
		return left - right;
	});
}

function buildReadme({ dateFrom, dateTo, sampleLimit, counts, includeFiles, diagnostics }) {
	return [
		'# Bullhorn Export Batch',
		'',
		'This ZIP was generated from the Bullhorn REST API for a bounded date range and is formatted to match Hire Gnome\'s Bullhorn batch importer.',
		'',
		`- Updated/created from: ${compactIso(dateFrom)}`,
		`- Updated/created to: ${compactIso(dateTo)}`,
		`- Changed-row sample limit per entity: ${sampleLimit}`,
		`- Candidate files included: ${includeFiles ? 'Yes' : 'No'}`,
		'',
		'Included files:',
		...BULLHORN_EXPORT_ALL_ENTITY_ORDER.map((entityKey) => `- ${ENTITY_FILE_NAMES[entityKey]} (${counts[entityKey] || 0} rows)`),
		`- ${BULLHORN_CANDIDATE_FILES_MANIFEST_NAME} (${counts.candidateFiles || 0} rows)`,
		'',
		'Notes:',
		'- Custom field definitions are included first so custom schema can be created before record import.',
		includeFiles
			? '- Candidate attachment files are included when Bullhorn exposes downloadable candidate files for the exported candidates.'
			: '- Candidate attachment files were not included in this export.',
		...(includeFiles && diagnostics?.candidateFiles
			? [
				`- Candidate file diagnostics: considered ${diagnostics.candidateFiles.candidatesConsidered || 0}, exported ${diagnostics.candidateFiles.exportedFiles || 0}, no attachments ${diagnostics.candidateFiles.candidatesWithoutAttachments || 0}, no allowed attachments ${diagnostics.candidateFiles.candidatesWithoutAllowedAttachments || 0}, download errors ${diagnostics.candidateFiles.skippedDownloadErrors || 0}.`
			]
			: []),
		'- The sample limit applies to changed Bullhorn rows per entity before dependency expansion.',
		'- Upstream dependency records may be included even if they fall outside the requested window so imports can link accurately.',
		'- The output is intended for review, testing, and importer compatibility validation.'
	].join('\n');
}

export async function createBullhornExportBatch(options) {
	const username = toTrimmedString(options.username);
	const password = toTrimmedString(options.password);
	const clientId = toTrimmedString(options.clientId);
	const clientSecret = toTrimmedString(options.clientSecret);
	if (!username || !password || !clientId || !clientSecret) {
		throw new BullhornExportValidationError('Bullhorn credentials are required.');
	}

	const fromDate = parseDateInput(options.dateFrom, 'Updated From');
	const toDate = parseDateInput(options.dateTo, 'Updated To');
	if (fromDate.getTime() > toDate.getTime()) {
		throw new BullhornExportValidationError('Updated From must be before Updated To.');
	}
	const sampleLimit = parsePositiveInt(options.sampleLimit, DEFAULT_SAMPLE_LIMIT);
	const includeFiles = Boolean(options.includeFiles);
	const assertNotCancelled = async () => {
		if (typeof options.shouldCancel !== 'function') return;
		const cancelled = await options.shouldCancel();
		if (cancelled) {
			throw new BullhornExportCancelledError();
		}
	};

	const session = await authorizeBullhorn({ username, password, clientId, clientSecret });
	await assertNotCancelled();
	const metadataEntries = await Promise.all(
		BULLHORN_CORE_ENTITY_ORDER.map(async (entityKey) => {
			const fields = await fetchEntityMetadata(session, entityKey);
			return [
				entityKey,
				{
					fields,
					customDefinitions: buildCustomFieldDefinitions(entityKey, fields),
					candidateSkillFieldNames:
						entityKey === 'candidates' ? buildCandidateSkillFieldNames(fields) : []
				}
			];
		})
	);
	await assertNotCancelled();
	const metadataByEntity = Object.fromEntries(metadataEntries);
	const customFieldDefinitionsByEntity = Object.fromEntries(
		BULLHORN_CORE_ENTITY_ORDER.map((entityKey) => [
			entityKey,
			metadataByEntity[entityKey]?.customDefinitions || []
		])
	);
	const candidateSkillFieldNames = metadataByEntity.candidates?.candidateSkillFieldNames || [];
	const queryFieldsByEntity = Object.fromEntries(
		BULLHORN_EXPORT_ENTITY_ORDER.map((entityKey) => [
			entityKey,
			buildQueryFields(
				entityKey,
				customFieldDefinitionsByEntity[entityKey] || [],
				entityKey === 'candidates' ? candidateSkillFieldNames : []
			)
		])
	);
	const changed = {
		clients: await fetchChangedQueryEntity(session, 'clients', { fromDate, toDate }, sampleLimit, queryFieldsByEntity.clients),
		contacts: await fetchChangedQueryEntity(session, 'contacts', { fromDate, toDate }, sampleLimit, queryFieldsByEntity.contacts),
		candidates: await fetchChangedCandidates(session, { fromDate, toDate }, sampleLimit, queryFieldsByEntity.candidates),
		jobOrders: await fetchChangedQueryEntity(session, 'jobOrders', { fromDate, toDate }, sampleLimit, queryFieldsByEntity.jobOrders),
		submissions: await fetchChangedQueryEntity(session, 'submissions', { fromDate, toDate }, sampleLimit, queryFieldsByEntity.submissions),
		interviews: await fetchChangedQueryEntity(session, 'interviews', { fromDate, toDate, extraWhere: "type='Interview'" }, sampleLimit, queryFieldsByEntity.interviews),
		placements: await fetchChangedQueryEntity(session, 'placements', { fromDate, toDate }, sampleLimit, queryFieldsByEntity.placements)
	};
	const changedMetadata = {
		candidateEducations: await fetchChangedQueryEntity(
			session,
			'candidateEducations',
			{ fromDate, toDate },
			sampleLimit,
			BASE_QUERY_FIELDS.candidateEducations
		),
		candidateWorkExperiences: await fetchChangedQueryEntity(
			session,
			'candidateWorkExperiences',
			{ fromDate, toDate },
			sampleLimit,
			BASE_QUERY_FIELDS.candidateWorkExperiences
		),
		notes: await fetchChangedNotes(session, { fromDate, toDate }, sampleLimit)
	};
	await assertNotCancelled();

	const expanded = await expandCoreDependencies(session, buildMaps(changed), queryFieldsByEntity);
	await populateMetadataDependencies(expanded, changedMetadata);
	await assertNotCancelled();
	const sorted = {
		clients: sortById([...expanded.maps.clients.values()]),
		contacts: sortById([...expanded.maps.contacts.values()]),
		candidates: sortById([...expanded.maps.candidates.values()]),
		jobOrders: sortById([...expanded.maps.jobOrders.values()]),
		submissions: sortById([...expanded.maps.submissions.values()]),
		interviews: sortById([...expanded.maps.interviews.values()]),
		placements: sortById([...expanded.maps.placements.values()]),
		candidateNotes: sortById(candidateNoteRows(changedMetadata.notes)),
		candidateEducations: sortById(changedMetadata.candidateEducations),
		candidateWorkExperiences: sortById(changedMetadata.candidateWorkExperiences),
		contactNotes: sortById(contactNoteRows(changedMetadata.notes))
	};
	const usedCustomFieldDefinitionsByEntity = Object.fromEntries(
		BULLHORN_CORE_ENTITY_ORDER.map((entityKey) => [
			entityKey,
			filterUsedCustomDefinitions(sorted[entityKey], customFieldDefinitionsByEntity[entityKey] || [])
				.map((definition, index) => ({
					...definition,
					sortOrder: index
				}))
		])
	);
	const customFieldDefinitionRows = buildCustomFieldDefinitionRows(usedCustomFieldDefinitionsByEntity);

	const csvs = {
		customFieldDefinitions: buildCsv(customFieldDefinitionRows),
		clients: buildCsv(clientRows(sorted.clients, usedCustomFieldDefinitionsByEntity.clients)),
		contacts: buildCsv(contactRows(sorted.contacts, usedCustomFieldDefinitionsByEntity.contacts)),
		candidates: buildCsv(
			candidateRows(
				sorted.candidates.map((candidate) => ({
					...candidate,
					__candidateSkillFieldNames: candidateSkillFieldNames
				})),
				usedCustomFieldDefinitionsByEntity.candidates
			)
		),
		jobOrders: buildCsv(jobOrderRows(sorted.jobOrders, usedCustomFieldDefinitionsByEntity.jobOrders)),
		submissions: buildCsv(submissionRows(sorted.submissions, usedCustomFieldDefinitionsByEntity.submissions)),
		interviews: buildCsv(interviewRows(sorted.interviews, usedCustomFieldDefinitionsByEntity.interviews)),
		placements: buildCsv(placementRows(sorted.placements, usedCustomFieldDefinitionsByEntity.placements)),
		candidateNotes: buildCsv(sorted.candidateNotes),
		candidateEducations: buildCsv(candidateEducationRows(sorted.candidateEducations)),
		candidateWorkExperiences: buildCsv(candidateWorkExperienceRows(sorted.candidateWorkExperiences)),
		contactNotes: buildCsv(sorted.contactNotes)
	};
	await assertNotCancelled();
	const candidateFileExport = includeFiles
		? await buildCandidateFileExport(session, sorted.candidates, { assertNotCancelled })
		: {
			rows: [],
			files: [],
			diagnostics: {
				candidatesConsidered: 0,
				candidatesWithAnyAttachments: 0,
				candidatesWithoutAttachments: 0,
				candidatesWithoutAllowedAttachments: 0,
				selectedResumeFiles: 0,
				selectedNonResumeFiles: 0,
				exportedFiles: 0,
				skippedDownloadErrors: 0,
				skippedEmptyDownloads: 0,
				skippedOversizeDownloads: 0,
				sampleReasons: []
			}
		};
	const candidateFilesCsv = buildCsv(candidateFileExport.rows);
	await assertNotCancelled();

	const zip = new JSZip();
	const counts = Object.fromEntries([
		['customFieldDefinitions', customFieldDefinitionRows.length],
		...BULLHORN_EXPORT_ENTITY_ORDER.map((entityKey) => [entityKey, sorted[entityKey].length]),
		['candidateFiles', candidateFileExport.rows.length],
		['diagnostics', {
			candidateFiles: candidateFileExport.diagnostics
		}]
	]);
	zip.file('README.md', buildReadme({
		dateFrom: fromDate,
		dateTo: toDate,
		sampleLimit,
		counts,
		includeFiles,
		diagnostics: counts.diagnostics
	}));
	zip.file('metadata.json', JSON.stringify({
		source: 'bullhorn_api',
		generatedAt: new Date().toISOString(),
		dateFrom: fromDate.toISOString(),
		dateTo: toDate.toISOString(),
		sampleLimit,
		includeFiles,
		counts,
		diagnostics: counts.diagnostics
	}, null, 2));
	for (const entityKey of BULLHORN_EXPORT_ALL_ENTITY_ORDER) {
		if (!csvs[entityKey]) continue;
		zip.file(ENTITY_FILE_NAMES[entityKey], csvs[entityKey]);
	}
	if (candidateFilesCsv) {
		zip.file(BULLHORN_CANDIDATE_FILES_MANIFEST_NAME, candidateFilesCsv);
	}
	for (const fileEntry of candidateFileExport.files) {
		zip.file(fileEntry.zipPath, fileEntry.buffer);
	}

	const buffer = await zip.generateAsync({
		type: 'nodebuffer',
		compression: 'DEFLATE',
		compressionOptions: { level: 6 }
	});
	await assertNotCancelled();

	return {
		fileName: exportFileName(toDate),
		buffer,
		counts,
		diagnostics: counts.diagnostics,
		sampleLimit,
		includeFiles,
		dateFrom: fromDate.toISOString(),
		dateTo: toDate.toISOString()
	};
}
