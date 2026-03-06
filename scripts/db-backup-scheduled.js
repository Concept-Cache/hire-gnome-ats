#!/usr/bin/env node

const { readdirSync, statSync, unlinkSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = resolve(__dirname, '..');
const defaultBackupDir = process.env.DB_BACKUP_DIR || join(projectRoot, '.backups');
const defaultRetentionDays = Number(process.env.DB_BACKUP_RETENTION_DAYS || '14');

function parseArgs() {
	const args = process.argv.slice(2);
	const outputIndex = args.indexOf('--output');
	const retentionIndex = args.indexOf('--retention-days');

	const outputDirectory = outputIndex >= 0 && args[outputIndex + 1]
		? args[outputIndex + 1]
		: defaultBackupDir;
	const retentionDays = retentionIndex >= 0 && args[retentionIndex + 1]
		? Number(args[retentionIndex + 1])
		: defaultRetentionDays;

	return {
		outputDirectory,
		retentionDays: Number.isFinite(retentionDays) && retentionDays > 0 ? retentionDays : 14
	};
}

function runBackup(outputDirectory) {
	const backupScript = join(projectRoot, 'scripts', 'db-backup.js');
	const command = spawnSync('node', [backupScript, '--output', outputDirectory], {
		cwd: projectRoot,
		stdio: 'inherit',
		env: process.env
	});

	if (command.status === 0) return;
	if (command.error) {
		throw command.error;
	}
	throw new Error(`db-backup failed with exit code ${command.status}.`);
}

function pruneBackups(outputDirectory, retentionDays) {
	const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
	let deleted = 0;
	let kept = 0;

	for (const fileName of readdirSync(outputDirectory)) {
		if (!fileName.startsWith('ats-backup-') || !fileName.endsWith('.sql')) {
			continue;
		}

		const fullPath = join(outputDirectory, fileName);
		let stats;
		try {
			stats = statSync(fullPath);
		} catch {
			continue;
		}

		if (!stats.isFile()) continue;
		if (stats.mtimeMs < cutoff) {
			unlinkSync(fullPath);
			deleted += 1;
		} else {
			kept += 1;
		}
	}

	return { deleted, kept };
}

function run() {
	const { outputDirectory, retentionDays } = parseArgs();

	runBackup(outputDirectory);
	const result = pruneBackups(outputDirectory, retentionDays);
	console.log(
		`Backup retention complete in ${outputDirectory}. Deleted ${result.deleted}, kept ${result.kept}.`
	);
}

try {
	run();
} catch (error) {
	console.error(error.message || error);
	process.exitCode = 1;
}
