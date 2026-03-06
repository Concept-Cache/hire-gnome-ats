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
import { formatSelectValueLabel } from '@/lib/select-value-label';

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

function formatPlacementType(value) {
	if (value === 'perm') return 'Perm';
	if (value === 'temp') return 'Temp';
	return '-';
}

function formatCompensation(row) {
	if (row.compensationType === 'hourly') {
		const hourlyPay = row.hourlyRtPayRate ?? row.regularRate ?? row.amount;
		return `Hourly Pay ${formatCurrency(row.currency, hourlyPay)}`;
	}

	if (row.compensationType === 'daily') {
		const dailyPay = row.dailyPayRate ?? row.dailyRate ?? row.amount;
		return `Daily Pay ${formatCurrency(row.currency, dailyPay)}`;
	}

	if (row.compensationType === 'salary') {
		const baseSalary = row.yearlyCompensation ?? row.annualSalary ?? row.amount;
		return `Base Salary ${formatCurrency(row.currency, baseSalary)}`;
	}

	return row.amount == null ? '-' : formatCurrency(row.currency, row.amount);
}

export default function PlacementsPage() {
	const router = useRouter();
	const toast = useToast();
	const { requestConfirm } = useConfirmDialog();
	const [rows, setRows] = useState([]);
	const [loading, setLoading] = useState(false);
	const [query, setQuery] = useState('');
	const [statusFilter, setStatusFilter] = useState('all');
	const [typeFilter, setTypeFilter] = useState('all');
	const { archivedIdSet, archiveEntity } = useArchivedEntities('PLACEMENT');

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

	const filteredRows = useMemo(() => {
		const q = query.trim().toLowerCase();
		return activeRows.filter((row) => {
			const matchesQuery =
				!q ||
				`${row.candidate} ${row.jobOrder} ${row.client} ${row.statusLabel} ${row.placementTypeLabel} ${row.compensationLabel}`
					.toLowerCase()
					.includes(q);
			const matchesStatus = statusFilter === 'all' || row.status === statusFilter;
			const matchesType = typeFilter === 'all' || row.placementType === typeFilter;
			return matchesQuery && matchesStatus && matchesType;
		});
	}, [activeRows, query, statusFilter, typeFilter]);

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
						statusLabel: formatSelectValueLabel(placement.status),
						placementTypeLabel: formatPlacementType(placement.placementType),
						compensationLabel: formatCompensation(placement)
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

	async function onArchive(row) {
		const confirmed = await requestConfirm({
			title: 'Archive Placement',
			message: `Archive ${row.recordId || `placement #${row.id}`}? You can restore it from Archive later.`,
			confirmLabel: 'Archive',
			cancelLabel: 'Cancel',
			destructive: true
		});
		if (!confirmed) return;
		const result = await archiveEntity(row.id);
		if (!result.ok) {
			toast.error(result.error || 'Failed to archive placement.');
			return;
		}
		toast.success('Placement archived.');
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
		{ key: 'placementTypeLabel', label: 'Type' },
		{ key: 'compensationLabel', label: 'Compensation' },
		{ key: 'statusLabel', label: 'Status' }
	];

	return (
		<section className="module-page">
			<header className="module-header module-header-list">
				<div>
					<h2>Placements</h2>
				</div>
				<div className="module-header-actions">
					<Link href="/archive" className="btn-secondary btn-link-icon" aria-label="Archive" title="Archive">
						<Archive aria-hidden="true" className="btn-refresh-icon-svg" />
					</Link>
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
					<div className="list-controls list-controls-three list-controls-with-columns">
					<input
						placeholder="Search candidate, job order, status, type, compensation"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
					/>
					<select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
						<option value="all">All Statuses</option>
						{statusOptions.map((option) => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</select>
						<select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
							<option value="all">All Types</option>
						{typeOptions.map((option) => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
							))}
						</select>
						<TableColumnPicker tableKey="placements" columns={columns} />
					</div>
					<EntityTable
						tableKey="placements"
						columns={columns}
						rows={filteredRows}
						loading={loading}
						loadingLabel="Loading placements"
					rowActions={[
						{ label: 'Open', onClick: onOpen },
						{ label: 'Archive', onClick: onArchive }
					]}
				/>
			</article>
		</section>
	);
}
