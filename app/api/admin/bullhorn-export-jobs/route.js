import { NextResponse } from 'next/server';
import { AccessControlError, getActingUser } from '@/lib/access-control';
import { withApiLogging } from '@/lib/api-logging';
import { BullhornExportValidationError } from '@/lib/bullhorn-export';
import {
	createBullhornExportJob,
	kickBullhornExportQueue,
	serializeBullhornExportJob,
} from '@/lib/bullhorn-export-jobs';
import { prisma } from '@/lib/prisma';
import { getSystemSettingRecord } from '@/lib/system-settings';
import { getBullhornOperationsEnabled } from '@/lib/integration-operations';

export const dynamic = 'force-dynamic';

async function getAdminBullhornExportJobsHandler(req) {
	if (!getBullhornOperationsEnabled()) {
		return NextResponse.json({ error: 'Bullhorn operations are disabled.' }, { status: 403 });
	}
	const actingUser = await getActingUser(req, { allowFallback: false });
	if (actingUser?.role !== 'ADMINISTRATOR') {
		throw new AccessControlError('Only administrators can view Bullhorn export jobs.', 403);
	}

	kickBullhornExportQueue();

	const rows = await prisma.bullhornExportJob.findMany({
		orderBy: { createdAt: 'desc' },
		take: 20,
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

	return NextResponse.json({
		rows: rows.map(serializeBullhornExportJob)
	});
}

async function postAdminBullhornExportJobsHandler(req) {
	if (!getBullhornOperationsEnabled()) {
		return NextResponse.json({ error: 'Bullhorn operations are disabled.' }, { status: 403 });
	}
	const actingUser = await getActingUser(req, { allowFallback: false });
	if (actingUser?.role !== 'ADMINISTRATOR') {
		throw new AccessControlError('Only administrators can start Bullhorn export jobs.', 403);
	}

	let body;
	try {
		body = await req.json();
	} catch {
		throw new BullhornExportValidationError('Request body must be valid JSON.');
	}

	const dateFrom = new Date(body?.dateFrom);
	const dateTo = new Date(body?.dateTo);
	if (Number.isNaN(dateFrom.getTime())) {
		throw new BullhornExportValidationError('Updated From is invalid.');
	}
	if (Number.isNaN(dateTo.getTime())) {
		throw new BullhornExportValidationError('Updated To is invalid.');
	}
	if (dateFrom.getTime() > dateTo.getTime()) {
		throw new BullhornExportValidationError('Updated From must be before Updated To.');
	}

	const setting = await getSystemSettingRecord();
	const credentials = {
		username: String(body?.username || setting?.bullhornUsername || '').trim(),
		password: String(body?.password || setting?.bullhornPassword || '').trim(),
		clientId: String(body?.clientId || setting?.bullhornClientId || '').trim(),
		clientSecret: String(body?.clientSecret || setting?.bullhornClientSecret || '').trim()
	};
	if (!credentials.username || !credentials.password || !credentials.clientId || !credentials.clientSecret) {
		throw new BullhornExportValidationError('Bullhorn credentials are required.');
	}

	const sampleLimit = Number.parseInt(String(body?.sampleLimit || '10'), 10);
	if (!Number.isInteger(sampleLimit) || sampleLimit <= 0) {
		throw new BullhornExportValidationError('Sample limit must be a positive whole number.');
	}
	const includeFiles = Boolean(body?.includeFiles);

	const job = await createBullhornExportJob({
		requestedByUserId: actingUser.id,
		dateFrom,
		dateTo,
		sampleLimit,
		includeFiles
	});
	kickBullhornExportQueue(job.recordId, credentials);

	return NextResponse.json({
		job: serializeBullhornExportJob(job)
	});
}

function handleError(error) {
	if (error instanceof AccessControlError) {
		return NextResponse.json({ error: error.message }, { status: error.status });
	}
	if (error instanceof BullhornExportValidationError) {
		return NextResponse.json({ error: error.message }, { status: error.status || 400 });
	}
	return NextResponse.json({ error: 'Failed to manage Bullhorn export jobs.' }, { status: 500 });
}

async function getRouteHandler(req) {
	try {
		return await getAdminBullhornExportJobsHandler(req);
	} catch (error) {
		return handleError(error);
	}
}

async function postRouteHandler(req) {
	try {
		return await postAdminBullhornExportJobsHandler(req);
	} catch (error) {
		return handleError(error);
	}
}

export const GET = withApiLogging('admin.bullhorn_export_jobs.get', getRouteHandler);
export const POST = withApiLogging('admin.bullhorn_export_jobs.post', postRouteHandler);
