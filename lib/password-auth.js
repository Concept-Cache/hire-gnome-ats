import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(crypto.scrypt);
const PASSWORD_HASH_VERSION = 's1';
const SALT_BYTES = 16;
const DERIVED_KEY_BYTES = 64;
const MIN_PASSWORD_LENGTH = 8;

function toStringValue(value) {
	return String(value || '').trim();
}

export function isAcceptablePassword(value) {
	return toStringValue(value).length >= MIN_PASSWORD_LENGTH;
}

export async function hashPassword(value) {
	const password = toStringValue(value);
	if (!isAcceptablePassword(password)) {
		throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
	}

	const salt = crypto.randomBytes(SALT_BYTES);
	const derivedKey = await scryptAsync(password, salt, DERIVED_KEY_BYTES);
	return `${PASSWORD_HASH_VERSION}$${salt.toString('base64url')}$${Buffer.from(derivedKey).toString('base64url')}`;
}

export async function verifyPassword(value, passwordHash) {
	const password = toStringValue(value);
	const hash = toStringValue(passwordHash);
	if (!password || !hash) return false;

	const parts = hash.split('$');
	if (parts.length !== 3 || parts[0] !== PASSWORD_HASH_VERSION) {
		return false;
	}

	const salt = Buffer.from(parts[1], 'base64url');
	const expectedKey = Buffer.from(parts[2], 'base64url');
	if (!salt.length || !expectedKey.length) {
		return false;
	}

	const derivedKey = await scryptAsync(password, salt, expectedKey.length);
	const actualKey = Buffer.from(derivedKey);
	if (actualKey.length !== expectedKey.length) {
		return false;
	}

	return crypto.timingSafeEqual(actualKey, expectedKey);
}
