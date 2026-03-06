import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
	AccessControlError,
	addScopeToWhere,
	getActingUser,
	getEntityScope
} from '@/lib/access-control';
import { getCandidateJobOrderScope } from '@/lib/related-record-scope';
import { formatSelectValueLabel } from '@/lib/select-value-label';

import { withApiLogging } from '@/lib/api-logging';
const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;
const PER_ENTITY_TAKE = 15;

function toLimit(value) {
	const parsed = Number.parseInt(String(value ?? ''), 10);
	if (!Number.isInteger(parsed) || parsed <= 0) return DEFAULT_LIMIT;
	return Math.min(parsed, MAX_LIMIT);
}

function sortByActivityDesc(a, b) {
	return new Date(b.activityAt).getTime() - new Date(a.activityAt).getTime();
}

function buildActivity(createdAt, updatedAt) {
	const created = createdAt ? new Date(createdAt) : null;
	const updated = updatedAt ? new Date(updatedAt) : created;
	const createdMs = created ? created.getTime() : 0;
	const updatedMs = updated ? updated.getTime() : createdMs;
	const activityType = Math.abs(updatedMs - createdMs) < 1000 ? 'created' : 'updated';

	return {
		activityAt: updated ? updated.toISOString() : new Date(0).toISOString(),
		activityType
	};
}

