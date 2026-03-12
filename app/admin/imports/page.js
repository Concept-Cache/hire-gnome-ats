'use client';

import Link from 'next/link';
import { useState } from 'react';
import AdminGate from '@/app/components/admin-gate';
import FormField from '@/app/components/form-field';
import { useToast } from '@/app/components/toast-provider';

const SOURCE_OPTIONS = [
	{ value: 'hire_gnome_export', label: 'Hire Gnome Export (.json / .ndjson / .zip)' },
	{ value: 'bullhorn_csv', label: 'Bullhorn CSV (.csv)' },
	{ value: 'zoho_recruit_csv', label: 'Zoho Recruit CSV (.csv)' }
];

const CSV_ENTITY_OPTIONS = [
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

const ZOHO_CSV_TEMPLATES = Object.freeze({
	clients: {
		headers: [
			'ID',
			'Account Name',
			'Industry',
			'Status',
			'Phone',
			'Billing Street',
			'Billing City',
			'Billing State',
			'Billing Code',
			'Website',
			'Description'
		],
		sample: [
			'5001',
			'Pioneer Clinical Group',
			'Healthcare',
			'Active',
			'(555) 338-4400',
			'900 Market Street',
			'Denver',
			'CO',
			'80202',
			'https://pioneerclinical.example',
			'Regional clinical staffing client'
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
			'Mailing Street',
			'Mailing Zip',
			'Account ID',
			'Account Name'
		],
		sample: [
			'6001',
			'Elena',
			'Brooks',
			'elena.brooks@pioneerclinical.example',
			'(555) 338-4411',
			'Director of Talent',
			'Human Resources',
			'LinkedIn Outreach',
			'900 Market Street',
			'80202',
			'5001',
			'Pioneer Clinical Group'
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
			'Candidate Status',
			'Source',
			'Current Job Title',
			'Current Employer',
			'Years of Experience',
			'Street',
			'City',
			'State',
			'Zip Code',
			'LinkedIn',
			'Website',
			'Skill Set',
			'Resume'
		],
		sample: [
			'7001',
			'Marcus',
			'Reed',
			'marcus.reed@example.com',
			'(555) 771-2299',
			'(555) 771-2200',
			'Qualified',
			'Referral',
			'Senior Recruiter',
			'Northline Talent',
			'11',
			'55 Lakeview Dr',
			'Charlotte',
			'NC',
			'28202',
			'https://linkedin.com/in/marcusreed',
			'https://marcusreed.example',
			'Sourcing;Boolean Search;Account Management',
			'Experienced recruiter focused on healthcare and professional placements.'
		]
	},
	jobOrders: {
		headers: [
			'ID',
			'Posting Title',
			'Job Opening Status',
			'Job Type',
			'Currency',
			'Salary From',
			'Salary To',
			'Number of Positions',
			'Job Description',
			'Public Description',
			'Location',
			'City',
			'State',
			'Zip',
			'Publish To Career Site',
			'Account ID',
			'Account Name',
			'Contact ID',
			'Contact Email',
			'Contact Name'
		],
		sample: [
			'8001',
			'Clinical Recruiter',
			'Open',
			'Permanent',
			'USD',
			'90000',
			'120000',
			'1',
			'Internal role requirements and delivery expectations.',
			'Join our team as a Clinical Recruiter supporting regional growth.',
			'Denver HQ',
			'Denver',
			'CO',
			'80202',
			'true',
			'5001',
			'Pioneer Clinical Group',
			'6001',
			'elena.brooks@pioneerclinical.example',
			'Elena Brooks'
		]
	}
});

function formatCount(value) {
	return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function importEntityLabel(entity) {
	const labels = {
		customFieldDefinitions: 'Custom Fields',
		clients: 'Clients',
		contacts: 'Contacts',
		candidates: 'Candidates',
		jobOrders: 'Job Orders',
		submissions: 'Submissions',
		interviews: 'Interviews',
		placements: 'Placements'
	};
	return labels[entity] || entity;
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
	const [zohoEntity, setZohoEntity] = useState('clients');
	const [runningMode, setRunningMode] = useState('');
	const [preview, setPreview] = useState(null);
	const [result, setResult] = useState(null);

	const busy = runningMode === 'preview' || runningMode === 'apply';
	const isBullhorn = sourceType === 'bullhorn_csv';
	const isZoho = sourceType === 'zoho_recruit_csv';
	const isCsvSource = isBullhorn || isZoho;
	const selectedCsvEntity = isBullhorn ? bullhornEntity : zohoEntity;
	const fileAccept = isCsvSource
		? '.csv,text/csv'
		: '.json,.ndjson,.zip,application/json,application/x-ndjson,application/zip';

	function downloadCsvTemplate() {
		const templateSet = isBullhorn ? BULLHORN_CSV_TEMPLATES : ZOHO_CSV_TEMPLATES;
		const template = templateSet[selectedCsvEntity];
		if (!template) return;
		const csvLines = [template.headers, template.sample].map((row) =>
			row.map((value) => toCsvValue(value)).join(',')
		);
		const csvText = `${csvLines.join('\n')}\n`;
		const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' });
		const objectUrl = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = objectUrl;
		anchor.download = `${isBullhorn ? 'bullhorn' : 'zoho-recruit'}-${selectedCsvEntity}-template.csv`;
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
			if (isZoho) {
				formData.set('zohoEntity', zohoEntity);
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
						<p>Import core ATS entities and custom field definitions from Hire Gnome exports, Bullhorn CSV, or Zoho Recruit CSV files.</p>
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

						{isCsvSource ? (
							<>
								<FormField
									label={isBullhorn ? 'Bullhorn CSV Profile' : 'Zoho Recruit CSV Profile'}
									hint="Choose the entity represented by this CSV file."
								>
									<select
										value={selectedCsvEntity}
										onChange={(event) => {
											if (isBullhorn) {
												setBullhornEntity(event.target.value);
											} else {
												setZohoEntity(event.target.value);
											}
											setPreview(null);
											setResult(null);
										}}
										disabled={busy}
									>
										{CSV_ENTITY_OPTIONS.map((option) => (
											<option key={option.value} value={option.value}>
												{option.label}
											</option>
										))}
									</select>
								</FormField>
								<div className="form-actions">
									<button type="button" className="btn-secondary" onClick={downloadCsvTemplate} disabled={busy}>
										Download Template CSV
									</button>
								</div>
							</>
						) : null}

						<FormField
							label="Import File"
							hint={
								isCsvSource
									? `Upload one ${isBullhorn ? 'Bullhorn' : 'Zoho Recruit'} CSV file at a time using the selected profile.`
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
							<p><span>Custom Fields</span><strong>{formatCount(preview.customFieldDefinitions)}</strong></p>
							<p><span>Clients</span><strong>{formatCount(preview.clients)}</strong></p>
							<p><span>Contacts</span><strong>{formatCount(preview.contacts)}</strong></p>
							<p><span>Candidates</span><strong>{formatCount(preview.candidates)}</strong></p>
							<p><span>Job Orders</span><strong>{formatCount(preview.jobOrders)}</strong></p>
							<p><span>Submissions</span><strong>{formatCount(preview.submissions)}</strong></p>
							<p><span>Interviews</span><strong>{formatCount(preview.interviews)}</strong></p>
							<p><span>Placements</span><strong>{formatCount(preview.placements)}</strong></p>
						</div>
					</article>
				) : null}

				{result ? (
					<article className="panel panel-spacious panel-narrow">
						<h3>Import Result</h3>
						<div className="workspace-scroll-area">
							<ul className="workspace-list">
								{['customFieldDefinitions', 'clients', 'contacts', 'candidates', 'jobOrders', 'submissions', 'interviews', 'placements'].map((entity) => (
									<li key={entity} className="workspace-item">
										<div className="workspace-item-header">
											<strong>{importEntityLabel(entity)}</strong>
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
