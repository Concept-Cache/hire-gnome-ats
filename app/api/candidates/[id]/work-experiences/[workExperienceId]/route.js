import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { AccessControlError, ensureScopedEntityAccess, getActingUser } from '@/lib/access-control';
import { logDelete } from '@/lib/audit-log';
import { parseRouteId, ValidationError } from '@/lib/request-validation';
import { enforceMutationThrottle } from '@/lib/mutation-throttle';

import { withApiLogging } from '@/lib/api-logging';
function handleError(error, fallbackMessage) {
	if (error instanceof AccessControlError) {
		return NextResponse.json({ error: error.message }, { status: error.status });
	}
	if (error instanceof ValidationError) {
		return NextResponse.json({ error: error.message }, { status: 400 });
	}

	return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

async function deleteCandidates_id_work_experiences_workexperienceidHandler(req, { params }) {
	try {
		const mutationThrottleResponse = await enforceMutationThrottle(
			req,
			'candidates.id.work_experiences.workexperienceid.delete'
		);
		if (mutationThrottleResponse) {
			return mutationThrottleResponse;
		}

		const awaitedParams = await params;
		const candidateId = parseRouteId(awaitedParams);
		const workExperienceId = parseRouteId(awaitedParams, 'workExperienceId');

		const actingUser = await getActingUser(req, { allowFallback: false });
		await ensureScopedEntityAccess('candidate', candidateId, actingUser);

		const workExperience = await prisma.candidateWorkExperience.findFirst({
			where: {
				id: workExperienceId,
				candidateId
			}
		});
		if (!workExperience) {
			return NextResponse.json({ error: 'Work experience record not found.' }, { status: 404 });
		}

			await prisma.candidateWorkExperience.delete({
				where: { id: workExperience.id }
			});
			await logDelete({
				actorUserId: actingUser?.id,
				entityType: 'CANDIDATE_WORK_EXPERIENCE',
				entity: workExperience,
				metadata: { candidateId }
			});

			return NextResponse.json({ ok: true });
	} catch (error) {
		return handleError(error, 'Failed to delete work experience.');
	}
}

export const DELETE = withApiLogging('candidates.id.work_experiences.workexperienceid.delete', deleteCandidates_id_work_experiences_workexperienceidHandler);
