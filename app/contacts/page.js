'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import EntityTable from '@/app/components/entity-table';
import SavedListViews from '@/app/components/saved-list-views';
import TableColumnPicker from '@/app/components/table-column-picker';
import TableEntityLink from '@/app/components/table-entity-link';
import { useConfirmDialog } from '@/app/components/confirm-dialog';
import useArchivedEntities from '@/app/hooks/use-archived-entities';
import { formatDateTimeAt } from '@/lib/date-format';
import { formatSelectValueLabel } from '@/lib/select-value-label';

function formatDateTime(value) {
	return formatDateTimeAt(value);
}

export default function ContactsPage() {
	const router = useRouter();
	const [rows, setRows] = useState([]);
	const [loading, setLoading] = useState(false);
	const [query, setQuery] = useState('');
	const [clientFilter, setClientFilter] = useState('all');
	const [ownerFilter, setOwnerFilter] = useState('all');
	const { archivedIdSet } = useArchivedEntities('CONTACT');

	const activeRows = useMemo(
		() => rows.filter((row) => !archivedIdSet.has(row.id)),
		[rows, archivedIdSet]
	);

	const clientOptions = useMemo(() => {
		return [...new Set(activeRows.map((row) => row.client).filter((value) => value && value !== '-'))].sort((a, b) =>
			String(a).localeCompare(String(b))
		);
	}, [activeRows]);

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
				`${row.fullName} ${row.client} ${row.owner} ${row.statusLabel ?? ''} ${row.title ?? ''} ${row.department ?? ''}`
					.toLowerCase()
					.includes(q);
			const matchesClient = clientFilter === 'all' || row.client === clientFilter;
			const matchesOwner = ownerFilter === 'all' || row.owner === ownerFilter;
			return matchesQuery && matchesClient && matchesOwner;
		});
	}, [activeRows, query, clientFilter, ownerFilter]);

	async function load() {
		setLoading(true);
		try {
			const res = await fetch('/api/contacts');
			const data = await res.json();

			setRows(
				data.map((contact) => ({
					...contact,
					fullName: `${contact.firstName} ${contact.lastName}`,
					client: contact.client?.name || '-',
					clientId: contact.client?.id || null,
					emailLabel: contact.email || '-',
					mobileLabel: contact.mobile || contact.phone || '-',
					departmentLabel: contact.department || '-',
					divisionName: contact.division?.name || '-',
					statusLabel: formatSelectValueLabel(contact.status),
					lastActivityAtLabel: formatDateTime(contact.lastActivityAt),
					owner: contact.ownerUser
						? `${contact.ownerUser.firstName} ${contact.ownerUser.lastName}`
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
		router.push(`/contacts/${row.id}`);
	}

	function applySavedViewState(nextState = {}) {
		setQuery(String(nextState.query ?? ''));
		setClientFilter(String(nextState.clientFilter || 'all'));
		setOwnerFilter(String(nextState.ownerFilter || 'all'));
	}

	const columns = [
		{ key: 'fullName', label: 'Name' },
		{ key: 'title', label: 'Title' },
		{ key: 'departmentLabel', label: 'Department', defaultVisible: false },
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
		{ key: 'emailLabel', label: 'Email', defaultVisible: false },
		{ key: 'mobileLabel', label: 'Mobile', defaultVisible: false },
		{ key: 'divisionName', label: 'Division', defaultVisible: false },
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
					<h2>Contacts</h2>
				</div>
				<div className="module-header-actions">
					<Link href="/contacts/new" className="btn-link btn-link-icon" aria-label="New Contact" title="New Contact">
						<Plus aria-hidden="true" className="btn-refresh-icon-svg" />
					</Link>
				</div>
			</header>

			<article className="panel">
				<h3>Contact List</h3>
					<div className="list-controls list-controls-three list-controls-with-columns">
						<input
							placeholder="Search contact, client, owner, title, department"
							value={query}
						onChange={(e) => setQuery(e.target.value)}
					/>
					<select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)}>
						<option value="all">All Clients</option>
						{clientOptions.map((client) => (
							<option key={client} value={client}>
								{client}
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
								listKey="contacts"
								columns={columns}
								defaultState={{ query: '', clientFilter: 'all', ownerFilter: 'all' }}
								currentState={{ query, clientFilter, ownerFilter }}
								onApplyState={applySavedViewState}
							/>
							<TableColumnPicker tableKey="contacts" columns={columns} />
						</div>
					</div>
					<EntityTable
						tableKey="contacts"
						columns={columns}
						rows={filteredRows}
						loading={loading}
						loadingLabel="Loading contacts"
					rowActions={[{ label: 'Open', onClick: onOpen }]}
				/>
			</article>
		</section>
	);
}
