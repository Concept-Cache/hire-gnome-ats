import { NextResponse } from 'next/server';
import { AccessControlError, getActingUser } from '@/lib/access-control';
import { getBillingSummary } from '@/lib/billing-seats';

import { withApiLogging } from '@/lib/api-logging';
export const dynamic = 'force-dynamic';

function handleError(error, fallbackMessage) {
	if (error instanceof AccessControlError) {
		return NextResponse.json({ error: error.message }, { status: error.status });
	}
	return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

async function getAdmin_billing_summaryHandler(req) {
	try {
		const actingUser = await getActingUser(req, { allowFallback: false });
		if (!actingUser) {
			throw new AccessControlError('Authentication required.', 401);
		}
		if (actingUser.role !== 'ADMINISTRATOR') {
			throw new AccessControlError('Only administrators can view billing settings.', 403);
		}

		const summary = await getBillingSummary();
		return NextResponse.json(summary, {
			headers: { 'Cache-Control': 'no-store' }
		});
	} catch (error) {
		return handleError(error, 'Failed to load billing summary.');
	}
}

export const GET = withApiLogging('admin.billing.summary.get', getAdmin_billing_summaryHandler);
