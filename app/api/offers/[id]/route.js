import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { offerSchema } from '@/lib/validators';
import { normalizeOfferData } from '@/lib/normalizers';
import { AccessControlError, addScopeToWhere, getActingUser } from '@/lib/access-control';
import { getCandidateJobOrderScope, validateScopedCandidateAndJobOrder } from '@/lib/related-record-scope';
import { logUpdate } from '@/lib/audit-log';
import { parseRouteId, parseJsonBody, ValidationError } from '@/lib/request-validation';
import { enforceMutationThrottle } from '@/lib/mutation-throttle';
import { validateAndNormalizeCustomFieldValues } from '@/lib/custom-fields';

import { withApiLogging } from '@/lib/api-logging';
const offerInclude = {
	candidate: true,
	jobOrder: {
		include: {
			client: true
		}
	},
	submission: { select: { id: true, status: true, createdAt: true } }
};

function parsePlacementStartDate(value) {
	if (!value) return null;
	const raw = String(value).trim();
	if (!raw) return null;
	const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00`) : new Date(raw);
	if (Number.isNaN(date.getTime())) return null;
	return date;
}

function hasPlacementStarted(value) {
	const startDate = parsePlacementStartDate(value);
	if (!startDate) return false;
	return Date.now() >= startDate.getTime();
}

function handleError(error, fallbackMessage) {
	if (error instanceof AccessControlError) {
		return NextResponse.json({ error: error.message }, { status: error.status });
	}
	if (error instanceof ValidationError) {
		return NextResponse.json({ error: error.message }, { status: error.status || 400 });
	}

	if (error.code === 'P2025') {
		return NextResponse.json({ error: 'Placement not found.' }, { status: 404 });
	}

	if (error.code === 'P2003') {
		return NextResponse.json({ error: 'Candidate or job order not found.' }, { status: 400 });
	}

	return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

async function getOffers_idHandler(req, { params }) {
	try {
		const awaitedParams = await params;
		const id = parseRouteId(awaitedParams);

		const actingUser = await getActingUser(req);
		const offer = await prisma.offer.findFirst({
			where: addScopeToWhere({ id }, getCandidateJobOrderScope(actingUser)),
			include: offerInclude
		});

		if (!offer) {
			return NextResponse.json({ error: 'Placement not found.' }, { status: 404 });
		}

		return NextResponse.json(offer);
	} catch (error) {
		return handleError(error, 'Failed to load placement.');
	}
}

async function patchOffers_idHandler(req, { params }) {
	try {
		const mutationThrottleResponse = await enforceMutationThrottle(req, 'offers.id.patch');
		if (mutationThrottleResponse) {
			return mutationThrottleResponse;
		}

		const awaitedParams = await params;
		const id = parseRouteId(awaitedParams);

		const actingUser = await getActingUser(req, { allowFallback: false });
			const existing = await prisma.offer.findFirst({
				where: addScopeToWhere({ id }, getCandidateJobOrderScope(actingUser)),
				select: {
					id: true,
					status: true,
					version: true,
					placementType: true,
					compensationType: true,
					currency: true,
					amount: true,
					payPeriod: true,
					regularRate: true,
					overtimeRate: true,
					dailyRate: true,
					annualSalary: true,
					hourlyRtBillRate: true,
					hourlyRtPayRate: true,
					hourlyOtBillRate: true,
					hourlyOtPayRate: true,
					dailyBillRate: true,
					dailyPayRate: true,
					yearlyCompensation: true,
					offeredOn: true,
					expectedJoinDate: true,
					endDate: true,
					withdrawnReason: true,
					notes: true,
					customFields: true,
					submissionId: true,
					candidateId: true,
					jobOrderId: true,
					createdAt: true
				}
			});
		if (!existing) {
			return NextResponse.json({ error: 'Placement not found.' }, { status: 404 });
		}

		if (String(existing.status || '').toLowerCase() === 'accepted') {
			return NextResponse.json(
				{ error: 'Accepted placements are read-only and cannot be changed.' },
				{ status: 409 }
			);
		}

		const body = await parseJsonBody(req);
		const parsed = offerSchema.safeParse(body);
		if (!parsed.success) {
			return NextResponse.json({ errors: parsed.error.flatten() }, { status: 400 });
		}
		const existingStatus = String(existing.status || '').toLowerCase();
		const nextStatus = String(parsed.data.status || '').toLowerCase();
		const started = hasPlacementStarted(parsed.data.expectedJoinDate || existing.expectedJoinDate);
		if (nextStatus === 'withdrawn' && existingStatus !== 'withdrawn' && started) {
			return NextResponse.json(
				{ error: 'Placement has started. Use Cancel Placement instead of Withdraw Placement.' },
				{ status: 409 }
			);
		}
		if (nextStatus === 'declined' && existingStatus !== 'declined' && !started) {
			return NextResponse.json(
				{ error: 'Placement has not started. Use Withdraw Placement instead of Cancel Placement.' },
				{ status: 409 }
			);
		}

		if (
			parsed.data.candidateId !== existing.candidateId ||
			parsed.data.jobOrderId !== existing.jobOrderId
		) {
			return NextResponse.json(
				{ error: 'Candidate and Job Order cannot be changed after placement creation.' },
				{ status: 400 }
			);
		}

		await validateScopedCandidateAndJobOrder({
			actingUser,
			candidateId: parsed.data.candidateId,
			jobOrderId: parsed.data.jobOrderId
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
			moduleKey: 'placements',
			customFieldsInput: { ...existingCustomFields, ...incomingCustomFields }
		});
		if (customFieldValidation.errors.length > 0) {
			return NextResponse.json(
				{ error: customFieldValidation.errors.join(' ') },
				{ status: 400 }
			);
		}

		const offer = await prisma.offer.update({
			where: { id },
			data: normalizeOfferData({
				...parsed.data,
				customFields: customFieldValidation.customFields
			}),
			include: offerInclude
		});
		await logUpdate({
			actorUserId: actingUser?.id,
			entityType: 'PLACEMENT',
			before: existing,
			after: offer
		});
		return NextResponse.json(offer);
	} catch (error) {
		return handleError(error, 'Failed to update placement.');
	}
}

export const GET = withApiLogging('offers.id.get', getOffers_idHandler);
export const PATCH = withApiLogging('offers.id.patch', patchOffers_idHandler);
