'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Trash2 } from 'lucide-react';
import AdminGate from '@/app/components/admin-gate';
import LoadingIndicator from '@/app/components/loading-indicator';
import { useToast } from '@/app/components/toast-provider';
import { useConfirmDialog } from '@/app/components/confirm-dialog';
import { formatDateTimeAt } from '@/lib/date-format';

function buildStatusLabel(status) {
	if (!Number.isInteger(status)) return '-';
	return String(status);
}

function buildMetaLine(row) {
	const parts = [];
	if (row.method) parts.push(row.method);
	if (row.path) parts.push(row.path);
	if (row.route) parts.push(`route: ${row.route}`);
	if (row.durationMs != null) parts.push(`${row.durationMs} ms`);
	if (row.requestId) parts.push(`req ${row.requestId}`);
	return parts.length > 0 ? parts.join(' | ') : '-';
}

export default function AdminErrorLogsPage() {
	const toast = useToast();
	const [loading, setLoading] = useState(true);
	const [purging, setPurging] = useState(false);
	const [refreshing, setRefreshing] = useState(false);
	const [rows, setRows] = useState([]);
	const [total, setTotal] = useState(0);
	const [lastLoggedAt, setLastLoggedAt] = useState(null);
	const [query, setQuery] = useState('');
	const [requestId, setRequestId] = useState('');
	const { requestConfirm } = useConfirmDialog();

	const filteredRows = useMemo(() => {
		const normalizedQuery = String(query || '').trim().toLowerCase();
		const normalizedRequestId = String(requestId || '').trim().toLowerCase();

		return rows.filter((row) => {
			const matchesRequestId = !normalizedRequestId
				? true
				: String(row.requestId || '').toLowerCase() === normalizedRequestId;
			if (!matchesRequestId) return false;
			if (!normalizedQuery) return true;

			return [
				row.event,
				row.summary,
				row.method,
				row.path,
				row.route,
				row.requestId,
				row.reason,
				row.status == null ? '' : String(row.status)
			]
				.join(' ')
				.toLowerCase()
				.includes(normalizedQuery);
		});
	}, [query, requestId, rows]);

	async function load({ silent = false } = {}) {
		if (!silent) {
			setLoading(true);
		} else {
			setRefreshing(true);
		}

		const res = await fetch('/api/admin/error-logs?limit=250', {
			cache: 'no-store'
		});
		const data = await res.json().catch(() => ({}));
		if (!res.ok) {
			toast.error(data.error || 'Failed to load API error logs.');
			setLoading(false);
			setRefreshing(false);
			return;
		}

		setRows(Array.isArray(data.logs) ? data.logs : []);
		setTotal(Number.isInteger(data.total) ? data.total : 0);
		setLastLoggedAt(data.lastLoggedAt || null);
		setLoading(false);
		setRefreshing(false);
	}

	async function purgeAll() {
		const confirmed = await requestConfirm({
			message: 'This will permanently delete all captured API error logs. Continue?',
			confirmLabel: 'Purge',
			cancelLabel: 'Keep',
			isDanger: true
		});
		if (!confirmed) return;

		setPurging(true);
		try {
			const res = await fetch('/api/admin/error-logs', {
				method: 'DELETE',
				cache: 'no-store'
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error(data.error || 'Failed to purge API error logs.');
				return;
			}

			const totalDeleted = Number.isFinite(data?.totalDeleted) ? data.totalDeleted : 0;
			toast.success(`Purged ${totalDeleted} API log entries.`);
			if (data.message) {
				toast.info(data.message);
			}
			await load({ silent: true });
		} catch (error) {
			toast.error('Unable to purge API error logs.');
			console.error('[admin-error-logs] purge failed', error);
		} finally {
			setPurging(false);
		}
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
						<h2>API Error Logs</h2>
						<p>Recent API errors from this server process.</p>
					</div>
				</header>

				<article className="panel">
					<div className="error-log-toolbar">
						<div className="error-log-toolbar-fields">
							<input
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								placeholder="Filter by event, path, summary, status"
							/>
							<input
								value={requestId}
								onChange={(event) => setRequestId(event.target.value)}
								placeholder="Request ID"
							/>
						</div>
						<div className="error-log-toolbar-actions">
							<span className="error-log-count">
								Showing {filteredRows.length} of {total}
							</span>
							<button
								type="button"
								className="btn-secondary btn-compact"
								onClick={purgeAll}
								disabled={loading || refreshing || purging}
							>
								<Trash2 aria-hidden="true" />
								{purging ? 'Purging...' : 'Clear All Logs'}
							</button>
							<button
								type="button"
								className="btn-secondary btn-link-icon btn-refresh-icon"
								onClick={() => load({ silent: true })}
								disabled={loading || refreshing || purging}
								aria-label={refreshing ? 'Refreshing error logs' : 'Refresh error logs'}
								title={refreshing ? 'Refreshing error logs' : 'Refresh error logs'}
							>
								<RefreshCw
									aria-hidden="true"
									className={refreshing ? 'btn-refresh-icon-svg row-action-icon-spinner' : 'btn-refresh-icon-svg'}
								/>
							</button>
						</div>
					</div>

					<p className="panel-subtext">
						Last captured error: {formatDateTimeAt(lastLoggedAt)}.
					</p>

					{loading ? <LoadingIndicator className="list-loading-indicator" label="Loading API error logs" /> : null}

					{!loading && filteredRows.length === 0 ? (
						<p className="panel-subtext">No API errors recorded since this server process started.</p>
					) : null}

					{!loading && filteredRows.length > 0 ? (
						<ul className="simple-list error-log-list">
							{filteredRows.map((row) => (
								<li key={row.id}>
									<div className="error-log-main">
										<div className="error-log-head">
											<strong>{row.event || 'api.error'}</strong>
											<span className="error-log-status-chip">{buildStatusLabel(row.status)}</span>
										</div>
										<p className="error-log-summary">{row.summary || 'Unknown API error'}</p>
										<p className="simple-list-meta">{buildMetaLine(row)}</p>
										<p className="simple-list-meta">Captured {formatDateTimeAt(row.timestamp)}</p>
										{row.error ? (
											<details className="error-log-raw">
												<summary>Error Details</summary>
												<pre>{JSON.stringify(row.error, null, '\t')}</pre>
											</details>
										) : null}
									</div>
								</li>
							))}
						</ul>
					) : null}
				</article>
			</section>
		</AdminGate>
	);
}
