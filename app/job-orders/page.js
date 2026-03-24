'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Filter, LayoutGrid, LayoutList, Plus, X } from 'lucide-react';
import EntityTable from '@/app/components/entity-table';
import JobOrderAdvancedSearchModal from '@/app/components/job-order-advanced-search-modal';
import SavedListViews from '@/app/components/saved-list-views';
import TableColumnPicker from '@/app/components/table-column-picker';
import TableEntityLink from '@/app/components/table-entity-link';
import KanbanBoard from '@/app/components/kanban-board';
import { useConfirmDialog } from '@/app/components/confirm-dialog';
import { useToast } from '@/app/components/toast-provider';
import useArchivedEntities from '@/app/hooks/use-archived-entities';
import { formatDateTimeAt } from '@/lib/date-format';
import {
	evaluateJobOrderAdvancedCriteria,
	normalizeJobOrderAdvancedCriteria,
	summarizeJobOrderAdvancedCriterion
} from '@/lib/job-order-advanced-search';
import { sortByConfig } from '@/lib/list-sort';
import { saveRecordNavigationContext, withRecordNavigationQuery } from '@/lib/record-navigation-context';
import { formatSelectValueLabel } from '@/lib/select-value-label';
import { JOB_ORDER_STATUS_OPTIONS } from '@/lib/job-order-options';
import { buildDefaultTableSortState, normalizeTableSortState } from '@/lib/table-sort';

const VIEW_MODE_STORAGE_KEY = 'job-orders-list-view-mode';

function formatDateTime(value) {
	return formatDateTimeAt(value);
}

