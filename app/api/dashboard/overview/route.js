import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
	AccessControlError,
	addScopeToWhere,
	getActingUser,
	getEntityScope
} from '@/lib/access-control';
import { getArchivedEntityIdSet } from '@/lib/archive-entities';
import { getCandidateJobOrderScope } from '@/lib/related-record-scope';
import { withApiLogging } from '@/lib/api-logging';

const AWAITING_FEEDBACK_SUBMISSION_STATUSES = ['submitted', 'under_review', 'qualified'];
const ACTIVE_INTERVIEW_STATUSES = ['scheduled'];
const OPEN_JOB_ORDER_STATUSES = ['open', 'active', 'on_hold'];
const RECENT_PRIORITY_EXCLUDED_SUBMISSION_STATUSES = ['rejected', 'placed'];

function andWhere(...clauses) {
	const filtered = clauses.filter(Boolean);
	if (filtered.length === 0) return undefined;
	if (filtered.length === 1) return filtered[0];
	return { AND: filtered };
}

function startOfDay(date) {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function addDays(date, days) {
	return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function startOfMonth(date) {
	return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

function startOfNextMonth(date) {
	return new Date(date.getFullYear(), date.getMonth() + 1, 1, 0, 0, 0, 0);
}

function toCandidateName(candidate) {
	return `${candidate?.firstName || '-'} ${candidate?.lastName || ''}`.trim();
}

function toOwnerName(user) {
	const label = `${user?.firstName || ''} ${user?.lastName || ''}`.trim();
	return label || 'Unassigned';
}

function toDisplayLabel(value) {
	const normalized = String(value || '').trim();
	if (!normalized) return '-';
	return normalized
		.replace(/[_-]+/g, ' ')
		.split(' ')
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ');
}

function toDayKey(date) {
	if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

function buildTrendSeed(startDate, totalDays) {
	return Array.from({ length: totalDays }).map((_, index) => {
		const currentDate = addDays(startDate, index);
		return {
			dateKey: toDayKey(currentDate),
			label: currentDate.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }),
			candidates: 0,
			jobOrders: 0,
			submissions: 0,
			interviews: 0,
			placements: 0,
			total: 0
		};
	});
}

function incrementTrendItem(itemsByKey, value, fieldName) {
	const date = value ? new Date(value) : null;
	if (!date || Number.isNaN(date.getTime())) return;
	const item = itemsByKey.get(toDayKey(date));
	if (!item) return;
	item[fieldName] += 1;
	item.total += 1;
}

function handleError(error, fallbackMessage) {
	if (error instanceof AccessControlError) {
		return NextResponse.json({ error: error.message }, { status: error.status });
	}

	return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

async function getDashboard_overviewHandler(req) {
	try {
		const actingUser = await getActingUser(req);
		const scope = getEntityScope(actingUser);
		const relatedScope = getCandidateJobOrderScope(actingUser);
		const now = new Date();
		const todayStart = startOfDay(now);
		const tomorrowStart = addDays(todayStart, 1);
		const sevenDaysAgo = addDays(now, -7);
		const fiveDaysAgo = addDays(now, -5);
		const inSevenDays = addDays(now, 7);
		const monthStart = startOfMonth(now);
		const nextMonthStart = startOfNextMonth(now);
		const trendStart = addDays(todayStart, -6);

		const [
			interviewsToday,
			awaitingFeedbackSubmissions,
			staleSubmissions,
			staleOpenJobOrders,
			openJobOrders,
			recentPrioritySubmissions,
			recentPriorityJobOrders,
			upcomingInterviews,
			recentCandidates,
			recentJobOrders,
			candidateTrendRows,
			jobOrderTrendRows,
			submissionTrendRows,
			interviewTrendRows,
			placementTrendRows,
			placementsThisMonth,
			archivedCandidateIds,
			archivedSubmissionIds,
			archivedJobOrderIds,
			archivedInterviewIds,
			archivedPlacementIds
		] = await Promise.all([
			prisma.interview.findMany({
				where: andWhere(
					relatedScope,
					{ startsAt: { gte: todayStart, lt: tomorrowStart } },
					{ status: { notIn: ['cancelled'] } }
				),
				select: {
					id: true,
					subject: true,
					status: true,
					startsAt: true,
					candidate: { select: { firstName: true, lastName: true } },
					jobOrder: { select: { title: true, client: { select: { name: true } } } }
				},
				orderBy: { startsAt: 'asc' }
			}),
			prisma.submission.findMany({
				where: andWhere(relatedScope, { status: { in: AWAITING_FEEDBACK_SUBMISSION_STATUSES } }),
				select: {
					id: true,
					status: true,
					createdAt: true,
					updatedAt: true,
					candidate: { select: { firstName: true, lastName: true } },
					jobOrder: { select: { title: true, client: { select: { name: true } } } }
				},
				orderBy: { updatedAt: 'asc' }
			}),
			prisma.submission.findMany({
				where: andWhere(
					relatedScope,
					{ status: { in: AWAITING_FEEDBACK_SUBMISSION_STATUSES } },
					{ createdAt: { lt: fiveDaysAgo } }
				),
				select: {
					id: true,
					status: true,
					createdAt: true,
					updatedAt: true,
					candidate: { select: { firstName: true, lastName: true } },
					jobOrder: { select: { title: true, client: { select: { name: true } } } }
				},
				orderBy: { createdAt: 'asc' },
				take: 8
			}),
			prisma.jobOrder.findMany({
				where: addScopeToWhere(
					{
						status: { in: OPEN_JOB_ORDER_STATUSES },
						submissions: {
							none: { createdAt: { gte: sevenDaysAgo } }
						}
					},
					scope
				),
				select: {
					id: true,
					title: true,
					status: true,
					updatedAt: true,
					openedAt: true,
					client: { select: { name: true } },
					ownerUser: { select: { firstName: true, lastName: true } }
				},
				orderBy: { updatedAt: 'asc' }
			}),
			prisma.jobOrder.findMany({
				where: addScopeToWhere({ status: { in: OPEN_JOB_ORDER_STATUSES } }, scope),
				select: {
					id: true,
					title: true,
					status: true,
					updatedAt: true,
					openedAt: true,
					client: { select: { name: true } },
					ownerUser: { select: { firstName: true, lastName: true } }
				},
				orderBy: { updatedAt: 'desc' },
				take: 8
			}),
			prisma.submission.findMany({
				where: andWhere(relatedScope, { status: { notIn: RECENT_PRIORITY_EXCLUDED_SUBMISSION_STATUSES } }),
				select: {
					id: true,
					status: true,
					createdAt: true,
					updatedAt: true,
					candidate: { select: { firstName: true, lastName: true } },
					jobOrder: { select: { title: true, client: { select: { name: true } } } }
				},
				orderBy: { updatedAt: 'desc' },
				take: 8
			}),
			prisma.jobOrder.findMany({
				where: addScopeToWhere({ status: { in: OPEN_JOB_ORDER_STATUSES } }, scope),
				select: {
					id: true,
					title: true,
					status: true,
					updatedAt: true,
					openedAt: true,
					client: { select: { name: true } },
					ownerUser: { select: { firstName: true, lastName: true } }
				},
				orderBy: { updatedAt: 'desc' },
				take: 8
			}),
			prisma.interview.findMany({
				where: andWhere(
					relatedScope,
					{ status: { in: ACTIVE_INTERVIEW_STATUSES } },
					{ startsAt: { gte: now, lt: inSevenDays } }
				),
				select: {
					id: true,
					subject: true,
					status: true,
					startsAt: true,
					candidate: { select: { firstName: true, lastName: true } },
					jobOrder: { select: { title: true, client: { select: { name: true } } } }
				},
				orderBy: { startsAt: 'asc' },
				take: 12
			}),
			prisma.candidate.findMany({
				where: addScopeToWhere({}, scope),
				select: {
					id: true,
					status: true,
					createdAt: true,
					updatedAt: true,
					firstName: true,
					lastName: true,
					currentJobTitle: true,
					currentEmployer: true,
					ownerUser: { select: { firstName: true, lastName: true } }
				},
				orderBy: { createdAt: 'desc' },
				take: 8
			}),
			prisma.jobOrder.findMany({
				where: addScopeToWhere({ status: { in: OPEN_JOB_ORDER_STATUSES } }, scope),
				select: {
					id: true,
					title: true,
					status: true,
					openedAt: true,
					updatedAt: true,
					client: { select: { name: true } },
					ownerUser: { select: { firstName: true, lastName: true } }
				},
				orderBy: [{ openedAt: 'desc' }, { createdAt: 'desc' }],
				take: 8
			}),
			prisma.candidate.findMany({
				where: addScopeToWhere({ createdAt: { gte: trendStart } }, scope),
				select: { id: true, createdAt: true }
			}),
			prisma.jobOrder.findMany({
				where: addScopeToWhere(
					{ OR: [{ openedAt: { gte: trendStart } }, { createdAt: { gte: trendStart } }] },
					scope
				),
				select: { id: true, openedAt: true, createdAt: true }
			}),
			prisma.submission.findMany({
				where: andWhere(relatedScope, { createdAt: { gte: trendStart } }),
				select: { id: true, createdAt: true }
			}),
			prisma.interview.findMany({
				where: andWhere(relatedScope, { createdAt: { gte: trendStart } }),
				select: { id: true, createdAt: true }
			}),
			prisma.offer.findMany({
				where: andWhere(relatedScope, { createdAt: { gte: trendStart } }),
				select: { id: true, createdAt: true }
			}),
			prisma.offer.findMany({
				where: andWhere(relatedScope, { offeredOn: { gte: monthStart, lt: nextMonthStart } }),
				select: {
					id: true,
					status: true,
					offeredOn: true,
					updatedAt: true,
					candidate: { select: { firstName: true, lastName: true } },
					jobOrder: { select: { title: true, client: { select: { name: true } } } }
				},
				orderBy: { offeredOn: 'desc' }
			}),
			getArchivedEntityIdSet('CANDIDATE'),
			getArchivedEntityIdSet('SUBMISSION'),
			getArchivedEntityIdSet('JOB_ORDER'),
			getArchivedEntityIdSet('INTERVIEW'),
			getArchivedEntityIdSet('PLACEMENT')
		]);

		const activeInterviewsToday = interviewsToday.filter((record) => !archivedInterviewIds.has(record.id));
		const activeAwaitingFeedbackSubmissions = awaitingFeedbackSubmissions.filter(
			(record) => !archivedSubmissionIds.has(record.id)
		);
		const activeStaleSubmissions = staleSubmissions.filter((record) => !archivedSubmissionIds.has(record.id));
		const activeStaleOpenJobOrders = staleOpenJobOrders.filter((record) => !archivedJobOrderIds.has(record.id));
		const activeOpenJobOrders = openJobOrders.filter((record) => !archivedJobOrderIds.has(record.id));
		const activeRecentPrioritySubmissions = recentPrioritySubmissions.filter(
			(record) => !archivedSubmissionIds.has(record.id)
		);
		const activeRecentPriorityJobOrders = recentPriorityJobOrders.filter(
			(record) => !archivedJobOrderIds.has(record.id)
		);
		const activeUpcomingInterviews = upcomingInterviews.filter((record) => !archivedInterviewIds.has(record.id));
		const activeRecentCandidates = recentCandidates.filter((record) => !archivedCandidateIds.has(record.id));
		const activeRecentJobOrders = recentJobOrders.filter((record) => !archivedJobOrderIds.has(record.id));
		const activeCandidateTrendRows = candidateTrendRows.filter((record) => !archivedCandidateIds.has(record.id));
		const activeJobOrderTrendRows = jobOrderTrendRows.filter((record) => !archivedJobOrderIds.has(record.id));
		const activeSubmissionTrendRows = submissionTrendRows.filter((record) => !archivedSubmissionIds.has(record.id));
		const activeInterviewTrendRows = interviewTrendRows.filter((record) => !archivedInterviewIds.has(record.id));
		const activePlacementTrendRows = placementTrendRows.filter((record) => !archivedPlacementIds.has(record.id));
		const activePlacementsThisMonth = placementsThisMonth.filter((record) => !archivedPlacementIds.has(record.id));

		const stalePriorityQueue = [
			...activeStaleSubmissions.map((record) => {
				const staleDays = Math.max(
					1,
					Math.floor((now.getTime() - new Date(record.createdAt).getTime()) / (24 * 60 * 60 * 1000))
				);
				return {
					id: `submission-${record.id}`,
					type: 'submission',
					title: `${toCandidateName(record.candidate)} | ${record.jobOrder?.title || '-'}`,
					subtitle: `Status: ${toDisplayLabel(record.status)}`,
					meta: record.jobOrder?.client?.name || '-',
					urgencyLabel: 'Awaiting feedback for over 5 days',
					urgencyRank: 200000 + staleDays,
					href: `/submissions/${record.id}`
				};
			}),
			...activeStaleOpenJobOrders.map((record) => {
				const staleDays = Math.max(
					1,
					Math.floor((now.getTime() - new Date(record.updatedAt).getTime()) / (24 * 60 * 60 * 1000))
				);
				return {
					id: `job-${record.id}`,
					type: 'jobOrder',
					title: record.title || `Job Order #${record.id}`,
					subtitle: record.client?.name || '-',
					meta: `Last updated ${staleDays} day${staleDays === 1 ? '' : 's'} ago`,
					urgencyLabel: 'No new submissions in the last 7 days',
					urgencyRank: 100000 + staleDays,
					href: `/job-orders/${record.id}`
				};
			})
		]
			.sort((a, b) => b.urgencyRank - a.urgencyRank)
			.slice(0, 8);

		const fallbackPriorityQueue = [
			...activeAwaitingFeedbackSubmissions.map((record) => {
				const staleDays = Math.max(
					1,
					Math.floor((now.getTime() - new Date(record.updatedAt || record.createdAt).getTime()) / (24 * 60 * 60 * 1000))
				);
				return {
					id: `fallback-submission-${record.id}`,
					type: 'submission',
					title: `${toCandidateName(record.candidate)} | ${record.jobOrder?.title || '-'}`,
					subtitle: `Status: ${toDisplayLabel(record.status)}`,
					meta: record.jobOrder?.client?.name || '-',
					urgencyLabel: staleDays >= 5 ? 'Awaiting feedback for over 5 days' : 'Awaiting feedback follow-up',
					urgencyRank: 50000 + staleDays,
					href: `/submissions/${record.id}`
				};
			}),
			...activeOpenJobOrders.map((record) => ({
				id: `fallback-job-${record.id}`,
				type: 'jobOrder',
				title: record.title || `Job Order #${record.id}`,
				subtitle: record.client?.name || '-',
				meta: 'Open job order',
				urgencyLabel: 'Review pipeline health',
				urgencyRank: 1000,
				href: `/job-orders/${record.id}`
			}))
		]
			.sort((a, b) => b.urgencyRank - a.urgencyRank)
			.slice(0, 8);

		const recentPriorityQueue = [
			...activeRecentPrioritySubmissions.map((record) => {
				const daysSinceUpdate = Math.max(
					1,
					Math.floor((now.getTime() - new Date(record.updatedAt || record.createdAt).getTime()) / (24 * 60 * 60 * 1000))
				);
				return {
					id: `recent-submission-${record.id}`,
					type: 'submission',
					title: `${toCandidateName(record.candidate)} | ${record.jobOrder?.title || '-'}`,
					subtitle: `Status: ${toDisplayLabel(record.status)}`,
					meta: record.jobOrder?.client?.name || '-',
					urgencyLabel: 'Recent active submission',
					urgencyRank: 500 + (10 - Math.min(daysSinceUpdate, 10)),
					href: `/submissions/${record.id}`
				};
			}),
			...activeRecentPriorityJobOrders.map((record) => ({
				id: `recent-job-${record.id}`,
				type: 'jobOrder',
				title: record.title || `Job Order #${record.id}`,
				subtitle: record.client?.name || '-',
				meta: 'Open job order',
				urgencyLabel: 'Recent open job order',
				urgencyRank: 400,
				href: `/job-orders/${record.id}`
			}))
		]
			.sort((a, b) => b.urgencyRank - a.urgencyRank)
			.slice(0, 8);

		const priorityQueue =
			stalePriorityQueue.length > 0
				? stalePriorityQueue
				: fallbackPriorityQueue.length > 0
					? fallbackPriorityQueue
					: recentPriorityQueue;

		const trendItems = buildTrendSeed(trendStart, 7);
		const trendItemsByKey = new Map(trendItems.map((item) => [item.dateKey, item]));
		for (const record of activeCandidateTrendRows) incrementTrendItem(trendItemsByKey, record.createdAt, 'candidates');
		for (const record of activeJobOrderTrendRows) {
			incrementTrendItem(trendItemsByKey, record.openedAt || record.createdAt, 'jobOrders');
		}
		for (const record of activeSubmissionTrendRows) incrementTrendItem(trendItemsByKey, record.createdAt, 'submissions');
		for (const record of activeInterviewTrendRows) incrementTrendItem(trendItemsByKey, record.createdAt, 'interviews');
		for (const record of activePlacementTrendRows) incrementTrendItem(trendItemsByKey, record.createdAt, 'placements');

		const detailLists = {
			interviewsToday: activeInterviewsToday.map((record) => ({
				id: `interview-${record.id}`,
				entityType: 'interview',
				title: record.subject || `Interview #${record.id}`,
				subtitle: `${toCandidateName(record.candidate)} | ${record.jobOrder?.title || '-'}`,
				meta: record.jobOrder?.client?.name || '-',
				dateValue: record.startsAt,
				badgeLabel: toDisplayLabel(record.status),
				href: `/interviews/${record.id}`
			})),
			awaitingFeedback: activeAwaitingFeedbackSubmissions.map((record) => ({
				id: `awaiting-${record.id}`,
				entityType: 'submission',
				title: `${toCandidateName(record.candidate)} | ${record.jobOrder?.title || '-'}`,
				subtitle: record.jobOrder?.client?.name || '-',
				meta: `Status: ${toDisplayLabel(record.status)}`,
				dateLabel: 'Updated',
				dateValue: record.updatedAt || record.createdAt,
				badgeLabel: 'Awaiting feedback',
				href: `/submissions/${record.id}`
			})),
			stalledJobs: activeStaleOpenJobOrders.map((record) => ({
				id: `stalled-job-${record.id}`,
				entityType: 'jobOrder',
				title: record.title || `Job Order #${record.id}`,
				subtitle: record.client?.name || '-',
				meta: `Owner: ${toOwnerName(record.ownerUser)}`,
				dateLabel: 'Updated',
				dateValue: record.updatedAt,
				badgeLabel: 'No submissions in 7 days',
				href: `/job-orders/${record.id}`
			})),
			placementsThisMonth: activePlacementsThisMonth.map((record) => ({
				id: `placement-month-${record.id}`,
				entityType: 'placement',
				title: `${toCandidateName(record.candidate)} | ${record.jobOrder?.title || '-'}`,
				subtitle: record.jobOrder?.client?.name || '-',
				meta: `Status: ${toDisplayLabel(record.status)}`,
				dateLabel: 'Offered On',
				dateValue: record.offeredOn || record.updatedAt,
				badgeLabel: toDisplayLabel(record.status),
				href: `/placements/${record.id}`
			}))
		};

		const sections = {
			needsAttention: priorityQueue.map((item) => ({
				id: item.id,
				entityType: item.type,
				title: item.title,
				subtitle: item.subtitle,
				meta: item.meta,
				badgeLabel: item.urgencyLabel,
				href: item.href
			})),
			upcomingInterviews: activeUpcomingInterviews.map((record) => ({
				id: `upcoming-interview-${record.id}`,
				entityType: 'interview',
				title: record.subject || `Interview #${record.id}`,
				subtitle: `${toCandidateName(record.candidate)} | ${record.jobOrder?.title || '-'}`,
				meta: record.jobOrder?.client?.name || '-',
				dateValue: record.startsAt,
				badgeLabel: toDisplayLabel(record.status),
				href: `/interviews/${record.id}`
			})),
			recentCandidates: activeRecentCandidates.map((record) => ({
				id: `recent-candidate-${record.id}`,
				entityType: 'candidate',
				title: toCandidateName(record),
				subtitle: `${record.currentJobTitle || '-'} | ${record.currentEmployer || '-'}`,
				meta: `Owner: ${toOwnerName(record.ownerUser)}`,
				dateLabel: 'Added',
				dateValue: record.createdAt,
				badgeLabel: toDisplayLabel(record.status),
				href: `/candidates/${record.id}`
			})),
			recentJobOrders: activeRecentJobOrders.map((record) => ({
				id: `recent-job-order-${record.id}`,
				entityType: 'jobOrder',
				title: record.title || `Job Order #${record.id}`,
				subtitle: record.client?.name || '-',
				meta: `Owner: ${toOwnerName(record.ownerUser)}`,
				dateLabel: 'Opened',
				dateValue: record.openedAt || record.updatedAt,
				badgeLabel: toDisplayLabel(record.status),
				href: `/job-orders/${record.id}`
			}))
		};

		return NextResponse.json({
			kpis: {
				interviewsToday: activeInterviewsToday.length,
				submissionsAwaitingFeedback: activeAwaitingFeedbackSubmissions.length,
				openJobsWithoutSubmissions7d: activeStaleOpenJobOrders.length,
				placementsThisMonth: activePlacementsThisMonth.length
			},
			trend: trendItems,
			sections,
			detailLists
		});
	} catch (error) {
		return handleError(error, 'Failed to load dashboard overview.');
	}
}

export const GET = withApiLogging('dashboard.overview.get', getDashboard_overviewHandler);
