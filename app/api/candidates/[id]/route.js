import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { candidateSchema } from '@/lib/validators';
import { normalizeCandidateData } from '@/lib/candidate-data';
import { resolveCandidateSkills, resolveSkillSetForWrite } from '@/lib/candidate-skills';
import { withInferredCityStateFromZip } from '@/lib/zip-code-lookup';
import {
	AccessControlError,
	addScopeToWhere,
	getActingUser,
	getEntityScope,
	resolveOwnershipForWrite
} from '@/lib/access-control';
import { logUpdate } from '@/lib/audit-log';
import { createRecordId } from '@/lib/record-id';
import { createOwnerAssignmentNotifications } from '@/lib/notifications';
import { parseRouteId, parseJsonBody, ValidationError } from '@/lib/request-validation';
import { enforceMutationThrottle } from '@/lib/mutation-throttle';
import { validateAndNormalizeCustomFieldValues } from '@/lib/custom-fields';

import { withApiLogging } from '@/lib/api-logging';
function isObjectEmpty(value) {
	return value && typeof value === 'object' && Object.keys(value).length === 0;
}

function normalizeStageChangeReason(value) {
	if (typeof value !== 'string') return '';
	return value.trim();
}

function hasStatusChanged(previousStatus, nextStatus) {
	return String(previousStatus || '').trim() !== String(nextStatus || '').trim();
}

function buildCandidateDetailInclude(entityScope, includeNoteAuthor = true, includeAiSummary = true) {
	const relatedJobOrderScope = !entityScope || isObjectEmpty(entityScope) ? undefined : { jobOrder: entityScope };
	const notesInclude = includeNoteAuthor
		? {
				orderBy: { createdAt: 'desc' },
				include: {
					createdByUser: { select: { id: true, firstName: true, lastName: true, email: true, isActive: true } }
				}
			}
		: {
				orderBy: { createdAt: 'desc' },
				select: {
					id: true,
					noteType: true,
					content: true,
					createdAt: true,
					updatedAt: true,
					candidateId: true
				}
			};

	const include = {
		ownerUser: { select: { id: true, firstName: true, lastName: true, email: true, isActive: true } },
		division: { select: { id: true, name: true, accessMode: true } },
		candidateSkills: {
			include: {
				skill: {
					select: { id: true, name: true, category: true, isActive: true }
				}
			},
			orderBy: { createdAt: 'asc' }
		},
		notes: notesInclude,
		activities: { orderBy: { createdAt: 'desc' } },
		candidateEducations: { orderBy: [{ endDate: 'desc' }, { startDate: 'desc' }, { createdAt: 'desc' }] },
		candidateWorkExperiences: {
			orderBy: [{ endDate: 'desc' }, { startDate: 'desc' }, { createdAt: 'desc' }]
		},
		submissions: {
			where: relatedJobOrderScope,
			orderBy: { createdAt: 'desc' },
			include: {
				createdByUser: {
					select: { id: true, firstName: true, lastName: true, email: true, isActive: true }
				},
				jobOrder: {
					include: { client: true }
				}
			}
		},
		interviews: {
			where: relatedJobOrderScope,
			orderBy: { createdAt: 'desc' },
			include: { jobOrder: true }
		},
		offers: {
			where: relatedJobOrderScope,
			orderBy: { createdAt: 'desc' },
			include: { jobOrder: true }
		},
		attachments: {
			orderBy: { createdAt: 'desc' },
			include: {
				uploadedByUser: {
					select: { id: true, firstName: true, lastName: true, email: true, isActive: true }
				}
			}
		},
		statusChanges: {
			orderBy: { createdAt: 'desc' },
			include: {
				changedByUser: {
					select: { id: true, firstName: true, lastName: true, email: true, isActive: true }
				}
			}
		}
	};

	if (includeAiSummary) {
		include.aiSummary = {
			include: {
				generatedByUser: {
					select: { id: true, firstName: true, lastName: true, email: true, isActive: true }
				}
			}
		};
	}

	return include;
}

