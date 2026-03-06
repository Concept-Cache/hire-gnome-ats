'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import LoadingIndicator from '@/app/components/loading-indicator';

function formatDateTime(value) {
	if (!value) return '-';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return '-';
	const datePart = date.toLocaleDateString(undefined, {
		month: 'numeric',
		day: 'numeric',
		year: 'numeric'
	});
	const timePart = date.toLocaleTimeString(undefined, {
		hour: 'numeric',
		minute: '2-digit'
	});
	return `${datePart} @ ${timePart}`;
}

const EMPTY_OVERVIEW = {
	kpis: {
		interviewsToday: 0,
		submissionsAwaitingFeedback: 0,
		openJobsWithoutSubmissions7d: 0,
		placementsThisMonth: 0
	},
	priorityQueue: [],
	upcomingInterviews: []
};

export default function HomePage() {
	const [overview, setOverview] = useState(EMPTY_OVERVIEW);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let active = true;

		async function load() {
			setLoading(true);

			try {
				const res = await fetch('/api/dashboard/overview');
				const data = await res.json().catch(() => ({}));

				if (!res.ok) {
					if (!active) return;
					setOverview(EMPTY_OVERVIEW);
					return;
				}

				if (!active) return;
				setOverview({
					kpis: data.kpis || EMPTY_OVERVIEW.kpis,
					priorityQueue: Array.isArray(data.priorityQueue) ? data.priorityQueue : [],
					upcomingInterviews: Array.isArray(data.upcomingInterviews) ? data.upcomingInterviews : []
				});
			} catch {
				if (!active) return;
				setOverview(EMPTY_OVERVIEW);
			} finally {
				if (active) setLoading(false);
			}
		}

		load();
		return () => {
			active = false;
		};
	}, []);

	const kpiCards = useMemo(
		() => [
			{
				key: 'interviewsToday',
				label: 'Interviews Today',
				value: overview.kpis.interviewsToday,
				href: '/interviews'
			},
			{
				key: 'submissionsAwaitingFeedback',
				label: 'Awaiting Feedback',
				value: overview.kpis.submissionsAwaitingFeedback,
				href: '/submissions'
			},
			{
				key: 'openJobsWithoutSubmissions7d',
				label: 'Open Jobs Stalled 7d',
				value: overview.kpis.openJobsWithoutSubmissions7d,
				href: '/job-orders'
			},
			{
				key: 'placementsThisMonth',
				label: 'Placements This Month',
				value: overview.kpis.placementsThisMonth,
				href: '/placements'
			}
		],
		[overview.kpis]
	);

	return (
		<section className="module-page">
			<header className="module-header">
				<div>
					<h2>Dashboard</h2>
				</div>
			</header>

			<article className="panel panel-spacious">
				<h3>Key Metrics</h3>
				<div className="metric-grid">
					{kpiCards.map((card) => (
						<Link key={card.key} href={card.href} className="metric-card">
							<p className="metric-label">{card.label}</p>
							<p className="metric-value">{card.value}</p>
						</Link>
					))}
				</div>
			</article>

			<div className="module-grid dashboard-focus-grid">
				<article className="panel panel-spacious">
					<h3>Priority Queue</h3>
					{loading ? <LoadingIndicator className="list-loading-indicator" label="Loading priority queue" /> : null}
					{!loading && overview.priorityQueue.length === 0 ? (
						<div className="dashboard-empty-state">
							<p className="panel-subtext">No records yet.</p>
						</div>
					) : null}
					{!loading && overview.priorityQueue.length > 0 ? (
						<ul className="simple-list dashboard-split-list">
							{overview.priorityQueue.map((item) => (
								<li key={item.id}>
									<div>
										<strong>
											<Link href={item.href}>{item.title || '-'}</Link>
										</strong>
										<p>{item.subtitle || '-'}</p>
										<p>{item.meta || '-'}</p>
									</div>
									<div className="simple-list-actions simple-list-indicators">
										<span className="chip">{item.urgencyLabel || '-'}</span>
									</div>
								</li>
							))}
						</ul>
					) : null}
				</article>

				<article className="panel panel-spacious">
					<h3>Upcoming Interviews</h3>
					{loading ? <LoadingIndicator className="list-loading-indicator" label="Loading upcoming interviews" /> : null}
					{!loading && overview.upcomingInterviews.length === 0 ? (
						<div className="dashboard-empty-state">
							<p className="panel-subtext">No records yet.</p>
						</div>
					) : null}
					{!loading && overview.upcomingInterviews.length > 0 ? (
						<ul className="simple-list dashboard-split-list">
							{overview.upcomingInterviews.map((item) => (
								<li key={item.id}>
									<div>
										<strong>
											<Link href={item.href}>{item.title || '-'}</Link>
										</strong>
										<p>{item.candidateName || '-'} | {item.jobOrderTitle || '-'}</p>
										<p>{item.clientName || '-'}</p>
									</div>
									<div className="simple-list-actions simple-list-indicators">
										<span className="chip">{formatDateTime(item.startsAt)}</span>
									</div>
								</li>
							))}
						</ul>
					) : null}
				</article>
			</div>
		</section>
	);
}
