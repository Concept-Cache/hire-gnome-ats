'use client';

import Link from 'next/link';
import { useState } from 'react';
import AdminGate from '@/app/components/admin-gate';
import FormField from '@/app/components/form-field';
import { useToast } from '@/app/components/toast-provider';

const SOURCE_OPTIONS = [
	{ value: 'hire_gnome_export', label: 'Hire Gnome Export (.json / .ndjson / .zip)' },
	{ value: 'bullhorn_csv', label: 'Bullhorn CSV (.csv)' }
];

const BULLHORN_ENTITY_OPTIONS = [
	{ value: 'clients', label: 'Clients' },
	{ value: 'contacts', label: 'Contacts' },
	{ value: 'candidates', label: 'Candidates' },
	{ value: 'jobOrders', label: 'Job Orders' }
];

const BULLHORN_CSV_TEMPLATES = Object.freeze({
	clients: {
		headers: [
			'ID',
			'Name',
			'Industry',
			'Status',
			'Phone',
			'Address',
			'City',
			'State',
			'Zip',
			'Website',
			'Description'
		],
		sample: [
			'1001',
			'Acme Health Partners',
			'Healthcare',
			'Active',
			'(555) 410-2200',
			'400 Main Street',
			'Dallas',
			'TX',
			'75201',
			'https://acmehealth.example',
			'Regional healthcare network'
		]
	},
	contacts: {
		headers: [
			'ID',
			'First Name',
			'Last Name',
			'Email',
			'Mobile',
			'Title',
			'Department',
			'Source',
			'Address',
			'Zip',
			'Client Corporation ID',
			'Client Corporation'
		],
		sample: [
			'2001',
			'Jordan',
			'Parker',
			'jordan.parker@acmehealth.example',
			'(555) 410-2211',
			'Hiring Manager',
			'Nursing',
			'LinkedIn Outreach',
			'400 Main Street',
			'75201',
			'1001',
			'Acme Health Partners'
		]
	},
	candidates: {
		headers: [
			'ID',
			'First Name',
			'Last Name',
			'Email',
			'Mobile',
			'Phone',
			'Status',
			'Source',
			'Current Job Title',
			'Current Employer',
			'Years Experience',
			'Address',
			'City',
			'State',
			'Zip',
			'LinkedIn',
			'Website',
			'Skills',
			'Summary'
		],
		sample: [
			'3001',
			'Sophia',
			'Gray',
			'sophia.gray@example.com',
			'(555) 220-8899',
			'(555) 220-8800',
			'Qualified',
			'LinkedIn',
			'Nurse Case Manager',
			'Helix BioLabs',
			'8',
			'101 Cedar Avenue',
			'Austin',
			'TX',
			'78701',
			'https://linkedin.com/in/sophiagray',
			'https://portfolio.example.com/sophiagray',
			'Case Management;EMR;Patient Education',
			'Experienced healthcare candidate with strong care coordination background.'
		]
	},
	jobOrders: {
		headers: [
			'ID',
			'Title',
			'Status',
			'Employment Type',
			'Currency',
			'Salary Min',
			'Salary Max',
			'Openings',
			'Description',
			'Public Description',
			'Location',
			'City',
			'State',
			'Zip',
			'Publish To Career Site',
			'Client Corporation ID',
			'Client Corporation',
			'Contact ID',
			'Contact Email',
			'Contact Name'
		],
		sample: [
			'4001',
			'Nurse Case Manager',
			'Open',
			'Temporary - W2',
			'USD',
			'45',
			'60',
			'2',
			'Internal notes and requirements for recruiting team.',
			'Join a collaborative care team as a Nurse Case Manager.',
			'Client HQ',
			'Dallas',
			'TX',
			'75201',
			'true',
			'1001',
			'Acme Health Partners',
			'2001',
			'jordan.parker@acmehealth.example',
			'Jordan Parker'
		]
	}
});

