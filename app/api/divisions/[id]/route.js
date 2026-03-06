import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { divisionSchema } from '@/lib/validators';
import {
	AccessControlError,
	canManageDivisions,
	getActingUser,
	hasAdministrator
} from '@/lib/access-control';
import { logUpdate } from '@/lib/audit-log';
import { parseRouteId, parseJsonBody, ValidationError } from '@/lib/request-validation';
import { enforceMutationThrottle } from '@/lib/mutation-throttle';

import { withApiLogging } from '@/lib/api-logging';
function handleError(error, fallbackMessage) {
	if (error instanceof AccessControlError) {
		return NextResponse.json({ error: error.message }, { status: error.status });
	}
	if (error instanceof ValidationError) {
		return NextResponse.json({ error: error.message }, { status: error.status || 400 });
	}

	if (error.code === 'P2002') {
		return NextResponse.json({ error: 'Division name already exists.' }, { status: 409 });
	}

	if (error.code === 'P2025') {
		return NextResponse.json({ error: 'Division not found.' }, { status: 404 });
	}

	return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

async function getScopedDivision(req, id) {
	const hasAdmin = await hasAdministrator();
	const actingUser = await getActingUser(req, { allowFallback: false });
	if (!actingUser) {
		return null;
	}
	if (!hasAdmin || canManageDivisions(actingUser)) {
		return prisma.division.findUnique({
			where: { id },
			include: {
				_count: {
					select: {
						users: true,
						candidates: true,
						clients: true,
						contacts: true,
						jobOrders: true
					}
				}
			}
		});
	}

	if (actingUser.divisionId !== id) {
		return null;
	}

	return prisma.division.findUnique({
		where: { id },
		include: {
			_count: {
				select: {
					users: true,
					candidates: true,
					clients: true,
					contacts: true,
					jobOrders: true
				}
			}
		}
	});
}

async function getDivisions_idHandler(req, { params }) {
	const awaitedParams = await params;
	const id = parseRouteId(awaitedParams);

	const division = await getScopedDivision(req, id);
	if (!division) {
		return NextResponse.json({ error: 'Division not found.' }, { status: 404 });
	}

	return NextResponse.json(division);
}

async function patchDivisions_idHandler(req, { params }) {
	try {
		const mutationThrottleResponse = await enforceMutationThrottle(req, 'divisions.id.patch');
		if (mutationThrottleResponse) {
			return mutationThrottleResponse;
		}

		const awaitedParams = await params;
		const id = parseRouteId(awaitedParams);

			const hasAdmin = await hasAdministrator();
			const actingUser = await getActingUser(req, { allowFallback: false });
			if (!actingUser) {
				throw new AccessControlError('Authentication required.', 401);
			}
			if (hasAdmin && actingUser && !canManageDivisions(actingUser)) {
				throw new AccessControlError('Only administrators can edit divisions.', 403);
			}
			const existing = await prisma.division.findUnique({
				where: { id },
				select: {
					id: true,
					name: true,
					accessMode: true,
					createdAt: true
				}
			});
			if (!existing) {
				return NextResponse.json({ error: 'Division not found.' }, { status: 404 });
			}

		const body = await parseJsonBody(req);
		const parsed = divisionSchema.safeParse(body);
		if (!parsed.success) {
			return NextResponse.json({ errors: parsed.error.flatten() }, { status: 400 });
		}

			const division = await prisma.division.update({
			where: { id },
			data: {
				name: parsed.data.name,
				accessMode: parsed.data.accessMode
			},
			include: {
				_count: {
					select: {
						users: true,
						candidates: true,
						clients: true,
						contacts: true,
						jobOrders: true
					}
				}
			}
			});
			await logUpdate({
				actorUserId: actingUser?.id,
				entityType: 'DIVISION',
				before: existing,
				after: division
			});

			return NextResponse.json(division);
	} catch (error) {
		return handleError(error, 'Failed to update division.');
	}
}

export const GET = withApiLogging('divisions.id.get', getDivisions_idHandler);
export const PATCH = withApiLogging('divisions.id.patch', patchDivisions_idHandler);
