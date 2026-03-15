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
import { logUpdate } from '@/lib/audit-log';
import { createOwnerAssignmentNotifications } from '@/lib/notifications';
import { parseRouteId, parseJsonBody, ValidationError } from '@/lib/request-validation';
import { enforceMutationThrottle } from '@/lib/mutation-throttle';
import { validateAndNormalizeCustomFieldValues } from '@/lib/custom-fields';

import { withApiLogging } from '@/lib/api-logging';
function isObjectEmpty(value) {
	return value && typeof value === 'object' && Object.keys(value).length === 0;
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

function buildContactDetailInclude(entityScope, includeNoteAuthor = true) {
	const nestedScope = !entityScope || isObjectEmpty(entityScope) ? undefined : entityScope;
	const notesInclude = includeNoteAuthor
		? {
				orderBy: { createdAt: 'desc' },
				include: {
					createdByUser: { select: { id: true, firstName: true, lastName: true, email: true, isActive: true } }
				}
			}
		: {
				orderBy: { createdAt: 'desc' },
				select: {
					id: true,
					noteType: true,
					content: true,
					createdAt: true,
					updatedAt: true,
					contactId: true
				}
			};

	return {
		client: true,
		ownerUser: { select: { id: true, firstName: true, lastName: true, email: true, isActive: true } },
		division: { select: { id: true, name: true, accessMode: true } },
		notes: notesInclude,
		jobOrders: {
			where: nestedScope,
			orderBy: { createdAt: 'desc' },
			include: {
				ownerUser: { select: { id: true, firstName: true, lastName: true, email: true, isActive: true } }
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
		return NextResponse.json({ error: 'Contact not found.' }, { status: 404 });
	}

	return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

function isMissingNoteAuthorColumnError(error) {
	if (!error) return false;
	if (error.code === 'P2022') return true;
	const message = `${error.message || ''}`;
	return message.includes('createdByUserId') || message.includes('createdByUser');
}

async function getContacts_idHandler(req, { params }) {
	try {
		const awaitedParams = await params;
		const id = parseRouteId(awaitedParams);

		const actingUser = await getActingUser(req);
		const entityScope = getEntityScope(actingUser);

		let contact;
		try {
			contact = await prisma.contact.findFirst({
				where: addScopeToWhere({ id }, entityScope),
				include: buildContactDetailInclude(entityScope, true)
			});
		} catch (error) {
			if (!isMissingNoteAuthorColumnError(error)) {
				throw error;
			}

			contact = await prisma.contact.findFirst({
				where: addScopeToWhere({ id }, entityScope),
				include: buildContactDetailInclude(entityScope, false)
			});
		}

		if (!contact) {
			return NextResponse.json({ error: 'Contact not found.' }, { status: 404 });
		}

		return NextResponse.json(contact);
	} catch (error) {
		return handleError(error, 'Failed to load contact.');
	}
}

async function patchContacts_idHandler(req, { params }) {
	try {
		const mutationThrottleResponse = await enforceMutationThrottle(req, 'contacts.id.patch');
		if (mutationThrottleResponse) {
			return mutationThrottleResponse;
		}

		const awaitedParams = await params;
		const id = parseRouteId(awaitedParams);

		const actingUser = await getActingUser(req, { allowFallback: false });
		const existing = await prisma.contact.findFirst({
			where: addScopeToWhere({ id }, getEntityScope(actingUser)),
			select: {
				id: true,
				firstName: true,
				lastName: true,
				email: true,
				phone: true,
				address: true,
				addressPlaceId: true,
				addressLatitude: true,
				addressLongitude: true,
				title: true,
				department: true,
				linkedinUrl: true,
				source: true,
				owner: true,
				customFields: true,
				clientId: true,
				ownerId: true,
				divisionId: true,
				createdAt: true
			}
		});
		if (!existing) {
			return NextResponse.json({ error: 'Contact not found.' }, { status: 404 });
		}

		const body = await parseJsonBody(req);
		const parsed = contactSchema.safeParse(body);

		if (!parsed.success) {
			return NextResponse.json({ errors: parsed.error.flatten() }, { status: 400 });
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
			moduleKey: 'contacts',
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

		const normalized = normalizeContactData(parsedDataWithCustomFields);
		if (normalized.clientId !== existing.clientId) {
			return NextResponse.json({ error: 'Client cannot be changed after contact is created.' }, { status: 400 });
		}
		const ownership = await resolveOwnershipForWrite({
			actingUser,
			ownerIdInput: normalized.ownerId,
			divisionIdInput: normalized.divisionId
		});
		const clientDivisionId = await validateClientDivision(normalized.clientId, ownership.divisionId);

		const contact = await prisma.contact.update({
			where: { id },
			data: {
				...normalized,
				ownerId: ownership.ownerId,
				divisionId: clientDivisionId
			},
			include: {
				client: true,
				ownerUser: { select: { id: true, firstName: true, lastName: true, email: true, isActive: true } },
				division: { select: { id: true, name: true, accessMode: true } }
			}
		});
		await logUpdate({
			actorUserId: actingUser?.id,
			entityType: 'CONTACT',
			before: existing,
			after: contact
		});
		await createOwnerAssignmentNotifications({
			previousOwnerId: existing.ownerId,
			nextOwnerId: contact.ownerId,
			actorUserId: actingUser?.id || null,
			entityType: 'CONTACT',
			entityId: contact.id,
			entityLabel: `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || contact.recordId,
			detailPath: `/contacts/${contact.id}`
		});

		return NextResponse.json(contact);
	} catch (error) {
		return handleError(error, 'Failed to update contact.');
	}
}

export const GET = withApiLogging('contacts.id.get', getContacts_idHandler);
export const PATCH = withApiLogging('contacts.id.patch', patchContacts_idHandler);
