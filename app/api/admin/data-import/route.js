import JSZip from 'jszip';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createRecordId } from '@/lib/record-id';
import { withApiLogging } from '@/lib/api-logging';
import { AccessControlError, getActingUser } from '@/lib/access-control';
import { enforceMutationThrottle } from '@/lib/mutation-throttle';
import { normalizeCandidateSourceValue } from '@/app/constants/candidate-source-options';
import { normalizeContactSourceValue } from '@/app/constants/contact-source-options';
import { toJobOrderStatusValue } from '@/lib/job-order-options';

export const dynamic = 'force-dynamic';

const SUPPORTED_IMPORT_ENTITY_KEYS = Object.freeze([
	'clients',
	'contacts',
	'candidates',
	'jobOrders',
	'submissions',
	'interviews',
	'placements'
]);
const SUPPORTED_SOURCE_TYPES = Object.freeze(['hire_gnome_export', 'bullhorn_csv']);
const BULLHORN_IMPORT_PROFILES = Object.freeze(['clients', 'contacts', 'candidates', 'jobOrders']);
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
		throw new ImportValidationError('Import source must be `hire_gnome_export` or `bullhorn_csv`.');
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

function normalizeHeaderKey(value) {
	return String(value || '')
		.replace(/^\ufeff/, '')
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '');
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

function parseCsvText(rawText) {
	const allRows = [];
	let row = [];
	let field = '';
	let inQuotes = false;

	function pushField() {
		row.push(field);
		field = '';
	}

	function pushRow() {
		if (row.length === 1 && row[0] === '') {
			row = [];
			return;
		}
		allRows.push(row);
		row = [];
	}

	for (let i = 0; i < rawText.length; i += 1) {
		const char = rawText[i];
		if (inQuotes) {
			if (char === '"') {
				if (rawText[i + 1] === '"') {
					field += '"';
					i += 1;
				} else {
					inQuotes = false;
				}
			} else {
				field += char;
			}
			continue;
		}

		if (char === '"') {
			inQuotes = true;
			continue;
		}
		if (char === ',') {
			pushField();
			continue;
		}
		if (char === '\n' || char === '\r') {
			pushField();
			pushRow();
			if (char === '\r' && rawText[i + 1] === '\n') {
				i += 1;
			}
			continue;
		}
		field += char;
	}

	pushField();
	if (row.length > 1 || (row.length === 1 && row[0] !== '')) {
		pushRow();
	}

	if (allRows.length <= 1) {
		throw new ImportValidationError('CSV file must include a header row and at least one data row.');
	}

	const headerRow = allRows[0].map((value, index) => {
		const normalized = String(value || '').replace(/^\ufeff/, '').trim();
		return normalized || `column_${index + 1}`;
	});
	const rows = allRows
		.slice(1)
		.map((values) => {
			const rawRow = {};
			headerRow.forEach((header, index) => {
				rawRow[header] = values[index] ?? '';
			});
			const normalized = {};
			for (const [key, value] of Object.entries(rawRow)) {
				normalized[normalizeHeaderKey(key)] = String(value ?? '').trim();
			}
			return normalized;
		})
		.filter((normalizedRow) =>
			Object.values(normalizedRow).some((value) => String(value || '').trim() !== '')
		);

	if (rows.length <= 0) {
		throw new ImportValidationError('CSV file contains no data rows.');
	}

	return rows;
}

function mapBullhornClientRow(row) {
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
		description: pickBullhornValue(row, ['description', 'notes'])
	};
}

function mapBullhornContactRow(row) {
	const parsedName = parseDisplayName(pickBullhornValue(row, ['name', 'full name', 'contact']));
	const firstName = pickBullhornValue(row, ['first name', 'firstname']) || parsedName.firstName;
	const lastName = pickBullhornValue(row, ['last name', 'lastname']) || parsedName.lastName;
	if (!firstName || !lastName) return null;
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
		clientName: pickBullhornValue(row, ['client corporation', 'client name', 'company', 'company name'])
	};
}

function mapBullhornCandidateRow(row) {
	const parsedName = parseDisplayName(pickBullhornValue(row, ['name', 'full name', 'candidate']));
	const firstName = pickBullhornValue(row, ['first name', 'firstname']) || parsedName.firstName;
	const lastName = pickBullhornValue(row, ['last name', 'lastname']) || parsedName.lastName;
	const email = pickBullhornValue(row, ['email', 'email address']);
	if (!firstName || !lastName || !email) return null;
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
		skillSet: pickBullhornValue(row, ['skills', 'skill set', 'primary skills']),
		summary: pickBullhornValue(row, ['summary', 'resume summary', 'resume text', 'notes'])
	};
}

