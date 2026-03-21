'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminGate from '@/app/components/admin-gate';
import LoadingIndicator from '@/app/components/loading-indicator';
import { useToast } from '@/app/components/toast-provider';
import { formatDateTimeAt } from '@/lib/date-format';

function toTitle(value) {
	const normalized = String(value || '').trim();
	if (!normalized) return '-';
	return normalized
		.replace(/[_-]+/g, ' ')
		.split(' ')
		.filter(Boolean)
		.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
		.join(' ');
}

function formatCurrency(cents, currency = 'usd') {
	const amount = Number(cents);
	if (!Number.isFinite(amount)) return '-';
	const safeCurrency = String(currency || 'usd').toUpperCase();
	return new Intl.NumberFormat(undefined, {
		style: 'currency',
		currency: safeCurrency,
		maximumFractionDigits: 2
	}).format(amount / 100);
}

export default function AdminBillingPage() {
	const toast = useToast();
	const router = useRouter();
	const [loading, setLoading] = useState(true);
	const [syncing, setSyncing] = useState(false);
	const [summary, setSummary] = useState(null);

	const latestEvent = summary?.recentEvents?.[0] || null;
	const estimatedMonthlyAmountLabel = useMemo(() => {
		const value = summary?.stripe?.estimatedMonthlyAmountCents;
		if (value == null) return '-';
		return formatCurrency(value, summary?.stripe?.currency || 'usd');
	}, [summary?.stripe?.currency, summary?.stripe?.estimatedMonthlyAmountCents]);

	async function load() {
		setLoading(true);
		const res = await fetch('/api/admin/billing/summary', { cache: 'no-store' });
		const data = await res.json().catch(() => ({}));
		if (res.ok && !data?.config?.enabled) {
			setLoading(false);
			router.replace('/admin');
			return;
		}
		if (!res.ok) {
			toast.error(data.error || 'Failed to load billing summary.');
			setLoading(false);
			return;
		}
		setSummary(data);
		setLoading(false);
	}

	async function onSync() {
		if (syncing) return;
		setSyncing(true);
		const res = await fetch('/api/admin/billing/sync', {
			method: 'POST'
		});
		const data = await res.json().catch(() => ({}));
		if (!res.ok) {
			toast.error(data.error || 'Billing sync failed.');
			setSyncing(false);
			await load();
			return;
		}
		if (data?.result?.eventPersisted === false) {
			toast.info('Billing seat sync completed, but history could not be persisted. Apply latest migrations.');
		} else {
			toast.success('Billing seat sync completed.');
		}
		setSyncing(false);
		await load();
	}

	useEffect(() => {
		load();
	}, []);

	return (
		<AdminGate>
			<section className="module-page">
				<header className="module-header">
					<div>
						<Link href="/admin" className="module-back-link" aria-label="Back to List">&larr; Back</Link>
						<h2>Billing</h2>
						<p>Base plan + per-active-user seat billing.</p>
					</div>
				</header>

				{loading ? <LoadingIndicator className="page-loading-indicator" label="Loading billing summary" /> : null}

				{!loading && summary ? (
					<>
						<article className="panel panel-spacious panel-narrow">
							<h3>Snapshot</h3>
							<div className="info-list snapshot-grid snapshot-grid-six">
								<p>
									<span>Billing Enabled</span>
									<strong>{summary.config?.enabled ? 'Yes' : 'No'}</strong>
								</p>
								<p>
									<span>Provider</span>
									<strong>{toTitle(summary.config?.provider || '-')}</strong>
								</p>
								<p>
									<span>Active Seats</span>
									<strong>{Number(summary.activeSeatCount || 0)}</strong>
								</p>
								<p>
									<span>Stripe Seat Qty</span>
									<strong>{summary.stripe?.seatQuantity == null ? '-' : Number(summary.stripe.seatQuantity)}</strong>
								</p>
								<p>
									<span>Est. Monthly</span>
									<strong>{estimatedMonthlyAmountLabel}</strong>
								</p>
								<p>
									<span>Subscription</span>
									<strong>{summary.config?.subscriptionIdMasked || '-'}</strong>
								</p>
							</div>
							<div className="form-actions billing-sync-actions">
								<button
									type="button"
									onClick={onSync}
									disabled={syncing || !summary.config?.enabled}
								>
									{syncing ? 'Syncing...' : 'Sync Seats Now'}
								</button>
								{latestEvent ? (
									<p className="form-actions-meta">
										Last Sync
										<strong>{formatDateTimeAt(latestEvent.createdAt)}</strong>
									</p>
								) : null}
							</div>
							{summary.stripe?.error ? (
								<p className="panel-subtext error">{summary.stripe.error}</p>
							) : null}
							{summary.stripe?.pricingWarning ? (
								<p className="panel-subtext error">{summary.stripe.pricingWarning}</p>
							) : null}
							{summary.eventStoreAvailable === false ? (
								<p className="panel-subtext error">
									Billing history storage is unavailable. Apply latest Prisma migrations to persist sync events.
								</p>
							) : null}
						</article>

						<article className="panel panel-spacious panel-narrow">
							<h3>Seat Sync History</h3>
							{Array.isArray(summary.recentEvents) && summary.recentEvents.length > 0 ? (
								<div className="workspace-scroll-area">
									<ul className="workspace-list">
										{summary.recentEvents.map((event) => (
											<li key={event.recordId} className="workspace-item">
												<div className="workspace-item-header">
													<strong>{toTitle(event.status)}</strong>
													<span className="chip">{toTitle(event.reason || '-')}</span>
												</div>
												<p>
													Seats: {Number(event.previousSeatQuantity ?? event.billedSeatQuantity ?? 0)} to{' '}
													{Number(event.nextSeatQuantity ?? event.billedSeatQuantity ?? 0)} | Active:{' '}
													{Number(event.activeSeatCount || 0)}
												</p>
												<p className="workspace-meta">
													By{' '}
													{event.triggeredByUser
														? `${event.triggeredByUser.firstName} ${event.triggeredByUser.lastName}`
														: 'System'}{' '}
													@ {formatDateTimeAt(event.createdAt)}
												</p>
												{event.errorMessage ? <p className="panel-subtext error">{event.errorMessage}</p> : null}
											</li>
										))}
									</ul>
								</div>
							) : (
								<div className="empty-state-card">
									<p className="empty-state-title">
										{summary.eventStoreAvailable === false ? 'Sync history unavailable' : 'No sync history yet'}
									</p>
									<p className="panel-subtext">
										{summary.eventStoreAvailable === false
											? 'Billing sync history cannot be loaded until the billing event store is available.'
											: 'No seat sync events have been recorded yet. Run Sync Seats Now to create the first entry.'}
									</p>
								</div>
							)}
						</article>
					</>
				) : null}
			</section>
		</AdminGate>
	);
}
