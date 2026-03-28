import { NextResponse } from 'next/server';
import { AccessControlError, getActingUser } from '@/lib/access-control';
import { withApiLogging } from '@/lib/api-logging';
import { BULLHORN_EXPORT_JOB_STATUSES, deleteBullhornExportJobFile } from '@/lib/bullhorn-export-jobs';
import { getBullhornOperationsEnabled } from '@/lib/integration-operations';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

async function patchAdminBullhornExportJobHandler(req, context) {
	if (!getBullhornOperationsEnabled()) {
		return NextResponse.json({ error: 'Bullhorn operations are disabled.' }, { status: 403 });
	}

	const actingUser = await getActingUser(req, { allowFallback: false });
	if (actingUser?.role !== 'ADMINISTRATOR') {
		throw new AccessControlError('Only administrators can cancel Bullhorn export jobs.', 403);
	}

	let body;
	try {
		body = await req.json();
	} catch {
		body = {};
	}
	if (String(body?.action || '').trim().toLowerCase() !== 'cancel') {
		return NextResponse.json({ error: 'Unsupported job action.' }, { status: 400 });
	}

	const { recordId } = await context.params;
	const job = await prisma.bullhornExportJob.findUnique({
		where: { recordId }
	});
	if (!job) {
		return NextResponse.json({ error: 'Export job was not found.' }, { status: 404 });
	}

	if (job.status === BULLHORN_EXPORT_JOB_STATUSES.QUEUED || job.status === BULLHORN_EXPORT_JOB_STATUSES.RUNNING) {
		await prisma.bullhornExportJob.update({
			where: { recordId },
			data: {
				status: BULLHORN_EXPORT_JOB_STATUSES.CANCELLED,
				completedAt: new Date(),
				errorMessage: 'Cancelled by user.'
			}
		});
		return NextResponse.json({ ok: true });
	}

	return NextResponse.json({ error: 'Only queued or running export jobs can be cancelled.' }, { status: 409 });
}

async function deleteAdminBullhornExportJobHandler(req, context) {
	if (!getBullhornOperationsEnabled()) {
		return NextResponse.json({ error: 'Bullhorn operations are disabled.' }, { status: 403 });
	}
	const actingUser = await getActingUser(req, { allowFallback: false });
	if (actingUser?.role !== 'ADMINISTRATOR') {
		throw new AccessControlError('Only administrators can delete Bullhorn export jobs.', 403);
	}

	const { recordId } = await context.params;
	const job = await prisma.bullhornExportJob.findUnique({
		where: { recordId }
	});
	if (!job) {
		return NextResponse.json({ error: 'Export job was not found.' }, { status: 404 });
	}

	if (
		job.status === BULLHORN_EXPORT_JOB_STATUSES.QUEUED
		|| job.status === BULLHORN_EXPORT_JOB_STATUSES.RUNNING
		|| job.status === BULLHORN_EXPORT_JOB_STATUSES.IMPORTING
	) {
		return NextResponse.json({ error: 'Active Bullhorn export jobs cannot be deleted.' }, { status: 409 });
	}

	await deleteBullhornExportJobFile(job.filePath);
	await prisma.bullhornExportJob.delete({
		where: { recordId }
	});

	return NextResponse.json({ ok: true });
}

function handleError(error) {
	if (error instanceof AccessControlError) {
		return NextResponse.json({ error: error.message }, { status: error.status });
	}
	return NextResponse.json({ error: 'Failed to update Bullhorn export job.' }, { status: 500 });
}

async function patchRouteHandler(req, context) {
	try {
		return await patchAdminBullhornExportJobHandler(req, context);
	} catch (error) {
		return handleError(error);
	}
}

async function deleteRouteHandler(req, context) {
	try {
		return await deleteAdminBullhornExportJobHandler(req, context);
	} catch (error) {
		if (error instanceof AccessControlError) {
			return NextResponse.json({ error: error.message }, { status: error.status });
		}
		return NextResponse.json({ error: 'Failed to delete Bullhorn export job.' }, { status: 500 });
	}
}

export const PATCH = withApiLogging('admin.bullhorn_export_jobs.record_id.patch', patchRouteHandler);
export const DELETE = withApiLogging('admin.bullhorn_export_jobs.record_id.delete', deleteRouteHandler);
