import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
	AccessControlError,
	addScopeToWhere,
	getActingUser,
	getEntityScope
} from '@/lib/access-control';
import { createRecordId } from '@/lib/record-id';
import { logCreate, logUpdate } from '@/lib/audit-log';
import { parseRouteId, ValidationError } from '@/lib/request-validation';
import { enforceMutationThrottle } from '@/lib/mutation-throttle';
import { generateCandidateSummaryWithOpenAi } from '@/lib/openai-candidate-summary';
import { withApiLogging } from '@/lib/api-logging';

function buildCandidateSummarySourceInclude() {
	return {
		candidateSkills: {
			include: {
				skill: {
					select: { id: true, name: true, category: true, isActive: true }
				}
			},
			orderBy: { createdAt: 'asc' }
		},
		candidateEducations: {
			orderBy: [{ endDate: 'desc' }, { startDate: 'desc' }, { createdAt: 'desc' }]
		},
		candidateWorkExperiences: {
			orderBy: [{ endDate: 'desc' }, { startDate: 'desc' }, { createdAt: 'desc' }]
		},
		notes: {
			orderBy: { createdAt: 'desc' },
			take: 5,
			select: {
				id: true,
				noteType: true,
				content: true,
				createdAt: true
			}
		},
		aiSummary: {
			include: {
				generatedByUser: {
					select: { id: true, firstName: true, lastName: true, email: true, isActive: true }
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

async function postCandidates_id_ai_summaryHandler(req, { params }) {
	try {
		const mutationThrottleResponse = await enforceMutationThrottle(req, 'candidates.id.ai-summary.post');
		if (mutationThrottleResponse) {
			return mutationThrottleResponse;
		}

		const awaitedParams = await params;
		const id = parseRouteId(awaitedParams);
		const actingUser = await getActingUser(req, { allowFallback: false });

		const candidate = await prisma.candidate.findFirst({
			where: addScopeToWhere({ id }, getEntityScope(actingUser)),
			include: buildCandidateSummarySourceInclude()
		});
		if (!candidate) {
			return NextResponse.json({ error: 'Candidate not found.' }, { status: 404 });
		}

		const generated = await generateCandidateSummaryWithOpenAi(candidate);
		if (!generated.ok) {
			return NextResponse.json({ error: generated.error || 'Failed to generate candidate summary.' }, { status: 400 });
		}

		const existingSummary = candidate.aiSummary;
		const savedSummary = existingSummary
			? await prisma.candidateAiSummary.update({
					where: { candidateId: candidate.id },
					data: {
						overview: generated.summary.overview,
						strengths: generated.summary.strengths,
						concerns: generated.summary.concerns,
						suggestedNextStep: generated.summary.suggestedNextStep || null,
						modelName: generated.modelName || null,
						generatedByUserId: actingUser.id
					},
					include: {
						generatedByUser: {
							select: { id: true, firstName: true, lastName: true, email: true, isActive: true }
						}
					}
				})
			: await prisma.candidateAiSummary.create({
					data: {
						recordId: createRecordId('CandidateAiSummary'),
						candidateId: candidate.id,
						overview: generated.summary.overview,
						strengths: generated.summary.strengths,
						concerns: generated.summary.concerns,
						suggestedNextStep: generated.summary.suggestedNextStep || null,
						modelName: generated.modelName || null,
						generatedByUserId: actingUser.id
					},
					include: {
						generatedByUser: {
							select: { id: true, firstName: true, lastName: true, email: true, isActive: true }
						}
					}
				});

		if (existingSummary) {
			await logUpdate({
				actorUserId: actingUser.id,
				entityType: 'CANDIDATE_AI_SUMMARY',
				before: existingSummary,
				after: savedSummary,
				metadata: { candidateId: candidate.id, source: 'openai_candidate_summary' }
			});
		} else {
			await logCreate({
				actorUserId: actingUser.id,
				entityType: 'CANDIDATE_AI_SUMMARY',
				entity: savedSummary,
				metadata: { candidateId: candidate.id, source: 'openai_candidate_summary' }
			});
		}

		return NextResponse.json({
			ok: true,
			aiSummary: savedSummary
		});
	} catch (error) {
		return handleError(error, 'Failed to generate candidate summary.');
	}
}

export const POST = withApiLogging('candidates.id.ai-summary.post', postCandidates_id_ai_summaryHandler);
