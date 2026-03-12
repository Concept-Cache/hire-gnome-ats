import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { jobOrderSchema } from '@/lib/validators';
import { normalizeJobOrderData } from '@/lib/normalizers';
import { withInferredCityStateFromZip } from '@/lib/zip-code-lookup';
import {
	AccessControlError,
	addScopeToWhere,
	getActingUser,
	getEntityScope,
	resolveOwnershipForWrite
} from '@/lib/access-control';
import { logCreate } from '@/lib/audit-log';
import { ensureDefaultUnassignedDivision } from '@/lib/default-division';
import { getSystemSettingRecord } from '@/lib/system-settings';
import { parseJsonBody, ValidationError } from '@/lib/request-validation';
import { enforceMutationThrottle } from '@/lib/mutation-throttle';
import { validateAndNormalizeCustomFieldValues } from '@/lib/custom-fields';

import { withApiLogging } from '@/lib/api-logging';
async function validateClientAndContactDivision(clientId, contactId, divisionId) {
	const selectedClient = await prisma.client.findUnique({
		where: { id: clientId },
		select: { id: true, divisionId: true }
	});

	if (!selectedClient) {
		throw new AccessControlError('Selected client was not found.', 400);
	}

	if (!selectedClient.divisionId) {
		throw new AccessControlError('Selected client must belong to a division.', 400);
	}

	if (divisionId && selectedClient.divisionId !== divisionId) {
		throw new AccessControlError('Job order division must match the selected client division.', 400);
	}

	if (!contactId) {
		return selectedClient.divisionId;
	}

	const selectedContact = await prisma.contact.findUnique({
		where: { id: contactId },
		select: { id: true, clientId: true, divisionId: true }
	});

	if (!selectedContact) {
		throw new AccessControlError('Selected contact was not found.', 400);
	}

	if (selectedContact.clientId !== clientId) {
		throw new AccessControlError('Selected contact must belong to the selected client.', 400);
	}

	if (selectedContact.divisionId !== selectedClient.divisionId) {
		throw new AccessControlError('Selected contact must be in the same division as the client.', 400);
	}

	return selectedClient.divisionId;
}

const jobOrderListInclude = {
	client: true,
	contact: true,
	ownerUser: { select: { id: true, firstName: true, lastName: true, email: true, isActive: true } },
	division: { select: { id: true, name: true, accessMode: true } },
	submissions: {
		select: { createdAt: true, updatedAt: true },
		orderBy: { updatedAt: 'desc' },
		take: 1
	},
	interviews: {
		select: { createdAt: true, updatedAt: true, startsAt: true },
		orderBy: { updatedAt: 'desc' },
		take: 1
	},
	offers: {
		select: { createdAt: true, updatedAt: true, offeredOn: true },
		orderBy: { updatedAt: 'desc' },
		take: 1
	}
};

function toTime(value) {
	if (!value) return null;
	const date = new Date(value);
	const time = date.getTime();
	return Number.isNaN(time) ? null : time;
}

