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

	return (
		<AdminGate>
			<section className="module-page">
				<header className="module-header">
					<div>
						<h2>Admin Area</h2>
						<p>Manage system configuration and internal access settings.</p>
					</div>
				</header>

				<div className="metric-grid admin-metric-grid">
					<Link className="metric-card" href="/admin/settings">
						<p className="metric-label">Configuration</p>
						<p className="metric-value">Settings</p>
						<span className="metric-link">
							<span>Detail</span>
							<span className="metric-link-icon" aria-hidden="true">
								<ArrowUpRight />
							</span>
						</span>
					</Link>
					{billingEnabled ? (
						<Link className="metric-card" href="/admin/billing">
							<p className="metric-label">Billing</p>
							<p className="metric-value">Seats</p>
							<span className="metric-link">
								<span>Detail</span>
								<span className="metric-link-icon" aria-hidden="true">
									<ArrowUpRight />
								</span>
							</span>
						</Link>
					) : null}
					<Link className="metric-card" href="/admin/users">
						<p className="metric-label">Users</p>
						<p className="metric-value">{counts.users}</p>
						<span className="metric-link">
							<span>Detail</span>
							<span className="metric-link-icon" aria-hidden="true">
								<ArrowUpRight />
							</span>
						</span>
					</Link>
					<Link className="metric-card" href="/admin/logs/errors">
						<p className="metric-label">API Errors</p>
						<p className="metric-value">{counts.apiErrors}</p>
						<span className="metric-link">
							<span>Detail</span>
							<span className="metric-link-icon" aria-hidden="true">
								<ArrowUpRight />
							</span>
						</span>
					</Link>
					<Link className="metric-card" href="/admin/divisions">
						<p className="metric-label">Divisions</p>
						<p className="metric-value">{counts.divisions}</p>
						<span className="metric-link">
							<span>Detail</span>
							<span className="metric-link-icon" aria-hidden="true">
								<ArrowUpRight />
							</span>
						</span>
					</Link>
					<Link className="metric-card" href="/admin/skills">
						<p className="metric-label">Skills</p>
						<p className="metric-value">{counts.skills}</p>
						<span className="metric-link">
							<span>Detail</span>
							<span className="metric-link-icon" aria-hidden="true">
								<ArrowUpRight />
							</span>
						</span>
					</Link>
				</div>
			</section>
		</AdminGate>
	);
}
