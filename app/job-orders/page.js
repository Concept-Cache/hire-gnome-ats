'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Archive, Plus } from 'lucide-react';
import EntityTable from '@/app/components/entity-table';
import TableColumnPicker from '@/app/components/table-column-picker';
import TableEntityLink from '@/app/components/table-entity-link';
import { useToast } from '@/app/components/toast-provider';
import { useConfirmDialog } from '@/app/components/confirm-dialog';
import useArchivedEntities from '@/app/hooks/use-archived-entities';
import { cascadeSelectionFromIds, getArchiveCascadeOptions } from '@/lib/archive-cascade-options';
import { formatDateTimeAt } from '@/lib/date-format';
import { formatSelectValueLabel } from '@/lib/select-value-label';

function formatDateTime(value) {
	return formatDateTimeAt(value);
}

export default function JobOrdersPage() {
	const router = useRouter();
	const toast = useToast();
	const { requestConfirmWithOptions } = useConfirmDialog();
	const [rows, setRows] = useState([]);
	const [loading, setLoading] = useState(false);
	const [query, setQuery] = useState('');
	const [statusFilter, setStatusFilter] = useState('all');
	const [clientFilter, setClientFilter] = useState('all');
	const { archivedIdSet, archiveEntity } = useArchivedEntities('JOB_ORDER');

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

	async function load() {
		setLoading(true);
		try {
			const res = await fetch('/api/job-orders');
			const data = await res.json();

			setRows(
				data.map((job) => ({
					...job,
					client: job.client?.name || '-',
					clientId: job.client?.id || null,
					contact: job.contact ? `${job.contact.firstName} ${job.contact.lastName}` : '-',
					statusLabel: formatSelectValueLabel(job.status),
					owner: job.ownerUser
						? `${job.ownerUser.firstName} ${job.ownerUser.lastName}`.trim()
						: '-',
					lastActivityAtLabel: formatDateTime(job.lastActivityAt)
				}))
			);
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => {
		load();
	}, []);

	function onOpen(row) {
		router.push(`/job-orders/${row.id}`);
	}

	async function onArchive(row) {
		const archiveOptions = getArchiveCascadeOptions('JOB_ORDER');
		const decision = await requestConfirmWithOptions({
			title: 'Archive Job Order',
			message: `Archive ${row.title}? You can restore it from Archive later.`,
			confirmLabel: 'Archive',
			cancelLabel: 'Cancel',
			isDanger: true,
			options: archiveOptions
		});
		if (!decision?.confirmed) return;
		const cascade = cascadeSelectionFromIds('JOB_ORDER', decision.selections);
		const result = await archiveEntity(row.id, '', cascade);
		if (!result.ok) {
			toast.error(result.error || 'Failed to archive job order.');
			return;
		}
		const relatedCount = Math.max(0, Number(result.archivedCount || 1) - 1);
		toast.success(
			relatedCount > 0
				? `Job order archived with ${relatedCount} related record${relatedCount === 1 ? '' : 's'}.`
				: 'Job order archived.'
		);
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
					<Link href="/archive" className="btn-secondary btn-link-icon" aria-label="Archive" title="Archive">
						<Archive aria-hidden="true" className="btn-refresh-icon-svg" />
					</Link>
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
				<h3>Job Order List</h3>
					<div className="list-controls list-controls-three list-controls-with-columns">
					<input
						placeholder="Search title, client, contact, location, status"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
					/>
					<select
						value={statusFilter}
						onChange={(e) => setStatusFilter(e.target.value)}
					>
						<option value="all">All Statuses</option>
						<option value="open">Open</option>
						<option value="on_hold">On Hold</option>
						<option value="closed">Closed</option>
					</select>
						<select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
							<option value="all">All Clients</option>
						{clientOptions.map((client) => (
							<option key={client} value={client}>
								{client}
							</option>
							))}
						</select>
						<TableColumnPicker tableKey="job-orders" columns={columns} />
					</div>
					<EntityTable
						tableKey="job-orders"
						columns={columns}
						rows={filteredRows}
						loading={loading}
						loadingLabel="Loading job orders"
					rowActions={[
						{ label: 'Open', onClick: onOpen },
						{ label: 'Archive', onClick: onArchive }
					]}
				/>
			</article>
		</section>
	);
}