function formatCount(value) {
	return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function toCsvValue(value) {
	const text = String(value ?? '');
	if (!text.includes(',') && !text.includes('"') && !text.includes('\n') && !text.includes('\r')) {
		return text;
	}
	return `"${text.replace(/"/g, '""')}"`;
}

export default function AdminImportsPage() {
	const toast = useToast();
	const [file, setFile] = useState(null);
	const [sourceType, setSourceType] = useState('hire_gnome_export');
	const [bullhornEntity, setBullhornEntity] = useState('clients');
	const [runningMode, setRunningMode] = useState('');
	const [preview, setPreview] = useState(null);
	const [result, setResult] = useState(null);

	const busy = runningMode === 'preview' || runningMode === 'apply';
	const isBullhorn = sourceType === 'bullhorn_csv';
	const fileAccept = isBullhorn
		? '.csv,text/csv'
		: '.json,.ndjson,.zip,application/json,application/x-ndjson,application/zip';

	function downloadBullhornTemplate() {
		const template = BULLHORN_CSV_TEMPLATES[bullhornEntity];
		if (!template) return;
		const csvLines = [template.headers, template.sample].map((row) =>
			row.map((value) => toCsvValue(value)).join(',')
		);
		const csvText = `${csvLines.join('\n')}\n`;
		const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' });
		const objectUrl = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = objectUrl;
		anchor.download = `bullhorn-${bullhornEntity}-template.csv`;
		document.body.appendChild(anchor);
		anchor.click();
		anchor.remove();
		URL.revokeObjectURL(objectUrl);
	}

	async function runImport(mode) {
		if (!file || busy) return;
		setRunningMode(mode);

		try {
			const formData = new FormData();
			formData.set('mode', mode);
			formData.set('sourceType', sourceType);
			if (isBullhorn) {
				formData.set('bullhornEntity', bullhornEntity);
			}
			formData.set('file', file);

			const res = await fetch('/api/admin/data-import', {
				method: 'POST',
				body: formData
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) {
				throw new Error(data.error || 'Import request failed.');
			}

			setPreview(data.preview || null);
			if (mode === 'apply') {
				setResult(data.result || null);
				toast.success('Import completed.');
			} else {
				toast.success('Import preview generated.');
			}
		} catch (error) {
			toast.error(error?.message || 'Import request failed.');
		} finally {
			setRunningMode('');
		}
	}

	return (
		<AdminGate>
			<section className="module-page">
				<header className="module-header">
					<div>
						<Link href="/admin" className="module-back-link" aria-label="Back to List">&larr; Back</Link>
						<h2>Data Import</h2>
						<p>Import core ATS entities from Hire Gnome exports or mapped Bullhorn CSV files.</p>
					</div>
				</header>

				<article className="panel panel-spacious panel-narrow">
					<section className="form-section">
						<FormField label="Source Type">
							<select
								value={sourceType}
								onChange={(event) => {
									setSourceType(event.target.value);
									setFile(null);
									setPreview(null);
									setResult(null);
								}}
								disabled={busy}
							>
								{SOURCE_OPTIONS.map((option) => (
									<option key={option.value} value={option.value}>
										{option.label}
									</option>
								))}
							</select>
						</FormField>

						{isBullhorn ? (
							<>
								<FormField
									label="Bullhorn CSV Profile"
									hint="Choose the entity represented by this CSV file."
								>
									<select
										value={bullhornEntity}
										onChange={(event) => {
											setBullhornEntity(event.target.value);
											setPreview(null);
											setResult(null);
										}}
										disabled={busy}
									>
										{BULLHORN_ENTITY_OPTIONS.map((option) => (
											<option key={option.value} value={option.value}>
												{option.label}
											</option>
										))}
									</select>
								</FormField>
								<div className="form-actions">
									<button type="button" className="btn-secondary" onClick={downloadBullhornTemplate} disabled={busy}>
										Download Template CSV
									</button>
								</div>
							</>
						) : null}

						<FormField
							label="Import File"
							hint={
								isBullhorn
									? 'Upload one Bullhorn CSV file at a time using the selected profile.'
									: 'Use files generated by Admin Data Export.'
							}
						>
							<input
								type="file"
								accept={fileAccept}
								onChange={(event) => {
									const nextFile = event.target.files?.[0] || null;
									setFile(nextFile);
									setPreview(null);
									setResult(null);
								}}
							/>
						</FormField>
						<div className="form-actions">
							<button type="button" className="btn-secondary" onClick={() => runImport('preview')} disabled={!file || busy}>
								{runningMode === 'preview' ? 'Previewing...' : 'Preview Import'}
							</button>
							<button type="button" onClick={() => runImport('apply')} disabled={!file || busy}>
								{runningMode === 'apply' ? 'Importing...' : 'Apply Import'}
							</button>
						</div>
							<p className="panel-subtext">
								Apply import creates/updates records and remaps relationships using IDs, record IDs, and name/email lookups.
							</p>
					</section>
				</article>

				{preview ? (
					<article className="panel panel-spacious panel-narrow">
						<h3>Preview</h3>
						<div className="info-list snapshot-grid snapshot-grid-six">
							<p><span>Clients</span><strong>{formatCount(preview.clients)}</strong></p>
							<p><span>Contacts</span><strong>{formatCount(preview.contacts)}</strong></p>
							<p><span>Candidates</span><strong>{formatCount(preview.candidates)}</strong></p>
							<p><span>Job Orders</span><strong>{formatCount(preview.jobOrders)}</strong></p>
							<p><span>Submissions</span><strong>{formatCount(preview.submissions)}</strong></p>
							<p><span>Interviews</span><strong>{formatCount(preview.interviews)}</strong></p>
						</div>
					</article>
				) : null}

				{result ? (
					<article className="panel panel-spacious panel-narrow">
						<h3>Import Result</h3>
						<div className="workspace-scroll-area">
							<ul className="workspace-list">
								{['clients', 'contacts', 'candidates', 'jobOrders', 'submissions', 'interviews', 'placements'].map((entity) => (
									<li key={entity} className="workspace-item">
										<div className="workspace-item-header">
											<strong>{entity}</strong>
											<span className="chip">Created {formatCount(result?.created?.[entity])}</span>
											<span className="chip">Updated {formatCount(result?.updated?.[entity])}</span>
											<span className="chip">Skipped {formatCount(result?.skipped?.[entity])}</span>
										</div>
									</li>
								))}
							</ul>
						</div>
						{Array.isArray(result?.errors) && result.errors.length > 0 ? (
							<>
								<hr />
								<h4>Warnings / Skips</h4>
								<div className="workspace-scroll-area">
									<ul className="workspace-list">
										{result.errors.map((message, index) => (
											<li key={`${message}-${index}`} className="workspace-item">
												<p>{message}</p>
											</li>
										))}
									</ul>
								</div>
							</>
						) : null}
					</article>
				) : null}
			</section>
		</AdminGate>
	);
}
