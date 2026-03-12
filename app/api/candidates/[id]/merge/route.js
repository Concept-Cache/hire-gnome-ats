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
	AccessControlError,
	addScopeToWhere,
	getActingUser,
	getEntityScope,
	resolveOwnershipForWrite
} from '@/lib/access-control';
import { chooseMostAdvancedCandidateStatus } from '@/lib/candidate-status';
import { logUpdate } from '@/lib/audit-log';
import { createRecordId } from '@/lib/record-id';
import { parseJsonBody, parseRouteId, ValidationError } from '@/lib/request-validation';
import { enforceMutationThrottle } from '@/lib/mutation-throttle';
import { validateAndNormalizeCustomFieldValues } from '@/lib/custom-fields';

import { withApiLogging } from '@/lib/api-logging';
function isBlank(value) {
	if (value == null) return true;
	if (typeof value === 'string') return value.trim() === '';
	return false;
}

function pickExistingOrIncoming(existingValue, incomingValue) {
	return isBlank(existingValue) && !isBlank(incomingValue) ? incomingValue : existingValue;
}

function toNumberOrNull(value) {
	if (value == null || value === '') return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function mergeNumericValue(existingValue, incomingValue) {
	const existingNumber = toNumberOrNull(existingValue);
	const incomingNumber = toNumberOrNull(incomingValue);
	if (existingNumber == null) return incomingNumber;
	if (incomingNumber == null) return existingNumber;
	return Math.max(existingNumber, incomingNumber);
}

function normalizeToken(value) {
	return String(value || '')
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '');
}

function parseDelimitedValues(value) {
	if (typeof value !== 'string') return [];
	return value
		.split(/[,;\n|/]+/)
		.map((entry) => entry.trim())
		.filter(Boolean);
}

function joinWithinLimit(values) {
	const parts = [];

	for (const rawValue of values) {
		const value = String(rawValue || '').trim();
		if (!value) continue;
		parts.push(value);
	}

	if (parts.length === 0) {
		return null;
	}
	return parts.join(', ');
}

function mergeDelimitedText(existingValue, incomingValue) {
	const values = [...parseDelimitedValues(existingValue), ...parseDelimitedValues(incomingValue)];
	const seen = new Set();
	const merged = [];

	for (const value of values) {
		const key = normalizeToken(value);
		if (!key || seen.has(key)) continue;
		seen.add(key);
		merged.push(value);
	}

	if (merged.length === 0) return null;
	return joinWithinLimit(merged);
}

function mergeSummary(existingSummary, incomingSummary) {
	const existing = typeof existingSummary === 'string' ? existingSummary.trim() : '';
	const incoming = typeof incomingSummary === 'string' ? incomingSummary.trim() : '';
	if (!existing && !incoming) return null;
	if (!existing) return incoming;
	if (!incoming) return existing;
	if (existing === incoming) return existing;
	if (existing.toLowerCase().includes(incoming.toLowerCase())) return existing;
	return `${existing}\n\n${incoming}`;
}

function normalizeStageChangeReason(value) {
	if (typeof value !== 'string') return '';
	return value.trim();
}

function educationKey(record) {
	const start = record?.startDate ? new Date(record.startDate).toISOString() : '';
	const end = record?.endDate ? new Date(record.endDate).toISOString() : '';
	return [
		String(record?.schoolName || '').trim().toLowerCase(),
		String(record?.degree || '').trim().toLowerCase(),
		String(record?.fieldOfStudy || '').trim().toLowerCase(),
		String(start),
		String(end),
		record?.isCurrent ? '1' : '0'
	].join('|');
}

function workExperienceKey(record) {
	const start = record?.startDate ? new Date(record.startDate).toISOString() : '';
	const end = record?.endDate ? new Date(record.endDate).toISOString() : '';
	return [
		String(record?.companyName || '').trim().toLowerCase(),
		String(record?.title || '').trim().toLowerCase(),
		String(start),
		String(end),
		record?.isCurrent ? '1' : '0'
	].join('|');
}

