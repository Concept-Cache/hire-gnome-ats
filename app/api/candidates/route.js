import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { candidateSchema } from '@/lib/validators';
import { normalizeCandidateData } from '@/lib/candidate-data';
import { resolveCandidateSkills, resolveSkillSetForWrite } from '@/lib/candidate-skills';
import { withInferredCityStateFromZip } from '@/lib/zip-code-lookup';
import {
	normalizeCandidateEducationRecords,
	normalizeCandidateWorkExperienceRecords
} from '@/lib/candidate-history';
import {
	CANDIDATE_ATTACHMENT_MAX_BYTES,
	isAllowedCandidateAttachmentContentType,
	isAllowedCandidateAttachmentFileName
} from '@/lib/candidate-attachment-options';
import { buildCandidateAttachmentStorageKey, deleteObject, uploadObjectBuffer } from '@/lib/object-storage';
import {
	AccessControlError,
	addScopeToWhere,
	getActingUser,
	getEntityScope,
	resolveOwnershipForWrite
} from '@/lib/access-control';
import { parseJsonBody, ValidationError } from '@/lib/request-validation';
import { logCreate } from '@/lib/audit-log';
import { createRecordId } from '@/lib/record-id';
import { ensureDefaultUnassignedDivision } from '@/lib/default-division';
import { enforceMutationThrottle } from '@/lib/mutation-throttle';
import { validateAndNormalizeCustomFieldValues } from '@/lib/custom-fields';

import { withApiLogging } from '@/lib/api-logging';
const candidateListInclude = {
	ownerUser: { select: { id: true, firstName: true, lastName: true, email: true, isActive: true } },
	division: { select: { id: true, name: true, accessMode: true } },
	candidateSkills: {
		include: {
			skill: {
				select: { id: true, name: true, category: true, isActive: true }
			}
		}
	},
	_count: { select: { submissions: true, notes: true, activities: true } },
	candidateEducations: {
		select: { id: true }
	},
	candidateWorkExperiences: {
		select: { id: true }
	},
	attachments: {
		where: { isResume: true },
		select: { id: true, isResume: true },
		take: 1
	},
	activities: {
		select: { createdAt: true, updatedAt: true, dueAt: true },
		orderBy: { updatedAt: 'desc' },
		take: 1
	},
	notes: {
		select: { createdAt: true, updatedAt: true },
		orderBy: { updatedAt: 'desc' },
		take: 1
	},
	submissions: {
		select: { createdAt: true, updatedAt: true },
		orderBy: { updatedAt: 'desc' },
		take: 1
	},
	interviews: {
		select: { createdAt: true, updatedAt: true, startsAt: true },
		orderBy: { updatedAt: 'desc' },
		take: 1
	},
	offers: {
		select: { createdAt: true, updatedAt: true, offeredOn: true },
		orderBy: { updatedAt: 'desc' },
		take: 1
	}
};

function toTime(value) {
	if (!value) return null;
	const date = new Date(value);
	const time = date.getTime();
	return Number.isNaN(time) ? null : time;
}

function resolveCandidateLastActivityAt(candidate) {
	const timestamps = [
		toTime(candidate.updatedAt),
		toTime(candidate.activities?.[0]?.updatedAt),
		toTime(candidate.activities?.[0]?.dueAt),
		toTime(candidate.activities?.[0]?.createdAt),
		toTime(candidate.notes?.[0]?.updatedAt),
		toTime(candidate.notes?.[0]?.createdAt),
		toTime(candidate.submissions?.[0]?.updatedAt),
		toTime(candidate.submissions?.[0]?.createdAt),
		toTime(candidate.interviews?.[0]?.updatedAt),
		toTime(candidate.interviews?.[0]?.startsAt),
		toTime(candidate.interviews?.[0]?.createdAt),
		toTime(candidate.offers?.[0]?.updatedAt),
		toTime(candidate.offers?.[0]?.offeredOn),
		toTime(candidate.offers?.[0]?.createdAt)
	].filter((value) => typeof value === 'number');

	if (timestamps.length === 0) return null;
	return new Date(Math.max(...timestamps)).toISOString();
}

