'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LayoutGrid, LayoutList, Plus } from 'lucide-react';
import EntityTable from '@/app/components/entity-table';
import TableColumnPicker from '@/app/components/table-column-picker';
import TableEntityLink from '@/app/components/table-entity-link';
import KanbanBoard from '@/app/components/kanban-board';
import { useConfirmDialog } from '@/app/components/confirm-dialog';
import { useToast } from '@/app/components/toast-provider';
import useArchivedEntities from '@/app/hooks/use-archived-entities';
import { formatDateTimeAt } from '@/lib/date-format';
import { formatSelectValueLabel } from '@/lib/select-value-label';
import { JOB_ORDER_STATUS_OPTIONS } from '@/lib/job-order-options';

const VIEW_MODE_STORAGE_KEY = 'job-orders-list-view-mode';

function formatDateTime(value) {
	return formatDateTimeAt(value);
}

function updateStatusDisplay(row, nextStatus, nextTimestamp) {
	const timestamp = nextTimestamp || row.lastActivityAt || row.updatedAt || new Date().toISOString();
	return {
		...row,
		status: nextStatus,
		statusLabel: formatSelectValueLabel(nextStatus),
		lastActivityAt: timestamp,
		lastActivityAtLabel: formatDateTime(timestamp)
	};
}

