import { NextResponse } from 'next/server';
import { getOnboardingState } from '@/lib/onboarding';

import { withApiLogging } from '@/lib/api-logging';
export const dynamic = 'force-dynamic';

async function getOnboarding_statusHandler() {
	const state = await getOnboardingState();
	return NextResponse.json(state, {
		headers: { 'Cache-Control': 'no-store' }
	});
}

export const GET = withApiLogging('onboarding.status.get', getOnboarding_statusHandler);
