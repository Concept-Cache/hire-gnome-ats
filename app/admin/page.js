'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import AdminGate from '@/app/components/admin-gate';

export default function AdminPage() {
	const [counts, setCounts] = useState({ divisions: 0, users: 0, skills: 0, apiErrors: 0 });
	const [billingEnabled, setBillingEnabled] = useState(false);

	useEffect(() => {
		let cancelled = false;

		async function load() {
			const [divisionRes, userRes, skillRes, errorRes, billingRes] = await Promise.all([
				fetch('/api/divisions'),
				fetch('/api/users'),
				fetch('/api/skills'),
				fetch('/api/admin/error-logs?limit=1'),
				fetch('/api/admin/billing/summary', { cache: 'no-store' })
			]);

			if (!divisionRes.ok || !userRes.ok || !skillRes.ok || !errorRes.ok) return;

			const [divisionData, userData, skillData] = await Promise.all([
				divisionRes.json(),
				userRes.json(),
				skillRes.json()
			]);
			const errorData = await errorRes.json().catch(() => ({}));
			const billingData = billingRes.ok ? await billingRes.json().catch(() => ({})) : {};
			if (cancelled) return;

			setCounts({
				divisions: Array.isArray(divisionData) ? divisionData.length : 0,
				users: Array.isArray(userData) ? userData.length : 0,
				skills: Array.isArray(skillData) ? skillData.length : 0,
				apiErrors: Number.isInteger(errorData?.total) ? errorData.total : 0
			});
			setBillingEnabled(Boolean(billingData?.config?.enabled));
		}

		load();
		return () => {
			cancelled = true;
		};
	}, []);

	function renderAdminCard({ href, label, value }) {
		return (
			<Link key={href} className="metric-card" href={href}>
				<p className="metric-label">{label}</p>
				<p className="metric-value">{value}</p>
				<span className="metric-link">
					<span>Detail</span>
					<span className="metric-link-icon" aria-hidden="true">
						<ArrowUpRight />
					</span>
				</span>
			</Link>
		);
	}

	return (
		<AdminGate>
			<section className="module-page">
				<header className="module-header">
					<div>
						<h2>Admin Area</h2>
						<p>Manage system configuration and internal access settings.</p>
					</div>
				</header>

				<div className="admin-card-sections">
					<article className="panel panel-spacious">
						<div className="admin-card-section-head">
							<h3>Platform Controls</h3>
							<p>Core configuration, billing, and export tools.</p>
						</div>
						<div className="metric-grid admin-metric-grid">
							{renderAdminCard({
								href: '/admin/settings',
								label: 'Configuration',
								value: 'Settings'
							})}
							{renderAdminCard({
								href: '/admin/exports',
								label: 'Data Export',
								value: 'JSON / NDJSON / ZIP'
							})}
							{billingEnabled
								? renderAdminCard({
									href: '/admin/billing',
									label: 'Billing',
									value: 'Seats'
								})
								: null}
						</div>
					</article>

					<article className="panel panel-spacious">
						<div className="admin-card-section-head">
							<h3>Access & Taxonomy</h3>
							<p>Users, organizational structure, and skill catalog management.</p>
						</div>
						<div className="metric-grid admin-metric-grid">
							{renderAdminCard({
								href: '/admin/users',
								label: 'Users',
								value: counts.users
							})}
							{renderAdminCard({
								href: '/admin/divisions',
								label: 'Divisions',
								value: counts.divisions
							})}
							{renderAdminCard({
								href: '/admin/skills',
								label: 'Skills',
								value: counts.skills
							})}
						</div>
					</article>

					<article className="panel panel-spacious">
						<div className="admin-card-section-head">
							<h3>Monitoring</h3>
							<p>Operational visibility for API and runtime failures.</p>
						</div>
						<div className="metric-grid admin-metric-grid">
							{renderAdminCard({
								href: '/admin/logs/errors',
								label: 'API Errors',
								value: counts.apiErrors
							})}
						</div>
					</article>
				</div>
			</section>
		</AdminGate>
	);
}