function resolveJobOrderLastActivityAt(jobOrder) {
	const timestamps = [
		toTime(jobOrder.updatedAt),
		toTime(jobOrder.closedAt),
		toTime(jobOrder.openedAt),
		toTime(jobOrder.submissions?.[0]?.updatedAt),
		toTime(jobOrder.submissions?.[0]?.createdAt),
		toTime(jobOrder.interviews?.[0]?.updatedAt),
		toTime(jobOrder.interviews?.[0]?.startsAt),
		toTime(jobOrder.interviews?.[0]?.createdAt),
		toTime(jobOrder.offers?.[0]?.updatedAt),
		toTime(jobOrder.offers?.[0]?.offeredOn),
		toTime(jobOrder.offers?.[0]?.createdAt)
	].filter((value) => typeof value === 'number');

	if (timestamps.length === 0) return null;
	return new Date(Math.max(...timestamps)).toISOString();
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

async function getJob_ordersHandler(req) {
	try {
		const actingUser = await getActingUser(req);
		const jobOrders = await prisma.jobOrder.findMany({
			where: addScopeToWhere(undefined, getEntityScope(actingUser)),
			include: jobOrderListInclude,
			orderBy: { createdAt: 'desc' }
		});
		const jobOrderRows = jobOrders.map((jobOrder) => {
			const { submissions, interviews, offers, ...jobOrderRest } = jobOrder;
			return {
				...jobOrderRest,
				lastActivityAt: resolveJobOrderLastActivityAt(jobOrder)
			};
		});

		return NextResponse.json(jobOrderRows);
	} catch (error) {
		return handleError(error, 'Failed to load job orders.');
	}
}

async function postJob_ordersHandler(req) {
	try {
		const mutationThrottleResponse = await enforceMutationThrottle(req, 'job_orders.post');
		if (mutationThrottleResponse) {
			return mutationThrottleResponse;
		}

		const actingUser = await getActingUser(req, { allowFallback: false });
		const systemSetting = await getSystemSettingRecord();
		const careerSiteEnabled = Boolean(systemSetting?.careerSiteEnabled);
		const body = await parseJsonBody(req);
		const parsed = jobOrderSchema.safeParse(body);

		if (!parsed.success) {
			return NextResponse.json({ errors: parsed.error.flatten() }, { status: 400 });
		}
		const defaultDivisionForAdmin =
			actingUser?.role === 'ADMINISTRATOR' && !parsed.data.divisionId
				? await ensureDefaultUnassignedDivision(prisma)
				: null;
		const jobOrderInput = defaultDivisionForAdmin
			? { ...parsed.data, divisionId: defaultDivisionForAdmin.id }
			: parsed.data;
		const customFieldValidation = await validateAndNormalizeCustomFieldValues({
			prisma,
			moduleKey: 'jobOrders',
			customFieldsInput: jobOrderInput.customFields
		});
		if (customFieldValidation.errors.length > 0) {
			return NextResponse.json(
				{ error: customFieldValidation.errors.join(' ') },
				{ status: 400 }
			);
		}
		const jobOrderInputWithCustomFields = {
			...jobOrderInput,
			customFields: customFieldValidation.customFields
		};

		const normalized = await withInferredCityStateFromZip(
			prisma,
			normalizeJobOrderData(jobOrderInputWithCustomFields)
		);
		if (normalized.publishToCareerSite && !careerSiteEnabled) {
			return NextResponse.json(
				{ error: 'Career site publishing is disabled. Enable it in Admin > System Settings first.' },
				{ status: 400 }
			);
		}
		const clientDivisionId = await validateClientAndContactDivision(
			normalized.clientId,
			normalized.contactId,
			normalized.divisionId
		);
		const ownership = await resolveOwnershipForWrite({
			actingUser,
			ownerIdInput: normalized.ownerId,
			divisionIdInput: clientDivisionId
		});
		if (ownership.divisionId !== clientDivisionId) {
			throw new AccessControlError('Owner must belong to the same division as the selected client.', 400);
		}

			const jobOrder = await prisma.jobOrder.create({
			data: {
				...normalized,
				ownerId: ownership.ownerId,
				divisionId: clientDivisionId
			},
			include: {
				client: true,
				contact: true,
				ownerUser: { select: { id: true, firstName: true, lastName: true, email: true, isActive: true } },
				division: { select: { id: true, name: true, accessMode: true } }
			}
			});
			await logCreate({
				actorUserId: actingUser?.id,
				entityType: 'JOB_ORDER',
				entity: jobOrder
			});

			return NextResponse.json(jobOrder, { status: 201 });
	} catch (error) {
		return handleError(error, 'Failed to create job order.');
	}
}

export const GET = withApiLogging('job_orders.get', getJob_ordersHandler);
export const POST = withApiLogging('job_orders.post', postJob_ordersHandler);