function handleError(error, fallbackMessage) {
	if (error instanceof AccessControlError) {
		return NextResponse.json({ error: error.message }, { status: error.status });
	}

	return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

async function getDashboard_recentHandler(req) {
	try {
		const actingUser = await getActingUser(req);
		const scope = getEntityScope(actingUser);
		const relatedScope = getCandidateJobOrderScope(actingUser);
		const limit = toLimit(req.nextUrl.searchParams.get('limit'));

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
				where: addScopeToWhere(undefined, scope),
				select: {
					id: true,
					firstName: true,
					lastName: true,
					status: true,
					currentJobTitle: true,
					updatedAt: true,
					createdAt: true
				},
				orderBy: { updatedAt: 'desc' },
				take: PER_ENTITY_TAKE
			}),
			prisma.client.findMany({
				where: addScopeToWhere(undefined, scope),
				select: {
					id: true,
					name: true,
					industry: true,
					updatedAt: true,
					createdAt: true
				},
				orderBy: { updatedAt: 'desc' },
				take: PER_ENTITY_TAKE
			}),
			prisma.contact.findMany({
				where: addScopeToWhere(undefined, scope),
				select: {
					id: true,
					firstName: true,
					lastName: true,
					title: true,
					client: { select: { name: true } },
					updatedAt: true,
					createdAt: true
				},
				orderBy: { updatedAt: 'desc' },
				take: PER_ENTITY_TAKE
			}),
			prisma.jobOrder.findMany({
				where: addScopeToWhere(undefined, scope),
				select: {
					id: true,
					title: true,
					status: true,
					location: true,
					client: { select: { name: true } },
					updatedAt: true,
					createdAt: true
				},
				orderBy: { updatedAt: 'desc' },
				take: PER_ENTITY_TAKE
			}),
			prisma.submission.findMany({
				where: relatedScope ? { AND: [relatedScope] } : undefined,
				select: {
					id: true,
					status: true,
					candidate: { select: { firstName: true, lastName: true } },
					jobOrder: { select: { title: true, client: { select: { name: true } } } },
					updatedAt: true,
					createdAt: true
				},
				orderBy: { updatedAt: 'desc' },
				take: PER_ENTITY_TAKE
			}),
			prisma.interview.findMany({
				where: relatedScope ? { AND: [relatedScope] } : undefined,
				select: {
					id: true,
					subject: true,
					status: true,
					candidate: { select: { firstName: true, lastName: true } },
					jobOrder: { select: { title: true } },
					updatedAt: true,
					createdAt: true
				},
				orderBy: { updatedAt: 'desc' },
				take: PER_ENTITY_TAKE
			}),
			prisma.offer.findMany({
				where: relatedScope ? { AND: [relatedScope] } : undefined,
				select: {
					id: true,
					status: true,
					placementType: true,
					candidate: { select: { firstName: true, lastName: true } },
					jobOrder: { select: { title: true } },
					updatedAt: true,
					createdAt: true
				},
				orderBy: { updatedAt: 'desc' },
				take: PER_ENTITY_TAKE
			})
		]);

		const items = [
			...candidates.map((record) => {
				const activity = buildActivity(record.createdAt, record.updatedAt);
				return {
					entityType: 'candidate',
					entityLabel: 'Candidate',
					entityId: record.id,
					title: `${record.firstName} ${record.lastName}`.trim(),
					subtitle: record.currentJobTitle || formatSelectValueLabel(record.status),
					meta: formatSelectValueLabel(record.status),
					href: `/candidates/${record.id}`,
					...activity
				};
			}),
			...clients.map((record) => {
				const activity = buildActivity(record.createdAt, record.updatedAt);
				return {
					entityType: 'client',
					entityLabel: 'Client',
					entityId: record.id,
					title: record.name || '-',
					subtitle: record.industry || 'No industry',
					meta: record.industry || '-',
					href: `/clients/${record.id}`,
					...activity
				};
			}),
			...contacts.map((record) => {
				const activity = buildActivity(record.createdAt, record.updatedAt);
				return {
					entityType: 'contact',
					entityLabel: 'Contact',
					entityId: record.id,
					title: `${record.firstName} ${record.lastName}`.trim(),
					subtitle: record.client?.name ? `Client: ${record.client.name}` : 'No client',
					meta: record.title || '-',
					href: `/contacts/${record.id}`,
					...activity
				};
			}),
			...jobOrders.map((record) => {
				const activity = buildActivity(record.createdAt, record.updatedAt);
				return {
					entityType: 'jobOrder',
					entityLabel: 'Job Order',
					entityId: record.id,
					title: record.title || '-',
					subtitle: record.client?.name ? `Client: ${record.client.name}` : 'No client',
					meta: formatSelectValueLabel(record.status),
					href: `/job-orders/${record.id}`,
					...activity
				};
			}),
			...submissions.map((record) => {
				const activity = buildActivity(record.createdAt, record.updatedAt);
				return {
					entityType: 'submission',
					entityLabel: 'Submission',
					entityId: record.id,
					title: `${record.candidate?.firstName || '-'} ${record.candidate?.lastName || ''}`.trim(),
					subtitle: record.jobOrder?.title ? `Job: ${record.jobOrder.title}` : 'No job order',
					meta: formatSelectValueLabel(record.status),
					href: `/submissions/${record.id}`,
					...activity
				};
			}),
			...interviews.map((record) => {
				const activity = buildActivity(record.createdAt, record.updatedAt);
				return {
					entityType: 'interview',
					entityLabel: 'Interview',
					entityId: record.id,
					title: record.subject || `Interview #${record.id}`,
					subtitle: `${record.candidate?.firstName || '-'} ${record.candidate?.lastName || ''}`.trim(),
					meta: formatSelectValueLabel(record.status),
					href: `/interviews/${record.id}`,
					...activity
				};
			}),
			...placements.map((record) => {
				const activity = buildActivity(record.createdAt, record.updatedAt);
				return {
					entityType: 'placement',
					entityLabel: 'Placement',
					entityId: record.id,
					title: `${record.candidate?.firstName || '-'} ${record.candidate?.lastName || ''}`.trim(),
					subtitle: record.jobOrder?.title ? `Job: ${record.jobOrder.title}` : 'No job order',
					meta:
						[formatSelectValueLabel(record.status, ''), formatSelectValueLabel(record.placementType, '')]
							.filter(Boolean)
							.join(' | ') || '-',
					href: `/placements/${record.id}`,
					...activity
				};
			})
		]
			.sort(sortByActivityDesc)
			.slice(0, limit);

		return NextResponse.json({
			limit,
			total: items.length,
			items
		});
	} catch (error) {
		return handleError(error, 'Failed to load recent dashboard activity.');
	}
}

export const GET = withApiLogging('dashboard.recent.get', getDashboard_recentHandler);
