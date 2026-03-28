'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { CircleStop, Download, LoaderCircle, RefreshCw, Trash2, Waypoints } from 'lucide-react';
import AdminGate from '@/app/components/admin-gate';
import { useConfirmDialog } from '@/app/components/confirm-dialog';
import FormField from '@/app/components/form-field';
import { useToast } from '@/app/components/toast-provider';

function triggerBlobDownload(blob, fileName) {
	const objectUrl = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = objectUrl;
	anchor.download = fileName;
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	URL.revokeObjectURL(objectUrl);
}

function getDownloadName(response, fallbackName) {
	const headerFileName = response.headers.get('content-disposition') || '';
	return headerFileName.match(/filename=\"?([^\"]+)\"?/i)?.[1] || fallbackName;
}

function formatDateTime(value) {
	if (!value) return '';
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return '';
	return parsed.toLocaleString();
}

function isActiveJobStatus(status) {
	return ['queued', 'running', 'importing'].includes(String(status || '').toLowerCase());
}

function summarizeImportResult(result) {
	if (!result || typeof result !== 'object') return '';
	const created = Object.values(result.created || {}).reduce((sum, value) => sum + Number(value || 0), 0);
	const updated = Object.values(result.updated || {}).reduce((sum, value) => sum + Number(value || 0), 0);
	const skipped = Object.values(result.skipped || {}).reduce((sum, value) => sum + Number(value || 0), 0);
	return `Created ${created} • Updated ${updated} • Skipped ${skipped}`;
}

function summarizeCandidateFileDiagnostics(diagnostics) {
	if (!diagnostics || typeof diagnostics !== 'object') return '';
	return [
		`Files: considered ${Number(diagnostics.candidatesConsidered || 0)}`,
		`exported ${Number(diagnostics.exportedFiles || 0)}`,
		`no attachments ${Number(diagnostics.candidatesWithoutAttachments || 0)}`,
		`no allowed ${Number(diagnostics.candidatesWithoutAllowedAttachments || 0)}`,
		`download errors ${Number(diagnostics.skippedDownloadErrors || 0)}`
	].join(' • ');
}

export default function AdminExportsPage() {
	const router = useRouter();
	const toast = useToast();
	const { requestConfirm } = useConfirmDialog();
	const [activeTab, setActiveTab] = useState('hire_gnome');
	const [dataExporting, setDataExporting] = useState(false);
	const [bullhornExporting, setBullhornExporting] = useState(false);
	const [bullhornJobs, setBullhornJobs] = useState([]);
	const [bullhornJobsLoading, setBullhornJobsLoading] = useState(true);
	const [activeJobAction, setActiveJobAction] = useState('');
	const [operationFlagsLoaded, setOperationFlagsLoaded] = useState(false);
	const [operationFlags, setOperationFlags] = useState({
		bullhornOperationsEnabled: true,
		zohoRecruitOperationsEnabled: true,
		bullhornCredentialsConfigured: false
	});
	const [exportOptions, setExportOptions] = useState({
		includeAuditLogs: false,
		includeApiErrorLogs: false,
		format: 'json',
		dateFrom: '',
		dateTo: ''
	});
	const [bullhornOptions, setBullhornOptions] = useState({
		dateFrom: '',
		dateTo: '',
		sampleLimit: '10',
		includeFiles: false
	});

	const exportButtonLabel = dataExporting
		? 'Exporting...'
		: exportOptions.format === 'zip'
			? 'Export ZIP Package'
			: exportOptions.format === 'ndjson'
				? 'Export NDJSON'
				: 'Export Data Snapshot';

	const bullhornButtonLabel = bullhornExporting ? 'Starting Background Export...' : 'Start Background Export';

	const hasActiveBullhornJob = useMemo(
		() => bullhornJobs.some((job) => isActiveJobStatus(job.status)),
		[bullhornJobs]
	);
	const bullhornExportReady = operationFlags.bullhornOperationsEnabled && operationFlags.bullhornCredentialsConfigured;

	async function loadBullhornJobs({ silent = false } = {}) {
		if (!silent) {
			setBullhornJobsLoading(true);
		}
		try {
			const res = await fetch('/api/admin/bullhorn-export-jobs', { cache: 'no-store' });
			const data = await res.json().catch(() => ({}));
			if (!res.ok) {
				throw new Error(data.error || 'Failed to load Bullhorn export jobs.');
			}
			setBullhornJobs(Array.isArray(data.rows) ? data.rows : []);
		} catch (error) {
			if (!silent) {
				toast.error(error?.message || 'Failed to load Bullhorn export jobs.');
			}
		} finally {
			if (!silent) {
				setBullhornJobsLoading(false);
			}
		}
	}

	useEffect(() => {
		let cancelled = false;
		async function loadIntegrationFlags() {
			try {
				const res = await fetch('/api/system-settings', { cache: 'no-store' });
				const data = await res.json().catch(() => ({}));
				if (!res.ok || cancelled) return;
				setOperationFlags({
					bullhornOperationsEnabled: Boolean(data.bullhornOperationsEnabled),
					zohoRecruitOperationsEnabled: Boolean(data.zohoRecruitOperationsEnabled),
					bullhornCredentialsConfigured: Boolean(data.bullhornCredentialsConfigured)
				});
				if (!data.bullhornOperationsEnabled) {
					setActiveTab('hire_gnome');
				}
			} catch {
				if (!cancelled) {
					setOperationFlags({
						bullhornOperationsEnabled: true,
						zohoRecruitOperationsEnabled: true,
						bullhornCredentialsConfigured: false
					});
				}
			} finally {
				if (!cancelled) {
					setOperationFlagsLoaded(true);
				}
			}
		}

		loadIntegrationFlags();
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		if (!operationFlagsLoaded || !operationFlags.bullhornOperationsEnabled) return;
		loadBullhornJobs();
	}, [operationFlagsLoaded, operationFlags.bullhornOperationsEnabled]);

	useEffect(() => {
		const timer = window.setInterval(() => {
			loadBullhornJobs({ silent: true });
		}, hasActiveBullhornJob ? 4000 : 12000);
		return () => window.clearInterval(timer);
	}, [hasActiveBullhornJob]);

	async function onExportData() {
		if (dataExporting) return;
		setDataExporting(true);

		try {
			const normalizedFrom = exportOptions.dateFrom ? new Date(exportOptions.dateFrom) : null;
			const normalizedTo = exportOptions.dateTo ? new Date(exportOptions.dateTo) : null;
			if (normalizedFrom && Number.isNaN(normalizedFrom.getTime())) {
				throw new Error('Updated From is invalid.');
			}
			if (normalizedTo && Number.isNaN(normalizedTo.getTime())) {
				throw new Error('Updated To is invalid.');
			}
			if (normalizedFrom && normalizedTo && normalizedFrom.getTime() > normalizedTo.getTime()) {
				throw new Error('Updated From must be before Updated To.');
			}

			const query = new URLSearchParams({
				format: exportOptions.format,
				includeAuditLogs: exportOptions.includeAuditLogs ? 'true' : 'false',
				includeApiErrorLogs: exportOptions.includeApiErrorLogs ? 'true' : 'false'
			});
			if (normalizedFrom) {
				query.set('dateFrom', normalizedFrom.toISOString());
			}
			if (normalizedTo) {
				query.set('dateTo', normalizedTo.toISOString());
			}

			const res = await fetch(`/api/admin/data-export?${query.toString()}`, { cache: 'no-store' });
			if (!res.ok) {
				const payload = await res.json().catch(() => ({}));
				throw new Error(payload.error || 'Failed to export data.');
			}

			const blob = await res.blob();
			const extension = exportOptions.format === 'zip' ? 'zip' : exportOptions.format === 'ndjson' ? 'ndjson' : 'json';
			const fallbackName = `hire-gnome-data-export-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`;
			triggerBlobDownload(blob, getDownloadName(res, fallbackName));
			toast.success('Data export downloaded.');
		} catch (error) {
			toast.error(error?.message || 'Failed to export data.');
		} finally {
			setDataExporting(false);
		}
	}

	async function onExportBullhorn() {
		if (bullhornExporting) return;
		setBullhornExporting(true);

		try {
			const normalizedFrom = new Date(bullhornOptions.dateFrom);
			const normalizedTo = new Date(bullhornOptions.dateTo);
			if (Number.isNaN(normalizedFrom.getTime())) {
				throw new Error('Updated From is invalid.');
			}
			if (Number.isNaN(normalizedTo.getTime())) {
				throw new Error('Updated To is invalid.');
			}
			if (normalizedFrom.getTime() > normalizedTo.getTime()) {
				throw new Error('Updated From must be before Updated To.');
			}

			const res = await fetch('/api/admin/bullhorn-export-jobs', {
				method: 'POST',
				headers: {
					'content-type': 'application/json'
				},
				body: JSON.stringify({
					dateFrom: normalizedFrom.toISOString(),
					dateTo: normalizedTo.toISOString(),
					sampleLimit: bullhornOptions.sampleLimit,
					includeFiles: bullhornOptions.includeFiles
				})
			});
			if (!res.ok) {
				const payload = await res.json().catch(() => ({}));
				throw new Error(payload.error || 'Failed to start Bullhorn export.');
			}
			await loadBullhornJobs({ silent: true });
			toast.success('Bullhorn export started. You will see it here when it is ready.');
		} catch (error) {
			toast.error(error?.message || 'Failed to start Bullhorn export.');
		} finally {
			setBullhornExporting(false);
		}
	}

	async function onDownloadBullhornJob(job) {
		const actionKey = `download:${job.recordId}`;
		if (activeJobAction) return;
		setActiveJobAction(actionKey);
		try {
			const res = await fetch(`/api/admin/bullhorn-export-jobs/${job.recordId}/download`, { cache: 'no-store' });
			if (!res.ok) {
				const payload = await res.json().catch(() => ({}));
				throw new Error(payload.error || 'Failed to download Bullhorn export.');
			}
			const blob = await res.blob();
			triggerBlobDownload(blob, getDownloadName(res, job.fileName || `${job.recordId}.zip`));
		} catch (error) {
			toast.error(error?.message || 'Failed to download Bullhorn export.');
		} finally {
			setActiveJobAction('');
		}
	}

	function onImportBullhornJob(job) {
		if (!job?.recordId) return;
		const query = new URLSearchParams({
			sourceType: 'bullhorn_csv_zip',
			bullhornExportJob: job.recordId
		});
		router.push(`/admin/imports?${query.toString()}`);
	}

	async function onCancelBullhornJob(job) {
		const actionKey = `cancel:${job.recordId}`;
		if (activeJobAction) return;
		const confirmed = await requestConfirm({
			title: 'Cancel Export',
			message: `Cancel ${job.fileName || job.recordId}? The export will stop and any partial output will be discarded.`,
			confirmLabel: 'Cancel Export',
			cancelLabel: 'Keep Running',
			isDanger: true
		});
		if (!confirmed) return;
		setActiveJobAction(actionKey);
		try {
			const res = await fetch(`/api/admin/bullhorn-export-jobs/${job.recordId}`, {
				method: 'PATCH',
				headers: {
					'content-type': 'application/json'
				},
				body: JSON.stringify({ action: 'cancel' })
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) {
				throw new Error(data.error || 'Failed to cancel Bullhorn export.');
			}
			await loadBullhornJobs({ silent: true });
			toast.success('Bullhorn export cancelled.');
		} catch (error) {
			toast.error(error?.message || 'Failed to cancel Bullhorn export.');
		} finally {
			setActiveJobAction('');
		}
	}

	async function onDeleteBullhornJob(job) {
		const actionKey = `delete:${job.recordId}`;
		if (activeJobAction) return;
		const confirmed = await requestConfirm({
			title: 'Delete Export',
			message: `Delete ${job.fileName || job.recordId}? This removes the saved export ZIP and its job history.`,
			confirmLabel: 'Delete',
			cancelLabel: 'Keep',
			isDanger: true
		});
		if (!confirmed) return;
		setActiveJobAction(actionKey);
		try {
			const res = await fetch(`/api/admin/bullhorn-export-jobs/${job.recordId}`, {
				method: 'DELETE'
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) {
				throw new Error(data.error || 'Failed to delete Bullhorn export.');
			}
			await loadBullhornJobs({ silent: true });
			toast.success('Bullhorn export deleted.');
		} catch (error) {
			toast.error(error?.message || 'Failed to delete Bullhorn export.');
		} finally {
			setActiveJobAction('');
		}
	}

	return (
		<AdminGate>
			<section className="module-page">
				<header className="module-header">
					<div>
						<Link href="/admin" className="module-back-link" aria-label="Back to List">&larr; Back</Link>
						<h2>Data Export</h2>
						<p>Generate export packages for migration, analytics, and external system imports.</p>
					</div>
				</header>

				<div className="admin-settings-tabs exports-tabs" role="tablist" aria-label="Export types">
					<button
						type="button"
						role="tab"
						aria-selected={activeTab === 'hire_gnome'}
						className={`admin-settings-tab${activeTab === 'hire_gnome' ? ' is-active' : ''}`}
						onClick={() => setActiveTab('hire_gnome')}
					>
						Hire Gnome
					</button>
					{operationFlags.bullhornOperationsEnabled ? (
						<button
							type="button"
							role="tab"
							aria-selected={activeTab === 'bullhorn'}
							className={`admin-settings-tab${activeTab === 'bullhorn' ? ' is-active' : ''}`}
							onClick={() => setActiveTab('bullhorn')}
						>
							Bullhorn
						</button>
					) : null}
				</div>

				{activeTab === 'hire_gnome' ? (
					<article className="panel panel-spacious panel-narrow">
						<section className="form-section">
							<div className="exports-section-head">
								<h3>Hire Gnome Export</h3>
								<p className="panel-subtext exports-section-intro">
									Generate a clean snapshot of your Hire Gnome data for migration, backup, or analysis.
								</p>
							</div>
							<FormField label="Export Format">
								<select
									value={exportOptions.format}
									onChange={(event) =>
										setExportOptions((current) => ({
											...current,
											format: event.target.value
										}))
									}
								>
									<option value="json">JSON Snapshot (single file)</option>
									<option value="ndjson">NDJSON Stream (record lines)</option>
									<option value="zip">ZIP Package (JSON per entity)</option>
								</select>
							</FormField>
							<div className="form-grid-2">
								<FormField label="Updated From">
									<input
										type="datetime-local"
										value={exportOptions.dateFrom}
										onChange={(event) =>
											setExportOptions((current) => ({
												...current,
												dateFrom: event.target.value
											}))
										}
									/>
								</FormField>
								<FormField label="Updated To">
									<input
										type="datetime-local"
										value={exportOptions.dateTo}
										onChange={(event) =>
											setExportOptions((current) => ({
												...current,
												dateTo: event.target.value
											}))
										}
									/>
								</FormField>
							</div>
							<p className="panel-subtext">
								Leave date range blank for a full export. Date filters use `updatedAt` first, then `createdAt`.
							</p>
							<p className="panel-subtext">
								Exports include `customFieldDefinitions` so custom schema moves with record data.
							</p>
							<label className="switch-field">
								<input
									type="checkbox"
									className="switch-input"
									checked={exportOptions.includeAuditLogs}
									onChange={(event) =>
										setExportOptions((current) => ({
											...current,
											includeAuditLogs: event.target.checked
										}))
									}
								/>
								<span className="switch-track" aria-hidden="true">
									<span className="switch-thumb" />
								</span>
								<span className="switch-copy">
									<span className="switch-label">Include Audit Trail</span>
									<span className="switch-hint">Exports `auditLogs` with before/after payloads.</span>
								</span>
							</label>
							<label className="switch-field">
								<input
									type="checkbox"
									className="switch-input"
									checked={exportOptions.includeApiErrorLogs}
									onChange={(event) =>
										setExportOptions((current) => ({
											...current,
											includeApiErrorLogs: event.target.checked
										}))
									}
								/>
								<span className="switch-track" aria-hidden="true">
									<span className="switch-thumb" />
								</span>
								<span className="switch-copy">
									<span className="switch-label">Include API Error Logs</span>
									<span className="switch-hint">Exports runtime error history for troubleshooting.</span>
								</span>
							</label>
							<div className="form-actions">
								<button type="button" onClick={onExportData} disabled={dataExporting}>
									{exportButtonLabel}
								</button>
							</div>
						</section>
					</article>
				) : operationFlags.bullhornOperationsEnabled ? (
					<>
						<article className="panel panel-spacious panel-narrow">
							<section className="form-section">
								<div className="exports-section-head">
									<h3>Bullhorn Export</h3>
									<p className="panel-subtext exports-section-intro">
										Queue a Bullhorn export job for a date window, then download the ready ZIP or import it directly when it finishes.
									</p>
								</div>
								<div className="form-grid-3">
									<FormField label="Updated From">
										<input
											type="datetime-local"
											value={bullhornOptions.dateFrom}
											onChange={(event) =>
												setBullhornOptions((current) => ({
													...current,
													dateFrom: event.target.value
												}))
											}
										/>
									</FormField>
									<FormField label="Updated To">
										<input
											type="datetime-local"
											value={bullhornOptions.dateTo}
											onChange={(event) =>
												setBullhornOptions((current) => ({
													...current,
													dateTo: event.target.value
												}))
											}
										/>
									</FormField>
									<FormField label="Sample Limit Per Entity">
										<input
											type="number"
											min="1"
											max="100"
											step="1"
											value={bullhornOptions.sampleLimit}
											onChange={(event) =>
												setBullhornOptions((current) => ({
													...current,
													sampleLimit: event.target.value
												}))
											}
										/>
									</FormField>
								</div>
								<label className="switch-field">
									<input
										type="checkbox"
										className="switch-input"
										checked={bullhornOptions.includeFiles}
										onChange={(event) =>
											setBullhornOptions((current) => ({
												...current,
												includeFiles: event.target.checked
											}))
										}
									/>
									<span className="switch-track" aria-hidden="true">
										<span className="switch-thumb" />
									</span>
									<span className="switch-copy">
										<span className="switch-label">Include Candidate Files</span>
										<span className="switch-hint">Includes one best candidate resume/file per exported candidate. This makes jobs take longer.</span>
									</span>
								</label>
								<p className="panel-subtext">
									Exports Bullhorn entities created or updated in the selected window, then expands upstream dependencies so the batch stays importable.
								</p>
								<p className="panel-subtext exports-section-footnote">
									Uses the Bullhorn credentials saved in Platform Settings. The sample limit applies to changed Bullhorn rows per entity before dependency expansion. The export runs in the background and can be downloaded or imported when ready.
								</p>
								<div className="form-actions">
									<button
										type="button"
										onClick={onExportBullhorn}
										disabled={bullhornExporting || !bullhornExportReady}
									>
										{bullhornButtonLabel}
									</button>
								</div>
								{!operationFlags.bullhornCredentialsConfigured ? (
									<p className="panel-subtext">
										Save Bullhorn username, password, client ID, and client secret in <strong>Admin Area &gt; System Settings &gt; Platform Settings</strong> before starting a background export.
									</p>
								) : null}
							</section>
						</article>

						<article className="panel panel-spacious panel-narrow">
							<section className="form-section">
								<div className="simple-list-toolbar exports-jobs-toolbar">
									<div className="exports-section-head">
										<h3>Bullhorn Export Jobs</h3>
										<p className="panel-subtext">Completed jobs can be downloaded or opened in the import preview flow. Active jobs refresh automatically.</p>
									</div>
									<button
										type="button"
										className="row-action-icon exports-job-action"
										onClick={() => loadBullhornJobs()}
										disabled={bullhornJobsLoading}
										aria-label="Refresh export jobs"
										title="Refresh Export Jobs"
									>
										{bullhornJobsLoading ? (
											<LoaderCircle aria-hidden="true" className="row-action-icon-spinner" />
										) : (
											<RefreshCw aria-hidden="true" />
										)}
									</button>
								</div>
								{bullhornJobsLoading && bullhornJobs.length === 0 ? (
									<p className="panel-subtext">Loading export jobs...</p>
								) : null}
								{!bullhornJobsLoading && bullhornJobs.length === 0 ? (
									<p className="panel-subtext">No Bullhorn export jobs yet.</p>
								) : null}
								{bullhornJobs.length > 0 ? (
									<ul className="exports-jobs-list">
										{bullhornJobs.map((job) => {
											const counts = job.rowCounts || {};
											const canDownload = Boolean(job.fileName) && ['completed', 'imported', 'importing'].includes(job.status);
											const canImport = Boolean(job.fileName) && ['completed', 'imported'].includes(job.status);
											const canCancel = ['queued', 'running'].includes(String(job.status || '').toLowerCase());
											const canDelete = !['queued', 'running', 'importing'].includes(String(job.status || '').toLowerCase());
											const statusLabel = String(job.status || '').replace(/_/g, ' ');
											const candidateFileDiagnostics = job.diagnostics?.candidateFiles || null;
											return (
												<li key={job.recordId} className="exports-job-card">
													<div className="exports-job-main">
														<div className="exports-job-header">
															<div>
																<strong>{job.fileName || `Bullhorn export ${formatDateTime(job.createdAt)}`}</strong>
																<p className="exports-job-meta">
																	<span className={`chip exports-job-status exports-job-status-${String(job.status || '').toLowerCase()}`}>
																		{statusLabel}
																	</span>
																	{job.requestedByUser ? `Requested by ${job.requestedByUser.firstName} ${job.requestedByUser.lastName}` : ''}
																</p>
															</div>
															<div className="exports-job-actions">
																{canCancel ? (
																	<button
																		type="button"
																		className="row-action-icon exports-job-action exports-job-action-warning"
																		onClick={() => onCancelBullhornJob(job)}
																		disabled={activeJobAction !== '' || bullhornJobsLoading}
																		aria-label="Cancel export"
																		title="Cancel Export"
																	>
																		{activeJobAction === `cancel:${job.recordId}` ? (
																			<LoaderCircle aria-hidden="true" className="row-action-icon-spinner" />
																		) : (
																			<CircleStop aria-hidden="true" />
																		)}
																	</button>
																) : null}
																{canDownload ? (
																	<button
																		type="button"
																		className="row-action-icon exports-job-action"
																		onClick={() => onDownloadBullhornJob(job)}
																		disabled={activeJobAction !== '' || bullhornJobsLoading}
																		aria-label="Download ZIP"
																		title="Download ZIP"
																	>
																		{activeJobAction === `download:${job.recordId}` ? (
																			<LoaderCircle aria-hidden="true" className="row-action-icon-spinner" />
																		) : (
																			<Download aria-hidden="true" />
																		)}
																	</button>
																) : null}
																{canImport ? (
																	<button
																		type="button"
																		className="row-action-icon exports-job-action"
																		onClick={() => onImportBullhornJob(job)}
																		disabled={bullhornJobsLoading}
																		aria-label={job.importedAt ? 'Open in import again' : 'Open in import'}
																		title={job.importedAt ? 'Open In Import Again' : 'Open In Import'}
																	>
																		<Waypoints aria-hidden="true" />
																	</button>
																) : null}
																{canDelete ? (
																	<button
																		type="button"
																		className="row-action-icon exports-job-action exports-job-action-danger"
																		onClick={() => onDeleteBullhornJob(job)}
																		disabled={activeJobAction !== '' || bullhornJobsLoading}
																		aria-label="Delete export"
																		title="Delete Export"
																	>
																		{activeJobAction === `delete:${job.recordId}` ? (
																			<LoaderCircle aria-hidden="true" className="row-action-icon-spinner" />
																		) : (
																			<Trash2 aria-hidden="true" />
																		)}
																	</button>
																) : null}
															</div>
														</div>
														<p className="exports-job-meta">
															Window {formatDateTime(job.dateFrom)} to {formatDateTime(job.dateTo)}
															{job.sampleLimit ? ` • Sample limit ${job.sampleLimit}` : ''}
															{job.includeFiles ? ' • Files included' : ''}
														</p>
														<div className="import-result-card-metrics exports-job-counts">
															<span className="chip import-result-chip import-result-chip-create">Clients {Number(counts.clients || 0)}</span>
															<span className="chip import-result-chip import-result-chip-create">Contacts {Number(counts.contacts || 0)}</span>
															<span className="chip import-result-chip import-result-chip-create">Candidates {Number(counts.candidates || 0)}</span>
															<span className="chip import-result-chip import-result-chip-create">Jobs {Number(counts.jobOrders || 0)}</span>
															<span className="chip import-result-chip import-result-chip-create">Submissions {Number(counts.submissions || 0)}</span>
															<span className="chip import-result-chip import-result-chip-create">Interviews {Number(counts.interviews || 0)}</span>
															<span className="chip import-result-chip import-result-chip-create">Placements {Number(counts.placements || 0)}</span>
														</div>
														{job.includeFiles && candidateFileDiagnostics ? (
															<>
																<p className="simple-list-meta exports-job-file-diagnostics">
																	{summarizeCandidateFileDiagnostics(candidateFileDiagnostics)}
																</p>
																{Array.isArray(candidateFileDiagnostics.sampleReasons) && candidateFileDiagnostics.sampleReasons.length > 0 ? (
																	<ul className="exports-job-file-diagnostic-samples">
																		{candidateFileDiagnostics.sampleReasons.map((reason, index) => (
																			<li key={`${job.recordId}-diag-${index}`}>{reason}</li>
																		))}
																	</ul>
																) : null}
															</>
														) : null}
														{job.importResult ? <p className="simple-list-meta exports-job-import-summary">Import: {summarizeImportResult(job.importResult)}</p> : null}
														{job.errorMessage ? <p className="simple-list-meta exports-job-error">Error: {job.errorMessage}</p> : null}
													</div>
												</li>
											);
										})}
									</ul>
								) : null}
							</section>
						</article>
					</>
				) : (
					<article className="panel panel-spacious panel-narrow">
						<section className="form-section">
							<h3>Bullhorn Export</h3>
							<p className="panel-subtext exports-section-intro">
								Bullhorn operations are disabled in the current environment.
							</p>
						</section>
					</article>
				)}
			</section>
		</AdminGate>
	);
}
