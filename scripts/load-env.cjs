const fs = require('node:fs');
const path = require('node:path');

function parseEnvValue(rawValue) {
	const value = String(rawValue || '').trim();
	if (!value) return '';

	const quoted =
		(value.startsWith('"') && value.endsWith('"')) ||
		(value.startsWith("'") && value.endsWith("'"));
	if (!quoted) return value;

	const quoteChar = value[0];
	const inner = value.slice(1, -1);
	if (quoteChar === "'") return inner;
	return inner
		.replace(/\\n/g, '\n')
		.replace(/\\r/g, '\r')
		.replace(/\\t/g, '\t')
		.replace(/\\"/g, '"')
		.replace(/\\\\/g, '\\');
}

function parseEnvFile(filePath) {
	let raw = '';
	try {
		raw = fs.readFileSync(filePath, 'utf8');
	} catch {
		return {};
	}

	const entries = {};
	for (const line of raw.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;

		const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
		if (!match) continue;

		const key = match[1];
		const value = parseEnvValue(match[2]);
		entries[key] = value;
	}

	return entries;
}

function applyEntries(entries, originalKeys, { forceOverride = false } = {}) {
	for (const [key, value] of Object.entries(entries)) {
		if (originalKeys.has(key)) continue;
		if (!forceOverride && typeof process.env[key] !== 'undefined') continue;
		process.env[key] = value;
	}
}

function loadEnv() {
	const projectRoot = path.resolve(__dirname, '..');
	const envPath = path.join(projectRoot, '.env');
	const envLocalPath = path.join(projectRoot, '.env.local');
	const originalKeys = new Set(Object.keys(process.env));

	applyEntries(parseEnvFile(envPath), originalKeys, { forceOverride: false });
	applyEntries(parseEnvFile(envLocalPath), originalKeys, { forceOverride: true });
}

loadEnv();

