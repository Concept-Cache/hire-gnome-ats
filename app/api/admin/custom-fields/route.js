import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { AccessControlError, getActingUser, hasAdministrator } from '@/lib/access-control';
import { withApiLogging } from '@/lib/api-logging';
import { logCreate } from '@/lib/audit-log';
import { parseJsonBody, ValidationError } from '@/lib/request-validation';
import { enforceMutationThrottle } from '@/lib/mutation-throttle';
import {
	normalizeCustomFieldDefinitionInput,
	normalizeCustomFieldDefinitionRow,
	normalizeCustomFieldModuleKey
} from '@/lib/custom-fields';

function toBooleanFlag(value, fallback = false) {
	if (value == null) return fallback;
	const normalized = String(value).trim().toLowerCase();
	if (!normalized) return fallback;
	if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
	if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
	return fallback;
}

function handleError(error, fallbackMessage) {
	if (error instanceof AccessControlError) {
		return NextResponse.json({ error: error.message }, { status: error.status });
	}
	if (error instanceof ValidationError) {
		return NextResponse.json({ error: error.message }, { status: error.status || 400 });
	}
	if (error?.code === 'P2002') {
		return NextResponse.json(
			{ error: 'A field with this module + key already exists.' },
			{ status: 409 }
		);
	}
	return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

async function assertCustomFieldAdminAccess(req) {
	const hasAdmin = await hasAdministrator();
	const actingUser = await getActingUser(req, { allowFallback: false });
	if (hasAdmin && actingUser?.role !== 'ADMINISTRATOR') {
		throw new AccessControlError('Only administrators can manage custom fields.', 403);
	}
	return actingUser;
}

async function getAdmin_customFieldsHandler(req) {
	await assertCustomFieldAdminAccess(req);

	const moduleKey = normalizeCustomFieldModuleKey(req.nextUrl.searchParams.get('moduleKey'));
	const includeInactive = toBooleanFlag(req.nextUrl.searchParams.get('includeInactive'), false);

	const rows = await prisma.customFieldDefinition.findMany({
		where: {
			...(moduleKey ? { moduleKey } : {}),
			...(includeInactive ? {} : { isActive: true })
		},
		orderBy: [{ moduleKey: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }]
	});

	return NextResponse.json(rows.map((row) => normalizeCustomFieldDefinitionRow(row)));
}

async function postAdmin_customFieldsHandler(req) {
	const mutationThrottleResponse = await enforceMutationThrottle(req, 'admin.custom_fields.post');
	if (mutationThrottleResponse) {
		return mutationThrottleResponse;
	}

	const actingUser = await assertCustomFieldAdminAccess(req);
	const body = await parseJsonBody(req);
	const normalizedInput = normalizeCustomFieldDefinitionInput(body);
	if (normalizedInput.error) {
		return NextResponse.json({ error: normalizedInput.error }, { status: 400 });
	}

	const customFieldDefinition = await prisma.customFieldDefinition.create({
		data: normalizedInput.data
	});
	await logCreate({
		actorUserId: actingUser?.id,
		entityType: 'CUSTOM_FIELD_DEFINITION',
		entity: customFieldDefinition
	});

	return NextResponse.json(normalizeCustomFieldDefinitionRow(customFieldDefinition), { status: 201 });
}

async function getHandler(req) {
	try {
		return await getAdmin_customFieldsHandler(req);
	} catch (error) {
		return handleError(error, 'Failed to load custom fields.');
	}
}

async function postHandler(req) {
	try {
		return await postAdmin_customFieldsHandler(req);
	} catch (error) {
		return handleError(error, 'Failed to create custom field.');
	}
}

export const GET = withApiLogging('admin.custom_fields.get', getHandler);
export const POST = withApiLogging('admin.custom_fields.post', postHandler);
