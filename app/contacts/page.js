'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Filter, Plus, X } from 'lucide-react';
import ContactAdvancedSearchModal from '@/app/components/contact-advanced-search-modal';
import EntityTable from '@/app/components/entity-table';
import SavedListViews from '@/app/components/saved-list-views';
import TableColumnPicker from '@/app/components/table-column-picker';
import TableEntityLink from '@/app/components/table-entity-link';
import { useConfirmDialog } from '@/app/components/confirm-dialog';
import useArchivedEntities from '@/app/hooks/use-archived-entities';
import { formatDateTimeAt } from '@/lib/date-format';
import {
	evaluateContactAdvancedCriteria,
	normalizeContactAdvancedCriteria,
	summarizeContactAdvancedCriterion
} from '@/lib/contact-advanced-search';
import { formatSelectValueLabel } from '@/lib/select-value-label';
import { buildDefaultTableSortState, normalizeTableSortState } from '@/lib/table-sort';

function formatDateTime(value) {
	return formatDateTimeAt(value);
}

export default function ContactsPage() {
	const router = useRouter();
	const [rows, setRows] = useState([]);
	const [loading, setLoading] = useState(false);
	const [query, setQuery] = useState('');
	const [advancedCriteria, setAdvancedCriteria] = useState([]);
	const [advancedSearchOpen, setAdvancedSearchOpen] = useState(false);
	const [sortState, setSortState] = useState({ key: '', direction: 'asc' });
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

	const sourceOptions = useMemo(() => {
		return [...new Set(activeRows.map((row) => row.sourceLabel).filter((value) => value && value !== '-'))].sort((a, b) =>
			String(a).localeCompare(String(b))
		);
	}, [activeRows]);

	const divisionOptions = useMemo(() => {
		return [...new Set(activeRows.map((row) => row.divisionName).filter((value) => value && value !== '-'))].sort((a, b) =>
			String(a).localeCompare(String(b))
		);
	}, [activeRows]);

	const normalizedAdvancedCriteria = useMemo(
		() => normalizeContactAdvancedCriteria(advancedCriteria),
		[advancedCriteria]
	);

	const quickFilteredRows = useMemo(() => {
		const q = query.trim().toLowerCase();
		return activeRows.filter((row) => {
			const matchesQuery =
				!q ||
				`${row.fullName} ${row.client} ${row.owner} ${row.statusLabel ?? ''} ${row.title ?? ''} ${row.department ?? ''} ${row.sourceLabel ?? ''}`
					.toLowerCase()
					.includes(q);
			return matchesQuery;
		});
	}, [activeRows, query]);

	const filteredRows = useMemo(() => {
		return quickFilteredRows.filter((row) => evaluateContactAdvancedCriteria(row, normalizedAdvancedCriteria));
	}, [normalizedAdvancedCriteria, quickFilteredRows]);

	const advancedCriteriaSummary = useMemo(
		() => normalizedAdvancedCriteria.map((criterion) => summarizeContactAdvancedCriterion(criterion)).filter(Boolean),
		[normalizedAdvancedCriteria]
	);

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
					sourceLabel: contact.source || '-',
					divisionName: contact.division?.name || '-',
					statusLabel: formatSelectValueLabel(contact.status),
					noteCount: contact._count?.notes || 0,
					jobOrderCount: contact._count?.jobOrders || 0,
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
		setAdvancedCriteria(normalizeContactAdvancedCriteria(nextState.advancedCriteria || []));
		setSortState(normalizeTableSortState(nextState.sortState));
	}

	function removeAdvancedCriterion(indexToRemove) {
		setAdvancedCriteria((current) => current.filter((_, index) => index !== indexToRemove));
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
		{ key: 'sourceLabel', label: 'Source', defaultVisible: false },
		{ key: 'divisionName', label: 'Division', defaultVisible: false },
		{ key: 'noteCount', label: 'Notes', defaultVisible: false },
		{ key: 'jobOrderCount', label: 'Job Orders', defaultVisible: false },
		{
			key: 'lastActivityAtLabel',
			label: 'Last Activity Date',
			getSortValue: (row) => row.lastActivityAt || ''
		}
	];
	const defaultSortState = useMemo(() => buildDefaultTableSortState(columns), [columns]);
	const effectiveSortState = sortState.key ? sortState : defaultSortState;

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
					<div className="list-controls contacts-list-controls">
						{advancedCriteriaSummary.length > 0 ? (
							<div className="contacts-search-token-field">
								<div className="contacts-search-token-field-chips" aria-label="Active advanced filters">
									{advancedCriteriaSummary.map((summary, index) => (
										<span key={`${summary}-${index}`} className="chip contacts-advanced-search-chip">
											<span>{summary}</span>
											<button
												type="button"
												className="contacts-advanced-search-chip-remove"
												onClick={() => removeAdvancedCriterion(index)}
												aria-label={`Remove ${summary}`}
												title={`Remove ${summary}`}
											>
												<X aria-hidden="true" />
											</button>
										</span>
									))}
									<input
										placeholder="Search within filtered contacts"
										value={query}
										onChange={(e) => setQuery(e.target.value)}
										aria-label="Search within advanced filtered contacts"
									/>
								</div>
							</div>
						) : (
							<input
								placeholder="Search contact, client, owner, title, department"
								value={query}
								onChange={(e) => setQuery(e.target.value)}
							/>
						)}
						<div className="list-controls-toolbar-group contacts-list-controls-tools">
							<button
								type="button"
								className="table-toolbar-button contacts-advanced-search-toggle"
								onClick={() => setAdvancedSearchOpen(true)}
							>
								<Filter aria-hidden="true" />
								Advanced Search
								{advancedCriteriaSummary.length > 0 ? (
									<span className="contacts-advanced-search-count">{advancedCriteriaSummary.length}</span>
								) : null}
							</button>
							<SavedListViews
								listKey="contacts"
								columns={columns}
								defaultState={{ query: '', advancedCriteria: [], sortState: defaultSortState }}
								currentState={{ query, advancedCriteria: normalizedAdvancedCriteria, sortState: effectiveSortState }}
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
						sortState={sortState.key ? sortState : undefined}
						onSortStateChange={setSortState}
					rowActions={[{ label: 'Open', onClick: onOpen }]}
				/>
			</article>
			<ContactAdvancedSearchModal
				open={advancedSearchOpen}
				criteria={normalizedAdvancedCriteria}
				clientOptions={clientOptions}
				ownerOptions={ownerOptions}
				sourceOptions={sourceOptions}
				divisionOptions={divisionOptions}
				onApply={(nextCriteria) => {
					setAdvancedCriteria(normalizeContactAdvancedCriteria(nextCriteria));
					setAdvancedSearchOpen(false);
				}}
				onClose={() => setAdvancedSearchOpen(false)}
			/>
		</section>
	);
}
