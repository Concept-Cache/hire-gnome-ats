#!/usr/bin/env node

const fs = require('node:fs/promises');

async function main() {
	const [recordId] = process.argv.slice(2);
	if (!recordId) {
		throw new Error('Bullhorn export job recordId is required.');
	}

	const { prisma } = await import('../lib/prisma.js');
	const { createBullhornExportBatch } = await import('../lib/bullhorn-export.js');
	const { buildBullhornExportFilePath, ensureBullhornExportDirectory, BULLHORN_EXPORT_JOB_STATUSES } =
		await import('../lib/bullhorn-export-jobs.js');
	const { createNotification } = await import('../lib/notifications.js');

	const username = String(process.env.BULLHORN_EXPORT_USERNAME || '').trim();
	const password = String(process.env.BULLHORN_EXPORT_PASSWORD || '').trim();
	const clientId = String(process.env.BULLHORN_EXPORT_CLIENT_ID || '').trim();
	const clientSecret = String(process.env.BULLHORN_EXPORT_CLIENT_SECRET || '').trim();
	if (!username || !password || !clientId || !clientSecret) {
		throw new Error('Bullhorn export credentials were not provided to the worker.');
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
			status: true
		}
	});
	if (!job) {
		throw new Error(`Bullhorn export job ${recordId} was not found.`);
	}

	await prisma.bullhornExportJob.update({
		where: { recordId },
		data: {
			status: BULLHORN_EXPORT_JOB_STATUSES.RUNNING,
			startedAt: new Date(),
			errorMessage: null
		}
	});

	try {
		const result = await createBullhornExportBatch({
			username,
			password,
			clientId,
			clientSecret,
			dateFrom: job.dateFrom.toISOString(),
			dateTo: job.dateTo.toISOString(),
			sampleLimit: job.sampleLimit
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
		throw error;
	} finally {
		delete process.env.BULLHORN_EXPORT_USERNAME;
		delete process.env.BULLHORN_EXPORT_PASSWORD;
		delete process.env.BULLHORN_EXPORT_CLIENT_ID;
		delete process.env.BULLHORN_EXPORT_CLIENT_SECRET;
		await prisma.$disconnect().catch(() => {});
	}
}

main()
	.then(() => process.exit(0))
	.catch(() => process.exit(1));
