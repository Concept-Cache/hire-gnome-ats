import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { AccessControlError, getActingUser } from '@/lib/access-control';
import { withApiLogging } from '@/lib/api-logging';
import {
	normalizeCustomFieldDefinitionRow,
	normalizeCustomFieldModuleKey
} from '@/lib/custom-fields';

function handleError(error) {
	if (error instanceof AccessControlError) {
		return NextResponse.json({ error: error.message }, { status: error.status });
	}
	return NextResponse.json({ error: 'Failed to load custom fields.' }, { status: 500 });
}

async function getCustom_fieldsHandler(req) {
	const actingUser = await getActingUser(req, { allowFallback: false });
	if (!actingUser?.id) {
		throw new AccessControlError('Unauthorized.', 401);
	}

	const moduleKey = normalizeCustomFieldModuleKey(req.nextUrl.searchParams.get('moduleKey'));
	if (!moduleKey) {
		return NextResponse.json({ error: 'moduleKey is required.' }, { status: 400 });
	}

	const rows = await prisma.customFieldDefinition.findMany({
		where: {
			moduleKey,
			isActive: true
		},
		orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
	});

	return NextResponse.json(rows.map((row) => normalizeCustomFieldDefinitionRow(row)));
}

async function routeHandler(req) {
	try {
		return await getCustom_fieldsHandler(req);
	} catch (error) {
		return handleError(error);
	}
}

export const GET = withApiLogging('custom_fields.get', routeHandler);

