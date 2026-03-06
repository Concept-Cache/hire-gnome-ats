import { pushApiErrorLog } from '@/lib/error-log-store';
import dgram from 'node:dgram';

const LOG_LEVELS = ['debug', 'info', 'warn', 'error'];
const LOG_LEVEL_PRIORITY = {
	debug: 10,
	info: 20,
	warn: 30,
	error: 40
};
const REQUEST_ID_HEADER = 'x-request-id';
const REDACTED_VALUE = '[REDACTED]';
const DEFAULT_ERROR_ALERT_COOLDOWN_SECONDS = 300;
const DEFAULT_ERROR_ALERT_SOURCE = 'hire-gnome-ats';
const DEFAULT_PAPERTRAIL_MIN_LEVEL = 'info';
const DEFAULT_PAPERTRAIL_APP_NAME = 'hire-gnome-ats';
const DEFAULT_PAPERTRAIL_FACILITY = 16;
const PAPERTRAIL_WARN_INTERVAL_MS = 60 * 1000;
const PAPERTRAIL_SEVERITY_BY_LEVEL = {
	debug: 7,
	info: 6,
	warn: 4,
	error: 3
};

const REDACTED_FIELD_PATTERNS = [
	/password/i,
	/secret/i,
	/access[_-]?key/i,
	/credentials?/i,
	/private[_-]?key/i,
	/session[_-]?secret/i,
	/api[_-]?key/i,
	/token/i,
	/authorization/i,
	/bearer/i,
	/cookie/i,
	/smtp.*pass/i,
	/passphrase/i
];

function normalizeLevel(value) {
	const normalized = String(value || '')
		.trim()
		.toLowerCase();
	if (!LOG_LEVELS.includes(normalized)) return 'info';
	return normalized;
}

function normalizeAlertMinLevel(value) {
	const normalized = normalizeLevel(value || 'error');
	return normalized;
}

function toPositiveInt(value, fallback) {
	const parsed = Number.parseInt(String(value || '').trim(), 10);
	if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
	return parsed;
}

function toBoundedInt(value, fallback, min, max) {
	const parsed = Number.parseInt(String(value || '').trim(), 10);
	if (!Number.isInteger(parsed)) return fallback;
	if (parsed < min || parsed > max) return fallback;
	return parsed;
}

function alertStateStore() {
	if (!globalThis.__hgErrorAlertState) {
		globalThis.__hgErrorAlertState = {
			lastSentByKey: new Map()
		};
	}
	return globalThis.__hgErrorAlertState;
}

function papertrailStateStore() {
	if (!globalThis.__hgPapertrailState) {
		globalThis.__hgPapertrailState = {
			socket: null,
			lastWarnAtEpochMs: 0
		};
	}
	return globalThis.__hgPapertrailState;
}

function canSendErrorAlert(payload) {
	const webhookUrl = String(process.env.ERROR_ALERT_WEBHOOK_URL || '').trim();
	if (!webhookUrl) return null;
	if (String(payload?.event || '').trim().startsWith('logger.alert')) return null;

	const minLevel = normalizeAlertMinLevel(process.env.ERROR_ALERT_MIN_LEVEL || 'error');
	const payloadPriority = LOG_LEVEL_PRIORITY[normalizeLevel(payload?.level)] ?? LOG_LEVEL_PRIORITY.info;
	const minPriority = LOG_LEVEL_PRIORITY[minLevel] ?? LOG_LEVEL_PRIORITY.error;
	if (payloadPriority < minPriority) return null;

	const cooldownSeconds = toPositiveInt(
		process.env.ERROR_ALERT_COOLDOWN_SECONDS,
		DEFAULT_ERROR_ALERT_COOLDOWN_SECONDS
	);
	const key = `${String(payload?.event || '')}|${String(payload?.path || '')}`;
	const state = alertStateStore();
	const now = Date.now();
	const lastSent = Number(state.lastSentByKey.get(key) || 0);
	if (lastSent > 0 && now - lastSent < cooldownSeconds * 1000) {
		return null;
	}

	state.lastSentByKey.set(key, now);
	return webhookUrl;
}

