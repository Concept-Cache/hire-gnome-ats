import fs from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { getIntegrationSettings } from '@/lib/system-settings';
import { getOnboardingState } from '@/lib/onboarding';
import { getObjectStorageConfig } from '@/lib/object-storage';

export const dynamic = 'force-dynamic';

function readEnvFileValues() {
	try {
		return fs
			.readFile(path.resolve(process.cwd(), '.env'), 'utf8')
			.then((content) => {
				const values = {};
				for (const line of content.split(/\r?\n/)) {
					const trimmed = line.trim();
					if (!trimmed || trimmed.startsWith('#')) continue;
					const index = trimmed.indexOf('=');
					if (index < 0) continue;
					const key = trimmed.slice(0, index).trim();
					values[key] = true;
				}
				return values;
			})
			.catch(() => ({}));
	} catch {
		return Promise.resolve({});
	}
}

async function hasDatabaseConnection() {
	const start = Date.now();
	try {
		await prisma.$queryRaw`SELECT 1`;
		return {
			ok: true,
			responseMs: Date.now() - start
		};
	} catch (error) {
		return {
			ok: false,
			error: error?.message || 'database_unavailable'
		};
	}
}

function buildPresenceFlag(value) {
	return Boolean(String(value || '').trim());
}

async function buildIntegrationHealth() {
	try {
		const integrationSettings = await getIntegrationSettings();
		const objectStorage = await getObjectStorageConfig();
		const objectStorageConfigured = objectStorage.mode === 'local'
			? true
			: buildPresenceFlag(objectStorage.bucket);
		return {
			openAi: buildPresenceFlag(integrationSettings.openAiApiKey),
			googleMaps: buildPresenceFlag(integrationSettings.googleMapsApiKey),
			smtp: buildPresenceFlag(integrationSettings.smtpHost)
				&& buildPresenceFlag(integrationSettings.smtpUser),
			openAiResumeModel: integrationSettings.openAiResumeModel || 'default',
			careerSiteEnabled: Boolean(integrationSettings.careerSiteEnabled),
			objectStorageMode: objectStorage.mode,
			objectStorageConfigured
		};
	} catch {
		return {
			openAi: false,
			googleMaps: false,
			smtp: false,
			openAiResumeModel: 'default',
			careerSiteEnabled: false,
			objectStorageMode: 'local',
			objectStorageConfigured: false
		};
	}
}

async function getHealthStatus() {
	const [db, onboardingState, envVars, integration] = await Promise.all([
		hasDatabaseConnection(),
		getOnboardingState(),
		readEnvFileValues(),
		buildIntegrationHealth()
	]);

	return {
		timestamp: new Date().toISOString(),
		version: process.env.npm_package_version || '0.1.0',
		service: 'Hire Gnome ATS',
		ok: db.ok && onboardingState !== null,
		database: {
			...db
		},
		onboarding: {
			needsOnboarding: onboardingState?.needsOnboarding ?? true,
			hasUsers: Boolean(onboardingState?.hasUsers),
			hasSystemSetting: Boolean(onboardingState?.hasSystemSetting)
		},
		config: {
			nodeEnv: process.env.NODE_ENV || 'development',
			authSessionSecretConfigured: buildPresenceFlag(process.env.AUTH_SESSION_SECRET),
			rateLimitSecretConfigured: buildPresenceFlag(process.env.RATE_LIMIT_SECRET),
			envFilePresent: Boolean(envVars?.DATABASE_URL && envVars?.AUTH_SESSION_SECRET),
			integrations: integration
		}
	};
}

export async function GET() {
	const health = await getHealthStatus();
	const statusCode = health.database.ok ? 200 : 503;
	return NextResponse.json(health, {
		status: statusCode,
		headers: {
			'Cache-Control': 'no-store'
		}
	});
}
