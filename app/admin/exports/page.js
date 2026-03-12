'use client';

import Link from 'next/link';
import { useState } from 'react';
import AdminGate from '@/app/components/admin-gate';
import FormField from '@/app/components/form-field';
import { useToast } from '@/app/components/toast-provider';

export default function AdminExportsPage() {
	const toast = useToast();
	const [dataExporting, setDataExporting] = useState(false);
	const [exportOptions, setExportOptions] = useState({
		includeAuditLogs: false,
		includeApiErrorLogs: false,
		format: 'json',
		dateFrom: '',
		dateTo: ''
	});

	const exportButtonLabel = dataExporting
		? 'Exporting...'
		: exportOptions.format === 'zip'
			? 'Export ZIP Package'
			: exportOptions.format === 'ndjson'
				? 'Export NDJSON'
				: 'Export Data Snapshot';

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
			const objectUrl = URL.createObjectURL(blob);
			const headerFileName = res.headers.get('content-disposition') || '';
			const matchedFileName = headerFileName.match(/filename=\"?([^\"]+)\"?/i)?.[1];
			const extension = exportOptions.format === 'zip' ? 'zip' : exportOptions.format === 'ndjson' ? 'ndjson' : 'json';
			const fallbackName = `hire-gnome-data-export-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`;
			const downloadName = matchedFileName || fallbackName;
			const anchor = document.createElement('a');
			anchor.href = objectUrl;
			anchor.download = downloadName;
			document.body.appendChild(anchor);
			anchor.click();
			anchor.remove();
			URL.revokeObjectURL(objectUrl);
			toast.success('Data export downloaded.');
		} catch (error) {
			toast.error(error?.message || 'Failed to export data.');
		} finally {
			setDataExporting(false);
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

				<article className="panel panel-spacious panel-narrow">
					<section className="form-section">
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
			</section>
		</AdminGate>
	);
}
