import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { AccessControlError, addScopeToWhere, getActingUser } from '@/lib/access-control';
import { getCandidateJobOrderScope } from '@/lib/related-record-scope';
import { logUpdate } from '@/lib/audit-log';
import { parseRouteId, ValidationError } from '@/lib/request-validation';
import { enforceMutationThrottle } from '@/lib/mutation-throttle';
import { generateSubmissionWriteUpWithOpenAi } from '@/lib/openai-submission-write-up';
import { withApiLogging } from '@/lib/api-logging';

const submissionWriteUpInclude = {
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
			client: true,
			contact: true
		}
	},
	createdByUser: {
		select: { id: true, firstName: true, lastName: true, email: true, isActive: true }
	},
	aiWriteUpGeneratedByUser: {
		select: { id: true, firstName: true, lastName: true, email: true, isActive: true }
	},
	offer: {
		select: { id: true, status: true, updatedAt: true }
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
		return NextResponse.json({ error: 'Submission not found.' }, { status: 404 });
	}
	return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

async function postSubmissions_id_generate_write_upHandler(req, { params }) {
	try {
		const mutationThrottleResponse = await enforceMutationThrottle(req, 'submissions.id.generate-write-up.post');
		if (mutationThrottleResponse) {
			return mutationThrottleResponse;
		}

		const awaitedParams = await params;
		const id = parseRouteId(awaitedParams);
		const actingUser = await getActingUser(req, { allowFallback: false });

		const submission = await prisma.submission.findFirst({
			where: addScopeToWhere({ id }, getCandidateJobOrderScope(actingUser)),
			include: submissionWriteUpInclude
		});
		if (!submission) {
			return NextResponse.json({ error: 'Submission not found.' }, { status: 404 });
		}
		if (submission.offer?.id) {
			return NextResponse.json(
				{ error: 'Submission is locked after conversion to placement.' },
				{ status: 409 }
			);
		}

		const generated = await generateSubmissionWriteUpWithOpenAi(submission);
		if (!generated.ok) {
			return NextResponse.json({ error: generated.error || 'Failed to generate submission write-up.' }, { status: 400 });
		}

		const updated = await prisma.submission.update({
			where: { id: submission.id },
			data: {
				aiWriteUp: generated.writeUp,
				aiWriteUpGeneratedAt: new Date(),
				aiWriteUpGeneratedByUserId: actingUser.id,
				aiWriteUpModelName: generated.modelName || null
			},
			include: submissionWriteUpInclude
		});

		await logUpdate({
			actorUserId: actingUser.id,
			entityType: 'SUBMISSION',
			before: submission,
			after: updated,
			metadata: { source: 'openai_submission_write_up' }
		});

		return NextResponse.json(updated);
	} catch (error) {
		return handleError(error, 'Failed to generate submission write-up.');
	}
}

export const POST = withApiLogging(
	'submissions.id.generate-write-up.post',
	postSubmissions_id_generate_write_upHandler
);
