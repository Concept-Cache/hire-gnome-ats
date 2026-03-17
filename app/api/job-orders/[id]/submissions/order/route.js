import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { AccessControlError, addScopeToWhere, getActingUser, getEntityScope } from '@/lib/access-control';
import { getCandidateJobOrderScope } from '@/lib/related-record-scope';
import { logUpdate } from '@/lib/audit-log';
import { parseRouteId, parseJsonBody, ValidationError } from '@/lib/request-validation';
import { enforceMutationThrottle } from '@/lib/mutation-throttle';
import { withApiLogging } from '@/lib/api-logging';

function handleError(error, fallbackMessage) {
	if (error instanceof AccessControlError) {
		return NextResponse.json({ error: error.message }, { status: error.status });
	}
	if (error instanceof ValidationError) {
		return NextResponse.json({ error: error.message }, { status: error.status || 400 });
	}
	return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

async function patchJob_orders_id_submissions_orderHandler(req, { params }) {
	try {
		const mutationThrottleResponse = await enforceMutationThrottle(req, 'job_orders.id.submissions.order.patch');
		if (mutationThrottleResponse) {
			return mutationThrottleResponse;
		}

		const awaitedParams = await params;
		const id = parseRouteId(awaitedParams);
		const actingUser = await getActingUser(req, { allowFallback: false });
		const entityScope = getEntityScope(actingUser);
		const body = await parseJsonBody(req);
		const submissionIds = Array.isArray(body?.submissionIds)
			? body.submissionIds
					.map((value) => Number(value))
					.filter((value) => Number.isInteger(value) && value > 0)
			: [];

		if (submissionIds.length === 0) {
			throw new ValidationError('Submission order payload is required.', 400);
		}
		if (new Set(submissionIds).size !== submissionIds.length) {
			throw new ValidationError('Submission order payload contains duplicates.', 400);
		}

		const jobOrder = await prisma.jobOrder.findFirst({
			where: addScopeToWhere({ id }, entityScope),
			select: { id: true }
		});
		if (!jobOrder) {
			return NextResponse.json({ error: 'Job order not found.' }, { status: 404 });
		}

		const scopedSubmissions = await prisma.submission.findMany({
			where: addScopeToWhere({ jobOrderId: id }, getCandidateJobOrderScope(actingUser)),
			select: {
				id: true,
				jobOrderId: true,
				submissionPriority: true,
				status: true,
				notes: true,
				createdByUserId: true,
				createdAt: true,
				updatedAt: true,
				candidateId: true
			}
		});

		const scopedIds = scopedSubmissions.map((submission) => submission.id).sort((a, b) => a - b);
		const requestedIds = [...submissionIds].sort((a, b) => a - b);
		if (
			scopedIds.length !== requestedIds.length ||
			scopedIds.some((value, index) => value !== requestedIds[index])
		) {
			throw new ValidationError('Submission order does not match the submissions available for this job order.', 400);
		}

		const beforeMap = new Map(scopedSubmissions.map((submission) => [submission.id, submission]));
		const updated = await prisma.$transaction(async (tx) => {
			for (let index = 0; index < submissionIds.length; index += 1) {
				await tx.submission.update({
					where: { id: submissionIds[index] },
					data: { submissionPriority: index + 1 }
				});
			}
			return tx.submission.findMany({
				where: { id: { in: submissionIds } },
				select: {
					id: true,
					jobOrderId: true,
					submissionPriority: true,
					status: true,
					notes: true,
					createdByUserId: true,
					createdAt: true,
					updatedAt: true,
					candidateId: true
				}
			});
		});

		await Promise.all(
			updated.map((submission) =>
				logUpdate({
					actorUserId: actingUser?.id,
					entityType: 'SUBMISSION',
					before: beforeMap.get(submission.id),
					after: submission
				})
			)
		);

		return NextResponse.json({
			ok: true,
			submissionIds: updated
				.sort((a, b) => a.submissionPriority - b.submissionPriority)
				.map((submission) => submission.id)
		});
	} catch (error) {
		return handleError(error, 'Failed to update submission order.');
	}
}

export const PATCH = withApiLogging(
	'job_orders.id.submissions.order.patch',
	patchJob_orders_id_submissions_orderHandler
);
