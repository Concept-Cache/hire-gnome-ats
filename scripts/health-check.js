#!/usr/bin/env node

require('./load-env.cjs');

const defaultTarget = 'http://localhost:3000/api/health';

function parseArgs() {
	const args = process.argv.slice(2);
	let target = defaultTarget;
	let alertWebhookUrl = String(process.env.HEALTH_ALERT_WEBHOOK_URL || '').trim();

	for (let i = 0; i < args.length; i += 1) {
		const arg = args[i];
		if (!arg) continue;
		if (!arg.startsWith('--') && target === defaultTarget) {
			target = arg;
			continue;
		}
		if (arg === '--alert-webhook' && args[i + 1]) {
			alertWebhookUrl = String(args[i + 1] || '').trim();
			i += 1;
		}
	}

	return { target, alertWebhookUrl };
}

async function postHealthAlert(alertWebhookUrl, payload) {
	if (!alertWebhookUrl) return;
	try {
		await fetch(alertWebhookUrl, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				source: String(process.env.HEALTH_ALERT_SOURCE || 'hire-gnome-ats').trim() || 'hire-gnome-ats',
				event: 'health_check_failed',
				timestamp: new Date().toISOString(),
				...payload
			})
		});
	} catch (error) {
		console.error(error?.message || 'Failed to send health alert webhook.');
	}
}

(async () => {
	const { target, alertWebhookUrl } = parseArgs();
	try {
		const response = await fetch(target);
		const payload = await response.json().catch(() => ({
			text: 'Could not parse JSON response.'
		}));
		console.log(`Health check: ${response.status} ${response.statusText}`);
		console.log(JSON.stringify(payload, null, 2));
		const isHealthy = response.ok && payload?.ok !== false;
		if (!isHealthy) {
			await postHealthAlert(alertWebhookUrl, {
				target,
				status: response.status,
				statusText: response.statusText,
				payload
			});
		}
		process.exitCode = isHealthy ? 0 : 1;
	} catch (error) {
		console.error(error?.message || 'Health check failed.');
		await postHealthAlert(alertWebhookUrl, {
			target,
			error: error?.message || 'Health check failed.'
		});
		process.exitCode = 1;
	}
})();
