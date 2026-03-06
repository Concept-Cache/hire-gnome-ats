import { NextResponse } from 'next/server';
import { getActingUser, getAuthenticatedUser } from '@/lib/access-control';

import { withApiLogging } from '@/lib/api-logging';
function serializeUser(user) {
	if (!user) return null;
	return {
		id: user.id,
		firstName: user.firstName,
		lastName: user.lastName,
		email: user.email,
		role: user.role,
		divisionId: user.divisionId,
		division: user.division
			? {
				id: user.division.id,
				name: user.division.name,
				accessMode: user.division.accessMode
			}
			: null
	};
}

async function getSession_acting_userHandler(req) {
	const authenticatedUser = await getAuthenticatedUser(req, { allowFallback: true });
	const actingUser = await getActingUser(req, { allowFallback: true });

	return NextResponse.json({
		user: serializeUser(actingUser),
		authenticatedUser: serializeUser(authenticatedUser),
		canImpersonate: authenticatedUser?.role === 'ADMINISTRATOR'
	});
}

export const GET = withApiLogging('session.acting_user.get', getSession_acting_userHandler);
