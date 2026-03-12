import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { offerSchema } from '@/lib/validators';
import { normalizeOfferData } from '@/lib/normalizers';
import { AccessControlError, getActingUser } from '@/lib/access-control';
import { getCandidateJobOrderScope, validateScopedCandidateAndJobOrder } from '@/lib/related-record-scope';
import { logCreate } from '@/lib/audit-log';
import { parseJsonBody, ValidationError } from '@/lib/request-validation';
import { enforceMutationThrottle } from '@/lib/mutation-throttle';
import { validateAndNormalizeCustomFieldValues } from '@/lib/custom-fields';

import { withApiLogging } from '@/lib/api-logging';
const offerInclude = {
	candidate: true,
	jobOrder: { include: { client: true } },
	submission: { select: { id: true, status: true, createdAt: true } }
};

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

async function getOffersHandler(req) {
	try {
		const actingUser = await getActingUser(req);
		const offers = await prisma.offer.findMany({
			where: getCandidateJobOrderScope(actingUser),
			include: offerInclude,
			orderBy: { createdAt: 'desc' }
		});

		return NextResponse.json(offers);
	} catch (error) {
		return handleError(error, 'Failed to load placements.');
	}
}

async function postOffersHandler(req) {
	try {
		const mutationThrottleResponse = await enforceMutationThrottle(req, 'offers.post');
		if (mutationThrottleResponse) {
			return mutationThrottleResponse;
		}

		const actingUser = await getActingUser(req, { allowFallback: false });
		const body = await parseJsonBody(req);
		const parsed = offerSchema.safeParse(body);
		if (!parsed.success) {
			return NextResponse.json({ errors: parsed.error.flatten() }, { status: 400 });
		}

		await validateScopedCandidateAndJobOrder({
			actingUser,
			candidateId: parsed.data.candidateId,
			jobOrderId: parsed.data.jobOrderId
		});
		const customFieldValidation = await validateAndNormalizeCustomFieldValues({
			prisma,
			moduleKey: 'placements',
			customFieldsInput: parsed.data.customFields
		});
		if (customFieldValidation.errors.length > 0) {
			return NextResponse.json(
				{ error: customFieldValidation.errors.join(' ') },
				{ status: 400 }
			);
		}

		const offer = await prisma.offer.create({
			data: normalizeOfferData({
				...parsed.data,
				customFields: customFieldValidation.customFields
			}),
			include: offerInclude
		});
		await logCreate({
			actorUserId: actingUser?.id,
			entityType: 'PLACEMENT',
			entity: offer
		});
		return NextResponse.json(offer, { status: 201 });
	} catch (error) {
		return handleError(error, 'Failed to create placement.');
	}
}

export const GET = withApiLogging('offers.get', getOffersHandler);
export const POST = withApiLogging('offers.post', postOffersHandler);
