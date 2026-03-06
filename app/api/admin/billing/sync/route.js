import { NextResponse } from 'next/server';
import { AccessControlError, getActingUser } from '@/lib/access-control';
import { syncBillingSeats } from '@/lib/billing-seats';
import { enforceMutationThrottle } from '@/lib/mutation-throttle';

import { withApiLogging } from '@/lib/api-logging';
export const dynamic = 'force-dynamic';

function handleError(error, fallbackMessage) {
	if (error instanceof AccessControlError) {
		return NextResponse.json({ error: error.message }, { status: error.status });
	}
	return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

async function postAdmin_billing_syncHandler(req) {
	try {
		const mutationThrottleResponse = await enforceMutationThrottle(req, 'admin.billing.sync.post');
		if (mutationThrottleResponse) {
			return mutationThrottleResponse;
		}

		const actingUser = await getActingUser(req, { allowFallback: false });
		if (!actingUser) {
			throw new AccessControlError('Authentication required.', 401);
		}
		if (actingUser.role !== 'ADMINISTRATOR') {
			throw new AccessControlError('Only administrators can sync billing.', 403);
		}

		const result = await syncBillingSeats({
			triggeredByUserId: actingUser.id,
			reason: 'manual_admin_sync'
		});

		if (!result.ok && result.status === 'failed') {
			return NextResponse.json({
				error: result.error || 'Billing seat sync failed.',
				result
			}, { status: 502 });
		}

		return NextResponse.json({
			ok: true,
			result
		});
	} catch (error) {
		return handleError(error, 'Failed to sync billing seats.');
	}
}

export const POST = withApiLogging('admin.billing.sync.post', postAdmin_billing_syncHandler);
