'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Filter, Plus, X } from 'lucide-react';
import EntityTable from '@/app/components/entity-table';
import SavedListViews from '@/app/components/saved-list-views';
import SubmissionAdvancedSearchModal from '@/app/components/submission-advanced-search-modal';
import TableColumnPicker from '@/app/components/table-column-picker';
import TableEntityLink from '@/app/components/table-entity-link';
import useArchivedEntities from '@/app/hooks/use-archived-entities';
import { formatDateTimeAt } from '@/lib/date-format';
import { formatSelectValueLabel } from '@/lib/select-value-label';
import {
	evaluateSubmissionAdvancedCriteria,
	normalizeSubmissionAdvancedCriteria,
	summarizeSubmissionAdvancedCriterion
} from '@/lib/submission-advanced-search';
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
	const [advancedCriteria, setAdvancedCriteria] = useState([]);
	const [advancedSearchOpen, setAdvancedSearchOpen] = useState(false);
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

	const normalizedAdvancedCriteria = useMemo(
		() => normalizeSubmissionAdvancedCriteria(advancedCriteria),
		[advancedCriteria]
	);

	const quickFilteredRows = useMemo(() => {
		const q = query.trim().toLowerCase();
		return activeRows.filter((row) => {
			const matchesQuery =
				!q ||
				`${row.candidate} ${row.jobOrder} ${row.client} ${row.effectiveStatus} ${row.statusLabel} ${row.originLabel ?? ''} ${row.submittedBy ?? ''}`
					.toLowerCase()
					.includes(q);
			return matchesQuery;
		});
	}, [activeRows, query]);

	const filteredRows = useMemo(() => {
		return quickFilteredRows.filter((row) => evaluateSubmissionAdvancedCriteria(row, normalizedAdvancedCriteria));
	}, [normalizedAdvancedCriteria, quickFilteredRows]);

	const advancedCriteriaSummary = useMemo(
		() => normalizedAdvancedCriteria.map((criterion) => summarizeSubmissionAdvancedCriterion(criterion)).filter(Boolean),
		[normalizedAdvancedCriteria]
	);

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

	function applySavedViewState(nextState = {}) {
		setQuery(String(nextState.query ?? ''));
		setAdvancedCriteria(normalizeSubmissionAdvancedCriteria(nextState.advancedCriteria || []));
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
					<div className="list-controls submissions-list-controls">
					{advancedCriteriaSummary.length > 0 ? (
						<div className="submissions-search-token-field">
							<div className="submissions-search-token-field-chips" aria-label="Active advanced filters">
								{advancedCriteriaSummary.map((summary, index) => (
									<span key={`${summary}-${index}`} className="chip submissions-advanced-search-chip">
										<span>{summary}</span>
										<button
											type="button"
											className="submissions-advanced-search-chip-remove"
											onClick={() => removeAdvancedCriterion(index)}
											aria-label={`Remove ${summary}`}
											title={`Remove ${summary}`}
										>
											<X aria-hidden="true" />
										</button>
									</span>
								))}
								<input
									placeholder="Search within filtered submissions"
									value={query}
									onChange={(e) => setQuery(e.target.value)}
									aria-label="Search within advanced filtered submissions"
								/>
							</div>
						</div>
					) : (
						<input
							placeholder="Search candidate, job order, client, status, origin, submitter"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
						/>
					)}
						<div className="list-controls-toolbar-group submissions-list-controls-tools">
							<button
								type="button"
								className="table-toolbar-button submissions-advanced-search-toggle"
								onClick={() => setAdvancedSearchOpen(true)}
							>
								<Filter aria-hidden="true" />
								Advanced Search
								{advancedCriteriaSummary.length > 0 ? (
									<span className="submissions-advanced-search-count">{advancedCriteriaSummary.length}</span>
								) : null}
							</button>
							<SavedListViews
								listKey="submissions"
								columns={columns}
								defaultState={{ query: '', advancedCriteria: [] }}
								currentState={{ query, advancedCriteria: normalizedAdvancedCriteria }}
								onApplyState={applySavedViewState}
							/>
							<TableColumnPicker tableKey="submissions" columns={columns} />
						</div>
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
			<SubmissionAdvancedSearchModal
				open={advancedSearchOpen}
				criteria={normalizedAdvancedCriteria}
				statusOptions={statusOptions}
				submitterOptions={submitterOptions}
				onApply={(nextCriteria) => {
					setAdvancedCriteria(normalizeSubmissionAdvancedCriteria(nextCriteria));
					setAdvancedSearchOpen(false);
				}}
				onClose={() => setAdvancedSearchOpen(false)}
			/>
		</section>
	);
}
