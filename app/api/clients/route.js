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
import { logCreate } from '@/lib/audit-log';
import { ensureDefaultUnassignedDivision } from '@/lib/default-division';
import { parseJsonBody, ValidationError } from '@/lib/request-validation';
import { enforceMutationThrottle } from '@/lib/mutation-throttle';
import { validateAndNormalizeCustomFieldValues } from '@/lib/custom-fields';

import { withApiLogging } from '@/lib/api-logging';
const clientListInclude = {
	ownerUser: { select: { id: true, firstName: true, lastName: true, email: true, isActive: true } },
	division: { select: { id: true, name: true, accessMode: true } },
	_count: { select: { contacts: true, jobOrders: true } }
};

function handleError(error, fallbackMessage) {
	if (error instanceof AccessControlError) {
		return NextResponse.json({ error: error.message }, { status: error.status });
	}
	if (error instanceof ValidationError) {
		return NextResponse.json({ error: error.message }, { status: error.status || 400 });
	}

	return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

async function getClientsHandler(req) {
	try {
		const actingUser = await getActingUser(req);
		const clients = await prisma.client.findMany({
			where: addScopeToWhere(undefined, getEntityScope(actingUser)),
			orderBy: { createdAt: 'desc' },
			include: clientListInclude
		});

		return NextResponse.json(clients);
	} catch (error) {
		return handleError(error, 'Failed to load clients.');
	}
}

async function postClientsHandler(req) {
	try {
		const mutationThrottleResponse = await enforceMutationThrottle(req, 'clients.post');
		if (mutationThrottleResponse) {
			return mutationThrottleResponse;
		}

		const actingUser = await getActingUser(req, { allowFallback: false });
		const body = await parseJsonBody(req);
		const parsed = clientSchema.safeParse(body);

		if (!parsed.success) {
			return NextResponse.json({ errors: parsed.error.flatten() }, { status: 400 });
		}
		const defaultDivisionForAdmin =
			actingUser?.role === 'ADMINISTRATOR' && !parsed.data.divisionId
				? await ensureDefaultUnassignedDivision(prisma)
				: null;
		const clientInput = defaultDivisionForAdmin
			? { ...parsed.data, divisionId: defaultDivisionForAdmin.id }
			: parsed.data;
		if (!parsed.data.ownerId) {
			return NextResponse.json({ error: 'Owner is required.' }, { status: 400 });
		}
		const customFieldValidation = await validateAndNormalizeCustomFieldValues({
			prisma,
			moduleKey: 'clients',
			customFieldsInput: clientInput.customFields
		});
		if (customFieldValidation.errors.length > 0) {
			return NextResponse.json(
				{ error: customFieldValidation.errors.join(' ') },
				{ status: 400 }
			);
		}
		const clientInputWithCustomFields = {
			...clientInput,
			customFields: customFieldValidation.customFields
		};

		const normalized = await withInferredCityStateFromZip(
			prisma,
			normalizeClientData(clientInputWithCustomFields)
		);
		const ownership = await resolveOwnershipForWrite({
			actingUser,
			ownerIdInput: normalized.ownerId,
			divisionIdInput: normalized.divisionId
		});

			const client = await prisma.client.create({
			data: {
				...normalized,
				ownerId: ownership.ownerId,
				divisionId: ownership.divisionId
			},
			include: clientListInclude
			});
			await logCreate({
				actorUserId: actingUser?.id,
				entityType: 'CLIENT',
				entity: client
			});

			return NextResponse.json(client, { status: 201 });
	} catch (error) {
		return handleError(error, 'Failed to create client.');
	}
}

export const GET = withApiLogging('clients.get', getClientsHandler);
export const POST = withApiLogging('clients.post', postClientsHandler);
