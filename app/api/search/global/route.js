import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { AccessControlError, addScopeToWhere, getActingUser, getEntityScope } from '@/lib/access-control';
import { getCandidateJobOrderScope } from '@/lib/related-record-scope';
import { GLOBAL_SEARCH_RATE_LIMIT_MAX_REQUESTS, GLOBAL_SEARCH_RATE_LIMIT_WINDOW_SECONDS } from '@/lib/security-constants';
import { consumeRequestThrottle } from '@/lib/request-throttle';

import { withApiLogging } from '@/lib/api-logging';
function normalizeText(value) {
	return String(value || '')
		.toLowerCase()
		.replace(/\s+/g, ' ')
		.trim();
}

function tokenize(value) {
	return normalizeText(value)
		.split(' ')
		.filter((token) => token.length >= 2);
}

function toLimit(value, fallback = 20) {
	const parsed = Number.parseInt(String(value ?? ''), 10);
	if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
	return Math.min(parsed, 50);
}

function relevanceScore(query, tokens, primaryText, secondaryText = '') {
	const primary = normalizeText(primaryText);
	const secondary = normalizeText(secondaryText);
	const combined = `${primary} ${secondary}`.trim();
	if (!combined) return 0;

	let score = 0;
	if (primary === query) score += 120;
	if (primary.startsWith(query)) score += 90;
	if (primary.includes(query)) score += 65;
	if (!primary.includes(query) && combined.includes(query)) score += 35;

	for (const token of tokens) {
		if (primary.startsWith(token)) score += 16;
		else if (primary.includes(token)) score += 12;
		else if (combined.includes(token)) score += 7;
	}

	return score;
}

function buildResult({
	entityType,
	entityId,
	title,
	subtitle = '',
	meta = '',
	href,
	score,
	updatedAt
}) {
	return {
		entityType,
		entityId,
		title,
		subtitle,
		meta,
		href,
		score,
		updatedAt: updatedAt || null
	};
}

