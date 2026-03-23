import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
	CANDIDATE_ATTACHMENT_MAX_BYTES,
	isAllowedCandidateAttachmentContentType,
	isAllowedCandidateAttachmentFileName
} from '@/lib/candidate-attachment-options';
import {
	buildCandidateAttachmentStorageKey,
	uploadObjectBuffer
} from '@/lib/object-storage';
import { deriveResumeSearchTextFromBuffer } from '@/lib/candidate-resume-search';
import { AccessControlError, ensureScopedEntityAccess, getActingUser } from '@/lib/access-control';
import { logCreate } from '@/lib/audit-log';
import { parseRouteId, ValidationError } from '@/lib/request-validation';
import { enforceMutationThrottle } from '@/lib/mutation-throttle';

import { withApiLogging } from '@/lib/api-logging';

function parseBooleanFormValue(value) {
	if (typeof value === 'boolean') return value;
	const normalized = String(value || '').trim().toLowerCase();
	return normalized === 'true' || normalized === '1' || normalized === 'on' || normalized === 'yes';
}

function handleError(error, fallbackMessage) {
	if (error instanceof AccessControlError) {
		return NextResponse.json({ error: error.message }, { status: error.status });
	}
	if (error instanceof ValidationError) {
		return NextResponse.json({ error: error.message }, { status: 400 });
	}

	if (error?.code === 'P2003') {
		return NextResponse.json({ error: 'Candidate not found.' }, { status: 404 });
	}

	return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

function fileValidationError(file) {
	if (!file || typeof file.arrayBuffer !== 'function') {
		return 'Upload a file.';
	}

	if (!file.name || !isAllowedCandidateAttachmentFileName(file.name)) {
		return 'Unsupported file type.';
	}
	if (!isAllowedCandidateAttachmentContentType(file.name, file.type)) {
		return 'Unsupported file content type.';
	}

	if (file.size <= 0) {
		return 'File is empty.';
	}

	if (file.size > CANDIDATE_ATTACHMENT_MAX_BYTES) {
		return `File exceeds ${Math.floor(CANDIDATE_ATTACHMENT_MAX_BYTES / (1024 * 1024))} MB limit.`;
	}

	return '';
}

async function getCandidates_id_filesHandler(req, { params }) {
	try {
		const awaitedParams = await params;
		const candidateId = parseRouteId(awaitedParams);

		const actingUser = await getActingUser(req);
		await ensureScopedEntityAccess('candidate', candidateId, actingUser);

		const files = await prisma.candidateAttachment.findMany({
			where: { candidateId },
			orderBy: { createdAt: 'desc' },
			include: {
				uploadedByUser: {
					select: { id: true, firstName: true, lastName: true, email: true, isActive: true }
				}
			}
		});

		return NextResponse.json(files);
	} catch (error) {
		return handleError(error, 'Failed to load files.');
	}
}

async function postCandidates_id_filesHandler(req, { params }) {
	try {
		const mutationThrottleResponse = await enforceMutationThrottle(req, 'candidates.id.files.post');
		if (mutationThrottleResponse) {
			return mutationThrottleResponse;
		}

		const awaitedParams = await params;
		const candidateId = parseRouteId(awaitedParams);

		const actingUser = await getActingUser(req, { allowFallback: false });
		await ensureScopedEntityAccess('candidate', candidateId, actingUser);

		const formData = await req.formData();
		const file = formData.get('file');
		const isResume = parseBooleanFormValue(formData.get('isResume'));
		const validationError = fileValidationError(file);
		if (validationError) {
			return NextResponse.json({ error: validationError }, { status: 400 });
		}

		const buffer = Buffer.from(await file.arrayBuffer());
		const resumeSearchText = isResume
			? await deriveResumeSearchTextFromBuffer({
					buffer,
					fileName: file.name,
					contentType: file.type
				})
			: '';
		const storageKey = buildCandidateAttachmentStorageKey(candidateId, file.name);
		const uploaded = await uploadObjectBuffer({
			key: storageKey,
			body: buffer,
			contentType: file.type || 'application/octet-stream'
		});

		const attachment = await prisma.$transaction(async (tx) => {
			if (isResume) {
				await tx.candidateAttachment.updateMany({
					where: {
						candidateId,
						isResume: true
					},
					data: {
						isResume: false
					}
				});
				await tx.candidate.update({
					where: { id: candidateId },
					data: { resumeSearchText: resumeSearchText || null }
				});
			}

			return tx.candidateAttachment.create({
				data: {
					candidateId,
					fileName: file.name,
					isResume,
					contentType: file.type || null,
					sizeBytes: file.size,
					storageProvider: uploaded.storageProvider,
					storageBucket: uploaded.storageBucket,
					storageKey: uploaded.storageKey,
					uploadedByUserId: actingUser?.id || null
				},
				include: {
					uploadedByUser: {
						select: { id: true, firstName: true, lastName: true, email: true, isActive: true }
					}
				}
			});
		});
			await logCreate({
				actorUserId: actingUser?.id,
				entityType: 'CANDIDATE_ATTACHMENT',
				entity: attachment,
				metadata: { candidateId }
			});

			return NextResponse.json(attachment, { status: 201 });
	} catch (error) {
		return handleError(error, 'Failed to upload file.');
	}
}

export const GET = withApiLogging('candidates.id.files.get', getCandidates_id_filesHandler);
export const POST = withApiLogging('candidates.id.files.post', postCandidates_id_filesHandler);
