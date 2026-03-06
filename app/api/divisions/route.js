import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { divisionSchema } from '@/lib/validators';
import {
	AccessControlError,
	canManageDivisions,
	getActingUser,
	hasAdministrator
} from '@/lib/access-control';
import { logCreate } from '@/lib/audit-log';
import { parseJsonBody, ValidationError } from '@/lib/request-validation';
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

	return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

async function getDivisionsHandler(req) {
	try {
		const hasAdmin = await hasAdministrator();
		const actingUser = await getActingUser(req, { allowFallback: false });
		if (!actingUser) {
			throw new AccessControlError('Authentication required.', 401);
		}

		const where =
			!hasAdmin || canManageDivisions(actingUser)
				? undefined
				: actingUser.divisionId
					? { id: actingUser.divisionId }
					: { id: -1 };

		const divisions = await prisma.division.findMany({
			where,
			orderBy: [{ name: 'asc' }],
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

		return NextResponse.json(divisions);
	} catch (error) {
		return handleError(error, 'Failed to load divisions.');
	}
}

async function postDivisionsHandler(req) {
	try {
		const mutationThrottleResponse = await enforceMutationThrottle(req, 'divisions.post');
		if (mutationThrottleResponse) {
			return mutationThrottleResponse;
		}

		const hasAdmin = await hasAdministrator();
		const actingUser = await getActingUser(req, { allowFallback: false });
		if (!actingUser) {
			throw new AccessControlError('Authentication required.', 401);
		}
		if (hasAdmin && actingUser && !canManageDivisions(actingUser)) {
			throw new AccessControlError('Only administrators can create divisions.', 403);
		}

		const body = await parseJsonBody(req);
		const parsed = divisionSchema.safeParse(body);
		if (!parsed.success) {
			return NextResponse.json({ errors: parsed.error.flatten() }, { status: 400 });
		}

			const division = await prisma.division.create({
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
			await logCreate({
				actorUserId: actingUser?.id,
				entityType: 'DIVISION',
				entity: division
			});

			return NextResponse.json(division, { status: 201 });
	} catch (error) {
		return handleError(error, 'Failed to create division.');
	}
}

export const GET = withApiLogging('divisions.get', getDivisionsHandler);
export const POST = withApiLogging('divisions.post', postDivisionsHandler);
