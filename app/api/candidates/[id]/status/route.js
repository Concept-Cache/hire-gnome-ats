import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { AccessControlError, addScopeToWhere, getActingUser, getEntityScope } from '@/lib/access-control';
import { createRecordId } from '@/lib/record-id';
import { logUpdate } from '@/lib/audit-log';
import { parseRouteId, parseJsonBody, ValidationError } from '@/lib/request-validation';
import { enforceMutationThrottle } from '@/lib/mutation-throttle';
import { CANDIDATE_STATUS_OPTIONS } from '@/lib/candidate-status';
import { withApiLogging } from '@/lib/api-logging';

const CANDIDATE_STATUS_VALUES = CANDIDATE_STATUS_OPTIONS.map((option) => option.value);

const candidateStatusSchema = z.object({
	status: z.enum(CANDIDATE_STATUS_VALUES),
	reason: z.string().trim().optional()
});

function normalizeReason(value) {
	return typeof value === 'string' ? value.trim() : '';
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

async function patchCandidates_id_statusHandler(req, { params }) {
	try {
		const mutationThrottleResponse = await enforceMutationThrottle(req, 'candidates.id.status.patch');
		if (mutationThrottleResponse) {
			return mutationThrottleResponse;
		}

		const awaitedParams = await params;
		const id = parseRouteId(awaitedParams);
		const actingUser = await getActingUser(req, { allowFallback: false });
		const existing = await prisma.candidate.findFirst({
			where: addScopeToWhere({ id }, getEntityScope(actingUser))
		});
		if (!existing) {
			return NextResponse.json({ error: 'Candidate not found.' }, { status: 404 });
		}

		const body = await parseJsonBody(req);
		const parsed = candidateStatusSchema.safeParse(body);
		if (!parsed.success) {
			return NextResponse.json({ errors: parsed.error.flatten() }, { status: 400 });
		}

		const nextStatus = parsed.data.status;
		const reason = normalizeReason(parsed.data.reason);
		const statusDidChange = String(existing.status || '').trim() !== String(nextStatus || '').trim();
		if (!statusDidChange) {
			return NextResponse.json({
				id: existing.id,
				status: existing.status,
				updatedAt: existing.updatedAt
			});
		}
		if (!reason) {
			return NextResponse.json(
				{ error: 'Status change reason is required when updating candidate status.' },
				{ status: 400 }
			);
		}

		const candidate = await prisma.$transaction(async (tx) => {
			const updated = await tx.candidate.update({
				where: { id },
				data: { status: nextStatus },
				select: { id: true, status: true, updatedAt: true }
			});
			await tx.candidateStatusChange.create({
				data: {
					recordId: createRecordId('CSC'),
					candidateId: updated.id,
					fromStatus: existing.status || null,
					toStatus: updated.status,
					reason,
					changedByUserId: actingUser?.id || null
				}
			});
			return updated;
		});

		await logUpdate({
			actorUserId: actingUser?.id,
			entityType: 'CANDIDATE',
			before: existing,
			after: candidate
		});

		return NextResponse.json(candidate);
	} catch (error) {
		return handleError(error, 'Failed to update candidate status.');
	}
}

export const PATCH = withApiLogging('candidates.id.status.patch', patchCandidates_id_statusHandler);
