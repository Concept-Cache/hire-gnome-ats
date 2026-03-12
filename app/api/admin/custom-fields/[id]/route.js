import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { AccessControlError, getActingUser, hasAdministrator } from '@/lib/access-control';
import { withApiLogging } from '@/lib/api-logging';
import { logDelete, logUpdate } from '@/lib/audit-log';
import { parseJsonBody, parseRouteId, ValidationError } from '@/lib/request-validation';
import { enforceMutationThrottle } from '@/lib/mutation-throttle';
import {
	normalizeCustomFieldDefinitionInput,
	normalizeCustomFieldDefinitionRow
} from '@/lib/custom-fields';

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
	if (error?.code === 'P2025') {
		return NextResponse.json({ error: 'Custom field not found.' }, { status: 404 });
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

async function getAdmin_customFields_idHandler(req, { params }) {
	await assertCustomFieldAdminAccess(req);
	const awaitedParams = await params;
	const id = parseRouteId(awaitedParams);

	const row = await prisma.customFieldDefinition.findUnique({ where: { id } });
	if (!row) {
		return NextResponse.json({ error: 'Custom field not found.' }, { status: 404 });
	}
	return NextResponse.json(normalizeCustomFieldDefinitionRow(row));
}

async function patchAdmin_customFields_idHandler(req, { params }) {
	const mutationThrottleResponse = await enforceMutationThrottle(req, 'admin.custom_fields.id.patch');
	if (mutationThrottleResponse) {
		return mutationThrottleResponse;
	}

	const awaitedParams = await params;
	const id = parseRouteId(awaitedParams);
	const actingUser = await assertCustomFieldAdminAccess(req);
	const existing = await prisma.customFieldDefinition.findUnique({
		where: { id }
	});
	if (!existing) {
		return NextResponse.json({ error: 'Custom field not found.' }, { status: 404 });
	}

	const body = await parseJsonBody(req);
	const normalizedInput = normalizeCustomFieldDefinitionInput(body);
	if (normalizedInput.error) {
		return NextResponse.json({ error: normalizedInput.error }, { status: 400 });
	}

	const updated = await prisma.customFieldDefinition.update({
		where: { id },
		data: {
			moduleKey: normalizedInput.data.moduleKey,
			fieldKey: normalizedInput.data.fieldKey,
			label: normalizedInput.data.label,
			fieldType: normalizedInput.data.fieldType,
			selectOptions: normalizedInput.data.selectOptions,
			placeholder: normalizedInput.data.placeholder,
			helpText: normalizedInput.data.helpText,
			isRequired: normalizedInput.data.isRequired,
			isActive: normalizedInput.data.isActive,
			sortOrder: normalizedInput.data.sortOrder
		}
	});
	await logUpdate({
		actorUserId: actingUser?.id,
		entityType: 'CUSTOM_FIELD_DEFINITION',
		before: existing,
		after: updated
	});
	return NextResponse.json(normalizeCustomFieldDefinitionRow(updated));
}

async function deleteAdmin_customFields_idHandler(req, { params }) {
	const mutationThrottleResponse = await enforceMutationThrottle(req, 'admin.custom_fields.id.delete');
	if (mutationThrottleResponse) {
		return mutationThrottleResponse;
	}

	const awaitedParams = await params;
	const id = parseRouteId(awaitedParams);
	const actingUser = await assertCustomFieldAdminAccess(req);
	const existing = await prisma.customFieldDefinition.findUnique({
		where: { id }
	});
	if (!existing) {
		return NextResponse.json({ error: 'Custom field not found.' }, { status: 404 });
	}

	await prisma.customFieldDefinition.delete({ where: { id } });
	await logDelete({
		actorUserId: actingUser?.id,
		entityType: 'CUSTOM_FIELD_DEFINITION',
		entity: existing
	});
	return NextResponse.json({ success: true });
}

async function getHandler(req, context) {
	try {
		return await getAdmin_customFields_idHandler(req, context);
	} catch (error) {
		return handleError(error, 'Failed to load custom field.');
	}
}

async function patchHandler(req, context) {
	try {
		return await patchAdmin_customFields_idHandler(req, context);
	} catch (error) {
		return handleError(error, 'Failed to update custom field.');
	}
}

async function deleteHandler(req, context) {
	try {
		return await deleteAdmin_customFields_idHandler(req, context);
	} catch (error) {
		return handleError(error, 'Failed to delete custom field.');
	}
}

export const GET = withApiLogging('admin.custom_fields.id.get', getHandler);
export const PATCH = withApiLogging('admin.custom_fields.id.patch', patchHandler);
export const DELETE = withApiLogging('admin.custom_fields.id.delete', deleteHandler);
