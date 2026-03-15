import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { AccessControlError, addScopeToWhere, getActingUser } from '@/lib/access-control';
import { getCandidateJobOrderScope } from '@/lib/related-record-scope';
import { logUpdate } from '@/lib/audit-log';
import { parseRouteId, ValidationError } from '@/lib/request-validation';
import { enforceMutationThrottle } from '@/lib/mutation-throttle';
import { generateInterviewQuestionSetWithOpenAi } from '@/lib/openai-interview-question-set';
import { withApiLogging } from '@/lib/api-logging';

const interviewQuestionInclude = {
	candidate: {
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
	},
	jobOrder: {
		include: {
			client: true
		}
	},
	aiQuestionSetGeneratedByUser: {
		select: { id: true, firstName: true, lastName: true, email: true, isActive: true }
	}
};

function handleError(error, fallbackMessage) {
	if (error instanceof AccessControlError) {
		return NextResponse.json({ error: error.message }, { status: error.status });
	}
	if (error instanceof ValidationError) {
		return NextResponse.json({ error: error.message }, { status: error.status || 400 });
	}
	if (error.code === 'P2025') {
		return NextResponse.json({ error: 'Interview not found.' }, { status: 404 });
	}
	return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

async function postInterviews_id_generate_questionsHandler(req, { params }) {
	try {
		const mutationThrottleResponse = await enforceMutationThrottle(req, 'interviews.id.generate-questions.post');
		if (mutationThrottleResponse) {
			return mutationThrottleResponse;
		}

		const awaitedParams = await params;
		const id = parseRouteId(awaitedParams);
		const actingUser = await getActingUser(req, { allowFallback: false });

		const interview = await prisma.interview.findFirst({
			where: addScopeToWhere({ id }, getCandidateJobOrderScope(actingUser)),
			include: interviewQuestionInclude
		});
		if (!interview) {
			return NextResponse.json({ error: 'Interview not found.' }, { status: 404 });
		}

		const generated = await generateInterviewQuestionSetWithOpenAi(interview);
		if (!generated.ok) {
			return NextResponse.json(
				{ error: generated.error || 'Failed to generate interview question set.' },
				{ status: 400 }
			);
		}

		const updated = await prisma.interview.update({
			where: { id: interview.id },
			data: {
				aiQuestionSet: generated.questionSet,
				aiQuestionSetGeneratedAt: new Date(),
				aiQuestionSetGeneratedByUserId: actingUser.id,
				aiQuestionSetModelName: generated.modelName || null
			},
			include: {
				candidate: true,
				jobOrder: { include: { client: true } },
				aiQuestionSetGeneratedByUser: {
					select: { id: true, firstName: true, lastName: true, email: true, isActive: true }
				}
			}
		});

		await logUpdate({
			actorUserId: actingUser.id,
			entityType: 'INTERVIEW',
			before: interview,
			after: updated,
			metadata: { source: 'openai_interview_question_set' }
		});

		return NextResponse.json(updated);
	} catch (error) {
		return handleError(error, 'Failed to generate interview question set.');
	}
}

export const POST = withApiLogging(
	'interviews.id.generate-questions.post',
	postInterviews_id_generate_questionsHandler
);
