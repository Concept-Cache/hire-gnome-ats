#!/usr/bin/env node
/* eslint-disable no-console */

const { spawn } = require('node:child_process');

function toPositiveInt(value, fallback) {
	const parsed = Number.parseInt(String(value || '').trim(), 10);
	if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
	return parsed;
}

function toBoolean(value, fallback = false) {
	const normalized = String(value || '').trim().toLowerCase();
	if (!normalized) return fallback;
	if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
	if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
	return fallback;
}

function runResetOnce() {
	return new Promise((resolve, reject) => {
		const child = spawn('node', ['scripts/demo-reset.js', '--mode=full', '--preserve-settings=true'], {
			stdio: 'inherit',
			env: process.env
		});

		child.on('error', (error) => {
			reject(error);
		});
		child.on('exit', (code) => {
			if (code === 0) {
				resolve();
				return;
			}
			reject(new Error(`demo-reset exited with code ${code}.`));
		});
	});
}

async function main() {
	const intervalMinutes = toPositiveInt(process.env.DEMO_RESET_INTERVAL_MINUTES, 360);
	const runOnStart = toBoolean(process.env.DEMO_RESET_RUN_ON_START, true);
	const intervalMs = intervalMinutes * 60 * 1000;
	let running = false;

	console.log(`[demo-reset-loop] Interval: every ${intervalMinutes} minute(s).`);
	console.log(`[demo-reset-loop] Run on start: ${runOnStart ? 'yes' : 'no'}.`);

	const executeCycle = async () => {
		if (running) {
			console.log('[demo-reset-loop] Reset already running. Skipping this interval.');
			return;
		}
		running = true;
		const startedAt = new Date();
		console.log(`[demo-reset-loop] Reset started at ${startedAt.toISOString()}.`);
		try {
			await runResetOnce();
			console.log('[demo-reset-loop] Reset completed.');
		} catch (error) {
			console.error('[demo-reset-loop] Reset failed.');
			console.error(error?.message || error);
		} finally {
			running = false;
		}
	};

	if (runOnStart) {
		await executeCycle();
	}

	const timer = setInterval(() => {
		executeCycle().catch((error) => {
			console.error('[demo-reset-loop] Unexpected scheduler error.');
			console.error(error?.message || error);
		});
	}, intervalMs);

	timer.unref();

	const stop = () => {
		clearInterval(timer);
		console.log('[demo-reset-loop] Stopped.');
		process.exit(0);
	};

	process.on('SIGINT', stop);
	process.on('SIGTERM', stop);
}

main().catch((error) => {
	console.error('[demo-reset-loop] Fatal error.');
	console.error(error?.message || error);
	process.exit(1);
});