function handleError(error, fallbackMessage) {
	if (error instanceof AccessControlError) {
		return NextResponse.json({ error: error.message }, { status: error.status });
	}
	if (error instanceof ValidationError) {
		return NextResponse.json({ error: error.message }, { status: 400 });
	}

	if (error.code === 'P2025') {
		return NextResponse.json({ error: 'Candidate not found.' }, { status: 404 });
	}

	if (error.code === 'P2002') {
		return NextResponse.json({ error: 'Candidate email already exists.' }, { status: 409 });
	}

	return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

async function postCandidates_id_mergeHandler(req, { params }) {
	try {
		const mutationThrottleResponse = await enforceMutationThrottle(req, 'candidates.id.merge.post');
		if (mutationThrottleResponse) {
			return mutationThrottleResponse;
		}

		const awaitedParams = await params;
		const id = parseRouteId(awaitedParams);

		const actingUser = await getActingUser(req, { allowFallback: false });
		const scopedWhere = addScopeToWhere({ id }, getEntityScope(actingUser));
		const existing = await prisma.candidate.findFirst({
			where: scopedWhere,
			include: {
				candidateSkills: {
					select: { skillId: true }
				},
				candidateEducations: {
					select: {
						schoolName: true,
						degree: true,
						fieldOfStudy: true,
						startDate: true,
						endDate: true,
						isCurrent: true
					}
				},
				candidateWorkExperiences: {
					select: {
						companyName: true,
						title: true,
						startDate: true,
						endDate: true,
						isCurrent: true
					}
				}
			}
		});

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

		const stageChangeReason = normalizeStageChangeReason(parsedDataWithCustomFields.stageChangeReason);
		const normalizedIncoming = await withInferredCityStateFromZip(
			prisma,
			normalizeCandidateData(parsedDataWithCustomFields)
		);
		const mergedStatus = chooseMostAdvancedCandidateStatus(existing.status, normalizedIncoming.status);
		const statusDidChange = String(existing.status || '').trim() !== String(mergedStatus || '').trim();

		const resolvedSkills = await resolveCandidateSkills(
			parsedDataWithCustomFields.skillIds,
			parsedDataWithCustomFields.parsedSkillNames
		);
		const normalizedEducationRecords = normalizeCandidateEducationRecords(
			parsedDataWithCustomFields.educationRecords
		);
		const normalizedWorkExperienceRecords = normalizeCandidateWorkExperienceRecords(
			parsedDataWithCustomFields.workExperienceRecords
		);
		const incomingResolvedSkillSet = await resolveSkillSetForWrite({
			normalizedSkillSet: normalizedIncoming.skillSet,
			unmatchedParsedSkillNames: resolvedSkills.unmatchedParsedSkillNames,
			extraKnownSkillNames: resolvedSkills.skillNames
		});

		const ownership = await resolveOwnershipForWrite({
			actingUser,
			ownerIdInput: existing.ownerId || normalizedIncoming.ownerId,
			divisionIdInput: existing.divisionId || normalizedIncoming.divisionId
		});

		const mergedSkillIds = [
			...new Set([
				...(existing.candidateSkills || []).map((candidateSkill) => candidateSkill.skillId).filter(Boolean),
				...(resolvedSkills.hasSkillIds ? resolvedSkills.skillIds : [])
			])
		];

		const mergedData = {
			firstName: pickExistingOrIncoming(existing.firstName, normalizedIncoming.firstName),
			lastName: pickExistingOrIncoming(existing.lastName, normalizedIncoming.lastName),
			email: pickExistingOrIncoming(existing.email, normalizedIncoming.email),
			mobile: pickExistingOrIncoming(existing.mobile, normalizedIncoming.mobile),
			status: mergedStatus,
			source: pickExistingOrIncoming(existing.source, normalizedIncoming.source),
			owner: pickExistingOrIncoming(existing.owner, normalizedIncoming.owner),
			currentJobTitle: pickExistingOrIncoming(existing.currentJobTitle, normalizedIncoming.currentJobTitle),
			currentEmployer: pickExistingOrIncoming(existing.currentEmployer, normalizedIncoming.currentEmployer),
			experienceYears: mergeNumericValue(existing.experienceYears, normalizedIncoming.experienceYears),
			address: pickExistingOrIncoming(existing.address, normalizedIncoming.address),
			addressPlaceId: pickExistingOrIncoming(existing.addressPlaceId, normalizedIncoming.addressPlaceId),
			addressLatitude: pickExistingOrIncoming(existing.addressLatitude, normalizedIncoming.addressLatitude),
			addressLongitude: pickExistingOrIncoming(existing.addressLongitude, normalizedIncoming.addressLongitude),
			city: pickExistingOrIncoming(existing.city, normalizedIncoming.city),
			state: pickExistingOrIncoming(existing.state, normalizedIncoming.state),
			zipCode: pickExistingOrIncoming(existing.zipCode, normalizedIncoming.zipCode),
			website: pickExistingOrIncoming(existing.website, normalizedIncoming.website),
			linkedinUrl: pickExistingOrIncoming(existing.linkedinUrl, normalizedIncoming.linkedinUrl),
			skillSet: mergeDelimitedText(existing.skillSet, incomingResolvedSkillSet),
			summary: mergeSummary(existing.summary, normalizedIncoming.summary),
			customFields: normalizedIncoming.customFields,
			ownerId: ownership.ownerId,
			divisionId: ownership.divisionId
		};

		const existingEducationKeys = new Set((existing.candidateEducations || []).map((record) => educationKey(record)));
		const educationCreates = normalizedEducationRecords
			.filter((record) => !existingEducationKeys.has(educationKey(record)))
			.map((record) => ({
				...record,
				recordId: createRecordId('CED')
			}));

		const existingWorkKeys = new Set(
			(existing.candidateWorkExperiences || []).map((record) => workExperienceKey(record))
		);
		const workCreates = normalizedWorkExperienceRecords
			.filter((record) => !existingWorkKeys.has(workExperienceKey(record)))
			.map((record) => ({
				...record,
				recordId: createRecordId('CWR')
			}));

		const mergedCandidate = await prisma.$transaction(async (tx) => {
			const updatedCandidate = await tx.candidate.update({
				where: { id },
				data: {
					...mergedData,
					candidateSkills: {
						deleteMany: {},
						...(mergedSkillIds.length > 0
							? {
								createMany: {
									data: mergedSkillIds.map((skillId) => ({ skillId })),
									skipDuplicates: true
								}
							}
							: {})
					},
					...(educationCreates.length > 0
						? {
							candidateEducations: {
								create: educationCreates
							}
						}
						: {}),
					...(workCreates.length > 0
						? {
							candidateWorkExperiences: {
								create: workCreates
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
						reason: stageChangeReason || 'Status advanced during duplicate merge.',
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
			after: mergedCandidate,
			summary: 'Candidate merged from duplicate intake data',
			metadata: {
				merge: true,
				statusChanged: statusDidChange,
				statusChangeReason: statusDidChange ? stageChangeReason || 'Status advanced during duplicate merge.' : null,
				educationRecordsAdded: educationCreates.length,
				workExperienceRecordsAdded: workCreates.length,
				skillsMerged: mergedSkillIds.length
			}
		});

		return NextResponse.json({
			candidate: mergedCandidate,
			mergeSummary: {
				statusChanged: statusDidChange,
				educationRecordsAdded: educationCreates.length,
				workExperienceRecordsAdded: workCreates.length,
				skillsMerged: mergedSkillIds.length
			}
		});
	} catch (error) {
		return handleError(error, 'Failed to merge candidate.');
	}
}

export const POST = withApiLogging('candidates.id.merge.post', postCandidates_id_mergeHandler);
