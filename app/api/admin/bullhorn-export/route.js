import { NextResponse } from 'next/server';
import { AccessControlError, getActingUser } from '@/lib/access-control';
import { withApiLogging } from '@/lib/api-logging';
import { BullhornExportValidationError, createBullhornExportBatch } from '@/lib/bullhorn-export';

export const dynamic = 'force-dynamic';

async function postAdminBullhornExportHandler(req) {
	const actingUser = await getActingUser(req, { allowFallback: false });
	if (actingUser?.role !== 'ADMINISTRATOR') {
		throw new AccessControlError('Only administrators can export Bullhorn data.', 403);
	}

	let body;
	try {
		body = await req.json();
	} catch {
		throw new BullhornExportValidationError('Request body must be valid JSON.');
	}

	const result = await createBullhornExportBatch({
		username: body?.username,
		password: body?.password,
		clientId: body?.clientId,
		clientSecret: body?.clientSecret,
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

export const POST = withApiLogging('admin.bullhorn_export.post', postAdminBullhornExportHandler);
