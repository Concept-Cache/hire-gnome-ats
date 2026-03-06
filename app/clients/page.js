'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Archive, Plus } from 'lucide-react';
import EntityTable from '@/app/components/entity-table';
import TableColumnPicker from '@/app/components/table-column-picker';
import { useToast } from '@/app/components/toast-provider';
import { useConfirmDialog } from '@/app/components/confirm-dialog';
import useArchivedEntities from '@/app/hooks/use-archived-entities';
import { cascadeSelectionFromIds, getArchiveCascadeOptions } from '@/lib/archive-cascade-options';
import { CLIENT_STATUS_OPTIONS, normalizeClientStatusValue } from '@/lib/client-status-options';

export default function ClientsPage() {
	const router = useRouter();
	const toast = useToast();
	const { requestConfirmWithOptions } = useConfirmDialog();
	const [rows, setRows] = useState([]);
	const [loading, setLoading] = useState(false);
	const [query, setQuery] = useState('');
	const [statusFilter, setStatusFilter] = useState('all');
	const [ownerFilter, setOwnerFilter] = useState('all');
	const { archivedIdSet, archiveEntity } = useArchivedEntities('CLIENT');

	const activeRows = useMemo(
		() => rows.filter((row) => !archivedIdSet.has(row.id)),
		[rows, archivedIdSet]
	);

	const ownerOptions = useMemo(() => {
		return [...new Set(activeRows.map((row) => row.owner).filter((value) => value && value !== '-'))].sort((a, b) =>
			String(a).localeCompare(String(b))
		);
	}, [activeRows]);

	const filteredRows = useMemo(() => {
		const q = query.trim().toLowerCase();
		return activeRows.filter((row) => {
			const matchesQuery =
				!q ||
				`${row.name} ${row.industry ?? ''} ${row.status ?? ''} ${row.owner ?? ''}`
					.toLowerCase()
					.includes(q);
			const matchesStatus = statusFilter === 'all' || row.status === statusFilter;
			const matchesOwner = ownerFilter === 'all' || row.owner === ownerFilter;
			return matchesQuery && matchesStatus && matchesOwner;
		});
	}, [activeRows, query, statusFilter, ownerFilter]);

	async function load() {
		setLoading(true);
		try {
			const res = await fetch('/api/clients');
			const data = await res.json();
			setRows(
				data.map((client) => ({
					...client,
					status: normalizeClientStatusValue(client.status),
					owner: client.ownerUser
						? `${client.ownerUser.firstName} ${client.ownerUser.lastName}`
						: '-'
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
		router.push(`/clients/${row.id}`);
	}

	async function onArchive(row) {
		const archiveOptions = getArchiveCascadeOptions('CLIENT');
		const decision = await requestConfirmWithOptions({
			title: 'Archive Client',
			message: `Archive ${row.name}? You can restore it from Archive later.`,
			confirmLabel: 'Archive',
			cancelLabel: 'Cancel',
			isDanger: true,
			options: archiveOptions
		});
		if (!decision?.confirmed) return;
		const cascade = cascadeSelectionFromIds('CLIENT', decision.selections);
		const result = await archiveEntity(row.id, '', cascade);
		if (!result.ok) {
			toast.error(result.error || 'Failed to archive client.');
			return;
		}
		const relatedCount = Math.max(0, Number(result.archivedCount || 1) - 1);
		toast.success(
			relatedCount > 0
				? `Client archived with ${relatedCount} related record${relatedCount === 1 ? '' : 's'}.`
				: 'Client archived.'
		);
	}

	const columns = [
		{ key: 'name', label: 'Name' },
		{ key: 'industry', label: 'Industry' },
		{ key: 'status', label: 'Status' },
		{ key: 'owner', label: 'Owner' }
	];

	return (
		<section className="module-page">
			<header className="module-header module-header-list">
				<div>
					<h2>Clients</h2>
				</div>
				<div className="module-header-actions">
					<Link href="/archive" className="btn-secondary btn-link-icon" aria-label="Archive" title="Archive">
						<Archive aria-hidden="true" className="btn-refresh-icon-svg" />
					</Link>
					<Link href="/clients/new" className="btn-link btn-link-icon" aria-label="New Client" title="New Client">
						<Plus aria-hidden="true" className="btn-refresh-icon-svg" />
					</Link>
				</div>
			</header>

			<article className="panel">
				<h3>Client List</h3>
					<div className="list-controls list-controls-three list-controls-with-columns">
						<input
							placeholder="Search client, industry, status, owner"
							value={query}
						onChange={(e) => setQuery(e.target.value)}
					/>
					<select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
						<option value="all">All Statuses</option>
						{CLIENT_STATUS_OPTIONS.map((status) => (
							<option key={status.value} value={status.value}>
								{status.label}
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
						<TableColumnPicker tableKey="clients" columns={columns} />
					</div>
					<EntityTable
						tableKey="clients"
						columns={columns}
						rows={filteredRows}
						loading={loading}
						loadingLabel="Loading clients"
					rowActions={[
						{ label: 'Open', onClick: onOpen },
						{ label: 'Archive', onClick: onArchive }
					]}
				/>
			</article>
		</section>
	);
}
