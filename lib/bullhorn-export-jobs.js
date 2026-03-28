import fs from 'node:fs/promises';
import path from 'node:path';
import { prisma } from './prisma.js';
import { createRecordId } from './record-id.js';
import { BullhornExportCancelledError, createBullhornExportBatch } from './bullhorn-export.js';
import { createNotification } from './notifications.js';
import { getSystemSettingRecord } from './system-settings.js';

const EXPORT_DIRECTORY = path.join(process.cwd(), '.generated', 'bullhorn-exports');
const queueState = globalThis.__bullhornExportQueueState ?? {
	activeRecordIds: new Set(),
	credentialOverrides: new Map(),
	drainScheduled: false
};
globalThis.__bullhornExportQueueState = queueState;

export const BULLHORN_EXPORT_JOB_STATUSES = Object.freeze({
	QUEUED: 'queued',
	RUNNING: 'running',
	CANCELLED: 'cancelled',
	COMPLETED: 'completed',
	FAILED: 'failed',
	IMPORTING: 'importing',
	IMPORTED: 'imported'
});

export async function ensureBullhornExportDirectory() {
	await fs.mkdir(EXPORT_DIRECTORY, { recursive: true });
	return EXPORT_DIRECTORY;
}

export function buildBullhornExportFilePath(recordId) {
	return path.join(EXPORT_DIRECTORY, `${recordId}.zip`);
}

export function serializeBullhornExportJob(job) {
	const rowCounts = job.rowCounts && typeof job.rowCounts === 'object' ? job.rowCounts : null;
	const diagnostics = rowCounts?.diagnostics && typeof rowCounts.diagnostics === 'object'
		? rowCounts.diagnostics
		: null;
	if (!job) return null;
	return {
		id: job.id,
		recordId: job.recordId,
		status: job.status,
		dateFrom: job.dateFrom,
		dateTo: job.dateTo,
		sampleLimit: job.sampleLimit,
		includeFiles: Boolean(job.includeFiles),
		fileName: job.fileName,
		rowCounts,
		diagnostics,
		importResult: job.importResult || null,
		errorMessage: job.errorMessage || '',
		startedAt: job.startedAt,
		completedAt: job.completedAt,
		importedAt: job.importedAt,
		createdAt: job.createdAt,
		updatedAt: job.updatedAt,
		requestedByUser: job.requestedByUser
			? {
				id: job.requestedByUser.id,
				recordId: job.requestedByUser.recordId,
				firstName: job.requestedByUser.firstName,
				lastName: job.requestedByUser.lastName,
				email: job.requestedByUser.email
			}
			: null
	};
}

export async function createBullhornExportJob({ requestedByUserId, dateFrom, dateTo, sampleLimit, includeFiles = false }) {
	await ensureBullhornExportDirectory();
	return prisma.bullhornExportJob.create({
		data: {
			recordId: createRecordId('BullhornExportJob'),
			requestedByUserId,
			status: BULLHORN_EXPORT_JOB_STATUSES.QUEUED,
			dateFrom,
			dateTo,
			sampleLimit,
			includeFiles,
			rowCounts: null,
			importResult: null
		},
		include: {
			requestedByUser: {
				select: {
					id: true,
					recordId: true,
					firstName: true,
					lastName: true,
					email: true
				}
			}
		}
	});
}

function normalizeCredentials(credentials) {
	return {
		username: String(credentials?.username || '').trim(),
		password: String(credentials?.password || '').trim(),
		clientId: String(credentials?.clientId || '').trim(),
		clientSecret: String(credentials?.clientSecret || '').trim()
	};
}

function hasCompleteCredentials(credentials) {
	return Boolean(
		credentials?.username
		&& credentials?.password
		&& credentials?.clientId
		&& credentials?.clientSecret
	);
}

async function getSavedBullhornCredentials() {
	const setting = await getSystemSettingRecord();
	return normalizeCredentials({
		username: setting?.bullhornUsername,
		password: setting?.bullhornPassword,
		clientId: setting?.bullhornClientId,
		clientSecret: setting?.bullhornClientSecret
	});
}

async function resolveCredentialsForJob(recordId) {
	const override = queueState.credentialOverrides.get(recordId);
	if (hasCompleteCredentials(override)) return override;
	return getSavedBullhornCredentials();
}

