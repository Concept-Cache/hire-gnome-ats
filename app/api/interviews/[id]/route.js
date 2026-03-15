import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { interviewSchema } from '@/lib/validators';
import { normalizeInterviewData } from '@/lib/normalizers';
import { AccessControlError, addScopeToWhere, getActingUser } from '@/lib/access-control';
import { getCandidateJobOrderScope, validateScopedCandidateAndJobOrder } from '@/lib/related-record-scope';
import { logUpdate } from '@/lib/audit-log';
import { sendInterviewInviteEmail } from '@/lib/interview-email';
import { createNotificationsForUsers } from '@/lib/notifications';
import { logError, requestLogContext } from '@/lib/logger';
import { parseRouteId, parseJsonBody, ValidationError } from '@/lib/request-validation';
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

	if (error.code === 'P2025') {
		return NextResponse.json({ error: 'Interview not found.' }, { status: 404 });
	}

	if (error.code === 'P2003') {
		return NextResponse.json({ error: 'Candidate or job order not found.' }, { status: 400 });
	}

	return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

async function getInterviewById(req, { params }) {
	try {
		const resolvedParams = await params;
		const id = parseRouteId(resolvedParams);

		const actingUser = await getActingUser(req);
		const interview = await prisma.interview.findFirst({
			where: addScopeToWhere({ id }, getCandidateJobOrderScope(actingUser)),
			include: {
				candidate: true,
				jobOrder: {
					include: {
						client: true
					}
				},
				aiQuestionSetGeneratedByUser: {
					select: { id: true, firstName: true, lastName: true, email: true, isActive: true }
				}
			}
		});

		if (!interview) {
			return NextResponse.json({ error: 'Interview not found.' }, { status: 404 });
		}

		return NextResponse.json(interview);
	} catch (error) {
		return handleError(error, 'Failed to load interview.');
	}
}

async function patchInterviewById(req, { params }) {
	try {
		const mutationThrottleResponse = await enforceMutationThrottle(req, 'interviews.id.patch');
		if (mutationThrottleResponse) {
			return mutationThrottleResponse;
		}

		const resolvedParams = await params;
		const id = parseRouteId(resolvedParams);

		const actingUser = await getActingUser(req, { allowFallback: false });
		const existing = await prisma.interview.findFirst({
			where: addScopeToWhere({ id }, getCandidateJobOrderScope(actingUser)),
			select: {
				id: true,
				interviewMode: true,
				status: true,
				subject: true,
				interviewer: true,
				interviewerEmail: true,
				optionalParticipants: true,
				startsAt: true,
				endsAt: true,
				location: true,
				locationPlaceId: true,
				locationLatitude: true,
				locationLongitude: true,
				videoLink: true,
				aiQuestionSet: true,
				aiQuestionSetGeneratedAt: true,
				aiQuestionSetGeneratedByUserId: true,
				aiQuestionSetModelName: true,
				customFields: true,
				feedback: true,
				evaluationScore: true,
				recommendation: true,
				candidateId: true,
				jobOrderId: true,
				createdAt: true
			}
		});
		if (!existing) {
			return NextResponse.json({ error: 'Interview not found.' }, { status: 404 });
		}

		const body = await parseJsonBody(req);
		const parsed = interviewSchema.safeParse(body);
		if (!parsed.success) {
			return NextResponse.json({ errors: parsed.error.flatten() }, { status: 400 });
		}

		const relationChanged =
			parsed.data.candidateId !== existing.candidateId || parsed.data.jobOrderId !== existing.jobOrderId;
		if (relationChanged) {
			return NextResponse.json(
				{ error: 'Candidate and job order cannot be changed after interview creation.' },
				{ status: 400 }
			);
		}

		await validateScopedCandidateAndJobOrder({
			actingUser,
			candidateId: existing.candidateId,
			jobOrderId: existing.jobOrderId
		});
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
			moduleKey: 'interviews',
			customFieldsInput: { ...existingCustomFields, ...incomingCustomFields }
		});
		if (customFieldValidation.errors.length > 0) {
			return NextResponse.json(
				{ error: customFieldValidation.errors.join(' ') },
				{ status: 400 }
			);
		}

		const interview = await prisma.interview.update({
			where: { id },
			data: normalizeInterviewData({
				...parsed.data,
				candidateId: existing.candidateId,
				jobOrderId: existing.jobOrderId,
				customFields: customFieldValidation.customFields
			}),
			include: {
				candidate: true,
				jobOrder: { include: { client: true } },
				aiQuestionSetGeneratedByUser: {
					select: { id: true, firstName: true, lastName: true, email: true, isActive: true }
				}
			}
		});
		await logUpdate({
			actorUserId: actingUser?.id,
			entityType: 'INTERVIEW',
			before: existing,
			after: interview
		});
		const statusChanged = String(existing.status || '').trim() !== String(interview.status || '').trim();
		await createNotificationsForUsers({
			userIds: [
				interview.candidate?.ownerId,
				interview.jobOrder?.ownerId
			].filter((userId) => Number(userId) > 0 && Number(userId) !== Number(actingUser?.id)),
			type: 'interview',
			title: statusChanged && interview.status === 'cancelled' ? 'Interview Cancelled' : 'Interview Updated',
			message: `${interview.subject || interview.recordId || 'Interview'} was ${
				statusChanged && interview.status === 'cancelled' ? 'cancelled' : 'updated'
			}.`,
			entityType: 'INTERVIEW',
			entityId: interview.id,
			linkHref: `/interviews/${interview.id}`
		});
		const inviteEmail = await sendInterviewInviteEmail({ interview, reason: 'updated' });
		if (!inviteEmail.sent && !inviteEmail.skipped) {
			logError(
				'interview.invite_email.update_failed',
				requestLogContext(req, {
					interviewId: interview.id,
					reason: inviteEmail.reason || 'Unknown reason'
				})
			);
		}

		return NextResponse.json({ ...interview, inviteEmail });
	} catch (error) {
		return handleError(error, 'Failed to update interview.');
	}
}

export const GET = withApiLogging('interviews.id.get', getInterviewById);
export const PATCH = withApiLogging('interviews.id.patch', patchInterviewById);
