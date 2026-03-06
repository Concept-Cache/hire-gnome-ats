import { NextResponse } from 'next/server';
import { getPublicCareerJobById } from '@/lib/careers-public';
import { getSystemBranding } from '@/lib/system-settings';
import { parseRouteId, ValidationError } from '@/lib/request-validation';

import { withApiLogging } from '@/lib/api-logging';
async function getCareers_jobs_idHandler(req, { params }) {
	const branding = await getSystemBranding();
	if (!branding?.careerSiteEnabled) {
		return NextResponse.json({ error: 'Career site is not enabled.' }, { status: 404 });
	}

	const resolvedParams = await params;
	let id;
	try {
		id = parseRouteId(resolvedParams);
	} catch (error) {
		if (error instanceof ValidationError) {
			return NextResponse.json({ error: error.message }, { status: 400 });
		}
		throw error;
	}

	const job = await getPublicCareerJobById(id);
	if (!job) {
		return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
	}

	return NextResponse.json(job);
}

export const GET = withApiLogging('careers.jobs.id.get', getCareers_jobs_idHandler);
