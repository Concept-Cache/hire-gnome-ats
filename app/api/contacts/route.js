import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { contactSchema } from '@/lib/validators';
import { normalizeContactData } from '@/lib/normalizers';
import {
	AccessControlError,
	addScopeToWhere,
	getActingUser,
	getEntityScope,
	resolveOwnershipForWrite
} from '@/lib/access-control';
import { logCreate } from '@/lib/audit-log';
import { ensureDefaultUnassignedDivision } from '@/lib/default-division';
import { parseJsonBody, ValidationError } from '@/lib/request-validation';
import { enforceMutationThrottle } from '@/lib/mutation-throttle';
import { validateAndNormalizeCustomFieldValues } from '@/lib/custom-fields';

import { withApiLogging } from '@/lib/api-logging';
const contactListInclude = {
	client: true,
	ownerUser: { select: { id: true, firstName: true, lastName: true, email: true, isActive: true } },
	division: { select: { id: true, name: true, accessMode: true } },
	_count: { select: { notes: true, jobOrders: true } },
	notes: {
		select: { createdAt: true, updatedAt: true },
		orderBy: { updatedAt: 'desc' },
		take: 1
	},
	jobOrders: {
		select: { status: true, updatedAt: true, createdAt: true },
		orderBy: { updatedAt: 'desc' }
	}
};

function toTime(value) {
	if (!value) return null;
	const date = new Date(value);
	const time = date.getTime();
	return Number.isNaN(time) ? null : time;
}

function resolveContactStatus(contact) {
	const jobStatuses = (contact.jobOrders || []).map((jobOrder) =>
		String(jobOrder?.status || '')
			.trim()
			.toLowerCase()
	);
	if (jobStatuses.length === 0) return 'new';
	if (jobStatuses.some((status) => status === 'open' || status === 'active' || status === 'on_hold')) {
		return 'active';
	}
	return 'inactive';
}

function resolveContactLastActivityAt(contact) {
	const timestamps = [
		toTime(contact.updatedAt),
		toTime(contact.notes?.[0]?.updatedAt),
		toTime(contact.notes?.[0]?.createdAt),
		...((contact.jobOrders || []).flatMap((jobOrder) => [
			toTime(jobOrder.updatedAt),
			toTime(jobOrder.createdAt)
		]))
	].filter((value) => typeof value === 'number');

	if (timestamps.length === 0) return null;
	return new Date(Math.max(...timestamps)).toISOString();
}

async function validateClientDivision(clientId, divisionId) {
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
		throw new AccessControlError('Contact division must match the selected client division.', 400);
	}

	return selectedClient.divisionId;
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

async function getContactsHandler(req) {
	try {
		const actingUser = await getActingUser(req);
		const contacts = await prisma.contact.findMany({
			where: addScopeToWhere(undefined, getEntityScope(actingUser)),
			include: contactListInclude,
			orderBy: { createdAt: 'desc' }
		});

		const contactRows = contacts.map((contact) => {
			const { notes, jobOrders, ...contactRest } = contact;
			return {
				...contactRest,
				status: resolveContactStatus(contact),
				lastActivityAt: resolveContactLastActivityAt(contact)
			};
		});

		return NextResponse.json(contactRows);
	} catch (error) {
		return handleError(error, 'Failed to load contacts.');
	}
}

async function postContactsHandler(req) {
	try {
		const mutationThrottleResponse = await enforceMutationThrottle(req, 'contacts.post');
		if (mutationThrottleResponse) {
			return mutationThrottleResponse;
		}

		const actingUser = await getActingUser(req, { allowFallback: false });
		const body = await parseJsonBody(req);
		const parsed = contactSchema.safeParse(body);

		if (!parsed.success) {
			return NextResponse.json({ errors: parsed.error.flatten() }, { status: 400 });
		}
		const defaultDivisionForAdmin =
			actingUser?.role === 'ADMINISTRATOR' && !parsed.data.divisionId
				? await ensureDefaultUnassignedDivision(prisma)
				: null;
		const contactInput = defaultDivisionForAdmin
			? { ...parsed.data, divisionId: defaultDivisionForAdmin.id }
			: parsed.data;
		const customFieldValidation = await validateAndNormalizeCustomFieldValues({
			prisma,
			moduleKey: 'contacts',
			customFieldsInput: contactInput.customFields
		});
		if (customFieldValidation.errors.length > 0) {
			return NextResponse.json(
				{ error: customFieldValidation.errors.join(' ') },
				{ status: 400 }
			);
		}
		const contactInputWithCustomFields = {
			...contactInput,
			customFields: customFieldValidation.customFields
		};

		const normalized = normalizeContactData(contactInputWithCustomFields);
		const ownership = await resolveOwnershipForWrite({
			actingUser,
			ownerIdInput: normalized.ownerId,
			divisionIdInput: normalized.divisionId
		});
		const clientDivisionId = await validateClientDivision(normalized.clientId, ownership.divisionId);

			const contact = await prisma.contact.create({
			data: {
				...normalized,
				ownerId: ownership.ownerId,
				divisionId: clientDivisionId
			},
			include: contactListInclude
			});
			await logCreate({
				actorUserId: actingUser?.id,
				entityType: 'CONTACT',
				entity: contact
			});

			return NextResponse.json(contact, { status: 201 });
	} catch (error) {
		return handleError(error, 'Failed to create contact.');
	}
}

export const GET = withApiLogging('contacts.get', getContactsHandler);
export const POST = withApiLogging('contacts.post', postContactsHandler);
