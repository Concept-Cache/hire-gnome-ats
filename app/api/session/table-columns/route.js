import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/access-control';
import { enforceMutationThrottle } from '@/lib/mutation-throttle';
import {
	normalizeColumnVisibilityState,
	normalizeTableColumnPreferences,
	normalizeTableKey
} from '@/lib/table-columns';
import { withApiLogging } from '@/lib/api-logging';

const visibilityStateSchema = z.object({
	hiddenColumnKeys: z.array(z.string().trim().min(1)).default([]),
	shownColumnKeys: z.array(z.string().trim().min(1)).default([]),
	orderedColumnKeys: z.array(z.string().trim().min(1)).default([])
});

const patchSchema = z.object({
	tableKey: z.string().trim().min(1),
	visibilityState: visibilityStateSchema
});

function serializePreferences(raw) {
	return normalizeTableColumnPreferences(raw);
}

async function getSession_table_columnsHandler(req) {
	const authenticatedUser = await getAuthenticatedUser(req, { allowFallback: false });
	if (!authenticatedUser?.id) {
		return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
	}

	const user = await prisma.user.findUnique({
		where: { id: authenticatedUser.id },
		select: { id: true, isActive: true, tableColumnPreferences: true }
	});
	if (!user || !user.isActive) {
		return NextResponse.json({ error: 'Your account is not active.' }, { status: 403 });
	}

	return NextResponse.json({
		tableColumnPreferences: serializePreferences(user.tableColumnPreferences)
	});
}

async function patchSession_table_columnsHandler(req) {
	const mutationThrottleResponse = await enforceMutationThrottle(req, 'session.table_columns.patch');
	if (mutationThrottleResponse) {
		return mutationThrottleResponse;
	}

	const authenticatedUser = await getAuthenticatedUser(req, { allowFallback: false });
	if (!authenticatedUser?.id) {
		return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
	}

	const body = await req.json().catch(() => ({}));
	const parsed = patchSchema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json({ errors: parsed.error.flatten() }, { status: 400 });
	}

	const normalizedTableKey = normalizeTableKey(parsed.data.tableKey);
	if (!normalizedTableKey) {
		return NextResponse.json({ error: 'A valid table key is required.' }, { status: 400 });
	}

	const user = await prisma.user.findUnique({
		where: { id: authenticatedUser.id },
		select: { id: true, isActive: true, tableColumnPreferences: true }
	});
	if (!user || !user.isActive) {
		return NextResponse.json({ error: 'Your account is not active.' }, { status: 403 });
	}

	const existingPreferences = serializePreferences(user.tableColumnPreferences);
	const nextPreferences = {
		...existingPreferences,
		[normalizedTableKey]: normalizeColumnVisibilityState(parsed.data.visibilityState)
	};

	const updated = await prisma.user.update({
		where: { id: user.id },
		data: { tableColumnPreferences: nextPreferences },
		select: { tableColumnPreferences: true }
	});

	return NextResponse.json({
		ok: true,
		tableColumnPreferences: serializePreferences(updated.tableColumnPreferences)
	});
}

export const GET = withApiLogging('session.table_columns.get', getSession_table_columnsHandler);
export const PATCH = withApiLogging('session.table_columns.patch', patchSession_table_columnsHandler);
