#!/usr/bin/env node
/* eslint-disable no-console */

const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');

const projectRoot = path.resolve(__dirname, '..');
const envPath = path.join(projectRoot, '.env');
const defaultBackupDir = path.join(projectRoot, '.backups');

function parseEnvFile(filePath) {
	try {
		const raw = fs.readFileSync(filePath, 'utf8');
		const values = {};

		for (const line of raw.split(/\r?\n/)) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith('#')) continue;

			const separator = trimmed.indexOf('=');
			if (separator < 0) continue;

			const key = trimmed.slice(0, separator).trim();
			let value = trimmed.slice(separator + 1).trim();
			if (
				(value.startsWith('"') && value.endsWith('"')) ||
				(value.startsWith("'") && value.endsWith("'"))
			) {
				value = value.slice(1, -1);
			}
			values[key] = value;
		}

		return values;
	} catch {
		return {};
	}
}

function readConfig() {
	const fromFile = parseEnvFile(envPath);
	const getValue = (key, fallback = '') => {
		const fromProcess = String(process.env[key] || '').trim();
		if (fromProcess) return fromProcess;
		return String(fromFile[key] || fallback).trim();
	};

	return {
		databaseUrl: getValue('DATABASE_URL'),
		authSessionSecret: getValue('AUTH_SESSION_SECRET'),
		authAppBaseUrl: getValue('AUTH_APP_BASE_URL'),
		emailTestMode: getValue('EMAIL_TEST_MODE', 'true').toLowerCase(),
		emailTestRecipient: getValue('EMAIL_TEST_RECIPIENT'),
		backupDir: getValue('DB_BACKUP_DIR', defaultBackupDir),
		skipDbConnectivity:
			getValue('PREFLIGHT_SKIP_DB_CONNECTIVITY', 'false').toLowerCase() === 'true',
		dbRetries: Number.parseInt(getValue('PREFLIGHT_DB_RETRIES', '1'), 10) || 1,
		dbRetryDelayMs: Number.parseInt(getValue('PREFLIGHT_DB_RETRY_DELAY_MS', '2500'), 10) || 2500
	};
}

function parseDatabaseUrl(databaseUrl) {
	const parsed = new URL(databaseUrl);
	const socket = String(parsed.searchParams.get('socket') || '').trim();

	return {
		host: parsed.hostname || 'localhost',
		port: Number(parsed.port || '3306'),
		user: decodeURIComponent(parsed.username || 'root'),
		password: decodeURIComponent(parsed.password || ''),
		database: (parsed.pathname || '/ats').replace(/^\//, ''),
		socket
	};
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function verifyDatabaseConnectivity(config, { retries, retryDelayMs }) {
	const maxAttempts = Math.max(1, retries);
	let lastError = null;

	for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
		let connection;
		try {
			const connectionConfig = config.socket
				? {
						user: config.user,
						password: config.password,
						database: config.database,
						socketPath: config.socket
					}
				: {
						host: config.host,
						port: config.port,
						user: config.user,
						password: config.password,
						database: config.database
					};

			connection = await mysql.createConnection(connectionConfig);
			await connection.query('SELECT 1');
			await connection.end();
			return;
		} catch (error) {
			lastError = error;
			if (connection) {
				try {
					await connection.end();
				} catch {
					// no-op
				}
			}

			if (attempt < maxAttempts) {
				console.warn(
					`[preflight] DB connectivity attempt ${attempt}/${maxAttempts} failed. Retrying in ${retryDelayMs}ms...`
				);
				await sleep(retryDelayMs);
			}
		}
	}

	throw lastError || new Error('Unknown DB connectivity failure.');
}

function verifyBackupDirectory(backupDir) {
	fs.mkdirSync(backupDir, { recursive: true });
	const testPath = path.join(backupDir, `.preflight-${Date.now()}.tmp`);
	fs.writeFileSync(testPath, 'ok');
	fs.unlinkSync(testPath);
}

function validateConfig(config) {
	const failures = [];
	const warnings = [];

	if (!config.databaseUrl) failures.push('DATABASE_URL is required.');
	if (!config.authSessionSecret) failures.push('AUTH_SESSION_SECRET is required.');
	if (!config.authAppBaseUrl) failures.push('AUTH_APP_BASE_URL is required.');

	if (config.authSessionSecret && config.authSessionSecret.length < 24) {
		warnings.push('AUTH_SESSION_SECRET is shorter than recommended minimum (24 chars).');
	}

	if (config.authAppBaseUrl) {
		try {
			new URL(config.authAppBaseUrl);
		} catch {
			failures.push('AUTH_APP_BASE_URL must be a valid URL.');
		}
	}

	if (config.emailTestMode === 'true' && !config.emailTestRecipient) {
		warnings.push('EMAIL_TEST_MODE is true but EMAIL_TEST_RECIPIENT is empty.');
	}

	return { failures, warnings };
}

async function run() {
	const config = readConfig();
	const { failures, warnings } = validateConfig(config);

	for (const warning of warnings) {
		console.warn(`[preflight] warning: ${warning}`);
	}

	if (failures.length > 0) {
		for (const failure of failures) {
			console.error(`[preflight] error: ${failure}`);
		}
		process.exit(1);
	}

	let dbConfig;
	try {
		dbConfig = parseDatabaseUrl(config.databaseUrl);
	} catch {
		console.error('[preflight] error: DATABASE_URL is not a valid mysql URL.');
		process.exit(1);
	}

	if (!config.skipDbConnectivity) {
		await verifyDatabaseConnectivity(dbConfig, {
			retries: config.dbRetries,
			retryDelayMs: config.dbRetryDelayMs
		});
		console.log('[preflight] Database connectivity check passed.');
	} else {
		console.log('[preflight] Database connectivity check skipped.');
	}

	verifyBackupDirectory(config.backupDir);
	console.log(`[preflight] Backup directory check passed: ${config.backupDir}`);
	console.log('[preflight] OK');
}

run().catch((error) => {
	console.error(`[preflight] error: ${error?.message || error}`);
	process.exit(1);
});
