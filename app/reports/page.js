'use client';

import Link from 'next/link';
import { X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import LoadingIndicator from '@/app/components/loading-indicator';
import { useToast } from '@/app/components/toast-provider';

function toDateInputValue(date) {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

function defaultFilters() {
	const today = new Date();
	const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6, 0, 0, 0, 0);
	return {
		startDate: toDateInputValue(start),
		endDate: toDateInputValue(new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0, 0)),
		divisionId: '',
		ownerId: ''
	};
}

function buildQuery(filters) {
	const params = new URLSearchParams();
	if (filters.startDate) params.set('startDate', filters.startDate);
	if (filters.endDate) params.set('endDate', filters.endDate);
	if (filters.divisionId) params.set('divisionId', filters.divisionId);
	if (filters.ownerId) params.set('ownerId', filters.ownerId);
	return params.toString();
}

function buildDetailQuery(filters, selection) {
	const params = new URLSearchParams();
	if (filters.startDate) params.set('startDate', filters.startDate);
	if (filters.endDate) params.set('endDate', filters.endDate);
	if (filters.divisionId) params.set('divisionId', filters.divisionId);
	if (filters.ownerId) params.set('ownerId', filters.ownerId);
	params.set('group', selection.group);
	params.set('key', selection.key);
	if (selection.value) params.set('value', selection.value);
	return params.toString();
}

function sumSeries(series) {
	return (Array.isArray(series) ? series : []).reduce((total, item) => total + Number(item?.count || 0), 0);
}

function emptyReportState() {
	return {
		appliedFilters: defaultFilters(),
		scope: {
			role: 'RECRUITER',
			canFilterDivision: false,
			canFilterOwner: false,
			lockedToOwnData: false
		},
		filterOptions: {
			divisions: [],
			owners: []
		},
		summary: {
			candidatesAdded: 0,
			jobOrdersOpened: 0,
			submissionsCreated: 0,
			interviewsScheduled: 0,
			placementsCreated: 0,
			placementsAccepted: 0,
			openJobOrders: 0
		},
		pipeline: {
			candidates: [],
			jobOrders: [],
			submissions: [],
			placements: [],
			interviewTypes: []
		},
		trend: [],
		ownerPerformance: []
	};
}

function emptyDetailState() {
	return {
		title: '',
		rows: []
	};
}

function kpiCards(summary) {
	return [
		{ key: 'candidatesAdded', label: 'New Candidates', value: summary.candidatesAdded },
		{ key: 'jobOrdersOpened', label: 'New Job Orders', value: summary.jobOrdersOpened },
		{ key: 'submissionsCreated', label: 'New Submissions', value: summary.submissionsCreated },
		{ key: 'interviewsScheduled', label: 'New Interviews', value: summary.interviewsScheduled },
		{ key: 'placementsCreated', label: 'New Placements', value: summary.placementsCreated },
		{ key: 'placementsAccepted', label: 'Accepted', value: summary.placementsAccepted },
		{ key: 'openJobOrders', label: 'Open Job Orders', value: summary.openJobOrders }
	];
}

function PipelinePanel({ title, detailKey, series, total, onSelectDetail }) {
	return (
		<article className="panel panel-spacious">
			<div className="panel-header-row">
				<h3>{title}</h3>
				<button
					type="button"
					className="btn-secondary report-detail-button"
					onClick={() => onSelectDetail({ group: 'pipeline', key: detailKey, value: 'all', label: title })}
				>
					View All
				</button>
			</div>
			<div className="report-series-grid">
				{series.map((item) => (
					<button
						key={item.value}
						type="button"
						className="report-series-card report-detail-button"
						onClick={() =>
							onSelectDetail({
								group: 'pipeline',
								key: detailKey,
								value: item.value,
								label: `${title} - ${item.label}`
							})
						}
					>
						<p className="metric-label">{item.label}</p>
						<p className="report-series-value">{item.count}</p>
					</button>
				))}
			</div>
			<p className="report-panel-total">Total: {total}</p>
		</article>
	);
}

