import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { clientSchema } from '@/lib/validators';
import { normalizeClientData } from '@/lib/normalizers';
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
import { parseRouteId, parseJsonBody, ValidationError } from '@/lib/request-validation';
import { enforceMutationThrottle } from '@/lib/mutation-throttle';

import { withApiLogging } from '@/lib/api-logging';
function isObjectEmpty(value) {
	return value && typeof value === 'object' && Object.keys(value).length === 0;
}

function buildClientDetailInclude(entityScope, includeNoteAuthor = true) {
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
					content: true,
					createdAt: true,
					updatedAt: true,
					clientId: true
				}
			};

	return {
		ownerUser: { select: { id: true, firstName: true, lastName: true, email: true, isActive: true } },
		division: { select: { id: true, name: true, accessMode: true } },
		notes: notesInclude,
		contacts: {
			where: nestedScope,
			orderBy: { createdAt: 'desc' },
			include: {
				ownerUser: { select: { id: true, firstName: true, lastName: true, email: true, isActive: true } }
			}
		},
		jobOrders: {
			where: nestedScope,
			orderBy: { createdAt: 'desc' },
			include: {
				ownerUser: { select: { id: true, firstName: true, lastName: true, email: true, isActive: true } },
				_count: {
					select: {
						submissions: true,
						interviews: true
					}
				}
			}
		},
		_count: { select: { contacts: true, jobOrders: true } }
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
		return NextResponse.json({ error: 'Client not found.' }, { status: 404 });
	}

	return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

function isMissingNoteAuthorColumnError(error) {
	if (!error) return false;
	if (error.code === 'P2022') return true;
	const message = `${error.message || ''}`;
	return message.includes('createdByUserId') || message.includes('createdByUser');
}

async function getClients_idHandler(req, { params }) {
	try {
		const awaitedParams = await params;
		const id = parseRouteId(awaitedParams);

		const actingUser = await getActingUser(req);
		const entityScope = getEntityScope(actingUser);

		let client;
		try {
			client = await prisma.client.findFirst({
				where: addScopeToWhere({ id }, entityScope),
				include: buildClientDetailInclude(entityScope, true)
			});
		} catch (error) {
			if (!isMissingNoteAuthorColumnError(error)) {
				throw error;
			}

			client = await prisma.client.findFirst({
				where: addScopeToWhere({ id }, entityScope),
				include: buildClientDetailInclude(entityScope, false)
			});
		}

		if (!client) {
			return NextResponse.json({ error: 'Client not found.' }, { status: 404 });
		}

		return NextResponse.json(client);
	} catch (error) {
		return handleError(error, 'Failed to load client.');
	}
}

async function patchClients_idHandler(req, { params }) {
	try {
		const mutationThrottleResponse = await enforceMutationThrottle(req, 'clients.id.patch');
		if (mutationThrottleResponse) {
			return mutationThrottleResponse;
		}

		const awaitedParams = await params;
		const id = parseRouteId(awaitedParams);

		const actingUser = await getActingUser(req, { allowFallback: false });
		const existing = await prisma.client.findFirst({
			where: addScopeToWhere({ id }, getEntityScope(actingUser)),
			select: {
				id: true,
				name: true,
				industry: true,
				status: true,
				owner: true,
				phone: true,
				address: true,
				city: true,
				state: true,
				zipCode: true,
				website: true,
				description: true,
				ownerId: true,
				divisionId: true,
				createdAt: true
			}
		});
		if (!existing) {
			return NextResponse.json({ error: 'Client not found.' }, { status: 404 });
		}

		const body = await parseJsonBody(req);
		const parsed = clientSchema.safeParse(body);
		if (!parsed.success) {
			return NextResponse.json({ errors: parsed.error.flatten() }, { status: 400 });
		}
		if (actingUser?.role === 'ADMINISTRATOR' && !parsed.data.divisionId) {
			return NextResponse.json({ error: 'Division is required for administrators.' }, { status: 400 });
		}
		if (!parsed.data.ownerId) {
			return NextResponse.json({ error: 'Owner is required.' }, { status: 400 });
		}

		const normalized = await withInferredCityStateFromZip(prisma, normalizeClientData(parsed.data));
		const ownership = await resolveOwnershipForWrite({
			actingUser,
			ownerIdInput: normalized.ownerId,
			divisionIdInput: normalized.divisionId
		});
		const nextDivisionId = ownership.divisionId ?? null;
		const previousDivisionId = existing.divisionId ?? null;
		const divisionChanged = nextDivisionId !== previousDivisionId;

		const client = await prisma.$transaction(async (tx) => {
			const updatedClient = await tx.client.update({
				where: { id },
				data: {
					...normalized,
					ownerId: ownership.ownerId,
					divisionId: nextDivisionId
				},
				include: {
					ownerUser: { select: { id: true, firstName: true, lastName: true, email: true, isActive: true } },
					division: { select: { id: true, name: true, accessMode: true } },
					_count: { select: { contacts: true, jobOrders: true } }
				}
			});

			if (!divisionChanged || !nextDivisionId) {
				return updatedClient;
			}

			await tx.contact.updateMany({
				where: { clientId: id },
				data: { divisionId: nextDivisionId }
			});
			await tx.jobOrder.updateMany({
				where: { clientId: id },
				data: { divisionId: nextDivisionId }
			});

			const [contactRows, jobOrderRows] = await Promise.all([
				tx.contact.findMany({
					where: {
						clientId: id,
						ownerId: { not: null }
					},
					select: {
						id: true,
						ownerUser: { select: { divisionId: true } }
					}
				}),
				tx.jobOrder.findMany({
					where: {
						clientId: id,
						ownerId: { not: null }
					},
					select: {
						id: true,
						ownerUser: { select: { divisionId: true } }
					}
				})
			]);

			const contactOwnerIdsToClear = contactRows
				.filter((row) => row.ownerUser?.divisionId !== nextDivisionId)
				.map((row) => row.id);
			const jobOrderOwnerIdsToClear = jobOrderRows
				.filter((row) => row.ownerUser?.divisionId !== nextDivisionId)
				.map((row) => row.id);

			if (contactOwnerIdsToClear.length > 0) {
				await tx.contact.updateMany({
					where: { id: { in: contactOwnerIdsToClear } },
					data: { ownerId: null }
				});
			}
			if (jobOrderOwnerIdsToClear.length > 0) {
				await tx.jobOrder.updateMany({
					where: { id: { in: jobOrderOwnerIdsToClear } },
					data: { ownerId: null }
				});
			}

			return updatedClient;
		});
		await logUpdate({
			actorUserId: actingUser?.id,
			entityType: 'CLIENT',
			before: existing,
			after: client
		});
		await createOwnerAssignmentNotifications({
			previousOwnerId: existing.ownerId,
			nextOwnerId: client.ownerId,
			actorUserId: actingUser?.id || null,
			entityType: 'CLIENT',
			entityId: client.id,
			entityLabel: client.name || client.recordId,
			detailPath: `/clients/${client.id}`
		});

		return NextResponse.json(client);
	} catch (error) {
		return handleError(error, 'Failed to update client.');
	}
}

export const GET = withApiLogging('clients.id.get', getClients_idHandler);
export const PATCH = withApiLogging('clients.id.patch', patchClients_idHandler);
