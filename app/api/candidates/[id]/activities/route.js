import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { candidateActivitySchema } from '@/lib/validators';
import { AccessControlError, ensureScopedEntityAccess, getActingUser } from '@/lib/access-control';
import { logCreate } from '@/lib/audit-log';
import { parseJsonBody, parseRouteId, ValidationError } from '@/lib/request-validation';
import { enforceMutationThrottle } from '@/lib/mutation-throttle';

import { withApiLogging } from '@/lib/api-logging';
function parseDueAt(value) {
	if (!value) return null;

	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return date;
}

function handleError(error, fallbackMessage) {
	if (error instanceof AccessControlError) {
		return NextResponse.json({ error: error.message }, { status: error.status });
	}
	if (error instanceof ValidationError) {
		return NextResponse.json({ error: error.message }, { status: 400 });
	}

	if (error.code === 'P2003') {
		return NextResponse.json({ error: 'Candidate not found.' }, { status: 404 });
	}

	return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

async function getCandidates_id_activitiesHandler(req, { params }) {
	try {
		const awaitedParams = await params;
		const candidateId = parseRouteId(awaitedParams);

		const actingUser = await getActingUser(req);
		await ensureScopedEntityAccess('candidate', candidateId, actingUser);

		const activities = await prisma.candidateActivity.findMany({
			where: { candidateId },
			orderBy: { createdAt: 'desc' }
		});

		return NextResponse.json(activities);
	} catch (error) {
		return handleError(error, 'Failed to load activities.');
	}
}

async function postCandidates_id_activitiesHandler(req, { params }) {
	try {
		const mutationThrottleResponse = await enforceMutationThrottle(req, 'candidates.id.activities.post');
		if (mutationThrottleResponse) {
			return mutationThrottleResponse;
		}

		const awaitedParams = await params;
		const candidateId = parseRouteId(awaitedParams);

		const actingUser = await getActingUser(req, { allowFallback: false });
		await ensureScopedEntityAccess('candidate', candidateId, actingUser);

		const body = await parseJsonBody(req);
		const parsed = candidateActivitySchema.safeParse(body);
		if (!parsed.success) {
			return NextResponse.json({ errors: parsed.error.flatten() }, { status: 400 });
		}

		const dueAt = parseDueAt(parsed.data.dueAt);
		if (parsed.data.dueAt && !dueAt) {
			return NextResponse.json({ error: 'Invalid due date.' }, { status: 400 });
		}

			const activity = await prisma.candidateActivity.create({
			data: {
				candidateId,
				type: parsed.data.type,
				subject: parsed.data.subject,
				description: parsed.data.description || null,
				dueAt,
				status: parsed.data.status
			}
			});
			await logCreate({
				actorUserId: actingUser?.id,
				entityType: 'CANDIDATE_ACTIVITY',
				entity: activity,
				metadata: { candidateId }
			});

			return NextResponse.json(activity, { status: 201 });
	} catch (error) {
		return handleError(error, 'Failed to create activity.');
	}
}

export const GET = withApiLogging('candidates.id.activities.get', getCandidates_id_activitiesHandler);
export const POST = withApiLogging('candidates.id.activities.post', postCandidates_id_activitiesHandler);