export default function ReportsPage() {
	const toast = useToast();
	const [filters, setFilters] = useState(defaultFilters);
	const [report, setReport] = useState(emptyReportState);
	const [detail, setDetail] = useState(emptyDetailState);
	const [detailSelection, setDetailSelection] = useState(null);
	const [loading, setLoading] = useState(true);
	const [applying, setApplying] = useState(false);
	const [exporting, setExporting] = useState(false);
	const [detailLoading, setDetailLoading] = useState(false);
	const [detailModalOpen, setDetailModalOpen] = useState(false);

	const summaryCards = useMemo(() => kpiCards(report.summary), [report.summary]);
	const trendRows = useMemo(() => {
		return Array.isArray(report.trend) ? report.trend : [];
	}, [report.trend]);
	const trendMax = useMemo(() => {
		return Math.max(1, ...(trendRows.map((item) => Number(item?.total || 0))));
	}, [trendRows]);

	async function loadDetail(nextSelection, nextFilters = filters) {
		setDetailLoading(true);
		setDetailSelection(nextSelection);
		setDetailModalOpen(true);
		try {
			const query = buildDetailQuery(nextFilters, nextSelection);
			const res = await fetch(`/api/reports/operational/details?${query}`, {
				cache: 'no-store'
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) {
				throw new Error(data?.error || 'Failed to load report detail.');
			}
			setDetail({
				title: data?.title || nextSelection.label || 'Report Detail',
				rows: Array.isArray(data?.rows) ? data.rows : []
			});
		} catch (error) {
			toast.error(error.message || 'Failed to load report detail.');
		} finally {
			setDetailLoading(false);
		}
	}

	useEffect(() => {
		if (!detailModalOpen) return undefined;

		function onKeyDown(event) {
			if (event.key === 'Escape') {
				setDetailModalOpen(false);
			}
		}

		document.addEventListener('keydown', onKeyDown);
		return () => {
			document.removeEventListener('keydown', onKeyDown);
		};
	}, [detailModalOpen]);

	async function load(nextFilters, { initial = false } = {}) {
		if (initial) {
			setLoading(true);
		} else {
			setApplying(true);
		}

		try {
			const query = buildQuery(nextFilters);
			const res = await fetch(`/api/reports/operational${query ? `?${query}` : ''}`, {
				cache: 'no-store'
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) {
				throw new Error(data?.error || 'Failed to load operational report.');
			}

			setReport({
				...emptyReportState(),
				...data
			});
			setFilters({
				startDate: data?.appliedFilters?.startDate || nextFilters.startDate,
				endDate: data?.appliedFilters?.endDate || nextFilters.endDate,
				divisionId: data?.appliedFilters?.divisionId ? String(data.appliedFilters.divisionId) : '',
				ownerId: data?.appliedFilters?.ownerId ? String(data.appliedFilters.ownerId) : ''
			});
		} catch (error) {
			toast.error(error.message || 'Failed to load operational report.');
		} finally {
			if (initial) {
				setLoading(false);
			} else {
				setApplying(false);
			}
		}
	}

	useEffect(() => {
		load(defaultFilters(), { initial: true });
	}, []);

	function onApply(event) {
		event.preventDefault();
		load(filters);
	}

	function onReset() {
		const next = defaultFilters();
		setFilters(next);
		load(next);
	}

	function onSelectDetail(selection) {
		loadDetail(selection, filters);
	}

	async function onExportExcel() {
		setExporting(true);
		try {
			const query = buildQuery(filters);
			const res = await fetch(`/api/reports/operational/export${query ? `?${query}` : ''}`, {
				cache: 'no-store'
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data?.error || 'Failed to export report.');
			}

			const blob = await res.blob();
			const objectUrl = window.URL.createObjectURL(blob);
			const link = document.createElement('a');
			const disposition = res.headers.get('content-disposition') || '';
			const fileNameMatch = disposition.match(/filename="?([^"]+)"?/i);
			link.href = objectUrl;
			link.download = fileNameMatch?.[1] || 'operational-report.xlsx';
			document.body.appendChild(link);
			link.click();
			link.remove();
			window.URL.revokeObjectURL(objectUrl);
		} catch (error) {
			toast.error(error.message || 'Failed to export report.');
		} finally {
			setExporting(false);
		}
	}

	return (
		<section className="module-page">
			<header className="module-header">
				<div>
					<h2>Operational Reporting</h2>
				</div>
			</header>

			<article className="panel panel-spacious">
				<div className="panel-header-row">
					<h3>Report Filters</h3>
					<div className="report-filter-actions">
						<button type="button" className="btn-secondary" onClick={onReset} disabled={loading || applying}>
							Reset
						</button>
						<button
							type="button"
							className="btn-secondary"
							onClick={onExportExcel}
							disabled={loading || applying || exporting || detailLoading}
						>
							{exporting ? 'Exporting...' : 'Export Excel'}
						</button>
						<button
							type="submit"
							form="operational-report-form"
							className="btn-link"
							disabled={loading || applying || detailLoading}
						>
							{applying ? 'Running...' : 'Run Report'}
						</button>
					</div>
				</div>
				<form id="operational-report-form" className="report-filter-form" onSubmit={onApply}>
					<div className="report-filter-grid">
						<label>
							<span>Start Date</span>
							<input
								type="date"
								value={filters.startDate}
								onChange={(event) => setFilters((current) => ({ ...current, startDate: event.target.value }))}
								required
							/>
						</label>
						<label>
							<span>End Date</span>
							<input
								type="date"
								value={filters.endDate}
								onChange={(event) => setFilters((current) => ({ ...current, endDate: event.target.value }))}
								required
							/>
						</label>
						<label>
							<span>Division</span>
							<select
								value={filters.divisionId}
								onChange={(event) =>
									setFilters((current) => ({
										...current,
										divisionId: event.target.value,
										ownerId: ''
									}))
								}
								disabled={!report.scope.canFilterDivision || loading || applying}
							>
								<option value="">All Divisions</option>
								{report.filterOptions.divisions.map((division) => (
									<option key={division.id} value={division.id}>
										{division.name}
									</option>
								))}
							</select>
						</label>
						<label>
							<span>Owner</span>
							<select
								value={filters.ownerId}
								onChange={(event) => setFilters((current) => ({ ...current, ownerId: event.target.value }))}
								disabled={!report.scope.canFilterOwner || loading || applying}
							>
								<option value="">{report.scope.lockedToOwnData ? 'Your Data Only' : 'All Owners'}</option>
								{report.filterOptions.owners.map((owner) => (
									<option key={owner.id} value={owner.id}>
										{owner.name}
									</option>
								))}
							</select>
						</label>
					</div>
				</form>
				<div className="report-scope-row">
					<span className="chip">Role: {report.scope.role.replace(/_/g, ' ')}</span>
					{report.scope.lockedToOwnData ? <span className="chip">Recruiter reporting is locked to your data</span> : null}
					{applying ? <span className="chip">Refreshing report...</span> : null}
				</div>
			</article>

			{loading ? (
				<article className="panel panel-spacious">
					<LoadingIndicator className="list-loading-indicator" label="Loading operational reporting" />
				</article>
			) : (
				<>
					<article className="panel panel-spacious">
						<h3>Summary</h3>
						<div className="report-summary-grid">
							{summaryCards.map((card) => (
								<button
									key={card.key}
									type="button"
									className="metric-card report-detail-button report-summary-card"
									onClick={() => onSelectDetail({ group: 'summary', key: card.key, value: '', label: card.label })}
								>
									<p className="metric-label">{card.label}</p>
									<p className="metric-value">{card.value}</p>
								</button>
							))}
						</div>
					</article>

					<article className="panel panel-spacious">
						<h3>Daily Activity Trend</h3>
						{trendRows.length === 0 ? <p className="panel-subtext">No records yet.</p> : null}
						{trendRows.length > 0 ? (
							<div className="report-trend-list">
								{trendRows.map((item) => (
									<div key={item.dateKey} className="report-trend-row">
										<div className="report-trend-date">
											<strong>{item.label}</strong>
											<p>{item.total} total</p>
										</div>
										<div className="report-trend-bar-track" aria-hidden="true">
											<div
												className="report-trend-bar-fill"
												style={{ width: `${Math.max(6, (Number(item.total || 0) / trendMax) * 100)}%` }}
											/>
										</div>
										<div className="report-trend-chips">
											<span className="chip report-trend-chip report-owner-chip-candidates">C {item.candidates}</span>
											<span className="chip report-trend-chip report-owner-chip-jobs">J {item.jobOrders}</span>
											<span className="chip report-trend-chip report-owner-chip-submissions">S {item.submissions}</span>
											<span className="chip report-trend-chip report-owner-chip-interviews">I {item.interviews}</span>
											<span className="chip report-trend-chip report-owner-chip-placements">P {item.placements}</span>
										</div>
									</div>
								))}
							</div>
						) : null}
					</article>

					<div className="module-grid report-pipeline-grid">
						<PipelinePanel
							title="Candidate Pipeline"
							detailKey="candidates"
							series={report.pipeline.candidates}
							total={sumSeries(report.pipeline.candidates)}
							onSelectDetail={onSelectDetail}
						/>
						<PipelinePanel
							title="Job Order Pipeline"
							detailKey="jobOrders"
							series={report.pipeline.jobOrders}
							total={sumSeries(report.pipeline.jobOrders)}
							onSelectDetail={onSelectDetail}
						/>
						<PipelinePanel
							title="Submission Pipeline"
							detailKey="submissions"
							series={report.pipeline.submissions}
							total={sumSeries(report.pipeline.submissions)}
							onSelectDetail={onSelectDetail}
						/>
						<PipelinePanel
							title="Placement Pipeline"
							detailKey="placements"
							series={report.pipeline.placements}
							total={sumSeries(report.pipeline.placements)}
							onSelectDetail={onSelectDetail}
						/>
					</div>

					<div className="module-grid report-detail-grid">
						<article className="panel panel-spacious">
							<div className="panel-header-row">
								<h3>Interview Mix</h3>
								<button
									type="button"
									className="btn-secondary report-detail-button"
									onClick={() =>
										onSelectDetail({
											group: 'pipeline',
											key: 'interviewTypes',
											value: 'all',
											label: 'All Interviews'
										})
									}
								>
									View All
								</button>
							</div>
							<div className="report-series-grid">
								{report.pipeline.interviewTypes.map((item) => (
									<button
										key={item.value}
										type="button"
										className="report-series-card report-detail-button"
										onClick={() =>
											onSelectDetail({
												group: 'pipeline',
												key: 'interviewTypes',
												value: item.value,
												label: `Interview Mix - ${item.label}`
											})
										}
									>
										<p className="metric-label">{item.label}</p>
										<p className="report-series-value">{item.count}</p>
									</button>
								))}
							</div>
						</article>
					</div>

					<article className="panel panel-spacious">
						<h3>Owner Performance</h3>
						{report.ownerPerformance.length === 0 ? <p className="panel-subtext">No records yet.</p> : null}
						{report.ownerPerformance.length > 0 ? (
							<div className="report-owner-list">
								{report.ownerPerformance.map((owner) => (
									<div key={owner.id} className="report-owner-row">
										<div className="report-owner-name">
											<strong>{owner.ownerName}</strong>
										</div>
										<div className="report-owner-chips">
											<span className="chip report-owner-chip report-owner-chip-candidates">Candidates {owner.candidatesAdded}</span>
											<span className="chip report-owner-chip report-owner-chip-jobs">Jobs {owner.jobOrdersOpened}</span>
											<span className="chip report-owner-chip report-owner-chip-submissions">Submissions {owner.submissionsCreated}</span>
											<span className="chip report-owner-chip report-owner-chip-interviews">Interviews {owner.interviewsScheduled}</span>
											<span className="chip report-owner-chip report-owner-chip-placements">Placements {owner.placementsCreated}</span>
											<span className="chip report-owner-chip report-owner-chip-accepted">Accepted {owner.placementsAccepted}</span>
										</div>
									</div>
								))}
							</div>
						) : null}
					</article>

				</>
			)}

			{detailModalOpen ? (
				<div className="confirm-overlay" onClick={() => setDetailModalOpen(false)}>
					<div
						className="confirm-dialog report-detail-modal"
						role="dialog"
						aria-modal="true"
						aria-labelledby="report-detail-modal-title"
						onClick={(event) => event.stopPropagation()}
					>
						<div className="report-detail-modal-head">
							<h3 id="report-detail-modal-title" className="confirm-title">
								{detail.title || 'Report Detail'}
							</h3>
							<button
								type="button"
								className="btn-secondary btn-link-icon report-detail-modal-close"
								onClick={() => setDetailModalOpen(false)}
								aria-label="Close report detail"
								title="Close"
							>
								<X aria-hidden="true" className="btn-refresh-icon-svg" />
							</button>
						</div>
						{detailLoading ? <LoadingIndicator className="list-loading-indicator" label="Loading report detail" /> : null}
						{!detailLoading && detail.rows.length === 0 ? <p className="panel-subtext">No matching records.</p> : null}
						{!detailLoading && detail.rows.length > 0 ? (
							<ul className="simple-list report-detail-list report-detail-list-modal">
								{detail.rows.map((row) => (
									<li key={`${row.href || row.id}`}>
										<div>
											<strong>
												{row.href ? <Link href={row.href}>{row.title || '-'}</Link> : row.title || '-'}
											</strong>
											<p>{row.subtitle || '-'}</p>
											<p className="simple-list-meta">{row.meta || '-'}</p>
										</div>
										<div className="simple-list-actions simple-list-indicators report-detail-chips">
											{row.chips.map((chip) => (
												<span key={chip} className="chip">
													{chip}
												</span>
											))}
										</div>
									</li>
								))}
							</ul>
						) : null}
					</div>
				</div>
			) : null}
		</section>
	);
}
