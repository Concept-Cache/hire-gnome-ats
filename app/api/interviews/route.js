import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { interviewSchema } from '@/lib/validators';
import { normalizeInterviewData } from '@/lib/normalizers';
import { AccessControlError, getActingUser } from '@/lib/access-control';
import { getCandidateJobOrderScope, validateScopedCandidateAndJobOrder } from '@/lib/related-record-scope';
import { logCreate } from '@/lib/audit-log';
import { sendInterviewInviteEmail } from '@/lib/interview-email';
import { formatCandidateStatusLabel, isCandidateQualifiedForPipeline } from '@/lib/candidate-status';
import { createNotificationsForUsers } from '@/lib/notifications';
import { logError, requestLogContext } from '@/lib/logger';
import { parseJsonBody, ValidationError } from '@/lib/request-validation';
import { enforceMutationThrottle } from '@/lib/mutation-throttle';
import { validateAndNormalizeCustomFieldValues } from '@/lib/custom-fields';

import { withApiLogging } from '@/lib/api-logging';
function handleError(error, fallbackMessage) {
	if (error instanceof AccessControlError) {
		return NextResponse.json({ error: error.message }, { status: error.status });
	}
	if (error instanceof ValidationError) {
		return NextResponse.json({ error: error.message }, { status: error.status || 400 });
	}

	if (error.code === 'P2003') {
		return NextResponse.json({ error: 'Candidate or job order not found.' }, { status: 400 });
	}

	return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

async function getInterviews(req) {
	try {
		const actingUser = await getActingUser(req);
		const interviews = await prisma.interview.findMany({
			where: getCandidateJobOrderScope(actingUser),
			include: { candidate: true, jobOrder: { include: { client: true } } },
			orderBy: { createdAt: 'desc' }
		});

		return NextResponse.json(interviews);
	} catch (error) {
		return handleError(error, 'Failed to load interviews.');
	}
}

async function postInterviews(req) {
	try {
		const mutationThrottleResponse = await enforceMutationThrottle(req, 'interviews.post');
		if (mutationThrottleResponse) {
			return mutationThrottleResponse;
		}

		const actingUser = await getActingUser(req, { allowFallback: false });
		const body = await parseJsonBody(req);
		const parsed = interviewSchema.safeParse(body);

		if (!parsed.success) {
			return NextResponse.json({ errors: parsed.error.flatten() }, { status: 400 });
		}
		if (!parsed.data.startsAt) {
			return NextResponse.json({ error: 'Start date and time is required.' }, { status: 400 });
		}

		const scopedRelations = await validateScopedCandidateAndJobOrder({
			actingUser,
			candidateId: parsed.data.candidateId,
			jobOrderId: parsed.data.jobOrderId
		});
		if (!isCandidateQualifiedForPipeline(scopedRelations?.candidate?.status)) {
			throw new AccessControlError(
				`Candidate must be Qualified or beyond before interviews can be scheduled. Current status: ${formatCandidateStatusLabel(
					scopedRelations?.candidate?.status
				)}.`,
				400
			);
		}
		const customFieldValidation = await validateAndNormalizeCustomFieldValues({
			prisma,
			moduleKey: 'interviews',
			customFieldsInput: parsed.data.customFields
		});
		if (customFieldValidation.errors.length > 0) {
			return NextResponse.json(
				{ error: customFieldValidation.errors.join(' ') },
				{ status: 400 }
			);
		}

		const interview = await prisma.interview.create({
			data: normalizeInterviewData({
				...parsed.data,
				customFields: customFieldValidation.customFields
			}),
			include: { candidate: true, jobOrder: { include: { client: true } } }
		});
		await logCreate({
			actorUserId: actingUser?.id,
			entityType: 'INTERVIEW',
			entity: interview
		});
		await createNotificationsForUsers({
			userIds: [
				interview.candidate?.ownerId,
				interview.jobOrder?.ownerId
			].filter((userId) => Number(userId) > 0 && Number(userId) !== Number(actingUser?.id)),
			type: 'interview',
			title: 'Interview Scheduled',
			message: `${interview.subject || interview.recordId || 'Interview'} was scheduled.`,
			entityType: 'INTERVIEW',
			entityId: interview.id,
			linkHref: `/interviews/${interview.id}`
		});
		const inviteEmail = await sendInterviewInviteEmail({ interview, reason: 'created' });
		if (!inviteEmail.sent && !inviteEmail.skipped) {
			logError(
				'interview.invite_email.create_failed',
				requestLogContext(req, {
					interviewId: interview.id,
					reason: inviteEmail.reason || 'Unknown reason'
				})
			);
		}

		return NextResponse.json({ ...interview, inviteEmail }, { status: 201 });
	} catch (error) {
		return handleError(error, 'Failed to create interview.');
	}
}

export const GET = withApiLogging('interviews.get', getInterviews);
export const POST = withApiLogging('interviews.post', postInterviews);
