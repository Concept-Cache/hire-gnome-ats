'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Filter, Plus, X } from 'lucide-react';
import ClientAdvancedSearchModal from '@/app/components/client-advanced-search-modal';
import EntityTable from '@/app/components/entity-table';
import SavedListViews from '@/app/components/saved-list-views';
import TableColumnPicker from '@/app/components/table-column-picker';
import useArchivedEntities from '@/app/hooks/use-archived-entities';
import {
	evaluateClientAdvancedCriteria,
	normalizeClientAdvancedCriteria,
	summarizeClientAdvancedCriterion
} from '@/lib/client-advanced-search';
import { normalizeClientStatusValue } from '@/lib/client-status-options';
import { formatDateTimeAt } from '@/lib/date-format';
import { sortByConfig } from '@/lib/list-sort';
import { saveRecordNavigationContext, withRecordNavigationQuery } from '@/lib/record-navigation-context';
import { buildDefaultTableSortState, normalizeTableSortState } from '@/lib/table-sort';

function formatLocation(city, state) {
	const parts = [city, state].map((value) => String(value || '').trim()).filter(Boolean);
	return parts.length > 0 ? parts.join(', ') : '-';
}

function formatDateTime(value) {
	return formatDateTimeAt(value);
}

export default function ClientsPage() {
	const router = useRouter();
	const [rows, setRows] = useState([]);
	const [loading, setLoading] = useState(false);
	const [query, setQuery] = useState('');
	const [advancedCriteria, setAdvancedCriteria] = useState([]);
	const [advancedSearchOpen, setAdvancedSearchOpen] = useState(false);
	const [sortState, setSortState] = useState({ key: '', direction: 'asc' });
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

	const divisionOptions = useMemo(() => {
		return [...new Set(activeRows.map((row) => row.divisionName).filter((value) => value && value !== '-'))].sort((a, b) =>
			String(a).localeCompare(String(b))
		);
	}, [activeRows]);

	const normalizedAdvancedCriteria = useMemo(
		() => normalizeClientAdvancedCriteria(advancedCriteria),
		[advancedCriteria]
	);

	const quickFilteredRows = useMemo(() => {
		const q = query.trim().toLowerCase();
		return activeRows.filter((row) => {
			const matchesQuery =
				!q ||
				`${row.name} ${row.industry ?? ''} ${row.status ?? ''} ${row.owner ?? ''} ${row.locationLabel ?? ''}`
					.toLowerCase()
					.includes(q);
			return matchesQuery;
		});
	}, [activeRows, query]);

	const filteredRows = useMemo(() => {
		return quickFilteredRows.filter((row) => evaluateClientAdvancedCriteria(row, normalizedAdvancedCriteria));
	}, [normalizedAdvancedCriteria, quickFilteredRows]);

	const advancedCriteriaSummary = useMemo(
		() => normalizedAdvancedCriteria.map((criterion) => summarizeClientAdvancedCriterion(criterion)).filter(Boolean),
		[normalizedAdvancedCriteria]
	);

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
					noteCount: client._count?.notes || 0,
					lastActivityAt: client.lastActivityAt || client.updatedAt || client.createdAt || null,
					lastActivityAtLabel: formatDateTime(client.lastActivityAt || client.updatedAt || client.createdAt || null),
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

	function persistNavigationContext() {
		saveRecordNavigationContext('client', {
			ids: sortedListRows.map((row) => row.id),
			label: query.trim() || normalizedAdvancedCriteria.length > 0 ? 'Filtered Clients' : 'Client List',
			listPath: '/clients'
		});
	}

	function onOpen(row) {
		persistNavigationContext();
		router.push(withRecordNavigationQuery(`/clients/${row.id}`));
	}

	function applySavedViewState(nextState = {}) {
		setQuery(String(nextState.query ?? ''));
		setAdvancedCriteria(normalizeClientAdvancedCriteria(nextState.advancedCriteria || []));
		setSortState(normalizeTableSortState(nextState.sortState));
	}

	function removeAdvancedCriterion(indexToRemove) {
		setAdvancedCriteria((current) => current.filter((_, index) => index !== indexToRemove));
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
		{ key: 'jobOrderCount', label: 'Job Orders', defaultVisible: false },
		{ key: 'noteCount', label: 'Notes', defaultVisible: false },
		{ key: 'lastActivityAtLabel', label: 'Last Activity Date', defaultVisible: false, getSortValue: (row) => row.lastActivityAt || '' }
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
					<div className="list-controls clients-list-controls">
						{advancedCriteriaSummary.length > 0 ? (
							<div className="clients-search-token-field">
								<div className="clients-search-token-field-chips" aria-label="Active advanced filters">
									{advancedCriteriaSummary.map((summary, index) => (
										<span key={`${summary}-${index}`} className="chip clients-advanced-search-chip">
											<span>{summary}</span>
											<button
												type="button"
												className="clients-advanced-search-chip-remove"
												onClick={() => removeAdvancedCriterion(index)}
												aria-label={`Remove ${summary}`}
												title={`Remove ${summary}`}
											>
												<X aria-hidden="true" />
											</button>
										</span>
									))}
									<input
										placeholder="Search within filtered clients"
										value={query}
										onChange={(e) => setQuery(e.target.value)}
										aria-label="Search within advanced filtered clients"
									/>
								</div>
							</div>
						) : (
							<input
								placeholder="Search client, industry, status, owner"
								value={query}
								onChange={(e) => setQuery(e.target.value)}
							/>
						)}
						<div className="list-controls-toolbar-group clients-list-controls-tools">
							<button
								type="button"
								className="table-toolbar-button clients-advanced-search-toggle"
								onClick={() => setAdvancedSearchOpen(true)}
							>
								<Filter aria-hidden="true" />
								Advanced Search
								{advancedCriteriaSummary.length > 0 ? (
									<span className="clients-advanced-search-count">{advancedCriteriaSummary.length}</span>
								) : null}
							</button>
							<SavedListViews
								listKey="clients"
								columns={columns}
								defaultState={{ query: '', advancedCriteria: [], sortState: defaultSortState }}
								currentState={{ query, advancedCriteria: normalizedAdvancedCriteria, sortState: effectiveSortState }}
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
						sortState={sortState.key ? sortState : undefined}
						onSortStateChange={setSortState}
					rowActions={[{ label: 'Open', onClick: onOpen }]}
				/>
			</article>
			<ClientAdvancedSearchModal
				open={advancedSearchOpen}
				criteria={normalizedAdvancedCriteria}
				ownerOptions={ownerOptions}
				divisionOptions={divisionOptions}
				onApply={(nextCriteria) => {
					setAdvancedCriteria(normalizeClientAdvancedCriteria(nextCriteria));
					setAdvancedSearchOpen(false);
				}}
				onClose={() => setAdvancedSearchOpen(false)}
			/>
		</section>
	);
}
