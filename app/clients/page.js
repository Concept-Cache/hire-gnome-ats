'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import EntityTable from '@/app/components/entity-table';
import SavedListViews from '@/app/components/saved-list-views';
import TableColumnPicker from '@/app/components/table-column-picker';
import useArchivedEntities from '@/app/hooks/use-archived-entities';
import { CLIENT_STATUS_OPTIONS, normalizeClientStatusValue } from '@/lib/client-status-options';

function formatLocation(city, state) {
	const parts = [city, state].map((value) => String(value || '').trim()).filter(Boolean);
	return parts.length > 0 ? parts.join(', ') : '-';
}

export default function ClientsPage() {
	const router = useRouter();
	const [rows, setRows] = useState([]);
	const [loading, setLoading] = useState(false);
	const [query, setQuery] = useState('');
	const [statusFilter, setStatusFilter] = useState('all');
	const [ownerFilter, setOwnerFilter] = useState('all');
	const { archivedIdSet } = useArchivedEntities('CLIENT');

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
					locationLabel: formatLocation(client.city, client.state),
					divisionName: client.division?.name || '-',
					websiteLabel: client.website || '-',
					contactCount: client._count?.contacts || 0,
					jobOrderCount: client._count?.jobOrders || 0,
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

	function applySavedViewState(nextState = {}) {
		setQuery(String(nextState.query ?? ''));
		setStatusFilter(String(nextState.statusFilter || 'all'));
		setOwnerFilter(String(nextState.ownerFilter || 'all'));
	}

	const columns = [
		{ key: 'name', label: 'Name' },
		{ key: 'industry', label: 'Industry' },
		{ key: 'status', label: 'Status' },
		{ key: 'owner', label: 'Owner' },
		{ key: 'locationLabel', label: 'Location', defaultVisible: false },
		{ key: 'divisionName', label: 'Division', defaultVisible: false },
		{ key: 'websiteLabel', label: 'Website', defaultVisible: false },
		{ key: 'contactCount', label: 'Contacts', defaultVisible: false },
		{ key: 'jobOrderCount', label: 'Job Orders', defaultVisible: false }
	];

	return (
		<section className="module-page">
			<header className="module-header module-header-list">
				<div>
					<h2>Clients</h2>
				</div>
				<div className="module-header-actions">
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
						<div className="list-controls-toolbar-group">
							<SavedListViews
								listKey="clients"
								columns={columns}
								defaultState={{ query: '', statusFilter: 'all', ownerFilter: 'all' }}
								currentState={{ query, statusFilter, ownerFilter }}
								onApplyState={applySavedViewState}
							/>
							<TableColumnPicker tableKey="clients" columns={columns} />
						</div>
					</div>
					<EntityTable
						tableKey="clients"
						columns={columns}
						rows={filteredRows}
						loading={loading}
						loadingLabel="Loading clients"
					rowActions={[{ label: 'Open', onClick: onOpen }]}
				/>
			</article>
		</section>
	);
}
