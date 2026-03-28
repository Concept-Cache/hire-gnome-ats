import { NextResponse } from 'next/server';
import { withApiLogging } from '@/lib/api-logging';
import { AccessControlError, getActingUser } from '@/lib/access-control';
import { enforceMutationThrottle } from '@/lib/mutation-throttle';
import { writeAuditLog } from '@/lib/audit-log';
import { prisma } from '@/lib/prisma';
import {
	createAdminPurgeChallenge,
	getOperationalPurgeDescription,
	purgeOperationalData,
	verifyAdminPurgeChallenge
} from '@/lib/admin-purge';

export const dynamic = 'force-dynamic';

function handleError(error, fallbackMessage) {
	if (error instanceof AccessControlError) {
		return NextResponse.json({ error: error.message }, { status: error.status });
	}
	return NextResponse.json({ error: fallbackMessage }, { status: error?.status || 500 });
}

async function getAdministrator(req) {
	const actingUser = await getActingUser(req, { allowFallback: false });
	if (!actingUser || actingUser.role !== 'ADMINISTRATOR') {
		throw new AccessControlError('Administrator access is required.', 403);
	}
	return actingUser;
}

async function getAdmin_purge_dataHandler(req) {
	try {
		await getAdministrator(req);
		return NextResponse.json({
			...createAdminPurgeChallenge(),
			description: getOperationalPurgeDescription()
		});
	} catch (error) {
		return handleError(error, 'Failed to generate purge confirmation.');
	}
}

async function postAdmin_purge_dataHandler(req) {
	try {
		const actingUser = await getAdministrator(req);
		await enforceMutationThrottle(req, { bucket: 'admin:purge-data', limit: 3, windowMs: 10 * 60 * 1000 });
		const body = await req.json().catch(() => ({}));
		const verification = verifyAdminPurgeChallenge({
			token: body?.token,
			word: body?.word,
			confirmation: body?.confirmation
		});
		if (!verification.ok) {
			return NextResponse.json({ error: verification.reason }, { status: 400 });
		}

		const purgeResult = await purgeOperationalData(prisma);
		await writeAuditLog({
			actorUserId: actingUser.id,
			action: 'DELETE',
			entityType: 'SYSTEM_PURGE',
			summary: 'Purged operational ATS data.',
			metadata: {
				description: getOperationalPurgeDescription(),
				summary: purgeResult.summary,
				storageCleanup: purgeResult.storageCleanup
			}
		});

		return NextResponse.json({
			ok: true,
			summary: purgeResult.summary,
			storageCleanup: purgeResult.storageCleanup
		});
	} catch (error) {
		return handleError(error, 'Failed to purge operational data.');
	}
}

export const GET = withApiLogging('admin.purge_data.get', getAdmin_purge_dataHandler);
export const POST = withApiLogging('admin.purge_data.post', postAdmin_purge_dataHandler);