function formatLocation(location, city, state) {
	const direct = String(location || '').trim();
	if (direct) return direct;
	const parts = [city, state].map((value) => String(value || '').trim()).filter(Boolean);
	return parts.length > 0 ? parts.join(', ') : '-';
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
	const [advancedCriteria, setAdvancedCriteria] = useState([]);
	const [advancedSearchOpen, setAdvancedSearchOpen] = useState(false);
	const [viewMode, setViewMode] = useState('list');
	const [sortState, setSortState] = useState({ key: '', direction: 'asc' });
	const [movingRowIds, setMovingRowIds] = useState(new Set());
	const { archivedIdSet } = useArchivedEntities('JOB_ORDER');

	const activeRows = useMemo(
		() => rows.filter((row) => !archivedIdSet.has(row.id)),
		[rows, archivedIdSet]
	);

	const clientOptions = useMemo(
		() =>
			[...new Set(activeRows.map((row) => row.client).filter((value) => value && value !== '-'))].sort((a, b) =>
				String(a).localeCompare(String(b))
			),
		[activeRows]
	);

	const ownerOptions = useMemo(() => {
		return [...new Set(activeRows.map((row) => row.owner).filter((value) => value && value !== '-'))].sort((a, b) =>
			String(a).localeCompare(String(b))
		);
	}, [activeRows]);

	const normalizedAdvancedCriteria = useMemo(
		() => normalizeJobOrderAdvancedCriteria(advancedCriteria),
		[advancedCriteria]
	);

	const quickFilteredRows = useMemo(() => {
		const q = query.trim().toLowerCase();
		return activeRows.filter((row) => {
			const matchesText =
				!q ||
				`${row.title} ${row.client} ${row.contact} ${row.owner ?? ''} ${row.location ?? ''} ${row.status} ${row.statusLabel}`
					.toLowerCase()
					.includes(q);
			return matchesText;
		});
	}, [activeRows, query]);

	const filteredRows = useMemo(() => {
		return quickFilteredRows.filter((row) => evaluateJobOrderAdvancedCriteria(row, normalizedAdvancedCriteria));
	}, [normalizedAdvancedCriteria, quickFilteredRows]);

	const advancedCriteriaSummary = useMemo(
		() => normalizedAdvancedCriteria.map((criterion) => summarizeJobOrderAdvancedCriterion(criterion)).filter(Boolean),
		[normalizedAdvancedCriteria]
	);

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
						locationLabel: formatLocation(job.location, job.city, job.state),
						employmentTypeLabel: formatSelectValueLabel(job.employmentType) || job.employmentType || '-',
						divisionName: job.division?.name || '-',
						openedAtLabel: formatDateTime(job.openedAt),
						closedAtLabel: formatDateTime(job.closedAt),
						publishLabel: job.publishToCareerSite ? 'Published' : 'Hidden',
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

	function persistNavigationContext() {
		const navigationRows = viewMode === 'kanban' ? kanbanRows : sortedListRows;
		saveRecordNavigationContext('job-order', {
			ids: navigationRows.map((row) => row.id),
			label:
				query.trim() || normalizedAdvancedCriteria.length > 0
					? 'Filtered Job Orders'
					: viewMode === 'kanban'
						? 'Job Order Pipeline'
						: 'Job Order List',
			listPath: '/job-orders'
		});
	}

	function onOpen(row) {
		persistNavigationContext();
		router.push(withRecordNavigationQuery(`/job-orders/${row.id}`));
	}

	function applySavedViewState(nextState = {}) {
		setQuery(String(nextState.query ?? ''));
		setAdvancedCriteria(normalizeJobOrderAdvancedCriteria(nextState.advancedCriteria || []));
		setSortState(normalizeTableSortState(nextState.sortState));
		const nextViewMode = String(nextState.viewMode || 'list');
		setNextViewMode(nextViewMode === 'kanban' ? 'kanban' : 'list');
	}

	function removeAdvancedCriterion(indexToRemove) {
		setAdvancedCriteria((current) => current.filter((_, index) => index !== indexToRemove));
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
		{ key: 'clientFeedbackCount', label: 'Client Feedback', defaultVisible: false },
		{ key: 'owner', label: 'Owner' },
		{ key: 'contact', label: 'Contact', defaultVisible: false },
		{ key: 'locationLabel', label: 'Location', defaultVisible: false },
		{ key: 'employmentTypeLabel', label: 'Employment Type', defaultVisible: false },
		{ key: 'openings', label: 'Openings', defaultVisible: false },
		{ key: 'publishLabel', label: 'Career Site', defaultVisible: false },
		{ key: 'divisionName', label: 'Division', defaultVisible: false },
		{ key: 'openedAtLabel', label: 'Opened At', defaultVisible: false, getSortValue: (row) => row.openedAt || '' },
		{ key: 'closedAtLabel', label: 'Closed At', defaultVisible: false, getSortValue: (row) => row.closedAt || '' },
		{
			key: 'lastActivityAtLabel',
			label: 'Last Activity Date',
			getSortValue: (row) => row.lastActivityAt || ''
		}
	];
	const defaultSortState = useMemo(() => buildDefaultTableSortState(columns), [columns]);
	const effectiveSortState = sortState.key ? sortState : defaultSortState;
	const sortedListRows = useMemo(() => {
		if (!effectiveSortState.key) return filteredRows;
		const sortColumn = columns.find((column) => column.key === effectiveSortState.key);
		if (!sortColumn) return filteredRows;

		return sortByConfig(
			filteredRows,
			{ field: effectiveSortState.key, direction: effectiveSortState.direction },
			(row) =>
				typeof sortColumn.getSortValue === 'function'
					? sortColumn.getSortValue(row)
					: row[sortColumn.key]
		);
	}, [columns, effectiveSortState.direction, effectiveSortState.key, filteredRows]);

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
				<div className="list-controls job-orders-list-controls">
					{advancedCriteriaSummary.length > 0 ? (
						<div className="job-orders-search-token-field">
							<div className="job-orders-search-token-field-chips" aria-label="Active advanced filters">
								{advancedCriteriaSummary.map((summary, index) => (
									<span key={`${summary}-${index}`} className="chip job-orders-advanced-search-chip">
										<span>{summary}</span>
										<button
											type="button"
											className="job-orders-advanced-search-chip-remove"
											onClick={() => removeAdvancedCriterion(index)}
											aria-label={`Remove ${summary}`}
											title={`Remove ${summary}`}
										>
											<X aria-hidden="true" />
										</button>
									</span>
								))}
								<input
									placeholder="Search within filtered job orders"
									value={query}
									onChange={(e) => setQuery(e.target.value)}
									aria-label="Search within advanced filtered job orders"
								/>
							</div>
						</div>
					) : (
						<input
							placeholder="Search title, client, contact, location, status"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
						/>
					)}
					<div className="list-controls-toolbar-group job-orders-list-controls-tools">
						<button
							type="button"
							className="table-toolbar-button job-orders-advanced-search-toggle"
							onClick={() => setAdvancedSearchOpen(true)}
						>
							<Filter aria-hidden="true" />
							Advanced Search
							{advancedCriteriaSummary.length > 0 ? (
								<span className="job-orders-advanced-search-count">{advancedCriteriaSummary.length}</span>
							) : null}
						</button>
						{viewMode === 'list' ? (
							<>
							<SavedListViews
								listKey="job-orders"
								columns={columns}
								defaultState={{
									query: '',
									advancedCriteria: [],
									sortState: defaultSortState,
									viewMode: 'list'
								}}
								currentState={{
									query,
									advancedCriteria: normalizedAdvancedCriteria,
									sortState: effectiveSortState,
									viewMode
								}}
								onApplyState={applySavedViewState}
							/>
							<TableColumnPicker tableKey="job-orders" columns={columns} />
							</>
						) : null}
					</div>
				</div>
				{viewMode === 'list' ? (
					<EntityTable
						tableKey="job-orders"
						columns={columns}
						rows={filteredRows}
						loading={loading}
						loadingLabel="Loading job orders"
						sortState={sortState.key ? sortState : undefined}
						onSortStateChange={setSortState}
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
			<JobOrderAdvancedSearchModal
				open={advancedSearchOpen}
				criteria={normalizedAdvancedCriteria}
				clientOptions={clientOptions}
				ownerOptions={ownerOptions}
				onApply={(nextCriteria) => {
					setAdvancedCriteria(normalizeJobOrderAdvancedCriteria(nextCriteria));
					setAdvancedSearchOpen(false);
				}}
				onClose={() => setAdvancedSearchOpen(false)}
			/>
		</section>
	);
}
