import { NextResponse } from 'next/server';
import { AccessControlError, getActingUser } from '@/lib/access-control';
import { withApiLogging } from '@/lib/api-logging';
import {
	BullhornExportValidationError,
	createBullhornExportBatch,
	estimateBullhornExportScope
} from '@/lib/bullhorn-export';
import { getBullhornOperationsEnabled } from '@/lib/integration-operations';
import { getSystemSettingRecord } from '@/lib/system-settings';

export const dynamic = 'force-dynamic';

async function getBullhornCredentials(body = null) {
	const setting = await getSystemSettingRecord();
	return {
		username: String(body?.username || setting?.bullhornUsername || '').trim(),
		password: String(body?.password || setting?.bullhornPassword || '').trim(),
		clientId: String(body?.clientId || setting?.bullhornClientId || '').trim(),
		clientSecret: String(body?.clientSecret || setting?.bullhornClientSecret || '').trim()
	};
}

async function ensureAdmin(req, message) {
	if (!getBullhornOperationsEnabled()) {
		return NextResponse.json({ error: 'Bullhorn operations are disabled.' }, { status: 403 });
	}
	const actingUser = await getActingUser(req, { allowFallback: false });
	if (actingUser?.role !== 'ADMINISTRATOR') {
		throw new AccessControlError(message, 403);
	}
	return null;
}

async function getAdminBullhornExportEstimateHandler(req) {
	const blocked = await ensureAdmin(req, 'Only administrators can estimate Bullhorn export scope.');
	if (blocked) return blocked;

	const { searchParams } = new URL(req.url);
	const credentials = await getBullhornCredentials();
	const result = await estimateBullhornExportScope({
		...credentials,
		dateFrom: searchParams.get('dateFrom'),
		dateTo: searchParams.get('dateTo')
	});

	return NextResponse.json(result);
}

async function postAdminBullhornExportHandler(req) {
	const blocked = await ensureAdmin(req, 'Only administrators can export Bullhorn data.');
	if (blocked) return blocked;

	let body;
	try {
		body = await req.json();
	} catch {
		throw new BullhornExportValidationError('Request body must be valid JSON.');
	}

	const credentials = await getBullhornCredentials(body);
	const result = await createBullhornExportBatch({
		...credentials,
		dateFrom: body?.dateFrom,
		dateTo: body?.dateTo,
		sampleLimit: body?.sampleLimit
	});

	return new NextResponse(result.buffer, {
		status: 200,
		headers: {
			'content-type': 'application/zip',
			'content-disposition': `attachment; filename="${result.fileName}"`,
			'x-bullhorn-export-counts': JSON.stringify(result.counts)
		}
	});
}

function handleError(error, fallbackMessage) {
	if (error instanceof AccessControlError) {
		return NextResponse.json({ error: error.message }, { status: error.status });
	}
	if (error instanceof BullhornExportValidationError) {
		return NextResponse.json({ error: error.message }, { status: error.status || 400 });
	}
	return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

async function getRouteHandler(req) {
	try {
		return await getAdminBullhornExportEstimateHandler(req);
	} catch (error) {
		return handleError(error, 'Failed to estimate Bullhorn export scope.');
	}
}

async function postRouteHandler(req) {
	try {
		return await postAdminBullhornExportHandler(req);
	} catch (error) {
		return handleError(error, 'Failed to export Bullhorn data.');
	}
}

export const GET = withApiLogging('admin.bullhorn_export.get', getRouteHandler);
export const POST = withApiLogging('admin.bullhorn_export.post', postRouteHandler);
