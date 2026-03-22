'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Filter, Plus, X } from 'lucide-react';
import EntityTable from '@/app/components/entity-table';
import PlacementAdvancedSearchModal from '@/app/components/placement-advanced-search-modal';
import SavedListViews from '@/app/components/saved-list-views';
import TableColumnPicker from '@/app/components/table-column-picker';
import TableEntityLink from '@/app/components/table-entity-link';
import useArchivedEntities from '@/app/hooks/use-archived-entities';
import { formatDateTimeAt } from '@/lib/date-format';
import {
	evaluatePlacementAdvancedCriteria,
	normalizePlacementAdvancedCriteria,
	summarizePlacementAdvancedCriterion
} from '@/lib/placement-advanced-search';
import { formatSelectValueLabel } from '@/lib/select-value-label';

function formatDateTime(value) {
	return formatDateTimeAt(value);
}

function formatCurrency(currency, value) {
	if (value === '') return '-';
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return '-';

	const currencyCode =
		typeof currency === 'string' && currency.trim() ? currency.trim().toUpperCase() : 'USD';
	try {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: currencyCode,
			minimumFractionDigits: 0,
			maximumFractionDigits: 2
		}).format(parsed);
	} catch {
		return `${currencyCode} ${parsed.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
	}
}

function formatAnnualCurrency(currency, value) {
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return '-';

	const currencyCode =
		typeof currency === 'string' && currency.trim() ? currency.trim().toUpperCase() : 'USD';

	if (Math.abs(parsed) >= 1000 && Math.abs(parsed) < 1000000) {
		const thousands = parsed / 1000;
		const rounded = Number.isInteger(thousands) ? String(thousands) : thousands.toFixed(1).replace(/\.0$/, '');
		return `${currencyCode === 'USD' ? '$' : `${currencyCode} `}${rounded}k`;
	}

	if (Math.abs(parsed) >= 1000000) {
		const millions = parsed / 1000000;
		const rounded = Number.isInteger(millions) ? String(millions) : millions.toFixed(1).replace(/\.0$/, '');
		return `${currencyCode === 'USD' ? '$' : `${currencyCode} `}${rounded}m`;
	}

	return formatCurrency(currencyCode, parsed);
}

function formatPlacementType(value) {
	if (value === 'perm') return 'Perm';
	if (value === 'temp') return 'Temp';
	return '-';
}

function formatCompensation(row) {
	if (row.compensationType === 'hourly') {
		const hourlyPay = row.hourlyRtPayRate ?? row.regularRate ?? row.amount;
		const hourlyBill = row.hourlyRtBillRate ?? null;
		if (hourlyPay != null && hourlyBill != null) {
			return `${formatCurrency(row.currency, hourlyPay)} Pay / ${formatCurrency(row.currency, hourlyBill)} Bill`;
		}
		if (hourlyPay != null) return `${formatCurrency(row.currency, hourlyPay)} Pay`;
		if (hourlyBill != null) return `${formatCurrency(row.currency, hourlyBill)} Bill`;
		return '-';
	}

	if (row.compensationType === 'daily') {
		const dailyPay = row.dailyPayRate ?? row.dailyRate ?? row.amount;
		const dailyBill = row.dailyBillRate ?? null;
		if (dailyPay != null && dailyBill != null) {
			return `${formatCurrency(row.currency, dailyPay)} Pay / ${formatCurrency(row.currency, dailyBill)} Bill`;
		}
		if (dailyPay != null) return `${formatCurrency(row.currency, dailyPay)} Pay`;
		if (dailyBill != null) return `${formatCurrency(row.currency, dailyBill)} Bill`;
		return '-';
	}

	if (row.compensationType === 'salary') {
		const baseSalary = row.yearlyCompensation ?? row.annualSalary ?? row.amount;
		return baseSalary == null ? '-' : `${formatAnnualCurrency(row.currency, baseSalary)} Annual`;
	}

	return row.amount == null ? '-' : formatCurrency(row.currency, row.amount);
}

export default function PlacementsPage() {
	const router = useRouter();
	const [rows, setRows] = useState([]);
	const [loading, setLoading] = useState(false);
	const [query, setQuery] = useState('');
	const [advancedCriteria, setAdvancedCriteria] = useState([]);
	const [advancedSearchOpen, setAdvancedSearchOpen] = useState(false);
	const { archivedIdSet } = useArchivedEntities('PLACEMENT');

	const activeRows = useMemo(
		() => rows.filter((row) => !archivedIdSet.has(row.id)),
		[rows, archivedIdSet]
	);

	const statusOptions = useMemo(() => {
		return [...new Set(activeRows.map((row) => row.status).filter(Boolean))]
			.map((status) => ({
				value: status,
				label: activeRows.find((row) => row.status === status)?.statusLabel || status
			}))
			.sort((a, b) => a.label.localeCompare(b.label));
	}, [activeRows]);

	const typeOptions = useMemo(() => {
		return [...new Set(activeRows.map((row) => row.placementType).filter(Boolean))]
			.map((type) => ({
				value: type,
				label: activeRows.find((row) => row.placementType === type)?.placementTypeLabel || type
			}))
			.sort((a, b) => a.label.localeCompare(b.label));
	}, [activeRows]);

	const normalizedAdvancedCriteria = useMemo(
		() => normalizePlacementAdvancedCriteria(advancedCriteria),
		[advancedCriteria]
	);

	const quickFilteredRows = useMemo(() => {
		const q = query.trim().toLowerCase();
		return activeRows.filter((row) => {
			const matchesQuery =
				!q ||
				`${row.candidate} ${row.jobOrder} ${row.client} ${row.statusLabel} ${row.placementTypeLabel} ${row.compensationLabel}`
					.toLowerCase()
					.includes(q);
			return matchesQuery;
		});
	}, [activeRows, query]);

	const filteredRows = useMemo(() => {
		return quickFilteredRows.filter((row) => evaluatePlacementAdvancedCriteria(row, normalizedAdvancedCriteria));
	}, [normalizedAdvancedCriteria, quickFilteredRows]);

	const advancedCriteriaSummary = useMemo(
		() => normalizedAdvancedCriteria.map((criterion) => summarizePlacementAdvancedCriterion(criterion)).filter(Boolean),
		[normalizedAdvancedCriteria]
	);

	useEffect(() => {
		let active = true;

		async function load() {
			setLoading(true);
			try {
				const res = await fetch('/api/placements');
				const data = await res.json();
				if (!active || !Array.isArray(data)) return;

				setRows(
					data.map((placement) => ({
						...placement,
						candidate: placement.candidate
							? `${placement.candidate.firstName} ${placement.candidate.lastName}`
							: '-',
						candidateId: placement.candidate?.id || null,
						jobOrder: placement.jobOrder?.title || '-',
						jobOrderId: placement.jobOrder?.id || null,
						client: placement.jobOrder?.client?.name || '-',
						clientId: placement.jobOrder?.client?.id || null,
						statusLabel: formatSelectValueLabel(placement.status),
						placementTypeLabel: formatPlacementType(placement.placementType),
						compensationLabel: formatCompensation(placement),
						offeredOnLabel: formatDateTime(placement.offeredOn),
						expectedJoinDateLabel: formatDateTime(placement.expectedJoinDate),
						endDateLabel: formatDateTime(placement.endDate)
					}))
				);
			} finally {
				if (active) {
					setLoading(false);
				}
			}
		}

		load();
		return () => {
			active = false;
		};
	}, []);

	function onOpen(row) {
		router.push(`/placements/${row.id}`);
	}

	function applySavedViewState(nextState = {}) {
		setQuery(String(nextState.query ?? ''));
		setAdvancedCriteria(normalizePlacementAdvancedCriteria(nextState.advancedCriteria || []));
	}

	function removeAdvancedCriterion(indexToRemove) {
		setAdvancedCriteria((current) => current.filter((_, index) => index !== indexToRemove));
	}

	const columns = [
		{
			key: 'candidate',
			label: 'Candidate',
			render: (row) =>
				row.candidateId ? (
					<TableEntityLink href={`/candidates/${row.candidateId}`}>{row.candidate}</TableEntityLink>
				) : (
					row.candidate
				)
		},
		{
			key: 'jobOrder',
			label: 'Job Order',
			render: (row) =>
				row.jobOrderId ? (
					<TableEntityLink href={`/job-orders/${row.jobOrderId}`}>{row.jobOrder}</TableEntityLink>
				) : (
					row.jobOrder
				)
		},
		{
			key: 'client',
			label: 'Client',
			defaultVisible: false,
			render: (row) =>
				row.clientId ? (
					<TableEntityLink href={`/clients/${row.clientId}`}>{row.client}</TableEntityLink>
				) : (
					row.client
				)
		},
		{ key: 'placementTypeLabel', label: 'Type' },
		{ key: 'compensationLabel', label: 'Compensation' },
		{ key: 'statusLabel', label: 'Status' },
		{ key: 'offeredOnLabel', label: 'Offered On', defaultVisible: false, getSortValue: (row) => row.offeredOn || '' },
		{ key: 'expectedJoinDateLabel', label: 'Expected Join', defaultVisible: false, getSortValue: (row) => row.expectedJoinDate || '' },
		{ key: 'endDateLabel', label: 'End Date', defaultVisible: false, getSortValue: (row) => row.endDate || '' }
	];

	return (
		<section className="module-page">
			<header className="module-header module-header-list">
				<div>
					<h2>Placements</h2>
				</div>
				<div className="module-header-actions">
					<Link
						href="/placements/new"
						className="btn-link btn-link-icon"
						aria-label="New Placement"
						title="New Placement"
					>
						<Plus aria-hidden="true" className="btn-refresh-icon-svg" />
					</Link>
				</div>
			</header>

			<article className="panel">
				<h3>Placement List</h3>
					<div className="list-controls placements-list-controls">
					{advancedCriteriaSummary.length > 0 ? (
						<div className="placements-search-token-field">
							<div className="placements-search-token-field-chips" aria-label="Active advanced filters">
								{advancedCriteriaSummary.map((summary, index) => (
									<span key={`${summary}-${index}`} className="chip placements-advanced-search-chip">
										<span>{summary}</span>
										<button
											type="button"
											className="placements-advanced-search-chip-remove"
											onClick={() => removeAdvancedCriterion(index)}
											aria-label={`Remove ${summary}`}
											title={`Remove ${summary}`}
										>
											<X aria-hidden="true" />
										</button>
									</span>
								))}
								<input
									placeholder="Search within filtered placements"
									value={query}
									onChange={(e) => setQuery(e.target.value)}
									aria-label="Search within advanced filtered placements"
								/>
							</div>
						</div>
					) : (
						<input
							placeholder="Search candidate, job order, status, type, compensation"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
						/>
					)}
						<div className="list-controls-toolbar-group placements-list-controls-tools">
							<button
								type="button"
								className="table-toolbar-button placements-advanced-search-toggle"
								onClick={() => setAdvancedSearchOpen(true)}
							>
								<Filter aria-hidden="true" />
								Advanced Search
								{advancedCriteriaSummary.length > 0 ? (
									<span className="placements-advanced-search-count">{advancedCriteriaSummary.length}</span>
								) : null}
							</button>
							<SavedListViews
								listKey="placements"
								columns={columns}
								defaultState={{ query: '', advancedCriteria: [] }}
								currentState={{ query, advancedCriteria: normalizedAdvancedCriteria }}
								onApplyState={applySavedViewState}
							/>
							<TableColumnPicker tableKey="placements" columns={columns} />
						</div>
					</div>
					<EntityTable
						tableKey="placements"
						columns={columns}
						rows={filteredRows}
						loading={loading}
						loadingLabel="Loading placements"
					rowActions={[{ label: 'Open', onClick: onOpen }]}
				/>
			</article>
			<PlacementAdvancedSearchModal
				open={advancedSearchOpen}
				criteria={normalizedAdvancedCriteria}
				statusOptions={statusOptions}
				typeOptions={typeOptions}
				onApply={(nextCriteria) => {
					setAdvancedCriteria(normalizePlacementAdvancedCriteria(nextCriteria));
					setAdvancedSearchOpen(false);
				}}
				onClose={() => setAdvancedSearchOpen(false)}
			/>
		</section>
	);
}