function mapBullhornJobOrderRow(row) {
	const title = pickBullhornValue(row, ['title', 'job title', 'job']);
	if (!title) return null;
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
		contactName: pickBullhornValue(row, ['contact name', 'hiring manager'])
	};
}

const BULLHORN_PROFILE_MAP = Object.freeze({
	clients: {
		entityKey: 'clients',
		mapRow: mapBullhornClientRow
	},
	contacts: {
		entityKey: 'contacts',
		mapRow: mapBullhornContactRow
	},
	candidates: {
		entityKey: 'candidates',
		mapRow: mapBullhornCandidateRow
	},
	jobOrders: {
		entityKey: 'jobOrders',
		mapRow: mapBullhornJobOrderRow
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
	const csvRows = parseCsvText(buffer.toString('utf8'));
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

function buildPreviewSummary(data) {
	return {
		clients: data.clients.length,
		contacts: data.contacts.length,
		candidates: data.candidates.length,
		jobOrders: data.jobOrders.length,
		submissions: data.submissions.length,
		interviews: data.interviews.length,
		placements: data.placements.length
	};
}

function sourceIdRecordIdMap(rows) {
	return new Map(
		rows
			.map((row) => [toOptionalInt(row?.id), toTrimmedString(row?.recordId)])
			.filter(([id, recordId]) => Number.isInteger(id) && Boolean(recordId))
	);
}

function resolveTargetIdFromSource({
	sourceId,
	sourceIdToRecordId,
	targetIdBySourceId,
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
	return null;
}

async function importData(tx, data, actingUser) {
	const summary = {
		created: {
			clients: 0,
			contacts: 0,
			candidates: 0,
			jobOrders: 0,
			submissions: 0,
			interviews: 0,
			placements: 0
		},
		updated: {
			clients: 0,
			contacts: 0,
			candidates: 0,
			jobOrders: 0,
			submissions: 0,
			interviews: 0,
			placements: 0
		},
		skipped: {
			clients: 0,
			contacts: 0,
			candidates: 0,
			jobOrders: 0,
			submissions: 0,
			interviews: 0,
			placements: 0
		},
		errors: []
	};

	const sourceClientIdToRecordId = sourceIdRecordIdMap(data.clients);
	const sourceContactIdToRecordId = sourceIdRecordIdMap(data.contacts);
	const sourceCandidateIdToRecordId = sourceIdRecordIdMap(data.candidates);
	const sourceJobOrderIdToRecordId = sourceIdRecordIdMap(data.jobOrders);
	const sourceSubmissionIdToRecordId = sourceIdRecordIdMap(data.submissions);

	const clientIdBySourceId = new Map();
	const clientIdByRecordId = new Map();
	const clientIdByName = new Map();
	const contactIdBySourceId = new Map();
	const contactIdByRecordId = new Map();
	const contactIdByEmail = new Map();
	const contactIdByClientName = new Map();
	const candidateIdBySourceId = new Map();
	const candidateIdByRecordId = new Map();
	const jobOrderIdBySourceId = new Map();
	const jobOrderIdByRecordId = new Map();
	const submissionIdBySourceId = new Map();
	const submissionIdByRecordId = new Map();

	function pushError(message) {
		if (summary.errors.length < 200) {
			summary.errors.push(message);
		}
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

	function resolveClientIdFromRow(row) {
		const bySource = resolveTargetIdFromSource({
			sourceId: row?.clientId,
			sourceIdToRecordId: sourceClientIdToRecordId,
			targetIdBySourceId: clientIdBySourceId,
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
			sourceIdToRecordId: sourceContactIdToRecordId,
			targetIdBySourceId: contactIdBySourceId,
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

	for (const row of data.clients) {
		const name = toTrimmedString(row?.name);
		if (!name) {
			summary.skipped.clients += 1;
			pushError('Skipped client row with missing `name`.');
			continue;
		}
		const recordId = toTrimmedString(row?.recordId);
		const existing = recordId
			? await tx.client.findUnique({
				where: { recordId },
				select: { id: true, recordId: true }
			})
			: await tx.client.findFirst({
				where: { name },
				select: { id: true, recordId: true }
			});
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

		const sourceId = toOptionalInt(row?.id);
		if (Number.isInteger(sourceId)) {
			clientIdBySourceId.set(sourceId, saved.id);
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
		if (!firstName || !lastName) {
			summary.skipped.contacts += 1;
			pushError('Skipped contact row with missing first or last name.');
			continue;
		}

		const clientId = resolveClientIdFromRow(row);
		if (!clientId) {
			summary.skipped.contacts += 1;
			pushError(`Skipped contact ${firstName} ${lastName}: related client could not be resolved.`);
			continue;
		}

		const recordId = toTrimmedString(row?.recordId);
		const email = toTrimmedString(row?.email);
		const contactMatchClauses = [{ firstName, lastName }];
		if (email) {
			contactMatchClauses.unshift({ email });
		}
		const existing = recordId
			? await tx.contact.findUnique({
				where: { recordId },
				select: { id: true, recordId: true }
			})
			: await tx.contact.findFirst({
				where: {
					clientId,
					OR: contactMatchClauses
				},
				select: { id: true, recordId: true }
			});
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

		const sourceId = toOptionalInt(row?.id);
		if (Number.isInteger(sourceId)) {
			contactIdBySourceId.set(sourceId, saved.id);
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

	for (const row of data.candidates) {
		const email = toTrimmedString(row?.email);
		const firstName = toTrimmedString(row?.firstName);
		const lastName = toTrimmedString(row?.lastName);
		if (!email || !firstName || !lastName) {
			summary.skipped.candidates += 1;
			pushError('Skipped candidate row with missing firstName, lastName, or email.');
			continue;
		}

		const recordId = toTrimmedString(row?.recordId) || createRecordId('Candidate');
		const existing = await tx.candidate.findFirst({
			where: {
				OR: [{ recordId }, { email }]
			},
			select: { id: true }
		});
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
			experienceYears: toOptionalNumber(row?.experienceYears),
			ownerId: actingUser.id,
			divisionId: actingUser.divisionId || null
		};

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

		const sourceId = toOptionalInt(row?.id);
		if (Number.isInteger(sourceId)) {
			candidateIdBySourceId.set(sourceId, saved.id);
		}
		candidateIdByRecordId.set(recordId, saved.id);
	}

	for (const row of data.jobOrders) {
		const title = toTrimmedString(row?.title);
		if (!title) {
			summary.skipped.jobOrders += 1;
			pushError('Skipped job order row with missing `title`.');
			continue;
		}

		const clientId = resolveClientIdFromRow(row);
		if (!clientId) {
			summary.skipped.jobOrders += 1;
			pushError(`Skipped job order "${title}": related client could not be resolved.`);
			continue;
		}

		const contactId = resolveContactIdFromRow(row, clientId);

		const recordId = toTrimmedString(row?.recordId);
		const openings = toOptionalInt(row?.openings, 1);
		const existing = recordId
			? await tx.jobOrder.findUnique({
				where: { recordId },
				select: { id: true, recordId: true }
			})
			: await tx.jobOrder.findFirst({
				where: {
					clientId,
					title
				},
				select: { id: true, recordId: true }
			});
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

		const sourceId = toOptionalInt(row?.id);
		if (Number.isInteger(sourceId)) {
			jobOrderIdBySourceId.set(sourceId, saved.id);
		}
		const mappedRecordId = existing?.recordId || saved.recordId || createdRecordId;
		if (mappedRecordId) {
			jobOrderIdByRecordId.set(mappedRecordId, saved.id);
		}
	}

	for (const row of data.submissions) {
		const candidateId = resolveTargetIdFromSource({
			sourceId: row?.candidateId,
			sourceIdToRecordId: sourceCandidateIdToRecordId,
			targetIdBySourceId: candidateIdBySourceId,
			targetIdByRecordId: candidateIdByRecordId
		});
		const jobOrderId = resolveTargetIdFromSource({
			sourceId: row?.jobOrderId,
			sourceIdToRecordId: sourceJobOrderIdToRecordId,
			targetIdBySourceId: jobOrderIdBySourceId,
			targetIdByRecordId: jobOrderIdByRecordId
		});

		if (!candidateId || !jobOrderId) {
			summary.skipped.submissions += 1;
			pushError('Skipped submission row: related candidate or job order could not be resolved.');
			continue;
		}

		const recordId = toTrimmedString(row?.recordId) || createRecordId('Submission');
		const existing = await tx.submission.findFirst({
			where: {
				OR: [{ recordId }, { AND: [{ candidateId }, { jobOrderId }] }]
			},
			select: { id: true }
		});
		const payload = {
			status: toTrimmedString(row?.status) || 'submitted',
			notes: toTrimmedString(row?.notes),
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

		const sourceId = toOptionalInt(row?.id);
		if (Number.isInteger(sourceId)) {
			submissionIdBySourceId.set(sourceId, saved.id);
		}
		submissionIdByRecordId.set(recordId, saved.id);
	}

	for (const row of data.interviews) {
		const candidateId = resolveTargetIdFromSource({
			sourceId: row?.candidateId,
			sourceIdToRecordId: sourceCandidateIdToRecordId,
			targetIdBySourceId: candidateIdBySourceId,
			targetIdByRecordId: candidateIdByRecordId
		});
		const jobOrderId = resolveTargetIdFromSource({
			sourceId: row?.jobOrderId,
			sourceIdToRecordId: sourceJobOrderIdToRecordId,
			targetIdBySourceId: jobOrderIdBySourceId,
			targetIdByRecordId: jobOrderIdByRecordId
		});
		if (!candidateId || !jobOrderId) {
			summary.skipped.interviews += 1;
			pushError('Skipped interview row: related candidate or job order could not be resolved.');
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
			candidateId,
			jobOrderId
		};

		if (existing) {
			await tx.interview.update({
				where: { id: existing.id },
				data: payload
			});
			summary.updated.interviews += 1;
		} else {
			await tx.interview.create({
				data: {
					recordId,
					...payload
				}
			});
			summary.created.interviews += 1;
		}
	}

	for (const row of data.placements) {
		const candidateId = resolveTargetIdFromSource({
			sourceId: row?.candidateId,
			sourceIdToRecordId: sourceCandidateIdToRecordId,
			targetIdBySourceId: candidateIdBySourceId,
			targetIdByRecordId: candidateIdByRecordId
		});
		const jobOrderId = resolveTargetIdFromSource({
			sourceId: row?.jobOrderId,
			sourceIdToRecordId: sourceJobOrderIdToRecordId,
			targetIdBySourceId: jobOrderIdBySourceId,
			targetIdByRecordId: jobOrderIdByRecordId
		});
		if (!candidateId || !jobOrderId) {
			summary.skipped.placements += 1;
			pushError('Skipped placement row: related candidate or job order could not be resolved.');
			continue;
		}

		const submissionId = resolveTargetIdFromSource({
			sourceId: row?.submissionId,
			sourceIdToRecordId: sourceSubmissionIdToRecordId,
			targetIdBySourceId: submissionIdBySourceId,
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
		} else {
			await tx.offer.create({
				data: {
					recordId,
					...payload
				}
			});
			summary.created.placements += 1;
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

async function postAdmin_data_importHandler(req) {
	const actingUser = await getActingUser(req, { allowFallback: false });
	if (actingUser?.role !== 'ADMINISTRATOR') {
		throw new AccessControlError('Only administrators can import data.', 403);
	}

	const formData = await req.formData();
	const mode = parseMode(formData.get('mode'));
	const file = formData.get('file');
	const sourceType = parseSourceType(formData.get('sourceType'));
	const bullhornEntity = sourceType === 'bullhorn_csv'
		? parseBullhornEntityProfile(formData.get('bullhornEntity'))
		: null;
	const parsedImport = sourceType === 'bullhorn_csv'
		? await parseUploadedBullhornCsvFile(file, bullhornEntity)
		: await parseUploadedHireGnomeImportFile(file);
	const preview = buildPreviewSummary(parsedImport.data);
	if (mode === 'preview') {
		return NextResponse.json({
			mode,
			sourceType,
			bullhornEntity,
			format: parsedImport.format,
			preview
		});
	}

	const mutationThrottleResponse = await enforceMutationThrottle(req, 'admin.data_import.post');
	if (mutationThrottleResponse) {
		return mutationThrottleResponse;
	}

	const imported = await prisma.$transaction((tx) => importData(tx, parsedImport.data, actingUser));
	return NextResponse.json({
		mode,
		sourceType,
		bullhornEntity,
		format: parsedImport.format,
		preview,
		result: imported
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
