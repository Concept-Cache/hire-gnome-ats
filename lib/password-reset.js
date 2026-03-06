import crypto from 'node:crypto';

const PASSWORD_RESET_TOKEN_BYTES = 32;
const DEFAULT_PASSWORD_RESET_TTL_MINUTES = 60;
const MIN_PASSWORD_RESET_TTL_MINUTES = 15;
const MAX_PASSWORD_RESET_TTL_MINUTES = 24 * 60;

function parsePositiveInt(value) {
	const parsed = Number.parseInt(String(value || '').trim(), 10);
	if (!Number.isInteger(parsed) || parsed <= 0) return null;
	return parsed;
}

function clampTtlMinutes(value) {
	const parsed = parsePositiveInt(value);
	if (!parsed) return DEFAULT_PASSWORD_RESET_TTL_MINUTES;
	if (parsed < MIN_PASSWORD_RESET_TTL_MINUTES) return MIN_PASSWORD_RESET_TTL_MINUTES;
	if (parsed > MAX_PASSWORD_RESET_TTL_MINUTES) return MAX_PASSWORD_RESET_TTL_MINUTES;
	return parsed;
}

export function getPasswordResetTtlMinutes() {
	return clampTtlMinutes(process.env.AUTH_PASSWORD_RESET_TOKEN_TTL_MINUTES);
}

export function generatePasswordResetToken() {
	return crypto.randomBytes(PASSWORD_RESET_TOKEN_BYTES).toString('base64url');
}

export function hashPasswordResetToken(value) {
	const token = String(value || '').trim();
	if (!token) return '';
	return crypto.createHash('sha256').update(token).digest('base64url');
}

export function getPasswordResetExpiresAt(fromDate = new Date()) {
	const ttlMinutes = getPasswordResetTtlMinutes();
	return new Date(fromDate.getTime() + ttlMinutes * 60 * 1000);
}

function normalizeBaseUrl(value) {
	const trimmed = String(value || '').trim();
	if (!trimmed) return '';
	try {
		const url = new URL(trimmed);
		return url.origin;
	} catch {
		return '';
	}
}

function getRequestOrigin(req) {
	if (req?.nextUrl?.origin) {
		return normalizeBaseUrl(req.nextUrl.origin);
	}

	const host = String(
		req?.headers?.get('x-forwarded-host') ||
		req?.headers?.get('host') ||
		''
	).trim();
	if (!host) return '';

	const protocol = String(req?.headers?.get('x-forwarded-proto') || 'http').trim().toLowerCase();
	const safeProtocol = protocol === 'https' ? 'https' : 'http';
	return normalizeBaseUrl(`${safeProtocol}://${host}`);
}

export function getAuthAppBaseUrl(req) {
	const envBaseUrl = normalizeBaseUrl(process.env.AUTH_APP_BASE_URL || process.env.APP_BASE_URL);
	if (envBaseUrl) return envBaseUrl;

	const requestOrigin = getRequestOrigin(req);
	if (requestOrigin) return requestOrigin;

	return 'http://localhost:3000';
}

export function buildPasswordResetUrl({ req, token }) {
	const baseUrl = getAuthAppBaseUrl(req);
	const url = new URL('/reset-password', baseUrl);
	url.searchParams.set('token', String(token || '').trim());
	return url.toString();
}
