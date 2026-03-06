#!/usr/bin/env node

const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { PrismaClient } = require('@prisma/client');

const scryptAsync = promisify(crypto.scrypt);
const PASSWORD_HASH_VERSION = 's1';
const SALT_BYTES = 16;
const DERIVED_KEY_BYTES = 64;
const MIN_PASSWORD_LENGTH = 8;
const RECORD_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const RECORD_ID_RANDOM_LENGTH = 8;
const UNASSIGNED_DIVISION_NAME = 'Unassigned';

function parseBoolean(value, fallback = false) {
	const normalized = String(value || '').trim().toLowerCase();
	if (!normalized) return fallback;
	if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
	if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
	return fallback;
}

function cleanString(value) {
	return String(value || '').trim();
}

function randomRecordToken() {
	let token = '';
	for (let i = 0; i < RECORD_ID_RANDOM_LENGTH; i += 1) {
		token += RECORD_ID_ALPHABET[crypto.randomInt(0, RECORD_ID_ALPHABET.length)];
	}
	return token;
}

function createRecordId(prefix) {
	return `${prefix}-${randomRecordToken()}`;
}

function isAcceptablePassword(value) {
	return cleanString(value).length >= MIN_PASSWORD_LENGTH;
}

async function hashPassword(value) {
	const password = cleanString(value);
	if (!isAcceptablePassword(password)) {
		throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
	}

	const salt = crypto.randomBytes(SALT_BYTES);
	const derivedKey = await scryptAsync(password, salt, DERIVED_KEY_BYTES);
	return `${PASSWORD_HASH_VERSION}$${salt.toString('base64url')}$${Buffer.from(derivedKey).toString('base64url')}`;
}

function resolveConfig() {
	const email = cleanString(process.env.BOOTSTRAP_ADMIN_EMAIL || '').toLowerCase();
	const password = cleanString(process.env.BOOTSTRAP_ADMIN_PASSWORD || '');
	const firstName = cleanString(process.env.BOOTSTRAP_ADMIN_FIRST_NAME || 'System');
	const lastName = cleanString(process.env.BOOTSTRAP_ADMIN_LAST_NAME || 'Administrator');
	const enabled = parseBoolean(process.env.BOOTSTRAP_ADMIN_ENABLED, Boolean(email && password));

	return {
		enabled,
		email,
		password,
		firstName,
		lastName
	};
}

async function main() {
	const config = resolveConfig();
	if (!config.enabled) {
		console.log('[bootstrap-admin] Skipped. Set BOOTSTRAP_ADMIN_ENABLED=true to enable provisioning.');
		return;
	}
	if (!config.email) {
		throw new Error('BOOTSTRAP_ADMIN_EMAIL is required when BOOTSTRAP_ADMIN_ENABLED=true.');
	}
	if (!isAcceptablePassword(config.password)) {
		throw new Error(`BOOTSTRAP_ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`);
	}

	const prisma = new PrismaClient();
	try {
		const existingUsers = await prisma.user.count();
		if (existingUsers > 0) {
			console.log('[bootstrap-admin] Existing users found. Skipping default admin provisioning.');
			return;
		}

		const passwordHash = await hashPassword(config.password);
		const result = await prisma.$transaction(async (tx) => {
			const division = await tx.division.upsert({
				where: { name: UNASSIGNED_DIVISION_NAME },
				update: {},
				create: {
					recordId: createRecordId('DIV'),
					name: UNASSIGNED_DIVISION_NAME,
					accessMode: 'COLLABORATIVE'
				}
			});

			const user = await tx.user.create({
				data: {
					recordId: createRecordId('USR'),
					firstName: config.firstName,
					lastName: config.lastName,
					email: config.email,
					passwordHash,
					role: 'ADMINISTRATOR',
					divisionId: division.id,
					isActive: true
				},
				select: {
					id: true,
					email: true,
					firstName: true,
					lastName: true
				}
			});

			return { user, division };
		});

		console.log(
			`[bootstrap-admin] Created default admin ${result.user.email} in division "${result.division.name}".`
		);
	} finally {
		await prisma.$disconnect();
	}
}

main().catch((error) => {
	console.error('[bootstrap-admin] Failed.');
	console.error(error?.message || error);
	process.exitCode = 1;
});
