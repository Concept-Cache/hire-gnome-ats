import { NextResponse } from 'next/server';
import { listPublicCareerJobs } from '@/lib/careers-public';
import { getSystemBranding } from '@/lib/system-settings';

import { withApiLogging } from '@/lib/api-logging';
async function getCareers_jobsHandler() {
	const branding = await getSystemBranding();
	if (!branding?.careerSiteEnabled) {
		return NextResponse.json({ error: 'Career site is not enabled.' }, { status: 404 });
	}

	const jobs = await listPublicCareerJobs();
	return NextResponse.json(jobs);
}

export const GET = withApiLogging('careers.jobs.get', getCareers_jobsHandler);
