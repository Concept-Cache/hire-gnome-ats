import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { AccessControlError, getActingUser } from '@/lib/access-control';
import {
	hasScopedEntityAccess,
	isArchiveTableMissing,
	normalizeArchivableEntityType
} from '@/lib/archive-entities';
import { parseRouteId, ValidationError } from '@/lib/request-validation';
import { enforceMutationThrottle } from '@/lib/mutation-throttle';
import { withApiLogging } from '@/lib/api-logging';

function handleError(error, fallbackMessage) {
	if (error instanceof AccessControlError) {
		return NextResponse.json({ error: error.message }, { status: error.status });
	}
	if (error instanceof ValidationError) {
		return NextResponse.json({ error: error.message }, { status: error.status || 400 });
	}
	if (isArchiveTableMissing(error)) {
		return NextResponse.json(
			{ error: 'Archive tables are not available yet. Run database migrations.' },
			{ status: 503 }
		);
	}
	return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

async function deleteArchive_entityType_entityIdHandler(req, { params }) {
	try {
		const mutationThrottleResponse = await enforceMutationThrottle(req, 'archive.entityType.entityId.delete');
		if (mutationThrottleResponse) {
			return mutationThrottleResponse;
		}

		const actingUser = await getActingUser(req, { allowFallback: false });
		if (!actingUser?.id) {
			throw new AccessControlError('Authentication required.', 401);
		}

		const resolvedParams = await params;
		const entityType = normalizeArchivableEntityType(resolvedParams.entityType);
		if (!entityType) {
			throw new ValidationError('Invalid entity type.');
		}
		const entityId = parseRouteId({ id: resolvedParams.entityId });

		const hasAccess = await hasScopedEntityAccess({
			actingUser,
			entityType,
			entityId
		});
		if (!hasAccess) {
			throw new AccessControlError('Record not found or unavailable for your role.', 404);
		}

		await prisma.archivedEntity.deleteMany({
			where: {
				entityType,
				entityId
			}
		});

		return NextResponse.json({ ok: true });
	} catch (error) {
		return handleError(error, 'Failed to restore record.');
	}
}

export const DELETE = withApiLogging(
	'archive.entityType.entityId.delete',
	deleteArchive_entityType_entityIdHandler
);