function handleError(error, fallbackMessage) {
	if (error instanceof AccessControlError) {
		return NextResponse.json({ error: error.message }, { status: error.status });
	}
	if (error instanceof ValidationError) {
		return NextResponse.json({ error: error.message }, { status: error.status || 400 });
	}

	if (error.code === 'P2025') {
		return NextResponse.json({ error: 'Candidate not found.' }, { status: 404 });
	}

	if (error.code === 'P2002') {
		return NextResponse.json({ error: 'Candidate email already exists.' }, { status: 409 });
	}

	return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

function isMissingNoteAuthorColumnError(error) {
	if (!error) return false;
	if (error.code === 'P2022') return true;
	const message = `${error.message || ''}`;
	return message.includes('createdByUserId') || message.includes('createdByUser');
}

function isMissingCandidateAiSummaryTableError(error) {
	if (!error) return false;
	if (error.code === 'P2021') return true;
	const message = `${error.message || ''}`;
	return message.includes('CandidateAiSummary') || message.includes('aiSummary');
}

function isMissingAttachmentResumeColumnError(error) {
	if (!error) return false;
	if (error.code === 'P2022') return true;
	const message = `${error.message || ''}`;
	return message.includes('isResume');
}

async function getCandidates_idHandler(req, { params }) {
	try {
		const awaitedParams = await params;
		const id = parseRouteId(awaitedParams);

		const actingUser = await getActingUser(req);
		const entityScope = getEntityScope(actingUser);

		let candidate;
		try {
			candidate = await prisma.candidate.findFirst({
				where: addScopeToWhere({ id }, entityScope),
				include: buildCandidateDetailInclude(entityScope, true, true)
			});
		} catch (error) {
			if (isMissingCandidateAiSummaryTableError(error)) {
				candidate = await prisma.candidate.findFirst({
					where: addScopeToWhere({ id }, entityScope),
					include: buildCandidateDetailInclude(entityScope, true, false)
				});
			} else if (isMissingAttachmentResumeColumnError(error)) {
				return NextResponse.json(
					{ error: 'Candidate attachments schema is out of date. Run database migrations.' },
					{ status: 503 }
				);
			} else if (!isMissingNoteAuthorColumnError(error)) {
				throw error;
			} else {
				candidate = await prisma.candidate.findFirst({
					where: addScopeToWhere({ id }, entityScope),
					include: buildCandidateDetailInclude(entityScope, false, true)
				});
			}
		}

		if (!candidate) {
			return NextResponse.json({ error: 'Candidate not found.' }, { status: 404 });
		}

		return NextResponse.json(candidate);
	} catch (error) {
		return handleError(error, 'Failed to load candidate.');
	}
}

async function patchCandidates_idHandler(req, { params }) {
	try {
		const mutationThrottleResponse = await enforceMutationThrottle(req, 'candidates.id.patch');
		if (mutationThrottleResponse) {
			return mutationThrottleResponse;
		}

		const awaitedParams = await params;
		const id = parseRouteId(awaitedParams);

		const actingUser = await getActingUser(req, { allowFallback: false });
		const scopedWhere = addScopeToWhere({ id }, getEntityScope(actingUser));
		const existing = await prisma.candidate.findFirst({ where: scopedWhere });
			if (!existing) {
				return NextResponse.json({ error: 'Candidate not found.' }, { status: 404 });
			}

		const body = await parseJsonBody(req);
		const parsed = candidateSchema.safeParse(body);
		if (!parsed.success) {
			return NextResponse.json({ errors: parsed.error.flatten() }, { status: 400 });
		}
		const existingCustomFields =
			existing?.customFields && typeof existing.customFields === 'object' && !Array.isArray(existing.customFields)
				? existing.customFields
				: {};
		const incomingCustomFields =
			parsed.data.customFields &&
			typeof parsed.data.customFields === 'object' &&
			!Array.isArray(parsed.data.customFields)
				? parsed.data.customFields
				: {};
		const customFieldValidation = await validateAndNormalizeCustomFieldValues({
			prisma,
			moduleKey: 'candidates',
			customFieldsInput: { ...existingCustomFields, ...incomingCustomFields }
		});
		if (customFieldValidation.errors.length > 0) {
			return NextResponse.json(
				{ error: customFieldValidation.errors.join(' ') },
				{ status: 400 }
			);
		}
		const parsedDataWithCustomFields = {
			...parsed.data,
			customFields: customFieldValidation.customFields
		};
		if (actingUser?.role === 'ADMINISTRATOR' && !parsed.data.divisionId) {
			return NextResponse.json({ error: 'Division is required for administrators.' }, { status: 400 });
		}
		const stageChangeReason = normalizeStageChangeReason(parsedDataWithCustomFields.stageChangeReason);

			const normalized = await withInferredCityStateFromZip(
				prisma,
				normalizeCandidateData(parsedDataWithCustomFields)
			);
			const statusDidChange = hasStatusChanged(existing.status, normalized.status);
		if (statusDidChange && !stageChangeReason) {
			return NextResponse.json(
				{ error: 'Status change reason is required when updating candidate status.' },
				{ status: 400 }
			);
		}
			const resolvedSkills = await resolveCandidateSkills(
				parsedDataWithCustomFields.skillIds,
				parsedDataWithCustomFields.parsedSkillNames
			);
			const resolvedSkillSet = await resolveSkillSetForWrite({
				normalizedSkillSet: normalized.skillSet,
				unmatchedParsedSkillNames: resolvedSkills.unmatchedParsedSkillNames,
				extraKnownSkillNames: resolvedSkills.skillNames
			});
			const ownership = await resolveOwnershipForWrite({
				actingUser,
				ownerIdInput: normalized.ownerId,
			divisionIdInput: normalized.divisionId
		});

			const candidate = await prisma.$transaction(async (tx) => {
				const updatedCandidate = await tx.candidate.update({
					where: { id },
					data: {
						...normalized,
						skillSet: resolvedSkillSet,
						ownerId: ownership.ownerId,
						divisionId: ownership.divisionId,
						...(resolvedSkills.hasSkillIds
							? resolvedSkills.skillIds.length > 0
								? {
										candidateSkills: {
											deleteMany: {},
											createMany: {
												data: resolvedSkills.skillIds.map((skillId) => ({ skillId })),
												skipDuplicates: true
											}
										}
									}
								: {
										candidateSkills: {
											deleteMany: {}
										}
									}
							: {})
					},
					include: {
						ownerUser: { select: { id: true, firstName: true, lastName: true, email: true, isActive: true } },
						division: { select: { id: true, name: true, accessMode: true } },
						candidateSkills: {
							include: {
								skill: {
									select: { id: true, name: true, category: true, isActive: true }
								}
							},
							orderBy: { createdAt: 'asc' }
						}
					}
				});

				if (statusDidChange) {
					await tx.candidateStatusChange.create({
						data: {
							recordId: createRecordId('CSC'),
							candidateId: updatedCandidate.id,
							fromStatus: existing.status || null,
							toStatus: updatedCandidate.status,
							reason: stageChangeReason || null,
							changedByUserId: actingUser?.id || null
						}
					});
				}

				const statusChanges = await tx.candidateStatusChange.findMany({
					where: { candidateId: updatedCandidate.id },
					orderBy: { createdAt: 'desc' },
					include: {
						changedByUser: {
							select: { id: true, firstName: true, lastName: true, email: true, isActive: true }
						}
					}
				});

				return {
					...updatedCandidate,
					statusChanges
				};
			});
			await logUpdate({
				actorUserId: actingUser?.id,
				entityType: 'CANDIDATE',
				before: existing,
				after: candidate,
				summary: statusDidChange
					? `Candidate status changed: ${existing.status || '-'} -> ${candidate.status || '-'}`
					: undefined,
				metadata: statusDidChange
					? {
							statusChangeReason: stageChangeReason || null
						}
					: undefined
			});
			await createOwnerAssignmentNotifications({
				previousOwnerId: existing.ownerId,
				nextOwnerId: candidate.ownerId,
				actorUserId: actingUser?.id || null,
				entityType: 'CANDIDATE',
				entityId: candidate.id,
				entityLabel: `${candidate.firstName || ''} ${candidate.lastName || ''}`.trim() || candidate.recordId,
				detailPath: `/candidates/${candidate.id}`
			});

			return NextResponse.json(candidate);
	} catch (error) {
		return handleError(error, 'Failed to update candidate.');
	}
}

export const GET = withApiLogging('candidates.id.get', getCandidates_idHandler);
export const PATCH = withApiLogging('candidates.id.patch', patchCandidates_idHandler);