async function sendErrorAlert(webhookUrl, payload) {
	const source = String(process.env.ERROR_ALERT_SOURCE || DEFAULT_ERROR_ALERT_SOURCE).trim() || DEFAULT_ERROR_ALERT_SOURCE;
	const alertPayload = {
		source,
		event: 'api_error_alert',
		timestamp: payload.timestamp,
		level: payload.level,
		originalEvent: payload.event,
		path: payload.path || '',
		method: payload.method || '',
		requestId: payload.requestId || '',
		message: payload.message || ''
	};

	try {
		const response = await fetch(webhookUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(alertPayload)
		});
		if (response.ok) return;
		console.warn(
			`[logger] Error alert webhook failed with status ${response.status} ${response.statusText}.`
		);
	} catch (error) {
		console.warn(
			`[logger] Error alert webhook failed: ${error?.message || 'unknown error'}.`
		);
	}
}

function configuredLevel() {
	return normalizeLevel(process.env.LOG_LEVEL || 'info');
}

function normalizePapertrailConfig() {
	const host = String(process.env.PAPERTRAIL_HOST || '').trim();
	if (!host) return null;
	const port = toBoundedInt(process.env.PAPERTRAIL_PORT, 0, 1, 65535);
	if (!port) return null;
	const minLevel = normalizeLevel(process.env.PAPERTRAIL_MIN_LEVEL || DEFAULT_PAPERTRAIL_MIN_LEVEL);
	const appName = String(process.env.PAPERTRAIL_APP_NAME || DEFAULT_PAPERTRAIL_APP_NAME).trim() || DEFAULT_PAPERTRAIL_APP_NAME;
	const facility = toBoundedInt(process.env.PAPERTRAIL_FACILITY, DEFAULT_PAPERTRAIL_FACILITY, 0, 23);
	return {
		host,
		port,
		minLevel,
		appName,
		facility
	};
}

function warnPapertrailFailure(message, error) {
	const state = papertrailStateStore();
	const now = Date.now();
	if (now - Number(state.lastWarnAtEpochMs || 0) < PAPERTRAIL_WARN_INTERVAL_MS) return;
	state.lastWarnAtEpochMs = now;
	const detail = error?.message || String(error || '').trim() || 'unknown error';
	console.warn(`[logger] ${message}: ${detail}.`);
}

function shouldSendToPapertrail(level, minLevel) {
	const incoming = LOG_LEVEL_PRIORITY[normalizeLevel(level)] ?? LOG_LEVEL_PRIORITY.info;
	const minimum = LOG_LEVEL_PRIORITY[normalizeLevel(minLevel)] ?? LOG_LEVEL_PRIORITY.info;
	return incoming >= minimum;
}

function getPapertrailSocket() {
	const state = papertrailStateStore();
	if (state.socket) return state.socket;
	const socket = dgram.createSocket('udp4');
	socket.on('error', (error) => {
		warnPapertrailFailure('Papertrail socket error', error);
		try {
			socket.close();
		} catch {
			// Best effort.
		}
		if (papertrailStateStore().socket === socket) {
			papertrailStateStore().socket = null;
		}
	});
	try {
		socket.unref();
	} catch {
		// Not critical if unavailable.
	}
	state.socket = socket;
	return socket;
}

function asSafeTimestamp(value) {
	const parsed = Date.parse(String(value || ''));
	if (!Number.isFinite(parsed)) return new Date().toISOString();
	return new Date(parsed).toISOString();
}

function buildPapertrailLine(payload, config) {
	const timestampIso = asSafeTimestamp(payload?.timestamp);
	const host = String(process.env.HOSTNAME || 'localhost').trim() || 'localhost';
	const severity = PAPERTRAIL_SEVERITY_BY_LEVEL[normalizeLevel(payload?.level)] ?? PAPERTRAIL_SEVERITY_BY_LEVEL.info;
	const priority = config.facility * 8 + severity;
	return `<${priority}>${timestampIso} ${host} ${config.appName}: ${safeStringify(payload)}`;
}

function sendToPapertrail(payload) {
	const config = normalizePapertrailConfig();
	if (!config) return;
	if (!shouldSendToPapertrail(payload?.level, config.minLevel)) return;
	const socket = getPapertrailSocket();
	const line = buildPapertrailLine(payload, config);
	const buffer = Buffer.from(line, 'utf8');
	socket.send(buffer, config.port, config.host, (error) => {
		if (!error) return;
		warnPapertrailFailure('Papertrail UDP send failed', error);
	});
}

