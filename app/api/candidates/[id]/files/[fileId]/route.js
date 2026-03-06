import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { deleteObject } from '@/lib/object-storage';
import { AccessControlError, ensureScopedEntityAccess, getActingUser } from '@/lib/access-control';
import { logDelete } from '@/lib/audit-log';
import { parseRouteId, ValidationError } from '@/lib/request-validation';
import { enforceMutationThrottle } from '@/lib/mutation-throttle';

import { withApiLogging } from '@/lib/api-logging';
function isObjectMissingError(error) {
	return (
		error?.code === 'ENOENT' ||
		error?.name === 'NoSuchKey' ||
		error?.$metadata?.httpStatusCode === 404
	);
}

function handleError(error, fallbackMessage) {
	if (error instanceof AccessControlError) {
		return NextResponse.json({ error: error.message }, { status: error.status });
	}
	if (error instanceof ValidationError) {
		return NextResponse.json({ error: error.message }, { status: 400 });
	}

	return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

async function deleteCandidates_id_files_fileidHandler(req, { params }) {
	try {
		const mutationThrottleResponse = await enforceMutationThrottle(req, 'candidates.id.files.fileid.delete');
		if (mutationThrottleResponse) {
			return mutationThrottleResponse;
		}

		const awaitedParams = await params;
		const candidateId = parseRouteId(awaitedParams);
		const fileId = parseRouteId(awaitedParams, 'fileId');

		const actingUser = await getActingUser(req, { allowFallback: false });
		await ensureScopedEntityAccess('candidate', candidateId, actingUser);

		const attachment = await prisma.candidateAttachment.findFirst({
			where: {
				id: fileId,
				candidateId
			}
		});
		if (!attachment) {
			return NextResponse.json({ error: 'File not found.' }, { status: 404 });
		}

		try {
			await deleteObject({
				key: attachment.storageKey,
				storageProvider: attachment.storageProvider,
				storageBucket: attachment.storageBucket
			});
		} catch (storageError) {
			if (!isObjectMissingError(storageError)) {
				throw storageError;
			}
		}

			await prisma.candidateAttachment.delete({
				where: { id: attachment.id }
			});
			await logDelete({
				actorUserId: actingUser?.id,
				entityType: 'CANDIDATE_ATTACHMENT',
				entity: attachment,
				metadata: { candidateId }
			});

			return NextResponse.json({ ok: true });
	} catch (error) {
		return handleError(error, 'Failed to delete file.');
	}
}

export const DELETE = withApiLogging('candidates.id.files.fileid.delete', deleteCandidates_id_files_fileidHandler);
