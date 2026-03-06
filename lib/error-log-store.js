import { prisma } from '@/lib/prisma';
import { DEFAULT_API_ERROR_LOG_RETENTION_DAYS, getIntegrationSettings } from '@/lib/system-settings';

const API_ERROR_LOG_MAX_ENTRIES = 500;
const PERSIST_FAILURE_WARN_INTERVAL_MS = 60 * 1000;
const PERSIST_BACKOFF_MS = 30 * 1000;
const MISSING_TABLE_BACKOFF_MS = 5 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 15 * 60 * 1000;

let persistDisabledUntilEpochMs = 0;
let lastPersistFailureWarnAtEpochMs = 0;
let cleanupInFlight = false;
let nextCleanupAtEpochMs = 0;

function getStore() {
	if (!globalThis.__hgApiErrorStore) {
		globalThis.__hgApiErrorStore = {
			nextId: 1,
			entries: []
		};
	}

	return globalThis.__hgApiErrorStore;
}

function asCleanString(value) {
	return typeof value === 'string' ? value.trim() : '';
}

function toIntegerOrNull(value) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return null;
	return Math.trunc(parsed);
}

function buildErrorSummary(payload) {
	const errorMessage = asCleanString(payload?.error?.message);
	if (errorMessage) return errorMessage;

	const reason = asCleanString(payload?.reason);
	if (reason) return reason;

	const fallbackMessage = asCleanString(payload?.message);
	if (fallbackMessage) return fallbackMessage;

	return 'Unknown API error';
}

function safeJsonValue(value) {
	if (value == null) return null;
	try {
		return JSON.parse(JSON.stringify(value));
	} catch {
		return null;
	}
}

function buildEntry(payload) {
	return {
		id: 0,
		recordId: '',
		timestamp: asCleanString(payload?.timestamp) || new Date().toISOString(),
		level: asCleanString(payload?.level) || 'error',
		event: asCleanString(payload?.event) || 'api.error',
		requestId: asCleanString(payload?.requestId),
		method: asCleanString(payload?.method).toUpperCase(),
		path: asCleanString(payload?.path),
		route: asCleanString(payload?.route),
		status: toIntegerOrNull(payload?.status),
		durationMs: toIntegerOrNull(payload?.durationMs),
		summary: buildErrorSummary(payload),
		reason: asCleanString(payload?.reason),
		error: safeJsonValue(payload?.error),
		payload: safeJsonValue(payload)
	};
}

function addMemoryEntry(entry) {
	const store = getStore();
	const memoryEntry = {
		...entry,
		id: store.nextId
	};
	store.entries.push(memoryEntry);
	store.nextId += 1;

	if (store.entries.length > API_ERROR_LOG_MAX_ENTRIES) {
		store.entries.splice(0, store.entries.length - API_ERROR_LOG_MAX_ENTRIES);
	}

	return memoryEntry;
}

function isMissingTableError(error) {
	return (
		error?.code === 'P2021' ||
		error?.code === 'P2022' ||
		String(error?.message || '').includes('ApiErrorLog')
	);
}

function maybeWarnPersistFailure(error) {
	const now = Date.now();
	if (now - lastPersistFailureWarnAtEpochMs < PERSIST_FAILURE_WARN_INTERVAL_MS) {
		return;
	}
	lastPersistFailureWarnAtEpochMs = now;
	console.warn('[api-error-log] Failed to persist API error log entry.', {
		code: error?.code || '',
		message: error instanceof Error ? error.message : String(error || '')
	});
}

function canPersistNow() {
	return Date.now() >= persistDisabledUntilEpochMs;
}

function setPersistBackoff(error) {
	const backoff = isMissingTableError(error) ? MISSING_TABLE_BACKOFF_MS : PERSIST_BACKOFF_MS;
	persistDisabledUntilEpochMs = Date.now() + backoff;
}

async function persistEntry(entry) {
	if (!canPersistNow()) return;

	try {
		await prisma.apiErrorLog.create({
			data: {
				level: entry.level || 'error',
				event: entry.event || 'api.error',
				requestId: entry.requestId || null,
				method: entry.method || null,
				path: entry.path || null,
				route: entry.route || null,
				status: entry.status ?? null,
				durationMs: entry.durationMs ?? null,
				summary: entry.summary || 'Unknown API error',
				reason: entry.reason || null,
				errorData: entry.error || null,
				payload: entry.payload || null,
				createdAt: new Date(entry.timestamp)
			}
		});
	} catch (error) {
		setPersistBackoff(error);
		maybeWarnPersistFailure(error);
	}
}

async function getRetentionDays() {
	try {
		const settings = await getIntegrationSettings();
		const parsed = Number(settings?.apiErrorLogRetentionDays);
		if (!Number.isInteger(parsed) || parsed <= 0) {
			return DEFAULT_API_ERROR_LOG_RETENTION_DAYS;
		}
		return parsed;
	} catch {
		return DEFAULT_API_ERROR_LOG_RETENTION_DAYS;
	}
}

async function runApiErrorLogCleanupNow() {
	if (!canPersistNow()) return;

	const retentionDays = await getRetentionDays();
	if (!Number.isInteger(retentionDays) || retentionDays <= 0) return;

	const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
	try {
		await prisma.apiErrorLog.deleteMany({
			where: {
				createdAt: {
					lt: cutoff
				}
			}
		});
	} catch (error) {
		setPersistBackoff(error);
		maybeWarnPersistFailure(error);
	}
}

function maybeRunApiErrorLogCleanup() {
	const now = Date.now();
	if (cleanupInFlight) return;
	if (now < nextCleanupAtEpochMs) return;

	cleanupInFlight = true;
	nextCleanupAtEpochMs = now + CLEANUP_INTERVAL_MS;
	void runApiErrorLogCleanupNow().finally(() => {
		cleanupInFlight = false;
	});
}

