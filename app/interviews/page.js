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
import { normalizeInterviewType } from '@/app/constants/interview-type-options';

function formatDateTime(value) {
	return formatDateTimeAt(value);
}

export default function InterviewsPage() {
	const router = useRouter();
	const [rows, setRows] = useState([]);
	const [loading, setLoading] = useState(false);
	const [query, setQuery] = useState('');
	const [typeFilter, setTypeFilter] = useState('all');
	const { archivedIdSet } = useArchivedEntities('INTERVIEW');

	const activeRows = useMemo(
		() => rows.filter((row) => !archivedIdSet.has(row.id)),
		[rows, archivedIdSet]
	);

	const typeOptions = useMemo(() => {
		return [...new Set(activeRows.map((row) => row.interviewMode).filter(Boolean))]
			.map((type) => ({
				value: type,
				label: activeRows.find((row) => row.interviewMode === type)?.interviewModeLabel || type
			}))
			.sort((a, b) => a.label.localeCompare(b.label));
	}, [activeRows]);

	const filteredRows = useMemo(() => {
		const q = query.trim().toLowerCase();
		return activeRows.filter((row) => {
			const matchesQuery =
				!q ||
				`${row.subject} ${row.candidate} ${row.jobOrder} ${row.client} ${row.interviewMode} ${row.interviewModeLabel}`
					.toLowerCase()
					.includes(q);
			const matchesType = typeFilter === 'all' || row.interviewMode === typeFilter;
			return matchesQuery && matchesType;
		});
	}, [activeRows, query, typeFilter]);

	async function load() {
		setLoading(true);
		try {
			const res = await fetch('/api/interviews');
			const data = await res.json();

			setRows(
				data.map((interview) => {
					return {
						...interview,
						candidate: interview.candidate
							? `${interview.candidate.firstName} ${interview.candidate.lastName}`
							: '-',
						candidateId: interview.candidate?.id || null,
						jobOrder: interview.jobOrder?.title || '-',
						jobOrderId: interview.jobOrder?.id || null,
						client: interview.jobOrder?.client?.name || '-',
						clientId: interview.jobOrder?.client?.id || null,
						interviewModeLabel: formatSelectValueLabel(normalizeInterviewType(interview.interviewMode)),
						statusLabel: formatSelectValueLabel(interview.status),
						startsAtLabel: formatDateTime(interview.startsAt),
						interviewerLabel: interview.interviewer || '-',
						locationLabel: interview.location || '-'
					};
				})
			);
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => {
		load();
	}, []);

	function onOpen(row) {
		router.push(`/interviews/${row.id}`);
	}

	const columns = [
		{ key: 'subject', label: 'Subject', defaultVisible: false },
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
		{ key: 'interviewModeLabel', label: 'Type' },
		{ key: 'statusLabel', label: 'Status', defaultVisible: false, getSortValue: (row) => row.status || '' },
		{ key: 'startsAtLabel', label: 'Starts At', defaultVisible: false, getSortValue: (row) => row.startsAt || '' },
		{ key: 'interviewerLabel', label: 'Interviewer', defaultVisible: false },
		{ key: 'locationLabel', label: 'Location', defaultVisible: false }
	];

	return (
		<section className="module-page">
			<header className="module-header module-header-list">
				<div>
					<h2>Interviews</h2>
				</div>
				<div className="module-header-actions">
					<Link
						href="/interviews/new"
						className="btn-link btn-link-icon"
						aria-label="New Interview"
						title="New Interview"
					>
						<Plus aria-hidden="true" className="btn-refresh-icon-svg" />
					</Link>
				</div>
			</header>

			<article className="panel">
				<h3>Interview List</h3>
					<div className="list-controls list-controls-two interview-list-controls list-controls-with-columns">
						<input
						placeholder="Search subject, candidate, client, job order"
						value={query}
						onChange={(e) => setQuery(e.target.value)}
					/>
						<select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
							<option value="all">All Types</option>
						{typeOptions.map((option) => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
							))}
						</select>
						<TableColumnPicker tableKey="interviews" columns={columns} />
					</div>
					<EntityTable
						tableKey="interviews"
						columns={columns}
						rows={filteredRows}
						loading={loading}
						loadingLabel="Loading interviews"
					rowActions={[{ label: 'Open', onClick: onOpen }]}
				/>
			</article>
		</section>
	);
}