async function runBullhornExportJob(recordId) {
	const credentials = await resolveCredentialsForJob(recordId);
	if (!hasCompleteCredentials(credentials)) {
		await prisma.bullhornExportJob.update({
			where: { recordId },
			data: {
				status: BULLHORN_EXPORT_JOB_STATUSES.FAILED,
				completedAt: new Date(),
				errorMessage: 'Bullhorn export credentials are missing.'
			}
		});
		return;
	}

	const job = await prisma.bullhornExportJob.findUnique({
		where: { recordId },
		select: {
			id: true,
			recordId: true,
			requestedByUserId: true,
			dateFrom: true,
			dateTo: true,
			sampleLimit: true,
			includeFiles: true,
			status: true
		}
	});
	if (!job) return;

	const claimed = await prisma.bullhornExportJob.updateMany({
		where: {
			recordId,
			status: BULLHORN_EXPORT_JOB_STATUSES.QUEUED
		},
		data: {
			status: BULLHORN_EXPORT_JOB_STATUSES.RUNNING,
			startedAt: new Date(),
			errorMessage: null
		}
	});
	if (!claimed.count) return;

	try {
		const result = await createBullhornExportBatch({
			username: credentials.username,
			password: credentials.password,
			clientId: credentials.clientId,
			clientSecret: credentials.clientSecret,
			dateFrom: job.dateFrom.toISOString(),
			dateTo: job.dateTo.toISOString(),
			sampleLimit: job.sampleLimit,
			includeFiles: Boolean(job.includeFiles),
			shouldCancel: async () => {
				const latest = await prisma.bullhornExportJob.findUnique({
					where: { recordId },
					select: { status: true }
				});
				return latest?.status === BULLHORN_EXPORT_JOB_STATUSES.CANCELLED;
			}
		});

		await ensureBullhornExportDirectory();
		const filePath = buildBullhornExportFilePath(recordId);
		await fs.writeFile(filePath, result.buffer);

		await prisma.bullhornExportJob.update({
			where: { recordId },
			data: {
				status: BULLHORN_EXPORT_JOB_STATUSES.COMPLETED,
				fileName: result.fileName,
				filePath,
				rowCounts: result.counts,
				completedAt: new Date(),
				errorMessage: null
			}
		});

		await createNotification({
			userId: job.requestedByUserId,
			type: 'info',
			title: 'Bullhorn export ready',
			message: 'Your Bullhorn export batch is ready to download or import.',
			linkHref: '/admin/exports'
		});
	} catch (error) {
		if (error instanceof BullhornExportCancelledError) {
			await prisma.bullhornExportJob.updateMany({
				where: {
					recordId,
					status: BULLHORN_EXPORT_JOB_STATUSES.RUNNING
				},
				data: {
					status: BULLHORN_EXPORT_JOB_STATUSES.CANCELLED,
					completedAt: new Date(),
					errorMessage: 'Cancelled by user.'
				}
			});
			await createNotification({
				userId: job.requestedByUserId,
				type: 'info',
				title: 'Bullhorn export cancelled',
				message: 'Your Bullhorn export was cancelled before completion.',
				linkHref: '/admin/exports'
			});
			return;
		}
		await prisma.bullhornExportJob.update({
			where: { recordId },
			data: {
				status: BULLHORN_EXPORT_JOB_STATUSES.FAILED,
				completedAt: new Date(),
				errorMessage: String(error?.message || error || 'Bullhorn export failed.')
			}
		});
		await createNotification({
			userId: job.requestedByUserId,
			type: 'warning',
			title: 'Bullhorn export failed',
			message: String(error?.message || 'Review the job in Data Export and try again.'),
			linkHref: '/admin/exports'
		});
	}
}

async function drainBullhornExportQueue() {
	queueState.drainScheduled = false;
	if (queueState.activeRecordIds.size > 0) return;

	const nextJob = await prisma.bullhornExportJob.findFirst({
		where: {
			status: BULLHORN_EXPORT_JOB_STATUSES.QUEUED
		},
		orderBy: {
			createdAt: 'asc'
		},
		select: {
			recordId: true
		}
	});
	if (!nextJob?.recordId) return;

	const { recordId } = nextJob;
	if (queueState.activeRecordIds.has(recordId)) return;

	queueState.activeRecordIds.add(recordId);
	void runBullhornExportJob(recordId)
		.finally(() => {
			queueState.activeRecordIds.delete(recordId);
			queueState.credentialOverrides.delete(recordId);
			kickBullhornExportQueue();
		});
}

export function kickBullhornExportQueue(recordId = null, credentials = null) {
	if (recordId && credentials) {
		const normalized = normalizeCredentials(credentials);
		if (hasCompleteCredentials(normalized)) {
			queueState.credentialOverrides.set(recordId, normalized);
		}
	}
	if (queueState.drainScheduled) return;
	queueState.drainScheduled = true;
	setTimeout(() => {
		void drainBullhornExportQueue();
	}, 0);
}

export async function readBullhornExportJobFile(job) {
	if (!job?.filePath) throw new Error('Export file is not available.');
	return fs.readFile(job.filePath);
}

export async function deleteBullhornExportJobFile(filePath) {
	if (!filePath) return;
	await fs.rm(filePath, { force: true });
}