function buildQueryMatcher({ query = '', requestId = '' }) {
	const normalizedQuery = asCleanString(query).toLowerCase();
	const normalizedRequestId = asCleanString(requestId).toLowerCase();
	const normalizedStatus = toIntegerOrNull(query);

	return function matches(entry) {
		if (
			normalizedRequestId &&
			String(entry.requestId || '').toLowerCase() !== normalizedRequestId
		) {
			return false;
		}

		if (!normalizedQuery) {
			return true;
		}

		if (normalizedStatus != null && Number(entry.status) === normalizedStatus) {
			return true;
		}

		return [
			entry.event,
			entry.method,
			entry.path,
			entry.route,
			entry.summary,
			entry.reason,
			entry.requestId
		]
			.join(' ')
			.toLowerCase()
			.includes(normalizedQuery);
	};
}

function listMemoryApiErrorLogs({ limit = 50, query = '', requestId = '' } = {}) {
	const store = getStore();
	const normalizedLimit = Math.max(1, Math.min(500, Number(limit) || 50));
	const matches = buildQueryMatcher({ query, requestId });
	const allEntries = store.entries.slice().reverse();
	const logs = allEntries.filter(matches).slice(0, normalizedLimit);
	const lastLoggedAt = allEntries.length > 0 ? allEntries[0].timestamp : null;

	return {
		logs,
		total: allEntries.length,
		lastLoggedAt,
		source: 'memory'
	};
}

function buildDatabaseWhere({ query = '', requestId = '' }) {
	const normalizedQuery = asCleanString(query);
	const normalizedRequestId = asCleanString(requestId);
	const andConditions = [];

	if (normalizedRequestId) {
		andConditions.push({ requestId: normalizedRequestId });
	}

	if (normalizedQuery) {
		const orConditions = [
			{ event: { contains: normalizedQuery } },
			{ summary: { contains: normalizedQuery } },
			{ reason: { contains: normalizedQuery } },
			{ method: { contains: normalizedQuery } },
			{ path: { contains: normalizedQuery } },
			{ route: { contains: normalizedQuery } },
			{ requestId: { contains: normalizedQuery } }
		];
		const asStatus = toIntegerOrNull(normalizedQuery);
		if (asStatus != null) {
			orConditions.push({ status: asStatus });
		}
		andConditions.push({ OR: orConditions });
	}

	if (andConditions.length === 0) return undefined;
	if (andConditions.length === 1) return andConditions[0];
	return { AND: andConditions };
}

function mapDatabaseEntry(entry) {
	return {
		id: entry.id,
		recordId: entry.recordId || '',
		timestamp: entry.createdAt ? new Date(entry.createdAt).toISOString() : '',
		level: asCleanString(entry.level) || 'error',
		event: asCleanString(entry.event) || 'api.error',
		requestId: asCleanString(entry.requestId),
		method: asCleanString(entry.method).toUpperCase(),
		path: asCleanString(entry.path),
		route: asCleanString(entry.route),
		status: entry.status == null ? null : Number(entry.status),
		durationMs: entry.durationMs == null ? null : Number(entry.durationMs),
		summary: asCleanString(entry.summary) || 'Unknown API error',
		reason: asCleanString(entry.reason),
		error: entry.errorData || null,
		payload: entry.payload || null
	};
}

async function listDatabaseApiErrorLogs({ limit = 50, query = '', requestId = '' } = {}) {
	const normalizedLimit = Math.max(1, Math.min(500, Number(limit) || 50));
	const where = buildDatabaseWhere({ query, requestId });

	const [rows, total, latest] = await prisma.$transaction([
		prisma.apiErrorLog.findMany({
			where,
			orderBy: { createdAt: 'desc' },
			take: normalizedLimit
		}),
		prisma.apiErrorLog.count({ where }),
		prisma.apiErrorLog.findFirst({
			orderBy: { createdAt: 'desc' },
			select: { createdAt: true }
		})
	]);

	return {
		logs: rows.map(mapDatabaseEntry),
		total,
		lastLoggedAt: latest?.createdAt ? latest.createdAt.toISOString() : null,
		source: 'database'
	};
}

export function pushApiErrorLog(payload) {
	const entry = buildEntry(payload);
	const memoryEntry = addMemoryEntry(entry);
	void persistEntry(memoryEntry);
	maybeRunApiErrorLogCleanup();
	return memoryEntry;
}

export async function purgeApiErrorLogs() {
	const store = getStore();
	const deletedFromMemory = store.entries.length;
	store.entries = [];
	store.nextId = 1;

	let deletedFromDatabase = 0;
	let databaseError = null;
	try {
		const deleted = await prisma.apiErrorLog.deleteMany({
			where: {}
		});
		deletedFromDatabase = deleted?.count || 0;
	} catch (error) {
		databaseError = error;
		maybeWarnPersistFailure(error);
	}

	return {
		deletedFromMemory,
		deletedFromDatabase,
		totalDeleted: deletedFromMemory + deletedFromDatabase,
		databaseError: databaseError
			? (databaseError?.message || 'Unable to purge persisted logs.')
			: null
	};
}

export async function getApiErrorLogsSnapshot({ limit = 50, query = '', requestId = '' } = {}) {
	maybeRunApiErrorLogCleanup();
	try {
		return await listDatabaseApiErrorLogs({ limit, query, requestId });
	} catch (error) {
		maybeWarnPersistFailure(error);
		return listMemoryApiErrorLogs({ limit, query, requestId });
	}
}
