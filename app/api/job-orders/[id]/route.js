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
import { logUpdate } from '@/lib/audit-log';
import { createOwnerAssignmentNotifications } from '@/lib/notifications';
import { getSystemSettingRecord } from '@/lib/system-settings';
import { parseRouteId, parseJsonBody, ValidationError } from '@/lib/request-validation';
import { enforceMutationThrottle } from '@/lib/mutation-throttle';
import { validateAndNormalizeCustomFieldValues } from '@/lib/custom-fields';

import { withApiLogging } from '@/lib/api-logging';
function isObjectEmpty(value) {
	return value && typeof value === 'object' && Object.keys(value).length === 0;
}

function getFirstSchemaError(flattenedError) {
	const formError = flattenedError?.formErrors?.find(Boolean);
	if (formError) return formError;
	const fieldErrors = flattenedError?.fieldErrors || {};
	for (const messages of Object.values(fieldErrors)) {
		if (Array.isArray(messages) && messages.length > 0 && messages[0]) {
			return messages[0];
		}
	}
	return '';
}

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

function buildJobOrderDetailInclude(entityScope) {
	const relatedCandidateScope = !entityScope || isObjectEmpty(entityScope) ? undefined : { candidate: entityScope };

	return {
		client: true,
		contact: true,
		ownerUser: { select: { id: true, firstName: true, lastName: true, email: true, isActive: true } },
		division: { select: { id: true, name: true, accessMode: true } },
			submissions: {
				where: relatedCandidateScope,
				orderBy: { createdAt: 'desc' },
				include: {
					candidate: true,
					createdByUser: { select: { id: true, firstName: true, lastName: true, email: true, isActive: true } }
				}
			},
		interviews: {
			where: relatedCandidateScope,
			orderBy: { createdAt: 'desc' },
			include: {
				candidate: true
			}
		},
		offers: {
			where: relatedCandidateScope,
			orderBy: { createdAt: 'desc' },
			include: {
				candidate: true
			}
		},
		_count: {
			select: {
				submissions: true,
				interviews: true,
				offers: true
			}
		}
	};
}

function handleError(error, fallbackMessage) {
	if (error instanceof AccessControlError) {
		return NextResponse.json({ error: error.message }, { status: error.status });
	}
	if (error instanceof ValidationError) {
		return NextResponse.json({ error: error.message }, { status: error.status || 400 });
	}

	if (error.code === 'P2025') {
		return NextResponse.json({ error: 'Job order not found.' }, { status: 404 });
	}

	return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

async function getJob_orders_idHandler(req, { params }) {
	const awaitedParams = await params;
	const id = parseRouteId(awaitedParams);

	const actingUser = await getActingUser(req);
	const entityScope = getEntityScope(actingUser);
	const jobOrder = await prisma.jobOrder.findFirst({
		where: addScopeToWhere({ id }, entityScope),
		include: buildJobOrderDetailInclude(entityScope)
	});

	if (!jobOrder) {
		return NextResponse.json({ error: 'Job order not found.' }, { status: 404 });
	}

	return NextResponse.json(jobOrder);
}

async function patchJob_orders_idHandler(req, { params }) {
	try {
		const mutationThrottleResponse = await enforceMutationThrottle(req, 'job_orders.id.patch');
		if (mutationThrottleResponse) {
			return mutationThrottleResponse;
		}

		const awaitedParams = await params;
		const id = parseRouteId(awaitedParams);

		const actingUser = await getActingUser(req, { allowFallback: false });
		const systemSetting = await getSystemSettingRecord();
		const careerSiteEnabled = Boolean(systemSetting?.careerSiteEnabled);
		const existing = await prisma.jobOrder.findFirst({
			where: addScopeToWhere({ id }, getEntityScope(actingUser)),
			select: {
				id: true,
				title: true,
				description: true,
				publicDescription: true,
				location: true,
				locationPlaceId: true,
				locationLatitude: true,
				locationLongitude: true,
				city: true,
				state: true,
				zipCode: true,
				status: true,
				employmentType: true,
				openings: true,
				currency: true,
				salaryMin: true,
				salaryMax: true,
				publishToCareerSite: true,
				publishedAt: true,
				openedAt: true,
				closedAt: true,
				customFields: true,
				clientId: true,
				contactId: true,
				ownerId: true,
				divisionId: true,
				createdAt: true
			}
		});
		if (!existing) {
			return NextResponse.json({ error: 'Job order not found.' }, { status: 404 });
		}

		const body = await parseJsonBody(req);
		const parsed = jobOrderSchema.safeParse(body);
		if (!parsed.success) {
			const flattenedError = parsed.error.flatten();
			return NextResponse.json(
				{
					error: getFirstSchemaError(flattenedError) || 'Invalid job order payload.',
					errors: flattenedError
				},
				{ status: 400 }
			);
		}
		if (actingUser?.role === 'ADMINISTRATOR' && !parsed.data.divisionId) {
			return NextResponse.json({ error: 'Division is required for administrators.' }, { status: 400 });
		}
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
			moduleKey: 'jobOrders',
			customFieldsInput: { ...existingCustomFields, ...incomingCustomFields }
		});
		if (customFieldValidation.errors.length > 0) {
			return NextResponse.json(
				{ error: customFieldValidation.errors.join(' ') },
				{ status: 400 }
			);
		}
		const parsedDataWithCustomFields = {
			...parsed.data,
			customFields: customFieldValidation.customFields
		};

		const normalized = await withInferredCityStateFromZip(
			prisma,
			normalizeJobOrderData(parsedDataWithCustomFields)
		);
		if (!careerSiteEnabled && normalized.publishToCareerSite && !existing.publishToCareerSite) {
			return NextResponse.json(
				{ error: 'Career site publishing is disabled. Enable it in Admin > System Settings first.' },
				{ status: 400 }
			);
		}
		const clientDivisionId = await validateClientAndContactDivision(
			normalized.clientId,
			normalized.contactId,
			null
		);
		const ownership = await resolveOwnershipForWrite({
			actingUser,
			ownerIdInput: normalized.ownerId,
			divisionIdInput: clientDivisionId
		});
		if (ownership.divisionId !== clientDivisionId) {
			throw new AccessControlError('Owner must belong to the same division as the selected client.', 400);
		}

		const jobOrder = await prisma.jobOrder.update({
			where: { id },
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
		await logUpdate({
			actorUserId: actingUser?.id,
			entityType: 'JOB_ORDER',
			before: existing,
			after: jobOrder
		});
		await createOwnerAssignmentNotifications({
			previousOwnerId: existing.ownerId,
			nextOwnerId: jobOrder.ownerId,
			actorUserId: actingUser?.id || null,
			entityType: 'JOB_ORDER',
			entityId: jobOrder.id,
			entityLabel: jobOrder.title || jobOrder.recordId,
			detailPath: `/job-orders/${jobOrder.id}`
		});

		return NextResponse.json(jobOrder);
	} catch (error) {
		return handleError(error, 'Failed to update job order.');
	}
}

export const GET = withApiLogging('job_orders.id.get', getJob_orders_idHandler);
export const PATCH = withApiLogging('job_orders.id.patch', patchJob_orders_idHandler);
