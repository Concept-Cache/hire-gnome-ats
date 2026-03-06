import { NextResponse } from 'next/server';
import { ACTING_USER_COOKIE_NAME } from '@/lib/security-constants';
import { clearSessionCookie } from '@/lib/session-auth';
import { enforceMutationThrottle } from '@/lib/mutation-throttle';

import { withApiLogging } from '@/lib/api-logging';
async function postSession_logoutHandler(req) {
	const mutationThrottleResponse = await enforceMutationThrottle(req, 'session.logout.post');
	if (mutationThrottleResponse) {
		return mutationThrottleResponse;
	}

	const response = NextResponse.json({ ok: true });
	clearSessionCookie(response);
	response.cookies.set(ACTING_USER_COOKIE_NAME, '', {
		httpOnly: false,
		secure: process.env.NODE_ENV === 'production',
		sameSite: 'lax',
		path: '/',
		maxAge: 0
	});
	return response;
}

export const POST = withApiLogging('session.logout.post', postSession_logoutHandler);