function shouldWrite(level) {
	const current = LOG_LEVEL_PRIORITY[configuredLevel()] ?? LOG_LEVEL_PRIORITY.info;
	const incoming = LOG_LEVEL_PRIORITY[normalizeLevel(level)] ?? LOG_LEVEL_PRIORITY.info;
	return incoming >= current;
}

function getRequestPath(req) {
	if (!req) return '';
	if (req.nextUrl?.pathname) return req.nextUrl.pathname;
	try {
		return new URL(req.url).pathname;
	} catch {
		return '';
	}
}

function getHeaderValue(req, name) {
	if (!req || !req.headers || typeof req.headers.get !== 'function') return '';
	return String(req.headers.get(name) || '').trim();
}

function getClientIp(req) {
	const forwardedFor = getHeaderValue(req, 'x-forwarded-for');
	if (forwardedFor) {
		const first = forwardedFor
			.split(',')
			.map((entry) => entry.trim())
			.find(Boolean);
		if (first) return first;
	}
	return getHeaderValue(req, 'x-real-ip');
}

export function getRequestId(req) {
	return getHeaderValue(req, REQUEST_ID_HEADER);
}

function sanitizeValue(value, seen) {
	if (value == null) return value;
	if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
		return value;
	}
	if (typeof value === 'bigint') {
		return value.toString();
	}
	if (value instanceof Date) {
		return value.toISOString();
	}
	if (value instanceof Error) {
		return {
			name: value.name,
			message: value.message,
			code: value.code,
			stack: process.env.NODE_ENV === 'production' ? undefined : value.stack
		};
	}
	if (Array.isArray(value)) {
		return value.map((entry) => sanitizeValue(entry, seen));
	}
	if (typeof value === 'object') {
		if (seen.has(value)) return '[Circular]';
		seen.add(value);
		const out = {};
		for (const [key, entry] of Object.entries(value)) {
			if (REDACTED_FIELD_PATTERNS.some((pattern) => pattern.test(String(key || '')))) {
				out[key] = REDACTED_VALUE;
				continue;
			}

			if (typeof entry === 'undefined') continue;
			out[key] = sanitizeValue(entry, seen);
		}
		seen.delete(value);
		return out;
	}
	return String(value);
}

function safeStringify(payload) {
	try {
		return JSON.stringify(payload);
	} catch {
		return JSON.stringify({
			timestamp: new Date().toISOString(),
			level: payload?.level || 'error',
			event: payload?.event || 'logger.stringify_failed',
			message: 'Failed to serialize log payload.'
		});
	}
}

function write(level, event, meta = {}) {
	const normalizedLevel = normalizeLevel(level);
	if (!shouldWrite(normalizedLevel)) return;

	const payload = {
		timestamp: new Date().toISOString(),
		level: normalizedLevel,
		event,
		...sanitizeValue(meta, new WeakSet())
	};
	const message = safeStringify(payload);
	const isApiError =
		normalizedLevel === 'error' &&
		(String(payload.path || '').startsWith('/api/') || String(payload.event || '').startsWith('api.'));

	if (isApiError) {
		try {
			pushApiErrorLog(payload);
		} catch {
			// Keep logging resilient even if the in-memory buffer fails.
		}

		const alertWebhookUrl = canSendErrorAlert(payload);
		if (alertWebhookUrl) {
			void sendErrorAlert(alertWebhookUrl, payload);
		}
	}

	sendToPapertrail(payload);

	if (normalizedLevel === 'error') {
		console.error(message);
		return;
	}
	if (normalizedLevel === 'warn') {
		console.warn(message);
		return;
	}
	console.log(message);
}

export function requestLogContext(req, extra = {}) {
	const context = {
		requestId: getRequestId(req),
		method: String(req?.method || '').toUpperCase(),
		path: getRequestPath(req),
		clientIp: getClientIp(req),
		userAgent: getHeaderValue(req, 'user-agent')
	};
	return {
		...context,
		...extra
	};
}

export function logDebug(event, meta = {}) {
	write('debug', event, meta);
}

export function logInfo(event, meta = {}) {
	write('info', event, meta);
}

export function logWarn(event, meta = {}) {
	write('warn', event, meta);
}

export function logError(event, meta = {}) {
	write('error', event, meta);
}
