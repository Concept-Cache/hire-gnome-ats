import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { deleteObject } from '@/lib/object-storage';
import { syncCandidateResumeSearchText } from '@/lib/candidate-resume-search';
import { AccessControlError, ensureScopedEntityAccess, getActingUser } from '@/lib/access-control';
import { logDelete, logUpdate } from '@/lib/audit-log';
import { parseJsonBody, parseRouteId, ValidationError } from '@/lib/request-validation';
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

async function patchCandidates_id_files_fileidHandler(req, { params }) {
	try {
		const mutationThrottleResponse = await enforceMutationThrottle(req, 'candidates.id.files.fileid.patch');
		if (mutationThrottleResponse) {
			return mutationThrottleResponse;
		}

		const awaitedParams = await params;
		const candidateId = parseRouteId(awaitedParams);
		const fileId = parseRouteId(awaitedParams, 'fileId');
		const body = await parseJsonBody(req);
		const nextIsResume = typeof body?.isResume === 'boolean' ? body.isResume : null;
		if (nextIsResume == null) {
			return NextResponse.json({ error: 'isResume must be provided.' }, { status: 400 });
		}

		const actingUser = await getActingUser(req, { allowFallback: false });
		await ensureScopedEntityAccess('candidate', candidateId, actingUser);

		const existing = await prisma.candidateAttachment.findFirst({
			where: {
				id: fileId,
				candidateId
			},
			include: {
				uploadedByUser: {
					select: { id: true, firstName: true, lastName: true, email: true, isActive: true }
				}
			}
		});
		if (!existing) {
			return NextResponse.json({ error: 'File not found.' }, { status: 404 });
		}

		const updated = await prisma.$transaction(async (tx) => {
			if (nextIsResume) {
				await tx.candidateAttachment.updateMany({
					where: {
						candidateId,
						isResume: true,
						NOT: { id: fileId }
					},
					data: {
						isResume: false
					}
				});
			}

			return tx.candidateAttachment.update({
				where: { id: existing.id },
				data: { isResume: nextIsResume },
				include: {
					uploadedByUser: {
						select: { id: true, firstName: true, lastName: true, email: true, isActive: true }
					}
				}
			});
		});

		await logUpdate({
			actorUserId: actingUser?.id,
			entityType: 'CANDIDATE_ATTACHMENT',
			entity: updated,
			previousEntity: existing,
			metadata: { candidateId, isResume: nextIsResume }
		});

		if (nextIsResume) {
			await syncCandidateResumeSearchText(candidateId);
		} else if (existing.isResume) {
			await prisma.candidate.update({
				where: { id: candidateId },
				data: { resumeSearchText: null }
			});
		}

		return NextResponse.json(updated);
	} catch (error) {
		return handleError(error, 'Failed to update file.');
	}
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

			if (attachment.isResume) {
				await prisma.candidate.update({
					where: { id: candidateId },
					data: { resumeSearchText: null }
				});
			}

			return NextResponse.json({ ok: true });
	} catch (error) {
		return handleError(error, 'Failed to delete file.');
	}
}

export const DELETE = withApiLogging('candidates.id.files.fileid.delete', deleteCandidates_id_files_fileidHandler);
export const PATCH = withApiLogging('candidates.id.files.fileid.patch', patchCandidates_id_files_fileidHandler);