function handleError(error, fallbackMessage) {
	if (error instanceof AccessControlError) {
		return NextResponse.json({ error: error.message }, { status: error.status });
	}
	if (error instanceof ValidationError) {
		return NextResponse.json({ error: error.message }, { status: error.status || 400 });
	}

	if (error.code === 'P2002') {
		return NextResponse.json({ error: 'Candidate email already exists.' }, { status: 409 });
	}

	return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

function fileValidationError(file) {
	if (!file || typeof file.arrayBuffer !== 'function') {
		return 'Upload a resume file.';
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

async function parseCandidateCreatePayload(req) {
	const contentType = req.headers.get('content-type') || '';
	if (contentType.includes('multipart/form-data')) {
		const formData = await req.formData();
		const rawPayload = formData.get('payload');
		const parsedResumeAttachment = formData.get('file');

		if (typeof rawPayload !== 'string' || !rawPayload.trim()) {
			throw new ValidationError('Missing candidate payload.');
		}

		let body;
		try {
			body = JSON.parse(rawPayload);
		} catch {
			throw new ValidationError('Invalid candidate payload JSON.');
		}

		return { body, parsedResumeAttachment: parsedResumeAttachment || null };
	}

	return {
		body: await parseJsonBody(req),
		parsedResumeAttachment: null
	};
}

async function getCandidatesHandler(req) {
	try {
		const actingUser = await getActingUser(req);
		const candidates = await prisma.candidate.findMany({
			where: addScopeToWhere(undefined, getEntityScope(actingUser)),
			orderBy: { createdAt: 'desc' },
			include: candidateListInclude
		});
		const candidateRows = candidates.map((candidate) => {
			const { activities, notes, submissions, interviews, offers, ...candidateRest } = candidate;
			return {
				...candidateRest,
				lastActivityAt: resolveCandidateLastActivityAt(candidate)
			};
		});

		return NextResponse.json(candidateRows);
	} catch (error) {
		return handleError(error, 'Failed to load candidates.');
	}
}

async function postCandidatesHandler(req) {
	let resumeUploadMeta = null;
	try {
		const mutationThrottleResponse = await enforceMutationThrottle(req, 'candidates.post');
		if (mutationThrottleResponse) {
			return mutationThrottleResponse;
		}

		const actingUser = await getActingUser(req, { allowFallback: false });
		const { body, parsedResumeAttachment } = await parseCandidateCreatePayload(req);
		const parsedResumeAttachmentFile = parsedResumeAttachment || null;
		const resumeAttachmentError = parsedResumeAttachmentFile
			? fileValidationError(parsedResumeAttachmentFile)
			: '';
		if (resumeAttachmentError) {
			return NextResponse.json({ error: resumeAttachmentError }, { status: 400 });
		}

		const resumeAttachmentBuffer = parsedResumeAttachmentFile
			? Buffer.from(await parsedResumeAttachmentFile.arrayBuffer())
			: null;
		const parsedFromResume = body?.parsedFromResume === true;
		const parsed = candidateSchema.safeParse(body);

		if (!parsed.success) {
			return NextResponse.json({ errors: parsed.error.flatten() }, { status: 400 });
		}
		const defaultDivisionForAdmin =
			actingUser?.role === 'ADMINISTRATOR' && !parsed.data.divisionId
				? await ensureDefaultUnassignedDivision(prisma)
				: null;
		const candidateInput = defaultDivisionForAdmin
			? { ...parsed.data, divisionId: defaultDivisionForAdmin.id }
			: parsed.data;
		const customFieldValidation = await validateAndNormalizeCustomFieldValues({
			prisma,
			moduleKey: 'candidates',
			customFieldsInput: candidateInput.customFields
		});
		if (customFieldValidation.errors.length > 0) {
			return NextResponse.json(
				{ error: customFieldValidation.errors.join(' ') },
				{ status: 400 }
			);
		}
		const candidateInputWithCustomFields = {
			...candidateInput,
			customFields: customFieldValidation.customFields
		};

		const stageChangeReason =
			typeof candidateInputWithCustomFields.stageChangeReason === 'string'
				? candidateInputWithCustomFields.stageChangeReason.trim()
				: '';
		const normalized = await withInferredCityStateFromZip(
			prisma,
			normalizeCandidateData(candidateInputWithCustomFields)
		);
		const resolvedSkills = await resolveCandidateSkills(
			candidateInputWithCustomFields.skillIds,
			candidateInputWithCustomFields.parsedSkillNames
		);
		const normalizedEducationRecords = normalizeCandidateEducationRecords(
			candidateInputWithCustomFields.educationRecords
		);
		const normalizedWorkExperienceRecords = normalizeCandidateWorkExperienceRecords(
			candidateInputWithCustomFields.workExperienceRecords
		);
		const resolvedSkillSet = await resolveSkillSetForWrite({
			normalizedSkillSet: normalized.skillSet,
			unmatchedParsedSkillNames: resolvedSkills.unmatchedParsedSkillNames,
			extraKnownSkillNames: resolvedSkills.skillNames
		});
		const lockOwnerToActingUser =
			parsedFromResume &&
			Boolean(actingUser?.id) &&
			actingUser.role !== 'ADMINISTRATOR' &&
			actingUser.role !== 'DIRECTOR';
		const ownership = await resolveOwnershipForWrite({
			actingUser,
			ownerIdInput: lockOwnerToActingUser ? actingUser.id : normalized.ownerId,
			divisionIdInput: normalized.divisionId
		});

		const candidate = await prisma.$transaction(async (tx) => {
			const createdCandidate = await tx.candidate.create({
				data: {
					...normalized,
					skillSet: resolvedSkillSet,
					ownerId: ownership.ownerId,
					divisionId: ownership.divisionId,
					...(resolvedSkills.hasSkillIds && resolvedSkills.skillIds.length > 0
						? {
								candidateSkills: {
									createMany: {
										data: resolvedSkills.skillIds.map((skillId) => ({ skillId })),
										skipDuplicates: true
									}
								}
							}
						: {}),
					...(normalizedEducationRecords.length > 0
						? {
								candidateEducations: {
									create: normalizedEducationRecords.map((record) => ({
										recordId: createRecordId('CED'),
										...record
									}))
								}
							}
						: {}),
					...(normalizedWorkExperienceRecords.length > 0
						? {
								candidateWorkExperiences: {
									create: normalizedWorkExperienceRecords.map((record) => ({
										recordId: createRecordId('CWR'),
										...record
									}))
								}
							}
						: {})
			},
				include: candidateListInclude
			});

			if (parsedResumeAttachmentFile && resumeAttachmentBuffer) {
				const attachmentFileName =
					parsedResumeAttachmentFile.name || `candidate-${createdCandidate.id}-resume`;
				const storageKey = buildCandidateAttachmentStorageKey(createdCandidate.id, attachmentFileName);
				const uploaded = await uploadObjectBuffer({
					key: storageKey,
					body: resumeAttachmentBuffer,
					contentType: parsedResumeAttachmentFile.type || 'application/octet-stream'
				});

				await tx.candidateAttachment.create({
					data: {
						candidateId: createdCandidate.id,
						fileName: attachmentFileName,
						isResume: true,
						contentType: parsedResumeAttachmentFile.type || null,
						sizeBytes: parsedResumeAttachmentFile.size,
						storageProvider: uploaded.storageProvider,
						storageBucket: uploaded.storageBucket,
						storageKey: uploaded.storageKey,
						uploadedByUserId: actingUser?.id || null
					}
				});

				resumeUploadMeta = {
					storageProvider: uploaded.storageProvider,
					storageBucket: uploaded.storageBucket,
					storageKey: uploaded.storageKey
				};
			}

			await tx.candidateStatusChange.create({
				data: {
					recordId: createRecordId('CSC'),
					candidateId: createdCandidate.id,
					fromStatus: null,
					toStatus: createdCandidate.status,
					reason: stageChangeReason || null,
					changedByUserId: actingUser?.id || null
				}
			});

			return createdCandidate;
		});
		await logCreate({
			actorUserId: actingUser?.id,
			entityType: 'CANDIDATE',
			entity: candidate
		});

		return NextResponse.json(candidate, { status: 201 });
	} catch (error) {
		if (resumeUploadMeta) {
			await deleteObject(resumeUploadMeta).catch(() => null);
		}

		return handleError(error, 'Failed to create candidate.');
	}
}

export const GET = withApiLogging('candidates.get', getCandidatesHandler);
export const POST = withApiLogging('candidates.post', postCandidatesHandler);