function handleError(error, fallbackMessage) {
	if (error instanceof AccessControlError) {
		return NextResponse.json({ error: error.message }, { status: error.status });
	}
	return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

async function getSearch_globalHandler(req) {
	try {
		const actingUser = await getActingUser(req);
		const throttle = await consumeRequestThrottle({
			req,
			routeKey: 'search.global',
			maxRequests: GLOBAL_SEARCH_RATE_LIMIT_MAX_REQUESTS,
			windowSeconds: GLOBAL_SEARCH_RATE_LIMIT_WINDOW_SECONDS
		});
		if (!throttle.allowed) {
			return NextResponse.json(
				{ error: 'Too many search requests from this network. Please try again shortly.' },
				{
					status: 429,
					headers: {
						'Retry-After': String(throttle.retryAfterSeconds || 60)
					}
				}
			);
		}

		const scope = getEntityScope(actingUser);
		const submissionScope = getCandidateJobOrderScope(actingUser);
		const { searchParams } = new URL(req.url);
		const query = normalizeText(searchParams.get('q'));
		const limit = toLimit(searchParams.get('limit'), 20);

		if (!query || query.length < 2) {
			return NextResponse.json({ query, total: 0, results: [] });
		}

		const tokens = tokenize(query);
		const perEntityTake = Math.max(6, Math.ceil(limit / 2));

		const [
			candidates,
			clients,
			contacts,
			jobOrders,
			submissions,
			interviews,
			placements
		] = await Promise.all([
			prisma.candidate.findMany({
				where: addScopeToWhere(
					{
						OR: [
							{ firstName: { contains: query } },
							{ lastName: { contains: query } },
							{ email: { contains: query } },
							{ currentJobTitle: { contains: query } },
							{ currentEmployer: { contains: query } },
							{ skillSet: { contains: query } }
						]
					},
					scope
				),
				select: {
					id: true,
					firstName: true,
					lastName: true,
					email: true,
					currentJobTitle: true,
					currentEmployer: true,
					updatedAt: true
				},
				orderBy: { updatedAt: 'desc' },
				take: perEntityTake
			}),
			prisma.client.findMany({
				where: addScopeToWhere(
					{
						OR: [
							{ name: { contains: query } },
							{ industry: { contains: query } },
							{ status: { contains: query } },
							{ city: { contains: query } },
							{ state: { contains: query } },
							{ zipCode: { contains: query } }
						]
					},
					scope
				),
				select: {
					id: true,
					name: true,
					industry: true,
					status: true,
					updatedAt: true
				},
				orderBy: { updatedAt: 'desc' },
				take: perEntityTake
			}),
			prisma.contact.findMany({
				where: addScopeToWhere(
					{
						OR: [
							{ firstName: { contains: query } },
							{ lastName: { contains: query } },
							{ email: { contains: query } },
							{ title: { contains: query } },
							{ department: { contains: query } },
							{ client: { name: { contains: query } } }
						]
					},
					scope
				),
				select: {
					id: true,
					firstName: true,
					lastName: true,
					email: true,
					title: true,
					client: { select: { name: true } },
					updatedAt: true
				},
				orderBy: { updatedAt: 'desc' },
				take: perEntityTake
			}),
			prisma.jobOrder.findMany({
				where: addScopeToWhere(
					{
						OR: [
							{ title: { contains: query } },
							{ description: { contains: query } },
							{ location: { contains: query } },
							{ client: { name: { contains: query } } },
							{ contact: { firstName: { contains: query } } },
							{ contact: { lastName: { contains: query } } }
						]
					},
					scope
				),
				select: {
					id: true,
					title: true,
					status: true,
					location: true,
					client: { select: { name: true } },
					contact: { select: { firstName: true, lastName: true } },
					updatedAt: true
				},
				orderBy: { updatedAt: 'desc' },
				take: perEntityTake
			}),
			prisma.submission.findMany({
				where: {
					AND: [
						submissionScope || {},
						{
							OR: [
								{ candidate: { firstName: { contains: query } } },
								{ candidate: { lastName: { contains: query } } },
								{ jobOrder: { title: { contains: query } } },
								{ jobOrder: { client: { name: { contains: query } } } },
								{ status: { contains: query } },
								{ notes: { contains: query } }
							]
						}
					]
				},
				select: {
					id: true,
					status: true,
					candidate: { select: { firstName: true, lastName: true } },
					jobOrder: { select: { title: true, client: { select: { name: true } } } },
					updatedAt: true
				},
				orderBy: { updatedAt: 'desc' },
				take: perEntityTake
			}),
			prisma.interview.findMany({
				where: {
					AND: [
						submissionScope || {},
						{
							OR: [
								{ subject: { contains: query } },
								{ interviewer: { contains: query } },
								{ interviewerEmail: { contains: query } },
								{ location: { contains: query } },
								{ candidate: { firstName: { contains: query } } },
								{ candidate: { lastName: { contains: query } } },
								{ jobOrder: { title: { contains: query } } }
							]
						}
					]
				},
				select: {
					id: true,
					subject: true,
					status: true,
					interviewMode: true,
					candidate: { select: { firstName: true, lastName: true } },
					jobOrder: { select: { title: true, client: { select: { name: true } } } },
					updatedAt: true
				},
				orderBy: { updatedAt: 'desc' },
				take: perEntityTake
			}),
			prisma.offer.findMany({
				where: {
					AND: [
						submissionScope || {},
						{
							OR: [
								{ status: { contains: query } },
								{ compensationType: { contains: query } },
								{ candidate: { firstName: { contains: query } } },
								{ candidate: { lastName: { contains: query } } },
								{ jobOrder: { title: { contains: query } } },
								{ jobOrder: { client: { name: { contains: query } } } }
							]
						}
					]
				},
				select: {
					id: true,
					status: true,
					placementType: true,
					candidate: { select: { firstName: true, lastName: true } },
					jobOrder: { select: { title: true, client: { select: { name: true } } } },
					updatedAt: true
				},
				orderBy: { updatedAt: 'desc' },
				take: perEntityTake
			})
		]);

		const results = [];

		for (const row of candidates) {
			const fullName = `${row.firstName || ''} ${row.lastName || ''}`.trim() || `Candidate #${row.id}`;
			const subtitle = [row.email, row.currentJobTitle, row.currentEmployer].filter(Boolean).join(' | ');
			const score = relevanceScore(query, tokens, fullName, subtitle);
			if (score <= 0) continue;
			results.push(
				buildResult({
					entityType: 'candidate',
					entityId: row.id,
					title: fullName,
					subtitle,
					meta: 'Candidate',
					href: `/candidates/${row.id}`,
					score,
					updatedAt: row.updatedAt
				})
			);
		}

		for (const row of clients) {
			const title = row.name || `Client #${row.id}`;
			const subtitle = [row.industry, row.status].filter(Boolean).join(' | ');
			const score = relevanceScore(query, tokens, title, subtitle);
			if (score <= 0) continue;
			results.push(
				buildResult({
					entityType: 'client',
					entityId: row.id,
					title,
					subtitle,
					meta: 'Client',
					href: `/clients/${row.id}`,
					score,
					updatedAt: row.updatedAt
				})
			);
		}

		for (const row of contacts) {
			const title = `${row.firstName || ''} ${row.lastName || ''}`.trim() || `Contact #${row.id}`;
			const subtitle = [row.client?.name, row.title, row.email].filter(Boolean).join(' | ');
			const score = relevanceScore(query, tokens, title, subtitle);
			if (score <= 0) continue;
			results.push(
				buildResult({
					entityType: 'contact',
					entityId: row.id,
					title,
					subtitle,
					meta: 'Contact',
					href: `/contacts/${row.id}`,
					score,
					updatedAt: row.updatedAt
				})
			);
		}

		for (const row of jobOrders) {
			const title = row.title || `Job Order #${row.id}`;
			const contactName = row.contact
				? `${row.contact.firstName || ''} ${row.contact.lastName || ''}`.trim()
				: '';
			const subtitle = [
				row.client?.name,
				row.location,
				row.status ? `Status: ${row.status}` : '',
				contactName
			]
				.filter(Boolean)
				.join(' | ');
			const score = relevanceScore(query, tokens, title, subtitle);
			if (score <= 0) continue;
			results.push(
				buildResult({
					entityType: 'jobOrder',
					entityId: row.id,
					title,
					subtitle,
					meta: 'Job Order',
					href: `/job-orders/${row.id}`,
					score,
					updatedAt: row.updatedAt
				})
			);
		}

		for (const row of submissions) {
			const candidateName = row.candidate
				? `${row.candidate.firstName || ''} ${row.candidate.lastName || ''}`.trim()
				: '';
			const title = candidateName || `Submission #${row.id}`;
			const subtitle = [row.jobOrder?.title, row.jobOrder?.client?.name, row.status]
				.filter(Boolean)
				.join(' | ');
			const score = relevanceScore(query, tokens, title, subtitle);
			if (score <= 0) continue;
			results.push(
				buildResult({
					entityType: 'submission',
					entityId: row.id,
					title,
					subtitle,
					meta: 'Submission',
					href: `/submissions/${row.id}`,
					score,
					updatedAt: row.updatedAt
				})
			);
		}

		for (const row of interviews) {
			const candidateName = row.candidate
				? `${row.candidate.firstName || ''} ${row.candidate.lastName || ''}`.trim()
				: '';
			const title = row.subject || `Interview #${row.id}`;
			const subtitle = [candidateName, row.jobOrder?.title, row.jobOrder?.client?.name, row.status]
				.filter(Boolean)
				.join(' | ');
			const score = relevanceScore(query, tokens, title, subtitle);
			if (score <= 0) continue;
			results.push(
				buildResult({
					entityType: 'interview',
					entityId: row.id,
					title,
					subtitle,
					meta: 'Interview',
					href: `/interviews/${row.id}`,
					score,
					updatedAt: row.updatedAt
				})
			);
		}

		for (const row of placements) {
			const candidateName = row.candidate
				? `${row.candidate.firstName || ''} ${row.candidate.lastName || ''}`.trim()
				: '';
			const title = candidateName || `Placement #${row.id}`;
			const subtitle = [row.jobOrder?.title, row.jobOrder?.client?.name, row.status]
				.filter(Boolean)
				.join(' | ');
			const score = relevanceScore(query, tokens, title, subtitle);
			if (score <= 0) continue;
			results.push(
				buildResult({
					entityType: 'placement',
					entityId: row.id,
					title,
					subtitle,
					meta: 'Placement',
					href: `/placements/${row.id}`,
					score,
					updatedAt: row.updatedAt
				})
			);
		}

		const sortedResults = results
			.sort((a, b) => {
				if (b.score !== a.score) return b.score - a.score;
				const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
				const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
				return bTime - aTime;
			})
			.slice(0, limit);

		return NextResponse.json({
			query,
			total: sortedResults.length,
			results: sortedResults
		});
	} catch (error) {
		return handleError(error, 'Failed to run global search.');
	}
}

export const GET = withApiLogging('search.global.get', getSearch_globalHandler);
