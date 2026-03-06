'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import EntityTable from '@/app/components/entity-table';
import TableColumnPicker from '@/app/components/table-column-picker';
import { useToast } from '@/app/components/toast-provider';
import { useConfirmDialog } from '@/app/components/confirm-dialog';
import TableEntityLink from '@/app/components/table-entity-link';
import { formatDateTimeAt } from '@/lib/date-format';

const ENTITY_TYPE_OPTIONS = [
	{ value: 'CANDIDATE', label: 'Candidates' },
	{ value: 'CLIENT', label: 'Clients' },
	{ value: 'CONTACT', label: 'Contacts' },
	{ value: 'JOB_ORDER', label: 'Job Orders' },
	{ value: 'SUBMISSION', label: 'Submissions' },
	{ value: 'INTERVIEW', label: 'Interviews' },
	{ value: 'PLACEMENT', label: 'Placements' }
];

export default function ArchivePage() {
	const router = useRouter();
	const toast = useToast();
	const { requestConfirm } = useConfirmDialog();
	const [entityType, setEntityType] = useState('CANDIDATE');
	const [query, setQuery] = useState('');
	const [rows, setRows] = useState([]);
	const [loading, setLoading] = useState(false);

	const filteredRows = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) return rows;
		return rows.filter((row) =>
			`${row.label || ''} ${row.subtitle || ''} ${row.reason || ''} ${row.archivedBy || ''}`.toLowerCase().includes(q)
		);
	}, [rows, query]);

	async function load() {
		setLoading(true);
		try {
			const params = new URLSearchParams({ entityType });
			const res = await fetch(`/api/archive?${params.toString()}`, {
				cache: 'no-store'
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error(data.error || 'Failed to load archived records.');
				setRows([]);
				return;
			}
			setRows(Array.isArray(data.rows) ? data.rows : []);
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => {
		load();
	}, [entityType]);

	async function onRestore(row) {
		const confirmed = await requestConfirm({
			title: 'Restore Record',
			message: `Restore ${row.label}?`,
			confirmLabel: 'Restore',
			cancelLabel: 'Cancel',
			destructive: false
		});
		if (!confirmed) return;

		const res = await fetch(`/api/archive/${encodeURIComponent(row.entityType)}/${encodeURIComponent(row.entityId)}`, {
			method: 'DELETE'
		});
		const data = await res.json().catch(() => ({}));
		if (!res.ok) {
			toast.error(data.error || 'Failed to restore record.');
			return;
		}
		toast.success('Record restored.');
		setRows((current) => current.filter((item) => item.id !== row.id));
	}

	function onOpen(row) {
		if (!row.linkHref) return;
		router.push(row.linkHref);
	}

	const columns = [
		{
			key: 'label',
			label: 'Record',
			render: (row) =>
				row.linkHref ? (
					<TableEntityLink href={row.linkHref}>{row.label}</TableEntityLink>
				) : (
					row.label
				)
		},
		{ key: 'subtitle', label: 'Type' },
		{ key: 'reason', label: 'Reason' },
		{
			key: 'archivedBy',
			label: 'Archived By'
		},
		{
			key: 'archivedAt',
			label: 'Archived At',
			render: (row) => formatDateTimeAt(row.archivedAt)
		}
	];

	return (
		<section className="module-page">
			<header className="module-header module-header-list">
				<div>
					<h2>Archive</h2>
				</div>
			</header>

			<article className="panel">
				<h3>Archived Records</h3>
					<div className="list-controls list-controls-two list-controls-with-columns archive-list-controls">
						<input
							placeholder="Search archived records"
							value={query}
							onChange={(event) => setQuery(event.target.value)}
						/>
						<select value={entityType} onChange={(event) => setEntityType(event.target.value)}>
							{ENTITY_TYPE_OPTIONS.map((option) => (
								<option key={option.value} value={option.value}>
									{option.label}
								</option>
							))}
						</select>
						<div className="archive-list-actions">
							<button
								type="button"
								className="btn-secondary btn-link-icon btn-refresh-icon"
								onClick={load}
								disabled={loading}
								aria-label={loading ? 'Refreshing archive records' : 'Refresh archive records'}
								title={loading ? 'Refreshing archive records' : 'Refresh archive records'}
							>
								<RefreshCw
									aria-hidden="true"
									className={loading ? 'btn-refresh-icon-svg row-action-icon-spinner' : 'btn-refresh-icon-svg'}
								/>
							</button>
							<TableColumnPicker tableKey="archive" columns={columns} />
						</div>
					</div>

					<EntityTable
						tableKey="archive"
						columns={columns}
						rows={filteredRows}
						loading={loading}
						loadingLabel="Loading archive records"
					rowActions={[
						{ label: 'Open', onClick: onOpen },
						{ label: 'Restore', onClick: onRestore }
					]}
				/>
			</article>
		</section>
	);
}
