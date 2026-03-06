import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { candidateEducationSchema } from '@/lib/validators';
import { normalizeCandidateEducationRecords } from '@/lib/candidate-history';
import { AccessControlError, ensureScopedEntityAccess, getActingUser } from '@/lib/access-control';
import { logCreate } from '@/lib/audit-log';
import { createRecordId } from '@/lib/record-id';
import { parseJsonBody, parseRouteId, ValidationError } from '@/lib/request-validation';
import { enforceMutationThrottle } from '@/lib/mutation-throttle';

import { withApiLogging } from '@/lib/api-logging';
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

async function postCandidates_id_educationsHandler(req, { params }) {
	try {
		const mutationThrottleResponse = await enforceMutationThrottle(req, 'candidates.id.educations.post');
		if (mutationThrottleResponse) {
			return mutationThrottleResponse;
		}

		const awaitedParams = await params;
		const candidateId = parseRouteId(awaitedParams);

		const actingUser = await getActingUser(req, { allowFallback: false });
		await ensureScopedEntityAccess('candidate', candidateId, actingUser);

		const body = await parseJsonBody(req);
		const parsed = candidateEducationSchema.safeParse(body);
		if (!parsed.success) {
			return NextResponse.json({ errors: parsed.error.flatten() }, { status: 400 });
		}

		const [normalizedRecord] = normalizeCandidateEducationRecords([parsed.data]);
		if (!normalizedRecord) {
			return NextResponse.json({ error: 'School is required.' }, { status: 400 });
		}

		const education = await prisma.candidateEducation.create({
			data: {
				recordId: createRecordId('CED'),
				candidateId,
				...normalizedRecord
			}
		});
		await logCreate({
			actorUserId: actingUser?.id,
			entityType: 'CANDIDATE_EDUCATION',
			entity: education,
			metadata: { candidateId }
		});

		return NextResponse.json(education, { status: 201 });
	} catch (error) {
		return handleError(error, 'Failed to save education.');
	}
}

export const POST = withApiLogging('candidates.id.educations.post', postCandidates_id_educationsHandler);
