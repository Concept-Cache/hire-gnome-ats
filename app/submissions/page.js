'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import EntityTable from '@/app/components/entity-table';
import TableColumnPicker from '@/app/components/table-column-picker';
import TableEntityLink from '@/app/components/table-entity-link';
import useArchivedEntities from '@/app/hooks/use-archived-entities';
import { formatDateTimeAt } from '@/lib/date-format';
import { formatSelectValueLabel } from '@/lib/select-value-label';
import { submissionCreatedByLabel, submissionOriginLabel } from '@/lib/submission-origin';
import { getEffectiveSubmissionStatus } from '@/lib/submission-status';

function formatDate(value) {
	return formatDateTimeAt(value);
}

export default function SubmissionsPage() {
	const router = useRouter();
	const [rows, setRows] = useState([]);
	const [loading, setLoading] = useState(false);
	const [query, setQuery] = useState('');
	const [statusFilter, setStatusFilter] = useState('all');
	const [submitterFilter, setSubmitterFilter] = useState('all');
	const { archivedIdSet } = useArchivedEntities('SUBMISSION');

	const activeRows = useMemo(
		() => rows.filter((row) => !archivedIdSet.has(row.id)),
		[rows, archivedIdSet]
	);

	const statusOptions = useMemo(() => {
		return [...new Set(activeRows.map((row) => row.effectiveStatus).filter(Boolean))]
			.map((status) => ({
				value: status,
				label: activeRows.find((row) => row.effectiveStatus === status)?.statusLabel || status
			}))
			.sort((a, b) => a.label.localeCompare(b.label));
	}, [activeRows]);

	const submitterOptions = useMemo(() => {
		return [...new Set(activeRows.map((row) => row.submittedBy).filter((value) => value && value !== 'Unknown User'))].sort((a, b) =>
			String(a).localeCompare(String(b))
		);
	}, [activeRows]);

	const filteredRows = useMemo(() => {
		const q = query.trim().toLowerCase();
		return activeRows.filter((row) => {
			const matchesQuery =
				!q ||
				`${row.candidate} ${row.jobOrder} ${row.client} ${row.effectiveStatus} ${row.statusLabel} ${row.originLabel ?? ''} ${row.submittedBy ?? ''}`
					.toLowerCase()
					.includes(q);
			const matchesStatus = statusFilter === 'all' || row.effectiveStatus === statusFilter;
			const matchesSubmitter = submitterFilter === 'all' || row.submittedBy === submitterFilter;
			return matchesQuery && matchesStatus && matchesSubmitter;
		});
	}, [activeRows, query, statusFilter, submitterFilter]);

	async function load() {
		setLoading(true);
		try {
			const res = await fetch('/api/submissions');
			const data = await res.json();
			const rows = Array.isArray(data) ? data : [];

			setRows(
				rows.map((submission) => ({
					...submission,
					effectiveStatus: getEffectiveSubmissionStatus(submission),
					candidate: submission.candidate
						? `${submission.candidate.firstName} ${submission.candidate.lastName}`
						: '-',
					candidateId: submission.candidate?.id || null,
					jobOrder: submission.jobOrder?.title || '-',
					jobOrderId: submission.jobOrder?.id || null,
					client: submission.jobOrder?.client?.name || '-',
					clientId: submission.jobOrder?.client?.id || null,
					statusLabel: formatSelectValueLabel(getEffectiveSubmissionStatus(submission)),
					originLabel: submissionOriginLabel(submission),
					clientPortalLabel: submission.isClientVisible ? 'Visible' : 'Hidden',
					submittedBy: submissionCreatedByLabel(submission),
					submittedAt: formatDate(submission.createdAt),
					updatedAtLabel: formatDate(submission.updatedAt)
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
		router.push(`/submissions/${row.id}`);
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
			render: (row) =>
				row.clientId ? (
					<TableEntityLink href={`/clients/${row.clientId}`}>{row.client}</TableEntityLink>
				) : (
					row.client
				)
		},
		{ key: 'statusLabel', label: 'Status' },
		{ key: 'submittedBy', label: 'Submitted By' },
		{ key: 'submittedAt', label: 'Submitted At' },
		{ key: 'updatedAtLabel', label: 'Updated At', defaultVisible: false, getSortValue: (row) => row.updatedAt || '' },
		{
			key: 'originLabel',
			label: 'Origin',
			render: (row) => (
				<span
					className={
						row.originLabel === 'Web'
							? 'chip submission-origin-chip submission-origin-chip-web'
							: 'chip submission-origin-chip submission-origin-chip-recruiter'
					}
				>
					{row.originLabel}
				</span>
			)
		},
		{
			key: 'clientPortalLabel',
			label: 'Client Portal',
			defaultVisible: false,
			getSortValue: (row) => row.isClientVisible ? 'visible' : 'hidden',
			render: (row) => (
				<span className="chip">
					{row.clientPortalLabel}
				</span>
			)
		},
		{ key: 'recordId', label: 'Record ID', defaultVisible: false }
	];

	return (
		<section className="module-page">
			<header className="module-header module-header-list">
				<div>
					<h2>Submissions</h2>
				</div>
				<div className="module-header-actions">
					<Link
						href="/submissions/new"
						className="btn-link btn-link-icon"
						aria-label="New Submission"
						title="New Submission"
					>
						<Plus aria-hidden="true" className="btn-refresh-icon-svg" />
					</Link>
				</div>
			</header>

			<article className="panel">
				<h3>Submission List</h3>
					<div className="list-controls list-controls-three list-controls-with-columns">
					<input
						placeholder="Search candidate, job order, client, status, origin, submitter"
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
						<select value={submitterFilter} onChange={(e) => setSubmitterFilter(e.target.value)}>
							<option value="all">All Submitters</option>
						{submitterOptions.map((submitter) => (
							<option key={submitter} value={submitter}>
								{submitter}
							</option>
							))}
						</select>
						<TableColumnPicker tableKey="submissions" columns={columns} />
					</div>
					<EntityTable
						tableKey="submissions"
						columns={columns}
						rows={filteredRows}
						loading={loading}
						loadingLabel="Loading submissions"
					rowActions={[{ label: 'Open', onClick: onOpen }]}
				/>
			</article>
		</section>
	);
}
