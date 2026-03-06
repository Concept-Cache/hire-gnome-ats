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
import { formatDateTimeAt } from '@/lib/date-format';
import { cascadeSelectionFromIds, getArchiveCascadeOptions } from '@/lib/archive-cascade-options';
import { formatSelectValueLabel } from '@/lib/select-value-label';
import { CANDIDATE_STATUS_OPTIONS } from '@/lib/candidate-status';

function formatDateTime(value) {
	return formatDateTimeAt(value);
}

export default function CandidatesPage() {
	const router = useRouter();
	const toast = useToast();
	const { requestConfirmWithOptions } = useConfirmDialog();
	const [rows, setRows] = useState([]);
	const [loading, setLoading] = useState(false);
	const [query, setQuery] = useState('');
	const [statusFilter, setStatusFilter] = useState('all');
	const [ownerFilter, setOwnerFilter] = useState('all');
	const { archivedIdSet, archiveEntity } = useArchivedEntities('CANDIDATE');

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

	async function load() {
		setLoading(true);
		try {
			const res = await fetch('/api/candidates');
			const data = await res.json();
			setRows(
				data.map((candidate) => ({
					...candidate,
					fullName: `${candidate.firstName} ${candidate.lastName}`,
					statusLabel: formatSelectValueLabel(candidate.status),
					currentTitle: candidate.currentJobTitle || '-',
					lastActivityAtLabel: formatDateTime(candidate.lastActivityAt),
					ownerName: candidate.ownerUser
						? `${candidate.ownerUser.firstName} ${candidate.ownerUser.lastName}`.trim()
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
		router.push(`/candidates/${row.id}`);
	}

	async function onArchive(row) {
		const archiveOptions = getArchiveCascadeOptions('CANDIDATE');
		const decision = await requestConfirmWithOptions({
			title: 'Archive Candidate',
			message: `Archive ${row.fullName}? You can restore it from Archive later.`,
			confirmLabel: 'Archive',
			cancelLabel: 'Cancel',
			isDanger: true,
			options: archiveOptions
		});
		if (!decision?.confirmed) return;
		const cascade = cascadeSelectionFromIds('CANDIDATE', decision.selections);
		const result = await archiveEntity(row.id, '', cascade);
		if (!result.ok) {
			toast.error(result.error || 'Failed to archive candidate.');
			return;
		}
		const relatedCount = Math.max(0, Number(result.archivedCount || 1) - 1);
		toast.success(
			relatedCount > 0
				? `Candidate archived with ${relatedCount} related record${relatedCount === 1 ? '' : 's'}.`
				: 'Candidate archived.'
		);
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
					<Link href="/archive" className="btn-secondary btn-link-icon" aria-label="Archive" title="Archive">
						<Archive aria-hidden="true" className="btn-refresh-icon-svg" />
					</Link>
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
				<h3>Candidate List</h3>
					<div className="list-controls list-controls-three list-controls-with-columns">
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
						<TableColumnPicker tableKey="candidates" columns={columns} />
					</div>
					<EntityTable
						tableKey="candidates"
						columns={columns}
						rows={filteredRows}
						loading={loading}
						loadingLabel="Loading candidates"
					rowActions={[
						{ label: 'Open', onClick: onOpen },
						{ label: 'Archive', onClick: onArchive }
					]}
				/>
			</article>
		</section>
	);
}
