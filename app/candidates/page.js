'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LayoutGrid, LayoutList, Plus } from 'lucide-react';
import EntityTable from '@/app/components/entity-table';
import TableColumnPicker from '@/app/components/table-column-picker';
import KanbanBoard from '@/app/components/kanban-board';
import { useConfirmDialog } from '@/app/components/confirm-dialog';
import useArchivedEntities from '@/app/hooks/use-archived-entities';
import { formatDateTimeAt } from '@/lib/date-format';
import { formatSelectValueLabel } from '@/lib/select-value-label';
import { CANDIDATE_STATUS_OPTIONS } from '@/lib/candidate-status';

const VIEW_MODE_STORAGE_KEY = 'candidates-list-view-mode';

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

export default function CandidatesPage() {
	const router = useRouter();
	const { requestPrompt } = useConfirmDialog();
	const [rows, setRows] = useState([]);
	const [loading, setLoading] = useState(false);
	const [query, setQuery] = useState('');
	const [statusFilter, setStatusFilter] = useState('all');
	const [ownerFilter, setOwnerFilter] = useState('all');
	const [viewMode, setViewMode] = useState('list');
	const [movingRowIds, setMovingRowIds] = useState(new Set());
	const { archivedIdSet } = useArchivedEntities('CANDIDATE');

	const activeRows = useMemo(
		() => rows.filter((row) => !archivedIdSet.has(row.id)),
		[rows, archivedIdSet]
	);

	const ownerOptions = useMemo(() => {
		return [...new Set(activeRows.map((row) => row.ownerName).filter((value) => value && value !== '-'))].sort((a, b) =>
			String(a).localeCompare(String(b))
		);
	}, [activeRows]);

	const filteredRows = useMemo(() => {
		const q = query.trim().toLowerCase();

		return activeRows.filter((row) => {
			const matchesQuery =
				!q ||
				`${row.fullName} ${row.email} ${row.status} ${row.statusLabel} ${row.source ?? ''} ${row.currentEmployer ?? ''}`
					.toLowerCase()
					.includes(q);
			const matchesStatus = statusFilter === 'all' || row.status === statusFilter;
			const matchesOwner = ownerFilter === 'all' || row.ownerName === ownerFilter;
			return matchesQuery && matchesStatus && matchesOwner;
		});
	}, [activeRows, query, statusFilter, ownerFilter]);

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
			const res = await fetch('/api/candidates');
			const data = await res.json();
			setRows(
				data.map((candidate) => {
					const lastActivityAt = candidate.lastActivityAt || candidate.updatedAt || candidate.createdAt || null;
					return {
						...candidate,
						fullName: `${candidate.firstName} ${candidate.lastName}`,
						statusLabel: formatSelectValueLabel(candidate.status),
						currentTitle: candidate.currentJobTitle || '-',
						lastActivityAt,
						lastActivityAtLabel: formatDateTime(lastActivityAt),
						ownerName: candidate.ownerUser
							? `${candidate.ownerUser.firstName} ${candidate.ownerUser.lastName}`.trim()
							: '-'
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
		router.push(`/candidates/${row.id}`);
	}

	async function onMoveCandidate(rowId, nextStatus) {
		const target = rows.find((row) => String(row.id) === String(rowId));
		if (!target) return;
		if (String(target.status) === String(nextStatus)) return;

		const nextLabel = formatSelectValueLabel(nextStatus);
		const reason = await requestPrompt({
			title: 'Move Candidate',
			message: `Move ${target.fullName} to ${nextLabel}?\n\nEnter a reason for this stage change.`,
			inputLabel: 'Reason',
			confirmLabel: 'Move',
			cancelLabel: 'Cancel',
			required: true
		});
		if (!reason) return;

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
			const res = await fetch(`/api/candidates/${rowId}/status`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ status: nextStatus, reason })
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) {
				setRows((current) =>
					current.map((row) => (String(row.id) === String(rowId) ? { ...target } : row))
				);
				toast.error(data.error || 'Failed to move candidate.');
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
			toast.success(`Moved ${target.fullName} to ${nextLabel}.`);
		} finally {
			setMovingRowIds((current) => {
				const next = new Set(current);
				next.delete(String(rowId));
				return next;
			});
		}
	}

	const columns = [
		{ key: 'fullName', label: 'Name' },
		{ key: 'currentTitle', label: 'Current Title' },
		{
			key: 'statusLabel',
			label: 'Status',
			getSortValue: (row) => row.status || ''
		},
		{ key: 'ownerName', label: 'Owner' },
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
					<h2>Candidates</h2>
				</div>
				<div className="module-header-actions">
					<Link
						href="/candidates/new"
						className="btn-link btn-link-icon"
						aria-label="New Candidate"
						title="New Candidate"
					>
						<Plus aria-hidden="true" className="btn-refresh-icon-svg" />
					</Link>
				</div>
			</header>

			<article className="panel">
				<div className="panel-header-row">
					<h3>Candidate Pipeline</h3>
					<div className="view-toggle" role="tablist" aria-label="Candidate view mode">
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
						placeholder="Search name, owner, title, email"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
					/>
					<select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
						<option value="all">All Stages</option>
						{CANDIDATE_STATUS_OPTIONS.map((option) => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</select>
					<select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)}>
						<option value="all">All Owners</option>
						{ownerOptions.map((owner) => (
							<option key={owner} value={owner}>
								{owner}
							</option>
						))}
					</select>
					{viewMode === 'list' ? <TableColumnPicker tableKey="candidates" columns={columns} /> : null}
				</div>
				{viewMode === 'list' ? (
					<EntityTable
						tableKey="candidates"
						columns={columns}
						rows={filteredRows}
						loading={loading}
						loadingLabel="Loading candidates"
						rowActions={[{ label: 'Open', onClick: onOpen }]}
					/>
				) : (
					<KanbanBoard
						columns={CANDIDATE_STATUS_OPTIONS}
						rows={kanbanRows}
						getRowId={(row) => row.id}
						getRowColumn={(row) => row.status}
						loading={loading}
						loadingLabel="Loading candidates"
						movingRowIds={movingRowIds}
						emptyLabel="No candidates."
						onMove={onMoveCandidate}
						renderCard={(row) => (
							<div className="kanban-card-body">
								<button type="button" className="kanban-card-link" onClick={() => onOpen(row)}>
									{row.fullName}
								</button>
								<p className="kanban-card-meta">{row.currentTitle}</p>
								<p className="kanban-card-meta">{row.ownerName || '-'}</p>
								<p className="kanban-card-time">{row.lastActivityAtLabel}</p>
							</div>
						)}
					/>
				)}
			</article>
		</section>
	);
}
