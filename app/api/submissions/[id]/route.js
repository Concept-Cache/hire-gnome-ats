import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { submissionSchema } from '@/lib/validators';
import { AccessControlError, addScopeToWhere, getActingUser } from '@/lib/access-control';
import { getCandidateJobOrderScope, validateScopedCandidateAndJobOrder } from '@/lib/related-record-scope';
import { logUpdate } from '@/lib/audit-log';
import { parseRouteId, parseJsonBody, ValidationError } from '@/lib/request-validation';
import { enforceMutationThrottle } from '@/lib/mutation-throttle';

import { withApiLogging } from '@/lib/api-logging';
const submissionInclude = {
	candidate: true,
	jobOrder: {
		include: {
			client: true,
			contact: true
		}
	},
	createdByUser: {
		select: { id: true, firstName: true, lastName: true, email: true, isActive: true }
	},
	offer: {
		select: { id: true, status: true, updatedAt: true }
	}
};

function toNullablePositiveInt(value) {
	if (value === '' || value == null) return null;
	const number = Number(value);
	if (!Number.isInteger(number) || number <= 0) return null;
	return number;
}

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

	if (error.code === 'P2002') {
		return NextResponse.json(
			{ error: 'This candidate is already submitted to this job order.' },
			{ status: 409 }
		);
	}

	if (error.code === 'P2003') {
		return NextResponse.json({ error: 'Candidate or job order not found.' }, { status: 400 });
	}

	return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

async function getSubmissions_idHandler(req, { params }) {
	try {
		const awaitedParams = await params;
		const id = parseRouteId(awaitedParams);

		const actingUser = await getActingUser(req);
		const submission = await prisma.submission.findFirst({
			where: addScopeToWhere({ id }, getCandidateJobOrderScope(actingUser)),
			include: submissionInclude
		});

		if (!submission) {
			return NextResponse.json({ error: 'Submission not found.' }, { status: 404 });
		}

		return NextResponse.json(submission);
	} catch (error) {
		return handleError(error, 'Failed to load submission.');
	}
}

async function patchSubmissions_idHandler(req, { params }) {
	try {
		const mutationThrottleResponse = await enforceMutationThrottle(req, 'submissions.id.patch');
		if (mutationThrottleResponse) {
			return mutationThrottleResponse;
		}

		const awaitedParams = await params;
		const id = parseRouteId(awaitedParams);

		const actingUser = await getActingUser(req, { allowFallback: false });
			const existing = await prisma.submission.findFirst({
				where: addScopeToWhere({ id }, getCandidateJobOrderScope(actingUser)),
				select: {
					id: true,
					status: true,
					notes: true,
					candidateId: true,
					jobOrderId: true,
					createdByUserId: true,
					createdAt: true,
					offer: {
						select: {
							id: true
						}
					}
				}
			});
		if (!existing) {
			return NextResponse.json({ error: 'Submission not found.' }, { status: 404 });
		}
		if (existing.offer?.id) {
			return NextResponse.json(
				{ error: 'Submission is locked after conversion to placement.' },
				{ status: 409 }
			);
		}

		const body = await parseJsonBody(req);
		const attemptedCandidateId = toNullablePositiveInt(body.candidateId);
		const attemptedJobOrderId = toNullablePositiveInt(body.jobOrderId);
		const attemptedAssignmentChange =
			(attemptedCandidateId != null && attemptedCandidateId !== existing.candidateId) ||
			(attemptedJobOrderId != null && attemptedJobOrderId !== existing.jobOrderId);
		if (attemptedAssignmentChange) {
			return NextResponse.json(
				{ error: 'Candidate and Job Order cannot be changed after submission is created.' },
				{ status: 400 }
			);
		}

		const parsed = submissionSchema.safeParse({
			...body,
			candidateId: existing.candidateId,
			jobOrderId: existing.jobOrderId
		});
		if (!parsed.success) {
			return NextResponse.json({ errors: parsed.error.flatten() }, { status: 400 });
		}

		await validateScopedCandidateAndJobOrder({
			actingUser,
			candidateId: existing.candidateId,
			jobOrderId: existing.jobOrderId
		});

			const submission = await prisma.submission.update({
			where: { id },
			data: {
				candidateId: existing.candidateId,
				jobOrderId: existing.jobOrderId,
				status: parsed.data.status,
				notes: parsed.data.notes || null
			},
			include: submissionInclude
			});
			await logUpdate({
				actorUserId: actingUser?.id,
				entityType: 'SUBMISSION',
				before: existing,
				after: submission
			});

			return NextResponse.json(submission);
	} catch (error) {
		return handleError(error, 'Failed to update submission.');
	}
}

export const GET = withApiLogging('submissions.id.get', getSubmissions_idHandler);
export const PATCH = withApiLogging('submissions.id.patch', patchSubmissions_idHandler);
