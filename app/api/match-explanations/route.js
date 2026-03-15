import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { AccessControlError, getActingUser } from '@/lib/access-control';
import { validateScopedCandidateAndJobOrder } from '@/lib/related-record-scope';
import { parseJsonBody, ValidationError } from '@/lib/request-validation';
import { enforceMutationThrottle } from '@/lib/mutation-throttle';
import { createRecordId } from '@/lib/record-id';
import { logCreate, logUpdate } from '@/lib/audit-log';
import { generateMatchExplanationWithOpenAi } from '@/lib/openai-match-explanation';
import { withApiLogging } from '@/lib/api-logging';

function parsePositiveInt(value) {
	const parsed = Number.parseInt(String(value ?? '').trim(), 10);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function buildInclude() {
	return {
		generatedByUser: {
			select: { id: true, firstName: true, lastName: true, email: true, isActive: true }
		},
		candidate: {
			select: {
				id: true,
				recordId: true,
				firstName: true,
				lastName: true,
				currentJobTitle: true,
				currentEmployer: true,
				updatedAt: true
			}
		},
		jobOrder: {
			select: {
				id: true,
				recordId: true,
				title: true,
				updatedAt: true,
				client: {
					select: {
						id: true,
						name: true
					}
				}
			}
		}
	};
}

function handleError(error, fallbackMessage) {
	if (error instanceof AccessControlError) {
		return NextResponse.json({ error: error.message }, { status: error.status });
	}
	if (error instanceof ValidationError) {
		return NextResponse.json({ error: error.message }, { status: error.status || 400 });
	}
	return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

async function loadSourceData(candidateId, jobOrderId) {
	const [candidate, jobOrder] = await Promise.all([
		prisma.candidate.findUnique({
			where: { id: candidateId },
			include: {
				candidateSkills: {
					include: {
						skill: {
							select: { id: true, name: true, category: true, isActive: true }
						}
					},
					orderBy: { createdAt: 'asc' }
				},
				candidateWorkExperiences: {
					orderBy: [{ endDate: 'desc' }, { startDate: 'desc' }, { createdAt: 'desc' }]
				}
			}
		}),
		prisma.jobOrder.findUnique({
			where: { id: jobOrderId },
			include: {
				client: true
			}
		})
	]);

	return { candidate, jobOrder };
}

async function getMatch_explanationsHandler(req) {
	try {
		const actingUser = await getActingUser(req, { allowFallback: false });
		const candidateId = parsePositiveInt(req.nextUrl.searchParams.get('candidateId'));
		const jobOrderId = parsePositiveInt(req.nextUrl.searchParams.get('jobOrderId'));

		if (!candidateId || !jobOrderId) {
			return NextResponse.json({ error: 'candidateId and jobOrderId are required.' }, { status: 400 });
		}

		await validateScopedCandidateAndJobOrder({ actingUser, candidateId, jobOrderId });

		const explanation = await prisma.matchExplanation.findUnique({
			where: {
				candidateId_jobOrderId: { candidateId, jobOrderId }
			},
			include: buildInclude()
		});

		if (!explanation) {
			return NextResponse.json({ explanation: null, stale: false });
		}

		const stale = Boolean(
			(explanation.candidateUpdatedAt && explanation.candidate?.updatedAt && explanation.candidate.updatedAt > explanation.candidateUpdatedAt) ||
			(explanation.jobOrderUpdatedAt && explanation.jobOrder?.updatedAt && explanation.jobOrder.updatedAt > explanation.jobOrderUpdatedAt)
		);

		return NextResponse.json({ explanation, stale });
	} catch (error) {
		return handleError(error, 'Failed to load match explanation.');
	}
}

async function postMatch_explanationsHandler(req) {
	try {
		const mutationThrottleResponse = await enforceMutationThrottle(req, 'match-explanations.post');
		if (mutationThrottleResponse) {
			return mutationThrottleResponse;
		}

		const actingUser = await getActingUser(req, { allowFallback: false });
		const body = await parseJsonBody(req);
		const candidateId = parsePositiveInt(body?.candidateId);
		const jobOrderId = parsePositiveInt(body?.jobOrderId);
		const scorePercent = Number.isFinite(Number(body?.scorePercent)) ? Math.max(0, Math.min(100, Math.round(Number(body.scorePercent)))) : null;
		const reasons = Array.isArray(body?.reasons) ? body.reasons.map((value) => String(value || '').trim()).filter(Boolean).slice(0, 8) : [];
		const risks = Array.isArray(body?.risks) ? body.risks.map((value) => String(value || '').trim()).filter(Boolean).slice(0, 8) : [];

		if (!candidateId || !jobOrderId) {
			return NextResponse.json({ error: 'candidateId and jobOrderId are required.' }, { status: 400 });
		}

		await validateScopedCandidateAndJobOrder({ actingUser, candidateId, jobOrderId });
		const { candidate, jobOrder } = await loadSourceData(candidateId, jobOrderId);
		if (!candidate || !jobOrder) {
			return NextResponse.json({ error: 'Candidate or job order not found.' }, { status: 404 });
		}

		const generated = await generateMatchExplanationWithOpenAi({
			candidate,
			jobOrder,
			scorePercent,
			reasons,
			risks
		});

		if (!generated.ok) {
			return NextResponse.json(
				{ error: generated.error || 'Failed to generate match explanation.' },
				{ status: 400 }
			);
		}

		const existing = await prisma.matchExplanation.findUnique({
			where: {
				candidateId_jobOrderId: { candidateId, jobOrderId }
			},
			include: buildInclude()
		});

		const saved = existing
			? await prisma.matchExplanation.update({
					where: { candidateId_jobOrderId: { candidateId, jobOrderId } },
					data: {
						whyItMatches: generated.explanation.whyItMatches,
						potentialGaps: generated.explanation.potentialGaps,
						whatToValidate: generated.explanation.whatToValidate,
						recommendedPositioning: generated.explanation.recommendedPositioning || null,
						scorePercent,
						candidateUpdatedAt: candidate.updatedAt,
						jobOrderUpdatedAt: jobOrder.updatedAt,
						modelName: generated.modelName || null,
						generatedByUserId: actingUser.id
					},
					include: buildInclude()
				})
			: await prisma.matchExplanation.create({
					data: {
						recordId: createRecordId('MatchExplanation'),
						candidateId,
						jobOrderId,
						whyItMatches: generated.explanation.whyItMatches,
						potentialGaps: generated.explanation.potentialGaps,
						whatToValidate: generated.explanation.whatToValidate,
						recommendedPositioning: generated.explanation.recommendedPositioning || null,
						scorePercent,
						candidateUpdatedAt: candidate.updatedAt,
						jobOrderUpdatedAt: jobOrder.updatedAt,
						modelName: generated.modelName || null,
						generatedByUserId: actingUser.id
					},
					include: buildInclude()
				});

		if (existing) {
			await logUpdate({
				actorUserId: actingUser.id,
				entityType: 'MATCH_EXPLANATION',
				before: existing,
				after: saved,
				metadata: { candidateId, jobOrderId, source: 'openai_match_explanation' }
			});
		} else {
			await logCreate({
				actorUserId: actingUser.id,
				entityType: 'MATCH_EXPLANATION',
				entity: saved,
				metadata: { candidateId, jobOrderId, source: 'openai_match_explanation' }
			});
		}

		return NextResponse.json({ explanation: saved, stale: false });
	} catch (error) {
		return handleError(error, 'Failed to generate match explanation.');
	}
}

export const GET = withApiLogging('match-explanations.get', getMatch_explanationsHandler);
export const POST = withApiLogging('match-explanations.post', postMatch_explanationsHandler);
