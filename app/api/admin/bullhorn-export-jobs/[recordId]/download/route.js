import { NextResponse } from 'next/server';
import { AccessControlError, getActingUser } from '@/lib/access-control';
import { withApiLogging } from '@/lib/api-logging';
import { readBullhornExportJobFile } from '@/lib/bullhorn-export-jobs';
import { getBullhornOperationsEnabled } from '@/lib/integration-operations';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

async function getAdminBullhornExportJobDownloadHandler(req, context) {
	if (!getBullhornOperationsEnabled()) {
		return NextResponse.json({ error: 'Bullhorn operations are disabled.' }, { status: 403 });
	}
	const actingUser = await getActingUser(req, { allowFallback: false });
	if (actingUser?.role !== 'ADMINISTRATOR') {
		throw new AccessControlError('Only administrators can download Bullhorn export jobs.', 403);
	}

	const { recordId } = await context.params;
	const job = await prisma.bullhornExportJob.findUnique({
		where: { recordId }
	});
	if (!job) {
		return NextResponse.json({ error: 'Export job was not found.' }, { status: 404 });
	}
	if (!job.filePath || (job.status !== 'completed' && job.status !== 'imported' && job.status !== 'importing')) {
		return NextResponse.json({ error: 'Export file is not ready yet.' }, { status: 409 });
	}

	const buffer = await readBullhornExportJobFile(job);
	return new NextResponse(buffer, {
		status: 200,
		headers: {
			'content-type': 'application/zip',
			'content-disposition': `attachment; filename="${job.fileName || `${recordId}.zip`}"`,
			'cache-control': 'no-store'
		}
	});
}

async function routeHandler(req, context) {
	try {
		return await getAdminBullhornExportJobDownloadHandler(req, context);
	} catch (error) {
		if (error instanceof AccessControlError) {
			return NextResponse.json({ error: error.message }, { status: error.status });
		}
		return NextResponse.json({ error: 'Failed to download Bullhorn export job.' }, { status: 500 });
	}
}

export const GET = withApiLogging('admin.bullhorn_export_jobs.record_id.download.get', routeHandler);
