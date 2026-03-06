import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
	AccessControlError,
	addScopeToWhere,
	getActingUser,
	getEntityScope
} from '@/lib/access-control';
import { getCandidateJobOrderScope } from '@/lib/related-record-scope';

import { withApiLogging } from '@/lib/api-logging';
const AWAITING_FEEDBACK_SUBMISSION_STATUSES = ['submitted', 'under_review', 'qualified'];
const ACTIVE_INTERVIEW_STATUSES = ['scheduled'];
const OPEN_JOB_ORDER_STATUSES = ['open', 'active', 'on_hold'];
const FOLLOW_UP_SUBMISSION_STATUSES = [...new Set([...AWAITING_FEEDBACK_SUBMISSION_STATUSES, 'new', 'offered', 'hired'])];
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

		const [
			interviewsTodayCount,
			submissionsAwaitingFeedbackCount,
			staleOpenJobOrdersCount,
			placementsThisMonthCount,
			staleSubmissions,
			staleOpenJobOrders,
			fallbackAwaitingFeedbackSubmissions,
			fallbackOpenJobOrders,
			recentPrioritySubmissions,
			recentPriorityJobOrders,
			upcomingInterviews
		] = await Promise.all([
			prisma.interview.count({
				where: andWhere(
					relatedScope,
					{ startsAt: { gte: todayStart, lt: tomorrowStart } },
					{ status: { notIn: ['cancelled'] } }
				)
			}),
			prisma.submission.count({
				where: andWhere(
					relatedScope,
					{ status: { in: AWAITING_FEEDBACK_SUBMISSION_STATUSES } }
				)
			}),
			prisma.jobOrder.count({
				where: addScopeToWhere(
					{
						status: { in: OPEN_JOB_ORDER_STATUSES },
						submissions: {
							none: { createdAt: { gte: sevenDaysAgo } }
						}
					},
					scope
				)
			}),
			prisma.offer.count({
				where: andWhere(relatedScope, {
					offeredOn: { gte: monthStart, lt: nextMonthStart }
				})
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
					updatedAt: true,
					client: { select: { name: true } }
				},
				orderBy: { updatedAt: 'asc' },
				take: 8
			}),
			prisma.submission.findMany({
				where: andWhere(
					relatedScope,
					{ status: { in: FOLLOW_UP_SUBMISSION_STATUSES } }
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
						status: { in: OPEN_JOB_ORDER_STATUSES }
					},
					scope
				),
				select: {
					id: true,
					title: true,
					updatedAt: true,
					client: { select: { name: true } }
				},
				orderBy: { updatedAt: 'asc' },
				take: 8
			}),
			prisma.submission.findMany({
				where: andWhere(
					relatedScope,
					{ status: { notIn: RECENT_PRIORITY_EXCLUDED_SUBMISSION_STATUSES } }
				),
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
				where: addScopeToWhere(
					{
						status: { in: OPEN_JOB_ORDER_STATUSES }
					},
					scope
				),
				select: {
					id: true,
					title: true,
					updatedAt: true,
					client: { select: { name: true } }
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
			})
		]);

		const stalePriorityQueue = [
			...staleSubmissions.map((record) => {
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
			...staleOpenJobOrders.map((record) => {
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
			...fallbackAwaitingFeedbackSubmissions.map((record) => {
				const staleDays = Math.max(
					1,
					Math.floor((now.getTime() - new Date(record.createdAt).getTime()) / (24 * 60 * 60 * 1000))
				);
				return {
					id: `fallback-submission-${record.id}`,
					type: 'submission',
					title: `${toCandidateName(record.candidate)} | ${record.jobOrder?.title || '-'}`,
					subtitle: `Status: ${toDisplayLabel(record.status)}`,
					meta: record.jobOrder?.client?.name || '-',
					urgencyLabel:
						staleDays >= 5 ? 'Awaiting feedback for over 5 days' : 'Awaiting feedback follow-up',
					urgencyRank: 50000 + staleDays,
					href: `/submissions/${record.id}`
				};
			}),
			...fallbackOpenJobOrders.map((record) => ({
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
			...recentPrioritySubmissions.map((record) => {
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
			...recentPriorityJobOrders.map((record) => ({
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

		return NextResponse.json({
			kpis: {
				interviewsToday: interviewsTodayCount,
				submissionsAwaitingFeedback: submissionsAwaitingFeedbackCount,
				openJobsWithoutSubmissions7d: staleOpenJobOrdersCount,
				placementsThisMonth: placementsThisMonthCount
			},
			priorityQueue,
			upcomingInterviews: upcomingInterviews.map((record) => ({
				id: record.id,
				title: record.subject || `Interview #${record.id}`,
				candidateName: toCandidateName(record.candidate),
				jobOrderTitle: record.jobOrder?.title || '-',
				clientName: record.jobOrder?.client?.name || '-',
				startsAt: record.startsAt,
				status: record.status,
				href: `/interviews/${record.id}`
			}))
		});
	} catch (error) {
		return handleError(error, 'Failed to load dashboard overview.');
	}
}

export const GET = withApiLogging('dashboard.overview.get', getDashboard_overviewHandler);