export default function JobOrdersPage() {
	const router = useRouter();
	const { requestConfirm } = useConfirmDialog();
	const toast = useToast();
	const [rows, setRows] = useState([]);
	const [loading, setLoading] = useState(false);
	const [query, setQuery] = useState('');
	const [statusFilter, setStatusFilter] = useState('all');
	const [clientFilter, setClientFilter] = useState('all');
	const [viewMode, setViewMode] = useState('list');
	const [movingRowIds, setMovingRowIds] = useState(new Set());
	const { archivedIdSet } = useArchivedEntities('JOB_ORDER');

	const activeRows = useMemo(
		() => rows.filter((row) => !archivedIdSet.has(row.id)),
		[rows, archivedIdSet]
	);

	const clientOptions = useMemo(() => {
		return [...new Set(activeRows.map((row) => row.client).filter((value) => value && value !== '-'))].sort((a, b) =>
			String(a).localeCompare(String(b))
		);
	}, [activeRows]);

	const filteredRows = useMemo(() => {
		const q = query.trim().toLowerCase();
		return activeRows.filter((row) => {
			const matchesText =
				!q ||
				`${row.title} ${row.client} ${row.contact} ${row.owner ?? ''} ${row.location ?? ''} ${row.status} ${row.statusLabel}`
					.toLowerCase()
					.includes(q);
			const matchesStatus = statusFilter === 'all' || row.status === statusFilter;
			const matchesClient = clientFilter === 'all' || row.client === clientFilter;
			return matchesText && matchesStatus && matchesClient;
		});
	}, [activeRows, query, statusFilter, clientFilter]);

	const kanbanRows = useMemo(() => {
		return [...filteredRows].sort((a, b) => {
			const aTime = new Date(a.lastActivityAt || a.updatedAt || a.createdAt || 0).getTime();
			const bTime = new Date(b.lastActivityAt || b.updatedAt || b.createdAt || 0).getTime();
			return bTime - aTime;
		});
	}, [filteredRows]);

	useEffect(() => {
		try {
			const stored = String(window.localStorage.getItem(VIEW_MODE_STORAGE_KEY) || '').trim();
			if (stored === 'kanban' || stored === 'list') {
				setViewMode(stored);
			}
		} catch {
			// Ignore storage access errors.
		}
	}, []);

	async function load() {
		setLoading(true);
		try {
			const res = await fetch('/api/job-orders');
			const data = await res.json();

			setRows(
				data.map((job) => {
					const lastActivityAt = job.lastActivityAt || job.updatedAt || job.createdAt || null;
					return {
						...job,
						client: job.client?.name || '-',
						clientId: job.client?.id || null,
						contact: job.contact ? `${job.contact.firstName} ${job.contact.lastName}` : '-',
						statusLabel: formatSelectValueLabel(job.status),
						owner: job.ownerUser
							? `${job.ownerUser.firstName} ${job.ownerUser.lastName}`.trim()
							: '-',
						lastActivityAt,
						lastActivityAtLabel: formatDateTime(lastActivityAt)
					};
				})
			);
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => {
		load();
	}, []);

	function setNextViewMode(nextViewMode) {
		setViewMode(nextViewMode);
		try {
			window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, nextViewMode);
		} catch {
			// Ignore storage access errors.
		}
	}

	function onOpen(row) {
		router.push(`/job-orders/${row.id}`);
	}

	async function onMoveJobOrder(rowId, nextStatus) {
		const target = rows.find((row) => String(row.id) === String(rowId));
		if (!target) return;
		if (String(target.status) === String(nextStatus)) return;
		if (String(nextStatus) === 'closed') {
			const confirmed = await requestConfirm({
				title: 'Close Job Order',
				message: `Close ${target.title}?`,
				confirmLabel: 'Close',
				cancelLabel: 'Cancel',
				isDanger: true
			});
			if (!confirmed) return;
		}

		const nextLabel = formatSelectValueLabel(nextStatus);
		const optimisticTimestamp = new Date().toISOString();
		setMovingRowIds((current) => {
			const next = new Set(current);
			next.add(String(rowId));
			return next;
		});
		setRows((current) =>
			current.map((row) =>
				String(row.id) === String(rowId) ? updateStatusDisplay(row, nextStatus, optimisticTimestamp) : row
			)
		);

		try {
			const res = await fetch(`/api/job-orders/${rowId}/status`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ status: nextStatus })
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) {
				setRows((current) =>
					current.map((row) => (String(row.id) === String(rowId) ? { ...target } : row))
				);
				toast.error(data.error || 'Failed to move job order.');
				return;
			}

			const updatedTimestamp = data.updatedAt || optimisticTimestamp;
			setRows((current) =>
				current.map((row) =>
					String(row.id) === String(rowId)
						? updateStatusDisplay(row, data.status || nextStatus, updatedTimestamp)
						: row
				)
			);
			toast.success(`Moved "${target.title}" to ${nextLabel}.`);
		} finally {
			setMovingRowIds((current) => {
				const next = new Set(current);
				next.delete(String(rowId));
				return next;
			});
		}
	}

	const columns = [
		{ key: 'title', label: 'Title' },
		{
			key: 'client',
			label: 'Client',
			render: (row) =>
				row.clientId ? (
					<TableEntityLink href={`/clients/${row.clientId}`}>{row.client}</TableEntityLink>
				) : (
					row.client
				)
		},
		{
			key: 'statusLabel',
			label: 'Status',
			getSortValue: (row) => row.status || ''
		},
		{
			key: 'submissionCount',
			label: 'Submissions'
		},
		{ key: 'owner', label: 'Owner' },
		{
			key: 'lastActivityAtLabel',
			label: 'Last Activity Date',
			getSortValue: (row) => row.lastActivityAt || ''
		}
	];

	return (
		<section className="module-page">
			<header className="module-header module-header-list">
				<div>
					<h2>Job Orders</h2>
				</div>
				<div className="module-header-actions">
					<Link
						href="/job-orders/new"
						className="btn-link btn-link-icon"
						aria-label="New Job Order"
						title="New Job Order"
					>
						<Plus aria-hidden="true" className="btn-refresh-icon-svg" />
					</Link>
				</div>
			</header>

			<article className="panel">
				<div className="panel-header-row">
					<h3>Job Order Pipeline</h3>
					<div className="view-toggle" role="tablist" aria-label="Job order view mode">
						<button
							type="button"
							className={`btn-secondary view-toggle-button${viewMode === 'list' ? ' active' : ''}`}
							onClick={() => setNextViewMode('list')}
							role="tab"
							aria-selected={viewMode === 'list'}
						>
							<LayoutList aria-hidden="true" />
							List
						</button>
						<button
							type="button"
							className={`btn-secondary view-toggle-button${viewMode === 'kanban' ? ' active' : ''}`}
							onClick={() => setNextViewMode('kanban')}
							role="tab"
							aria-selected={viewMode === 'kanban'}
						>
							<LayoutGrid aria-hidden="true" />
							Kanban
						</button>
					</div>
				</div>
				<div className={`list-controls list-controls-three${viewMode === 'list' ? ' list-controls-with-columns' : ''}`}>
					<input
						placeholder="Search title, client, contact, location, status"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
					/>
					<select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
						<option value="all">All Statuses</option>
						{JOB_ORDER_STATUS_OPTIONS.map((option) => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</select>
					<select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
						<option value="all">All Clients</option>
						{clientOptions.map((client) => (
							<option key={client} value={client}>
								{client}
							</option>
						))}
					</select>
					{viewMode === 'list' ? <TableColumnPicker tableKey="job-orders" columns={columns} /> : null}
				</div>
				{viewMode === 'list' ? (
					<EntityTable
						tableKey="job-orders"
						columns={columns}
						rows={filteredRows}
						loading={loading}
						loadingLabel="Loading job orders"
						rowActions={[{ label: 'Open', onClick: onOpen }]}
					/>
				) : (
					<KanbanBoard
						columns={JOB_ORDER_STATUS_OPTIONS}
						rows={kanbanRows}
						getRowId={(row) => row.id}
						getRowColumn={(row) => row.status}
						loading={loading}
						loadingLabel="Loading job orders"
						movingRowIds={movingRowIds}
						emptyLabel="No job orders."
						onMove={onMoveJobOrder}
						renderCard={(row) => (
							<div className="kanban-card-body">
								<button type="button" className="kanban-card-link" onClick={() => onOpen(row)}>
									{row.title}
								</button>
								<p className="kanban-card-meta">{row.client || '-'}</p>
								<p className="kanban-card-meta">{row.owner || '-'}</p>
								<p className="kanban-card-time">{row.lastActivityAtLabel}</p>
							</div>
						)}
					/>
				)}
			</article>
		</section>
	);
}
