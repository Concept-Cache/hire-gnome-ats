import { NextResponse } from 'next/server';
import { MUTATION_RATE_LIMIT_MAX_REQUESTS, MUTATION_RATE_LIMIT_WINDOW_SECONDS } from '@/lib/security-constants';
import { consumeRequestThrottle } from '@/lib/request-throttle';

export async function enforceMutationThrottle(req, routeKey, options = {}) {
	const maxRequests = Number.isInteger(options.maxRequests) && options.maxRequests > 0
		? options.maxRequests
		: MUTATION_RATE_LIMIT_MAX_REQUESTS;
	const windowSeconds = Number.isInteger(options.windowSeconds) && options.windowSeconds > 0
		? options.windowSeconds
		: MUTATION_RATE_LIMIT_WINDOW_SECONDS;

	const throttle = await consumeRequestThrottle({
		req,
		routeKey,
		maxRequests,
		windowSeconds
	});
	if (!throttle.allowed) {
		return NextResponse.json(
			{ error: options.message || 'Too many write requests from this network. Please try again shortly.' },
			{
				status: 429,
				headers: {
					'Retry-After': String(throttle.retryAfterSeconds || 60)
				}
			}
		);
	}

	return null;
}
