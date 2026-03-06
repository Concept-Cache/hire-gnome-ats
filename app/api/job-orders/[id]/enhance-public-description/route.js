import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { addScopeToWhere, getActingUser, getEntityScope } from '@/lib/access-control';
import { enhancePublicJobPostingWithOpenAi } from '@/lib/openai-job-posting-enhancer';
import { hasMeaningfulRichTextContent } from '@/lib/rich-text';
import { parseRouteId } from '@/lib/request-validation';
import { enforceMutationThrottle } from '@/lib/mutation-throttle';

import { withApiLogging } from '@/lib/api-logging';
function asString(value) {
	if (typeof value !== 'string') return '';
	return value;
}

async function postJob_orders_id_enhance_public_descriptionHandler(req, { params }) {
	const mutationThrottleResponse = await enforceMutationThrottle(
		req,
		'job_orders.id.enhance_public_description.post'
	);
	if (mutationThrottleResponse) {
		return mutationThrottleResponse;
	}
	const awaitedParams = await params;
	const id = parseRouteId(awaitedParams);

	const actingUser = await getActingUser(req, { allowFallback: false });
	if (!actingUser) {
		return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
	}

	const existing = await prisma.jobOrder.findFirst({
		where: addScopeToWhere({ id }, getEntityScope(actingUser)),
		select: {
			id: true,
			title: true,
			description: true,
			publicDescription: true,
			location: true,
			employmentType: true,
			currency: true,
			salaryMin: true,
			salaryMax: true
		}
	});

	if (!existing) {
		return NextResponse.json({ error: 'Job order not found.' }, { status: 404 });
	}

	const body = await req.json().catch(() => ({}));
	const publicDescription = asString(body?.publicDescription) || asString(existing.publicDescription);
	if (!hasMeaningfulRichTextContent(publicDescription)) {
		return NextResponse.json(
			{ error: 'Public description is required before AI enhancement.' },
			{ status: 400 }
		);
	}

	const result = await enhancePublicJobPostingWithOpenAi({
		title: asString(body?.title) || existing.title,
		description: asString(body?.description) || asString(existing.description),
		publicDescription,
		location: asString(body?.location) || asString(existing.location),
		employmentType: asString(body?.employmentType) || asString(existing.employmentType),
		currency: asString(body?.currency) || asString(existing.currency),
		salaryMin: body?.salaryMin ?? existing.salaryMin,
		salaryMax: body?.salaryMax ?? existing.salaryMax
	});

	if (!result.ok) {
		return NextResponse.json({ error: result.error || 'Failed to enhance public description.' }, { status: 400 });
	}

	return NextResponse.json({
		ok: true,
		enhancedPublicDescription: result.enhancedHtml
	});
}

export const POST = withApiLogging('job_orders.id.enhance_public_description.post', postJob_orders_id_enhance_public_descriptionHandler);
