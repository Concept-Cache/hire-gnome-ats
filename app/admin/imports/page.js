'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import JSZip from 'jszip';
import { ArrowLeft, Check, Download, Eraser, FileSpreadsheet, Plus, Trash2, WandSparkles } from 'lucide-react';
import AdminGate from '@/app/components/admin-gate';
import FormField from '@/app/components/form-field';
import { useToast } from '@/app/components/toast-provider';
import useUnsavedChangesGuard from '@/app/hooks/use-unsaved-changes-guard';
import { normalizeHeaderKey, parseCsvText } from '@/lib/data-import-csv';
import {
	buildGenericCsvTemplate,
	GENERIC_IMPORT_ENTITY_OPTIONS,
	getGenericImportProfile,
	suggestGenericImportMapping
} from '@/lib/generic-import-profiles';

const SOURCE_OPTIONS = [
	{ value: 'hire_gnome_export', label: 'Hire Gnome Export' },
	{ value: 'generic_csv_zip', label: 'Generic CSV Batch ZIP' },
	{ value: 'generic_csv_manual', label: 'Generic CSV Multi-File' },
	{ value: 'bullhorn_csv_zip', label: 'Bullhorn Batch ZIP' },
	{ value: 'bullhorn_csv_manual', label: 'Bullhorn Multi-File' },
	{ value: 'zoho_recruit_zip', label: 'Zoho Recruit Batch ZIP' },
	{ value: 'zoho_recruit_manual', label: 'Zoho Recruit Multi-File' }
];

function filterSourceOptions(options, flags) {
	return options.filter((option) => {
		if (String(option.value || '').startsWith('bullhorn_')) {
			return flags.bullhornOperationsEnabled;
		}
		if (String(option.value || '').startsWith('zoho_recruit_')) {
			return flags.zohoRecruitOperationsEnabled;
		}
		return true;
	});
}

const IMPORT_SAMPLE_DOWNLOADS = Object.freeze({
	hire_gnome_export: {
		href: '/import-samples/hire-gnome-export-sample.zip',
		label: 'Sample'
	},
	generic_csv_zip: {
		href: '/import-samples/generic-migration-batch-sample.zip',
		label: 'Sample'
	},
	generic_csv_manual: {
		href: '/import-samples/generic-migration-batch-sample.zip',
		label: 'Sample'
	},
	bullhorn_csv_zip: {
		href: '/import-samples/bullhorn-batch-sample.zip',
		label: 'Sample'
	},
	bullhorn_csv_manual: {
		href: '/import-samples/bullhorn-batch-sample.zip',
		label: 'Sample'
	},
	zoho_recruit_zip: {
		href: '/import-samples/zoho-recruit-batch-sample.zip',
		label: 'Sample'
	},
	zoho_recruit_manual: {
		href: '/import-samples/zoho-recruit-batch-sample.zip',
		label: 'Sample'
	}
});

const BULLHORN_CANDIDATE_FILES_MANIFEST_NAMES = ['12-candidate-files.csv', '08-candidate-files.csv'];

const CSV_ENTITY_OPTIONS = [
	{ value: 'clients', label: 'Clients' },
	{ value: 'contacts', label: 'Contacts' },
	{ value: 'candidates', label: 'Candidates' },
	{ value: 'jobOrders', label: 'Job Orders' }
];

const BULLHORN_CSV_ENTITY_OPTIONS = [
	{ value: 'customFieldDefinitions', label: 'Custom Fields' },
	{ value: 'clients', label: 'Clients' },
	{ value: 'contacts', label: 'Contacts' },
	{ value: 'contactNotes', label: 'Contact Notes' },
	{ value: 'candidates', label: 'Candidates' },
	{ value: 'candidateNotes', label: 'Candidate Notes' },
	{ value: 'candidateEducations', label: 'Candidate Education' },
	{ value: 'candidateWorkExperiences', label: 'Candidate Work History' },
	{ value: 'jobOrders', label: 'Job Orders' },
	{ value: 'submissions', label: 'Submissions' },
	{ value: 'interviews', label: 'Interviews' },
	{ value: 'placements', label: 'Placements' }
];

const ZOHO_CSV_ENTITY_OPTIONS = [
	{ value: 'clients', label: 'Clients' },
	{ value: 'contacts', label: 'Contacts' },
	{ value: 'candidates', label: 'Candidates' },
	{ value: 'jobOrders', label: 'Job Orders' },
	{ value: 'submissions', label: 'Submissions' },
	{ value: 'interviews', label: 'Interviews' },
	{ value: 'placements', label: 'Placements' }
];

const BULLHORN_CSV_TEMPLATES = Object.freeze({
	customFieldDefinitions: {
		headers: [
			'Module Key',
			'Field Key',
			'Label',
			'Field Type',
			'Select Options',
			'Help Text',
			'Bullhorn Field Name'
		],
		sample: [
			'candidates',
			'graduation_date',
			'Graduation Date',
			'date',
			'',
			'Bullhorn field customDate1',
			'customDate1'
		]
	},
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
	contactNotes: {
		headers: [
			'ID',
			'Record ID',
			'Contact ID',
			'Contact Email',
			'Content',
			'Note Type',
			'Created At',
			'Updated At'
		],
		sample: [
			'2101',
			'BH-ContactNote-2101',
			'2001',
			'jordan.parker@acmehealth.example',
			'Shared updated hiring-team availability and feedback timing expectations.',
			'comment',
			'2026-03-08T15:10:00Z',
			'2026-03-08T15:10:00Z'
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
	candidateNotes: {
		headers: [
			'ID',
			'Record ID',
			'Candidate ID',
			'Candidate Email',
			'Content',
			'Note Type',
			'Created At',
			'Updated At'
		],
		sample: [
			'3101',
			'BH-CandidateNote-3101',
			'3001',
			'sophia.gray@example.com',
			'Candidate confirmed updated availability and renewed interest in Dallas roles.',
			'comment',
			'2026-03-09T14:00:00Z',
			'2026-03-09T14:00:00Z'
		]
	},
	candidateEducations: {
		headers: [
			'ID',
			'Record ID',
			'Candidate ID',
			'Candidate Email',
			'School Name',
			'Degree',
			'Field Of Study',
			'Start Date',
			'End Date',
			'Is Current',
			'Description'
		],
		sample: [
			'3201',
			'BH-CandidateEducation-3201',
			'3001',
			'sophia.gray@example.com',
			'University of Texas',
			'BSN',
			'Nursing',
			'2012-08-20',
			'2016-05-15',
			'false',
			'Bachelor of Science in Nursing.'
		]
	},
	candidateWorkExperiences: {
		headers: [
			'ID',
			'Record ID',
			'Candidate ID',
			'Candidate Email',
			'Company Name',
			'Title',
			'Location',
			'Start Date',
			'End Date',
			'Is Current',
			'Description'
		],
		sample: [
			'3301',
			'BH-CandidateWorkExperience-3301',
			'3001',
			'sophia.gray@example.com',
			'Helix BioLabs',
			'Nurse Case Manager',
			'Austin, TX',
			'2021-02-01',
			'2026-03-01',
			'false',
			'Led care coordination across high-volume patient caseloads.'
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
	},
	submissions: {
		headers: [
			'ID',
			'Candidate ID',
			'Candidate Email',
			'Job Order ID',
			'Job Order Title',
			'Status',
			'Notes'
		],
		sample: [
			'5001',
			'3001',
			'sophia.gray@example.com',
			'4001',
			'Nurse Case Manager',
			'Submitted',
			'Submitted with updated resume and availability.'
		]
	},
	interviews: {
		headers: [
			'ID',
			'Candidate ID',
			'Candidate Email',
			'Job Order ID',
			'Job Order Title',
			'Subject',
			'Status',
			'Interview Mode',
			'Interviewer',
			'Interviewer Email',
			'Starts At',
			'Ends At',
			'Location',
			'Video Link'
		],
		sample: [
			'6001',
			'3001',
			'sophia.gray@example.com',
			'4001',
			'Nurse Case Manager',
			'Initial Screening',
			'Scheduled',
			'Phone',
			'Jordan Parker',
			'jordan.parker@acmehealth.example',
			'2026-03-10T14:00:00Z',
			'2026-03-10T14:30:00Z',
			'Phone',
			'https://meet.example.com/abc123'
		]
	},
	placements: {
		headers: [
			'ID',
			'Candidate ID',
			'Candidate Email',
			'Job Order ID',
			'Job Order Title',
			'Submission ID',
			'Status',
			'Placement Type',
			'Compensation Type',
			'Currency',
			'Offered On',
			'Expected Join Date',
			'End Date',
			'Notes',
			'Hourly RT Pay Rate',
			'Hourly RT Bill Rate',
			'Hourly OT Pay Rate',
			'Hourly OT Bill Rate'
		],
		sample: [
			'7001',
			'3001',
			'sophia.gray@example.com',
			'4001',
			'Nurse Case Manager',
			'5001',
			'Accepted',
			'Temp',
			'Hourly',
			'USD',
			'2026-03-11',
			'2026-03-18',
			'2026-09-18',
			'Accepted temp placement.',
			'50',
			'100',
			'75',
			'150'
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
	},
	submissions: {
		headers: [
			'ID',
			'Candidate ID',
			'Candidate Email',
			'Job Opening ID',
			'Posting Title',
			'Submission Status',
			'Notes'
		],
		sample: [
			'9001',
			'7001',
			'marcus.reed@example.com',
			'8001',
			'Clinical Recruiter',
			'Submitted',
			'Submitted with updated resume and compensation targets.'
		]
	},
	interviews: {
		headers: [
			'ID',
			'Candidate ID',
			'Candidate Email',
			'Job Opening ID',
			'Posting Title',
			'Subject',
			'Interview Status',
			'Interview Type',
			'Interviewer',
			'Interviewer Email',
			'Start Time',
			'End Time',
			'Location',
			'Meeting Link'
		],
		sample: [
			'9101',
			'7002',
			'amelia.bailey@example.com',
			'8003',
			'Senior Product Manager',
			'Product Leadership Interview',
			'Completed',
			'Video',
			'Tara Shah',
			'tara.shah@northpeakproduct.example',
			'2026-03-15T16:00:00Z',
			'2026-03-15T16:45:00Z',
			'Zoom',
			'https://meet.example.com/prod-123'
		]
	},
	placements: {
		headers: [
			'ID',
			'Candidate ID',
			'Candidate Email',
			'Job Opening ID',
			'Posting Title',
			'Submission ID',
			'Placement Status',
			'Placement Type',
			'Rate Type',
			'Currency',
			'Offer Date',
			'Start Date',
			'End Date',
			'Notes',
			'RT Pay Rate',
			'RT Bill Rate',
			'OT Pay Rate',
			'OT Bill Rate'
		],
		sample: [
			'9201',
			'7003',
			'sophia.gray@example.com',
			'8001',
			'Clinical Recruiter',
			'9003',
			'Accepted',
			'Temp',
			'Hourly',
			'USD',
			'2026-03-11',
			'2026-03-18',
			'2026-09-18',
			'Accepted temp placement.',
			'50',
			'100',
			'75',
			'150'
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
		contactNotes: 'Contact Notes',
		candidates: 'Candidates',
		candidateNotes: 'Candidate Notes',
		candidateEducations: 'Candidate Education',
		candidateWorkExperiences: 'Candidate Work History',
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

function uniqueFieldOptions(fields) {
	return fields.map((field) => ({
		value: field.key,
		label: field.label,
		required: Boolean(field.required)
	}));
}

const GENERIC_IMPORT_ORDER = ['clients', 'contacts', 'candidates', 'jobOrders', 'submissions', 'interviews', 'placements'];
const BULLHORN_IMPORT_ORDER = [
	'customFieldDefinitions',
	'clients',
	'contacts',
	'contactNotes',
	'candidates',
	'candidateNotes',
	'candidateEducations',
	'candidateWorkExperiences',
	'jobOrders',
	'submissions',
	'interviews',
	'placements'
];
const ZOHO_IMPORT_ORDER = ['clients', 'contacts', 'candidates', 'jobOrders', 'submissions', 'interviews', 'placements'];
const PREVIEW_ENTITY_KEYS = [
	'customFieldDefinitions',
	'clients',
	'contacts',
	'contactNotes',
	'candidates',
	'candidateNotes',
	'candidateEducations',
	'candidateWorkExperiences',
	'jobOrders',
	'submissions',
	'interviews',
	'placements'
];
const GENERIC_FILENAME_ENTITY_ALIASES = Object.freeze({
	customFieldDefinitions: ['customfielddefinitions', 'customfields', 'customfield', 'fielddefinitions'],
	clients: ['clients', 'client', 'accounts', 'account', 'companies', 'company'],
	contacts: ['contacts', 'contact', 'hiringmanagers', 'hiringmanager'],
	contactNotes: ['contactnotes', 'contactnote'],
	candidates: ['candidates', 'candidate', 'talent'],
	candidateNotes: ['candidatenotes', 'candidatenote'],
	candidateEducations: ['candidateeducations', 'candidateeducation', 'educations', 'education'],
	candidateWorkExperiences: [
		'candidateworkexperiences',
		'candidateworkexperience',
		'candidateworkhistory',
		'candidateworkhistories',
		'workexperience',
		'workexperiences',
		'workhistory',
		'workhistories'
	],
	jobOrders: ['joborders', 'joborder', 'jobs', 'job', 'openings', 'requisitions', 'reqs'],
	submissions: ['submissions', 'submission', 'submittals', 'submittal'],
	interviews: ['interviews', 'interview'],
	placements: ['placements', 'placement', 'offers', 'offer']
});

function createGenericBatchEntry(entity = 'clients') {
	return {
		id: `${entity}-${Math.random().toString(36).slice(2, 10)}`,
		entity,
		file: null,
		headers: [],
		sampleRows: [],
		mapping: {}
	};
}

function createBullhornBatchEntry(entity = 'clients') {
	return {
		id: `${entity}-${Math.random().toString(36).slice(2, 10)}`,
		entity,
		file: null,
		headers: [],
		sampleRows: []
	};
}

function createZohoBatchEntry(entity = 'clients') {
	return {
		id: `${entity}-${Math.random().toString(36).slice(2, 10)}`,
		entity,
		file: null,
		headers: [],
		sampleRows: []
	};
}

function getImportSampleDownload(sourceType) {
	return IMPORT_SAMPLE_DOWNLOADS[sourceType] || null;
}

function getImportApplyHelperText({
	isGenericCsv,
	isBullhornBatch,
	isZohoBatch
}) {
	if (isGenericCsv) {
		return 'Apply import creates/updates records and remaps relationships using IDs, external IDs, record IDs, and name/email lookups. Generic CSV migration batches run in dependency order automatically.';
	}
	if (isBullhornBatch) {
		return 'Apply import creates/updates records and resolves Bullhorn relationships in dependency order so upstream clients, contacts, candidates, and jobs are created before dependent records.';
	}
	if (isZohoBatch) {
		return 'Apply import creates/updates records and resolves Zoho Recruit relationships in dependency order so upstream clients, contacts, candidates, and jobs are created before dependent records.';
	}
	return 'Apply import creates/updates records and remaps relationships using IDs, external IDs, record IDs, and name/email lookups.';
}

function mappedFieldCountForEntry(entry) {
	return Object.values(entry?.mapping || {}).filter(Boolean).length;
}

function missingRequiredFieldsForEntry(entry) {
	const profile = getGenericImportProfile(entry?.entity);
	return (profile?.fields || [])
		.filter((field) => field.required)
		.filter((field) => !Object.values(entry?.mapping || {}).includes(field.key));
}

function inferGenericEntityFromFilename(fileName) {
	const normalizedFileName = String(fileName || '')
		.toLowerCase()
		.replace(/\.csv$/i, '')
		.replace(/[^a-z0-9]+/g, '');
	if (!normalizedFileName) return null;
	for (const entityKey of GENERIC_IMPORT_ORDER) {
		const aliases = GENERIC_FILENAME_ENTITY_ALIASES[entityKey] || [];
		if (aliases.some((alias) => normalizedFileName.includes(alias))) {
			return entityKey;
		}
	}
	return null;
}

function inferGenericEntityFromHeaders(headers) {
	let bestEntity = null;
	let bestScore = -1;
	let bestRequiredHits = -1;
	for (const entityKey of GENERIC_IMPORT_ORDER) {
		const profile = getGenericImportProfile(entityKey);
		const suggested = suggestGenericImportMapping(entityKey, headers);
		const score = Object.keys(suggested).length;
		const requiredHits = (profile?.fields || [])
			.filter((field) => field.required)
			.filter((field) => Object.values(suggested).includes(field.key)).length;
		if (requiredHits > bestRequiredHits || (requiredHits === bestRequiredHits && score > bestScore)) {
			bestEntity = entityKey;
			bestRequiredHits = requiredHits;
			bestScore = score;
		}
	}
	return bestEntity || 'clients';
}

function inferBullhornEntityFromFilename(fileName) {
	const normalizedFileName = String(fileName || '')
		.toLowerCase()
		.replace(/\.csv$/i, '')
		.replace(/[^a-z0-9]+/g, '');
	if (!normalizedFileName) return null;
	for (const entityKey of BULLHORN_IMPORT_ORDER) {
		const aliases = GENERIC_FILENAME_ENTITY_ALIASES[entityKey] || [];
		if (aliases.some((alias) => normalizedFileName.includes(alias))) {
			return entityKey;
		}
	}
	return null;
}

function inferBullhornEntityFromHeaders(headers) {
	const normalizedHeaders = new Set((headers || []).map((header) => header.key));
	let bestEntity = null;
	let bestScore = -1;
	for (const entityKey of BULLHORN_IMPORT_ORDER) {
		const template = BULLHORN_CSV_TEMPLATES[entityKey];
		if (!template) continue;
		const score = template.headers
			.map((header) => header.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim())
			.filter(Boolean)
			.map((header) => header.replace(/\s+/g, '_'))
			.filter((headerKey) => normalizedHeaders.has(headerKey)).length;
		if (score > bestScore) {
			bestEntity = entityKey;
			bestScore = score;
		}
	}
	return bestEntity || 'clients';
}

function inferZohoEntityFromFilename(fileName) {
	const normalizedFileName = String(fileName || '')
		.toLowerCase()
		.replace(/\.csv$/i, '')
		.replace(/[^a-z0-9]+/g, '');
	if (!normalizedFileName) return null;
	for (const entityKey of ZOHO_IMPORT_ORDER) {
		const aliases = GENERIC_FILENAME_ENTITY_ALIASES[entityKey] || [];
		if (aliases.some((alias) => normalizedFileName.includes(alias))) {
			return entityKey;
		}
	}
	return null;
}

function inferZohoEntityFromHeaders(headers) {
	const normalizedHeaders = new Set((headers || []).map((header) => header.key));
	let bestEntity = null;
	let bestScore = -1;
	for (const entityKey of ZOHO_IMPORT_ORDER) {
		const template = ZOHO_CSV_TEMPLATES[entityKey];
		if (!template) continue;
		const score = template.headers
			.map((header) => header.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim())
			.filter(Boolean)
			.map((header) => header.replace(/\s+/g, '_'))
			.filter((headerKey) => normalizedHeaders.has(headerKey)).length;
		if (score > bestScore) {
			bestEntity = entityKey;
			bestScore = score;
		}
	}
	return bestEntity || 'clients';
}

function getVisiblePreviewEntityKeys(preview, result) {
	const visible = PREVIEW_ENTITY_KEYS.filter((entityKey) => {
		if (formatCount(preview?.details?.[entityKey]?.incoming) > 0) return true;
		if ((formatCount(result?.created?.[entityKey]) + formatCount(result?.updated?.[entityKey]) + formatCount(result?.skipped?.[entityKey])) > 0) {
			return true;
		}
		return false;
	});
	return visible.length > 0 ? visible : PREVIEW_ENTITY_KEYS.slice(0, 8);
}

function firstPreviewEntityKey(preview) {
	for (const entityKey of PREVIEW_ENTITY_KEYS) {
		if (Number(preview?.details?.[entityKey]?.incoming || 0) > 0) {
			return entityKey;
		}
	}
	return PREVIEW_ENTITY_KEYS[0];
}

function firstResultEntityKey(result) {
	for (const entityKey of PREVIEW_ENTITY_KEYS) {
		const details = result?.details?.[entityKey];
		if (
			Number(details?.incoming || 0) > 0 ||
			Number(details?.create || 0) > 0 ||
			Number(details?.update || 0) > 0 ||
			Number(details?.skip || 0) > 0 ||
			(details?.rows || []).length > 0
		) {
			return entityKey;
		}
	}
	return PREVIEW_ENTITY_KEYS[0];
}

export default function AdminImportsPage() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const toast = useToast();
	const previewSectionRef = useRef(null);
	const mappingSectionRef = useRef(null);
	const shouldScrollToMappingRef = useRef(false);
	const handledBullhornExportJobRef = useRef('');
	const [loadedBullhornExportJobId, setLoadedBullhornExportJobId] = useState('');
	const [operationFlags, setOperationFlags] = useState({
		bullhornOperationsEnabled: true,
		zohoRecruitOperationsEnabled: true
	});
	const [file, setFile] = useState(null);
	const [sourceType, setSourceType] = useState('hire_gnome_export');
	const [genericBatchEntries, setGenericBatchEntries] = useState(() => [createGenericBatchEntry()]);
	const [activeBatchEntryId, setActiveBatchEntryId] = useState(null);
	const [bullhornBatchEntries, setBullhornBatchEntries] = useState(() => [createBullhornBatchEntry()]);
	const [activeBullhornBatchEntryId, setActiveBullhornBatchEntryId] = useState(null);
	const [bullhornZipFile, setBullhornZipFile] = useState(null);
	const [bullhornCandidateAttachmentEntries, setBullhornCandidateAttachmentEntries] = useState([]);
	const [zohoBatchEntries, setZohoBatchEntries] = useState(() => [createZohoBatchEntry()]);
	const [activeZohoBatchEntryId, setActiveZohoBatchEntryId] = useState(null);
	const [bullhornEntity, setBullhornEntity] = useState('clients');
	const [zohoEntity, setZohoEntity] = useState('clients');
	const [runningMode, setRunningMode] = useState('');
	const [importView, setImportView] = useState('mapping');
	const [preview, setPreview] = useState(null);
	const [previewEntityTab, setPreviewEntityTab] = useState(PREVIEW_ENTITY_KEYS[0]);
	const [result, setResult] = useState(null);
	const [resultEntityTab, setResultEntityTab] = useState(PREVIEW_ENTITY_KEYS[0]);

	const busy = runningMode === 'preview' || runningMode === 'apply';
	const isGenericCsv = sourceType === 'generic_csv' || sourceType === 'generic_csv_manual' || sourceType === 'generic_csv_zip';
	const isGenericCsvManual = sourceType === 'generic_csv_manual' || sourceType === 'generic_csv';
	const isGenericCsvZip = sourceType === 'generic_csv_zip';
	const isBullhorn = sourceType === 'bullhorn_csv' || sourceType === 'bullhorn_csv_manual' || sourceType === 'bullhorn_csv_zip';
	const isBullhornManual = sourceType === 'bullhorn_csv_manual' || sourceType === 'bullhorn_csv';
	const isBullhornZip = sourceType === 'bullhorn_csv_zip';
	const isBullhornBatch = isBullhornManual || isBullhornZip;
	const isZoho = sourceType === 'zoho_recruit_csv' || sourceType === 'zoho_recruit_manual' || sourceType === 'zoho_recruit_zip';
	const isZohoManual = sourceType === 'zoho_recruit_manual' || sourceType === 'zoho_recruit_csv';
	const isZohoZip = sourceType === 'zoho_recruit_zip';
	const isZohoBatch = isZohoManual || isZohoZip;
	const isCsvSource = isGenericCsv || isBullhorn || isZoho;
	const selectedCsvEntity = isBullhorn ? bullhornEntity : zohoEntity;
	const fileAccept = isCsvSource
		? '.csv,text/csv'
		: '.json,.ndjson,.zip,application/json,application/x-ndjson,application/zip';
	const activeGenericEntries = genericBatchEntries.filter((entry) => entry.file);
	const activeBatchEntry =
		genericBatchEntries.find((entry) => entry.id === activeBatchEntryId) ||
		genericBatchEntries[0] ||
		null;
	const activeBullhornBatchEntries = bullhornBatchEntries.filter((entry) => entry.file);
	const activeBullhornBatchEntry =
		bullhornBatchEntries.find((entry) => entry.id === activeBullhornBatchEntryId) ||
		bullhornBatchEntries[0] ||
		null;
	const activeZohoBatchEntries = zohoBatchEntries.filter((entry) => entry.file);
	const activeZohoBatchEntry =
		zohoBatchEntries.find((entry) => entry.id === activeZohoBatchEntryId) ||
		zohoBatchEntries[0] ||
		null;
	const sampleDownload = getImportSampleDownload(sourceType);
	const visiblePreviewEntityKeys = useMemo(
		() => getVisiblePreviewEntityKeys(preview, result),
		[preview, result]
	);
	const visibleSourceOptions = filterSourceOptions(SOURCE_OPTIONS, operationFlags);
	const importApplyHelperText = getImportApplyHelperText({
		isGenericCsv,
		isBullhornBatch,
		isZohoBatch
	});
	const readyBatchEntryCount = activeGenericEntries.filter(
		(entry) => mappedFieldCountForEntry(entry) > 0 && missingRequiredFieldsForEntry(entry).length <= 0
	).length;
	const incompleteBatchEntryCount = activeGenericEntries.length - readyBatchEntryCount;
	const missingBatchFileCount = genericBatchEntries.filter((entry) => !entry.file).length;
	const genericBatchReady =
		activeGenericEntries.length > 0 &&
		activeGenericEntries.every((entry) => mappedFieldCountForEntry(entry) > 0 && missingRequiredFieldsForEntry(entry).length <= 0);
	const readyBullhornBatchEntryCount = activeBullhornBatchEntries.length;
	const missingBullhornBatchFileCount = bullhornBatchEntries.filter((entry) => !entry.file).length;
	const bullhornBatchReady = activeBullhornBatchEntries.length > 0 && activeBullhornBatchEntries.every((entry) => entry.file && entry.entity);
	const readyZohoBatchEntryCount = activeZohoBatchEntries.length;
	const missingZohoBatchFileCount = zohoBatchEntries.filter((entry) => !entry.file).length;
	const zohoBatchReady = activeZohoBatchEntries.length > 0 && activeZohoBatchEntries.every((entry) => entry.file && entry.entity);
	const hasImportInProgress =
		(!result && Boolean(file)) ||
		(!result && activeGenericEntries.length > 0) ||
		(!result && activeBullhornBatchEntries.length > 0) ||
		(!result && activeZohoBatchEntries.length > 0) ||
		(!result && Boolean(preview));
	const importDraftState = {
		sourceType,
		fileName: file?.name || '',
		genericBatchEntries: genericBatchEntries.map((entry) => ({
			id: entry.id,
			entity: entry.entity,
			fileName: entry.file?.name || '',
			mapping: entry.mapping
		})),
		bullhornBatchEntries: bullhornBatchEntries.map((entry) => ({
			id: entry.id,
			entity: entry.entity,
			fileName: entry.file?.name || ''
		})),
		bullhornCandidateAttachmentCount: bullhornCandidateAttachmentEntries.length,
		zohoBatchEntries: zohoBatchEntries.map((entry) => ({
			id: entry.id,
			entity: entry.entity,
			fileName: entry.file?.name || ''
		})),
		importView,
		hasPreview: Boolean(preview),
		hasResult: Boolean(result)
	};
	const { markAsClean } = useUnsavedChangesGuard(importDraftState, {
		enabled: hasImportInProgress,
		enableNativeBeforeUnload: true,
		message: 'You have an import in progress. Leave this page and discard the current import setup?'
	});

	function switchSourceType(nextSourceType) {
		setSourceType(nextSourceType);
		setLoadedBullhornExportJobId('');
		setFile(null);
		setBullhornZipFile(null);
		setBullhornCandidateAttachmentEntries([]);
		setPreview(null);
		setImportView('mapping');
		setPreviewEntityTab(PREVIEW_ENTITY_KEYS[0]);
		setResultEntityTab(PREVIEW_ENTITY_KEYS[0]);
		setResult(null);
		const nextEntry = createGenericBatchEntry();
		setGenericBatchEntries([nextEntry]);
		setActiveBatchEntryId(nextEntry.id);
		const nextBullhornEntry = createBullhornBatchEntry();
		setBullhornBatchEntries([nextBullhornEntry]);
		setActiveBullhornBatchEntryId(nextBullhornEntry.id);
		const nextZohoEntry = createZohoBatchEntry();
		setZohoBatchEntries([nextZohoEntry]);
		setActiveZohoBatchEntryId(nextZohoEntry.id);
	}

	useEffect(() => {
		if (importView !== 'preview' || !preview || !previewSectionRef.current) return;
		previewSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}, [importView, preview]);

	useEffect(() => {
		if (visiblePreviewEntityKeys.includes(previewEntityTab)) return;
		setPreviewEntityTab(visiblePreviewEntityKeys[0] || PREVIEW_ENTITY_KEYS[0]);
	}, [previewEntityTab, visiblePreviewEntityKeys]);

	useEffect(() => {
		if (visiblePreviewEntityKeys.includes(resultEntityTab)) return;
		setResultEntityTab(visiblePreviewEntityKeys[0] || PREVIEW_ENTITY_KEYS[0]);
	}, [resultEntityTab, visiblePreviewEntityKeys]);

	useEffect(() => {
		if (!shouldScrollToMappingRef.current || importView !== 'mapping' || !mappingSectionRef.current) return;
		shouldScrollToMappingRef.current = false;
		mappingSectionRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}, [activeBatchEntryId, activeBullhornBatchEntryId, activeZohoBatchEntryId, importView]);

	useEffect(() => {
		let cancelled = false;
		async function loadOperationFlags() {
			try {
				const res = await fetch('/api/system-settings', { cache: 'no-store' });
				const data = await res.json().catch(() => ({}));
				if (!res.ok || cancelled) return;
				const nextFlags = {
					bullhornOperationsEnabled: Boolean(data.bullhornOperationsEnabled),
					zohoRecruitOperationsEnabled: Boolean(data.zohoRecruitOperationsEnabled)
				};
				setOperationFlags(nextFlags);
			} catch {
				if (!cancelled) {
					setOperationFlags({
						bullhornOperationsEnabled: true,
						zohoRecruitOperationsEnabled: true
					});
				}
			}
		}
		loadOperationFlags();
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		if (!operationFlags.bullhornOperationsEnabled && String(sourceType || '').startsWith('bullhorn_')) {
			switchSourceType('hire_gnome_export');
			return;
		}
		if (!operationFlags.zohoRecruitOperationsEnabled && String(sourceType || '').startsWith('zoho_recruit_')) {
			switchSourceType('hire_gnome_export');
		}
	}, [operationFlags, sourceType]);

	useEffect(() => {
		const requestedSourceType = searchParams.get('sourceType');
		const bullhornExportJobId = searchParams.get('bullhornExportJob');
		if (!bullhornExportJobId) return;
		if (!operationFlags.bullhornOperationsEnabled) return;

		if (requestedSourceType === 'bullhorn_csv_zip' && sourceType !== 'bullhorn_csv_zip') {
			switchSourceType('bullhorn_csv_zip');
			return;
		}

		if (sourceType !== 'bullhorn_csv_zip') return;
		if (handledBullhornExportJobRef.current === bullhornExportJobId) return;
		handledBullhornExportJobRef.current = bullhornExportJobId;

		let cancelled = false;

		async function loadBullhornExportJobIntoImport() {
			try {
				const res = await fetch(`/api/admin/bullhorn-export-jobs/${bullhornExportJobId}/download`, {
					cache: 'no-store'
				});
				if (!res.ok) {
					const payload = await res.json().catch(() => ({}));
					throw new Error(payload.error || 'Failed to load Bullhorn export job.');
				}

				const blob = await res.blob();
				const fileNameHeader = res.headers.get('content-disposition') || '';
				const fileName =
					fileNameHeader.match(/filename=\"?([^\"]+)\"?/i)?.[1] ||
					`bullhorn-export-${bullhornExportJobId}.zip`;
				const zipFile = new File([blob], fileName, {
					type: blob.type || 'application/zip'
				});

				if (!cancelled) {
					await importBullhornBatchZip(zipFile);
					setLoadedBullhornExportJobId(bullhornExportJobId);
					toast.success('Bullhorn export loaded into the import preview.');
				}
			} catch (error) {
				if (!cancelled) {
					handledBullhornExportJobRef.current = '';
					toast.error(error?.message || 'Failed to load Bullhorn export job.');
				}
			} finally {
				if (!cancelled) {
					const nextParams = new URLSearchParams(searchParams.toString());
					nextParams.delete('bullhornExportJob');
					nextParams.delete('sourceType');
					const nextQuery = nextParams.toString();
					router.replace(nextQuery ? `/admin/imports?${nextQuery}` : '/admin/imports');
				}
			}
		}

		loadBullhornExportJobIntoImport();

		return () => {
			cancelled = true;
		};
	}, [operationFlags.bullhornOperationsEnabled, router, searchParams, sourceType, toast]);

	async function buildGenericEntryState(nextFile, nextEntity) {
		if (!nextFile) {
			return {
				file: null,
				headers: [],
				sampleRows: [],
				mapping: {}
			};
		}
		try {
			const text = await nextFile.text();
			const parsed = parseCsvText(text);
			return {
				file: nextFile,
				headers: parsed.headers,
				sampleRows: parsed.rows.slice(0, 3),
				mapping: suggestGenericImportMapping(nextEntity, parsed.headers)
			};
		} catch (error) {
			throw new Error(error?.message || 'Failed to parse CSV file.');
		}
	}

	async function buildGenericBatchEntriesFromZip(nextZipFile) {
		if (!nextZipFile) return [createGenericBatchEntry()];
		const buffer = await nextZipFile.arrayBuffer();
		const zip = await JSZip.loadAsync(buffer);
		const csvFiles = Object.values(zip.files)
			.filter((entry) => !entry.dir && entry.name.toLowerCase().endsWith('.csv'))
			.sort((a, b) => a.name.localeCompare(b.name));
		if (csvFiles.length <= 0) {
			throw new Error('ZIP file does not contain any CSV files.');
		}

		const builtEntries = [];
		for (const zipEntry of csvFiles) {
			const csvText = await zipEntry.async('string');
			const parsed = parseCsvText(csvText);
			const inferredFromName = inferGenericEntityFromFilename(zipEntry.name);
			const inferredEntity = inferredFromName || inferGenericEntityFromHeaders(parsed.headers);
			const fileName = zipEntry.name.split('/').filter(Boolean).pop() || zipEntry.name;
			const extractedFile = new File([csvText], fileName, { type: 'text/csv' });
			builtEntries.push({
				id: `${inferredEntity}-${Math.random().toString(36).slice(2, 10)}`,
				entity: inferredEntity,
				file: extractedFile,
				headers: parsed.headers,
				sampleRows: parsed.rows.slice(0, 3),
				mapping: suggestGenericImportMapping(inferredEntity, parsed.headers)
			});
		}

		return builtEntries.sort((a, b) => {
			const aOrder = GENERIC_IMPORT_ORDER.indexOf(a.entity);
			const bOrder = GENERIC_IMPORT_ORDER.indexOf(b.entity);
			if (aOrder !== bOrder) return aOrder - bOrder;
			return String(a.file?.name || '').localeCompare(String(b.file?.name || ''));
		});
	}

	async function buildBullhornEntryState(nextFile, nextEntity) {
		if (!nextFile) {
			return {
				file: null,
				headers: [],
				sampleRows: []
			};
		}
		try {
			const text = await nextFile.text();
			const parsed = parseCsvText(text);
			return {
				file: nextFile,
				headers: parsed.headers,
				sampleRows: parsed.rows.slice(0, 3)
			};
		} catch (error) {
			throw new Error(error?.message || 'Failed to parse CSV file.');
		}
	}

	async function buildBullhornBatchEntriesFromZip(nextZipFile) {
		if (!nextZipFile) return [createBullhornBatchEntry()];
		const buffer = await nextZipFile.arrayBuffer();
		const zip = await JSZip.loadAsync(buffer);
		const csvFiles = Object.values(zip.files)
			.filter((entry) => !entry.dir && entry.name.toLowerCase().endsWith('.csv'))
			.sort((a, b) => a.name.localeCompare(b.name));
		if (csvFiles.length <= 0) {
			throw new Error('ZIP file does not contain any CSV files.');
		}

		const builtEntries = [];
		for (const zipEntry of csvFiles) {
			const csvText = await zipEntry.async('string');
			const parsed = parseCsvText(csvText);
			const inferredFromName = inferBullhornEntityFromFilename(zipEntry.name);
			const inferredEntity = inferredFromName || inferBullhornEntityFromHeaders(parsed.headers);
			const fileName = zipEntry.name.split('/').filter(Boolean).pop() || zipEntry.name;
			const extractedFile = new File([csvText], fileName, { type: 'text/csv' });
			builtEntries.push({
				id: `${inferredEntity}-${Math.random().toString(36).slice(2, 10)}`,
				entity: inferredEntity,
				file: extractedFile,
				headers: parsed.headers,
				sampleRows: parsed.rows.slice(0, 3)
			});
		}

		return builtEntries.sort((a, b) => {
			const aOrder = BULLHORN_IMPORT_ORDER.indexOf(a.entity);
			const bOrder = BULLHORN_IMPORT_ORDER.indexOf(b.entity);
			if (aOrder !== bOrder) return aOrder - bOrder;
			return String(a.file?.name || '').localeCompare(String(b.file?.name || ''));
		});
	}

	async function buildBullhornCandidateAttachmentEntriesFromZip(nextZipFile) {
		if (!nextZipFile) return [];
		const buffer = await nextZipFile.arrayBuffer();
		const zip = await JSZip.loadAsync(buffer);
		const manifestEntry = BULLHORN_CANDIDATE_FILES_MANIFEST_NAMES
			.map((fileName) => zip.file(fileName))
			.find(Boolean);
		if (!manifestEntry) return [];
		const manifestText = await manifestEntry.async('string');
		if (!String(manifestText || '').trim()) return [];
		const { rows } = parseCsvText(manifestText);
		const builtEntries = [];

		for (const [index, row] of rows.entries()) {
			const zipPath = String(row?.[normalizeHeaderKey('ZIP Path')] || '').trim();
			const fileName = String(row?.[normalizeHeaderKey('File Name')] || '').trim();
			if (!zipPath || !fileName) continue;
			const zipFileEntry = zip.file(zipPath);
			if (!zipFileEntry) continue;
			const fileBuffer = await zipFileEntry.async('arraybuffer');
			builtEntries.push({
				id: `bullhorn-attachment-${index + 1}`,
				candidateId: String(row?.[normalizeHeaderKey('Candidate ID')] || '').trim(),
				candidateEmail: String(row?.[normalizeHeaderKey('Candidate Email')] || '').trim(),
				fileName,
				contentType: String(row?.[normalizeHeaderKey('Content Type')] || 'application/octet-stream').trim(),
				description: String(row?.[normalizeHeaderKey('Description')] || '').trim(),
				isResume: String(row?.[normalizeHeaderKey('Is Resume')] || '').trim().toLowerCase() === 'true',
				file: new File([fileBuffer], fileName, {
					type: String(row?.[normalizeHeaderKey('Content Type')] || 'application/octet-stream').trim() || 'application/octet-stream'
				})
			});
		}

		return builtEntries;
	}

	async function buildZohoEntryState(nextFile, nextEntity) {
		if (!nextFile) {
			return {
				file: null,
				headers: [],
				sampleRows: []
			};
		}
		try {
			const text = await nextFile.text();
			const parsed = parseCsvText(text);
			return {
				file: nextFile,
				headers: parsed.headers,
				sampleRows: parsed.rows.slice(0, 3)
			};
		} catch (error) {
			throw new Error(error?.message || 'Failed to parse CSV file.');
		}
	}

	async function buildZohoBatchEntriesFromZip(nextZipFile) {
		if (!nextZipFile) return [createZohoBatchEntry()];
		const buffer = await nextZipFile.arrayBuffer();
		const zip = await JSZip.loadAsync(buffer);
		const csvFiles = Object.values(zip.files)
			.filter((entry) => !entry.dir && entry.name.toLowerCase().endsWith('.csv'))
			.sort((a, b) => a.name.localeCompare(b.name));
		if (csvFiles.length <= 0) {
			throw new Error('ZIP file does not contain any CSV files.');
		}

		const builtEntries = [];
		for (const zipEntry of csvFiles) {
			const csvText = await zipEntry.async('string');
			const parsed = parseCsvText(csvText);
			const inferredFromName = inferZohoEntityFromFilename(zipEntry.name);
			const inferredEntity = inferredFromName || inferZohoEntityFromHeaders(parsed.headers);
			const fileName = zipEntry.name.split('/').filter(Boolean).pop() || zipEntry.name;
			const extractedFile = new File([csvText], fileName, { type: 'text/csv' });
			builtEntries.push({
				id: `${inferredEntity}-${Math.random().toString(36).slice(2, 10)}`,
				entity: inferredEntity,
				file: extractedFile,
				headers: parsed.headers,
				sampleRows: parsed.rows.slice(0, 3)
			});
		}

		return builtEntries.sort((a, b) => {
			const aOrder = ZOHO_IMPORT_ORDER.indexOf(a.entity);
			const bOrder = ZOHO_IMPORT_ORDER.indexOf(b.entity);
			if (aOrder !== bOrder) return aOrder - bOrder;
			return String(a.file?.name || '').localeCompare(String(b.file?.name || ''));
		});
	}

	function downloadCsvTemplate() {
		const template = (isBullhorn ? BULLHORN_CSV_TEMPLATES : ZOHO_CSV_TEMPLATES)[selectedCsvEntity];
		if (!template) return;
		const csvLines = [template.headers, template.sample].map((row) =>
			row.map((value) => toCsvValue(value)).join(',')
		);
		const csvText = `${csvLines.join('\n')}\n`;
		const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' });
		const objectUrl = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = objectUrl;
		anchor.download = `${isGenericCsv ? 'generic' : isBullhorn ? 'bullhorn' : 'zoho-recruit'}-${selectedCsvEntity}-template.csv`;
		document.body.appendChild(anchor);
		anchor.click();
		anchor.remove();
		URL.revokeObjectURL(objectUrl);
	}

function downloadBullhornCsvTemplate(entity) {
		const template = BULLHORN_CSV_TEMPLATES[entity];
		if (!template) return;
		const csvLines = [template.headers, template.sample].map((row) =>
			row.map((value) => toCsvValue(value)).join(',')
		);
		const csvText = `${csvLines.join('\n')}\n`;
		const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' });
		const objectUrl = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = objectUrl;
		anchor.download = `bullhorn-${entity}-template.csv`;
		document.body.appendChild(anchor);
		anchor.click();
		anchor.remove();
	URL.revokeObjectURL(objectUrl);
}

function downloadZohoCsvTemplate(entity) {
	const template = ZOHO_CSV_TEMPLATES[entity];
	if (!template) return;
	const csvLines = [template.headers, template.sample].map((row) =>
		row.map((value) => toCsvValue(value)).join(',')
	);
	const csvText = `${csvLines.join('\n')}\n`;
	const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' });
	const objectUrl = URL.createObjectURL(blob);
	const anchor = document.createElement('a');
	anchor.href = objectUrl;
	anchor.download = `zoho-recruit-${entity}-template.csv`;
	document.body.appendChild(anchor);
	anchor.click();
	anchor.remove();
	URL.revokeObjectURL(objectUrl);
}

	function downloadGenericCsvTemplate(entity) {
		const template = buildGenericCsvTemplate(entity);
		if (!template) return;
		const csvLines = [template.headers, template.sample].map((row) =>
			row.map((value) => toCsvValue(value)).join(',')
		);
		const csvText = `${csvLines.join('\n')}\n`;
		const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8' });
		const objectUrl = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = objectUrl;
		anchor.download = `generic-${entity}-template.csv`;
		document.body.appendChild(anchor);
		anchor.click();
		anchor.remove();
		URL.revokeObjectURL(objectUrl);
	}

	async function runImport(mode, options = {}) {
		const entriesOverride = Array.isArray(options.entriesOverride) ? options.entriesOverride : null;
		const genericImportEntries = isGenericCsv ? (entriesOverride || activeGenericEntries) : [];
		const bullhornImportEntries = isBullhornBatch ? (entriesOverride || activeBullhornBatchEntries) : [];
		const zohoImportEntries = isZohoBatch ? (entriesOverride || activeZohoBatchEntries) : [];
		const genericReady =
			genericImportEntries.length > 0 &&
			genericImportEntries.every((entry) => mappedFieldCountForEntry(entry) > 0 && missingRequiredFieldsForEntry(entry).length <= 0);
		const bullhornReady =
			bullhornImportEntries.length > 0 &&
			bullhornImportEntries.every((entry) => entry.file && entry.entity);
		const zohoReady =
			zohoImportEntries.length > 0 &&
			zohoImportEntries.every((entry) => entry.file && entry.entity);
		if (
			(!isGenericCsv && !isBullhornBatch && !isZohoBatch && !file) ||
			busy ||
			(isGenericCsv && !genericReady) ||
			(isBullhornBatch && !bullhornReady) ||
			(isZohoBatch && !zohoReady)
		) return;
		setRunningMode(mode);

		try {
			let res;
			if (mode === 'apply' && isBullhornZip && loadedBullhornExportJobId) {
				res = await fetch(`/api/admin/bullhorn-export-jobs/${loadedBullhornExportJobId}/import`, {
					method: 'POST'
				});
			} else {
				const formData = new FormData();
				formData.set('mode', mode);
				formData.set('sourceType', sourceType);
				if (isGenericCsv) {
					const batchManifest = genericImportEntries.map((entry) => ({
						id: entry.id,
						entity: entry.entity,
						mapping: entry.mapping,
						fileField: `genericFile:${entry.id}`
					}));
					formData.set('genericBatch', JSON.stringify(batchManifest));
					for (const entry of genericImportEntries) {
						formData.set(`genericFile:${entry.id}`, entry.file);
					}
				}
				if (isBullhornBatch) {
					const batchManifest = bullhornImportEntries.map((entry) => ({
						id: entry.id,
						entity: entry.entity,
						fileField: `bullhornFile:${entry.id}`
					}));
					formData.set('bullhornBatch', JSON.stringify(batchManifest));
					for (const entry of bullhornImportEntries) {
						formData.set(`bullhornFile:${entry.id}`, entry.file);
					}
					if (isBullhornZip && bullhornZipFile) {
						formData.set('bullhornZipFile', bullhornZipFile);
					}
					if (isBullhornZip && bullhornCandidateAttachmentEntries.length > 0) {
						const attachmentManifest = bullhornCandidateAttachmentEntries.map((entry) => ({
							id: entry.id,
							candidateId: entry.candidateId,
							candidateEmail: entry.candidateEmail,
							fileName: entry.fileName,
							contentType: entry.contentType,
							description: entry.description,
							isResume: entry.isResume,
							fileField: `bullhornAttachmentFile:${entry.id}`
						}));
						formData.set('bullhornCandidateAttachments', JSON.stringify(attachmentManifest));
						for (const entry of bullhornCandidateAttachmentEntries) {
							formData.set(`bullhornAttachmentFile:${entry.id}`, entry.file);
						}
					}
				}
				if (isZohoBatch) {
					const batchManifest = zohoImportEntries.map((entry) => ({
						id: entry.id,
						entity: entry.entity,
						fileField: `zohoFile:${entry.id}`
					}));
					formData.set('zohoBatch', JSON.stringify(batchManifest));
					for (const entry of zohoImportEntries) {
						formData.set(`zohoFile:${entry.id}`, entry.file);
					}
				}
				if (isBullhorn && !isBullhornBatch) {
					formData.set('bullhornEntity', bullhornEntity);
				}
				if (isZoho && !isZohoBatch) {
					formData.set('zohoEntity', zohoEntity);
				}
				formData.set('file', file);

				res = await fetch('/api/admin/data-import', {
					method: 'POST',
					body: formData
				});
			}
			const data = await res.json().catch(() => ({}));
			if (!res.ok) {
				throw new Error(data.error || 'Import request failed.');
			}

			setPreview(data.preview || null);
			if (data.preview) {
				setPreviewEntityTab(firstPreviewEntityKey(data.preview));
				setImportView('preview');
			}
			if (mode === 'apply') {
				setResult(data.result || null);
				setResultEntityTab(firstResultEntityKey(data.result));
				markAsClean({
					sourceType,
					fileName: '',
					genericBatchEntries: [],
					bullhornBatchEntries: [],
					zohoBatchEntries: [],
					importView: 'mapping',
					hasPreview: false,
					hasResult: true
				});
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

	function addBullhornBatchEntry() {
		setLoadedBullhornExportJobId('');
		const nextEntry = createBullhornBatchEntry();
		shouldScrollToMappingRef.current = true;
		setBullhornBatchEntries((current) => [...current, nextEntry]);
		setActiveBullhornBatchEntryId(nextEntry.id);
	}

	function removeBullhornBatchEntry(entryId) {
		setLoadedBullhornExportJobId('');
		setBullhornBatchEntries((current) => {
			if (current.length <= 1) {
				const replacement = createBullhornBatchEntry();
				setActiveBullhornBatchEntryId(replacement.id);
				return [replacement];
			}
			const nextEntries = current.filter((entry) => entry.id !== entryId);
			if (activeBullhornBatchEntryId === entryId) {
				setActiveBullhornBatchEntryId(nextEntries[0]?.id || null);
			}
			return nextEntries;
		});
	}

	async function updateBullhornBatchEntity(entryId, nextEntity) {
		setLoadedBullhornExportJobId('');
		const currentEntry = bullhornBatchEntries.find((entry) => entry.id === entryId);
		if (!currentEntry) return;
		setPreview(null);
		setImportView('mapping');
		setResult(null);
		if (!currentEntry.file) {
			setBullhornBatchEntries((current) =>
				current.map((entry) =>
					entry.id === entryId
						? { ...entry, entity: nextEntity, headers: [], sampleRows: [] }
						: entry
				)
			);
			return;
		}
		try {
			const hydrated = await buildBullhornEntryState(currentEntry.file, nextEntity);
			setBullhornBatchEntries((current) =>
				current.map((entry) =>
					entry.id === entryId
						? { ...entry, entity: nextEntity, ...hydrated }
						: entry
				)
			);
		} catch (error) {
			toast.error(error?.message || 'Failed to parse CSV file.');
		}
	}

	async function updateBullhornBatchFile(entryId, nextFile) {
		setLoadedBullhornExportJobId('');
		setPreview(null);
		setImportView('mapping');
		setResult(null);
		const currentEntry = bullhornBatchEntries.find((entry) => entry.id === entryId);
		if (!currentEntry) return;
		try {
			const hydrated = await buildBullhornEntryState(nextFile, currentEntry.entity);
			setBullhornBatchEntries((current) =>
				current.map((entry) =>
					entry.id === entryId
						? { ...entry, ...hydrated }
						: entry
				)
			);
		} catch (error) {
			toast.error(error?.message || 'Failed to parse CSV file.');
		}
	}

	async function importBullhornBatchZip(nextZipFile) {
		setLoadedBullhornExportJobId('');
		setPreview(null);
		setImportView('mapping');
		setResult(null);
		setBullhornZipFile(nextZipFile || null);
		setBullhornCandidateAttachmentEntries([]);
		if (!nextZipFile) {
			setBullhornBatchEntries([createBullhornBatchEntry()]);
			setActiveBullhornBatchEntryId(null);
			return;
		}
		try {
			const [nextEntries, nextAttachmentEntries] = await Promise.all([
				buildBullhornBatchEntriesFromZip(nextZipFile),
				buildBullhornCandidateAttachmentEntriesFromZip(nextZipFile)
			]);
			setBullhornBatchEntries(nextEntries.length > 0 ? nextEntries : [createBullhornBatchEntry()]);
			setActiveBullhornBatchEntryId(nextEntries[0]?.id || null);
			setBullhornCandidateAttachmentEntries(nextAttachmentEntries);
			toast.success(`Loaded ${nextEntries.length} CSV file${nextEntries.length === 1 ? '' : 's'} from ZIP.`);
			if (nextEntries.length > 0 && nextEntries.every((entry) => entry.file && entry.entity)) {
				await runImport('preview', { entriesOverride: nextEntries });
			}
		} catch (error) {
			toast.error(error?.message || 'Failed to parse ZIP file.');
		}
	}

	function selectBullhornBatchEntry(entryId) {
		shouldScrollToMappingRef.current = true;
		setActiveBullhornBatchEntryId(entryId);
	}

	function addZohoBatchEntry() {
		const nextEntry = createZohoBatchEntry();
		shouldScrollToMappingRef.current = true;
		setZohoBatchEntries((current) => [...current, nextEntry]);
		setActiveZohoBatchEntryId(nextEntry.id);
	}

	function removeZohoBatchEntry(entryId) {
		setZohoBatchEntries((current) => {
			if (current.length <= 1) {
				const replacement = createZohoBatchEntry();
				setActiveZohoBatchEntryId(replacement.id);
				return [replacement];
			}
			const nextEntries = current.filter((entry) => entry.id !== entryId);
			if (activeZohoBatchEntryId === entryId) {
				setActiveZohoBatchEntryId(nextEntries[0]?.id || null);
			}
			return nextEntries;
		});
		setPreview(null);
		setImportView('mapping');
	}

	async function updateZohoBatchEntity(entryId, nextEntity) {
		const currentEntry = zohoBatchEntries.find((entry) => entry.id === entryId);
		if (!currentEntry) return;
		setPreview(null);
		setImportView('mapping');
		if (!currentEntry.file) {
			setZohoBatchEntries((current) =>
				current.map((entry) =>
					entry.id === entryId
						? { ...entry, entity: nextEntity }
						: entry
				)
			);
			return;
		}
		try {
			const hydrated = await buildZohoEntryState(currentEntry.file, nextEntity);
			setZohoBatchEntries((current) =>
				current.map((entry) =>
					entry.id === entryId
						? { ...entry, entity: nextEntity, ...hydrated }
						: entry
				)
			);
		} catch (error) {
			toast.error(error?.message || 'Failed to parse CSV file.');
		}
	}

	async function updateZohoBatchFile(entryId, nextFile) {
		const currentEntry = zohoBatchEntries.find((entry) => entry.id === entryId);
		if (!currentEntry) return;
		setPreview(null);
		setImportView('mapping');
		try {
			const hydrated = await buildZohoEntryState(nextFile, currentEntry.entity);
			setZohoBatchEntries((current) =>
				current.map((entry) =>
					entry.id === entryId
						? { ...entry, ...hydrated }
						: entry
				)
			);
		} catch (error) {
			toast.error(error?.message || 'Failed to parse CSV file.');
		}
	}

	async function importZohoBatchZip(nextZipFile) {
		setPreview(null);
		setImportView('mapping');
		setResult(null);
		if (!nextZipFile) {
			setZohoBatchEntries([createZohoBatchEntry()]);
			setActiveZohoBatchEntryId(null);
			return;
		}
		try {
			const nextEntries = await buildZohoBatchEntriesFromZip(nextZipFile);
			setZohoBatchEntries(nextEntries.length > 0 ? nextEntries : [createZohoBatchEntry()]);
			setActiveZohoBatchEntryId(nextEntries[0]?.id || null);
			if (nextEntries.length > 0) {
				await runImport('preview', { entriesOverride: nextEntries });
			}
		} catch (error) {
			toast.error(error?.message || 'Failed to unpack ZIP file.');
			setZohoBatchEntries([createZohoBatchEntry()]);
			setActiveZohoBatchEntryId(null);
		}
	}

	function selectZohoBatchEntry(entryId) {
		shouldScrollToMappingRef.current = true;
		setActiveZohoBatchEntryId(entryId);
	}

	function addGenericBatchEntry() {
		const nextEntry = createGenericBatchEntry();
		shouldScrollToMappingRef.current = true;
		setGenericBatchEntries((current) => [...current, nextEntry]);
		setActiveBatchEntryId(nextEntry.id);
	}

	function removeGenericBatchEntry(entryId) {
		setGenericBatchEntries((current) => {
			if (current.length <= 1) {
				const replacement = createGenericBatchEntry();
				setActiveBatchEntryId(replacement.id);
				return [replacement];
			}
			const nextEntries = current.filter((entry) => entry.id !== entryId);
			if (activeBatchEntryId === entryId) {
				setActiveBatchEntryId(nextEntries[0]?.id || null);
			}
			return nextEntries;
		});
	}

	async function updateGenericBatchEntity(entryId, nextEntity) {
		const currentEntry = genericBatchEntries.find((entry) => entry.id === entryId);
		if (!currentEntry) return;
		setPreview(null);
		setImportView('mapping');
		setResult(null);
		if (!currentEntry.file) {
			setGenericBatchEntries((current) =>
				current.map((entry) =>
					entry.id === entryId
						? { ...entry, entity: nextEntity, headers: [], sampleRows: [], mapping: {} }
						: entry
				)
			);
			return;
		}
		try {
			const hydrated = await buildGenericEntryState(currentEntry.file, nextEntity);
			setGenericBatchEntries((current) =>
				current.map((entry) =>
					entry.id === entryId
						? { ...entry, entity: nextEntity, ...hydrated }
						: entry
				)
			);
		} catch (error) {
			toast.error(error?.message || 'Failed to parse CSV file.');
		}
	}

	async function updateGenericBatchFile(entryId, nextFile) {
		setPreview(null);
		setImportView('mapping');
		setResult(null);
		const currentEntry = genericBatchEntries.find((entry) => entry.id === entryId);
		if (!currentEntry) return;
		try {
			const hydrated = await buildGenericEntryState(nextFile, currentEntry.entity);
			setGenericBatchEntries((current) =>
				current.map((entry) =>
					entry.id === entryId
						? { ...entry, ...hydrated }
						: entry
				)
			);
		} catch (error) {
			toast.error(error?.message || 'Failed to parse CSV file.');
		}
	}

	async function importGenericBatchZip(nextZipFile) {
		setPreview(null);
		setImportView('mapping');
		setResult(null);
		if (!nextZipFile) {
			setGenericBatchEntries([createGenericBatchEntry()]);
			return;
		}
		try {
			const nextEntries = await buildGenericBatchEntriesFromZip(nextZipFile);
			setGenericBatchEntries(nextEntries.length > 0 ? nextEntries : [createGenericBatchEntry()]);
			setActiveBatchEntryId(nextEntries[0]?.id || null);
			toast.success(`Loaded ${nextEntries.length} CSV file${nextEntries.length === 1 ? '' : 's'} from ZIP.`);
			const nextEntriesReady =
				nextEntries.length > 0 &&
				nextEntries.every((entry) => mappedFieldCountForEntry(entry) > 0 && missingRequiredFieldsForEntry(entry).length <= 0);
			if (nextEntriesReady) {
				await runImport('preview', { entriesOverride: nextEntries });
			}
		} catch (error) {
			toast.error(error?.message || 'Failed to parse ZIP file.');
		}
	}

	function selectGenericBatchEntry(entryId) {
		shouldScrollToMappingRef.current = true;
		setActiveBatchEntryId(entryId);
	}

	function applyAutoMapping(entryId) {
		setPreview(null);
		setImportView('mapping');
		setGenericBatchEntries((current) =>
			current.map((entry) =>
				entry.id === entryId
					? { ...entry, mapping: suggestGenericImportMapping(entry.entity, entry.headers) }
					: entry
			)
		);
	}

	function clearGenericMapping(entryId) {
		setPreview(null);
		setImportView('mapping');
		setGenericBatchEntries((current) =>
			current.map((entry) =>
				entry.id === entryId
					? { ...entry, mapping: {} }
					: entry
			)
		);
	}

	function updateGenericColumnMapping(entryId, headerKey, nextFieldKey) {
		setPreview(null);
		setImportView('mapping');
		setGenericBatchEntries((current) =>
			current.map((entry) => {
				if (entry.id !== entryId) return entry;
				const nextMapping = { ...entry.mapping };
				for (const [existingHeaderKey, existingFieldKey] of Object.entries(nextMapping)) {
					if (existingHeaderKey !== headerKey && existingFieldKey === nextFieldKey && nextFieldKey) {
						delete nextMapping[existingHeaderKey];
					}
				}
				if (nextFieldKey) {
					nextMapping[headerKey] = nextFieldKey;
				} else {
					delete nextMapping[headerKey];
				}
				return {
					...entry,
					mapping: nextMapping
				};
			})
		);
	}

	function resetImportFlow() {
		setLoadedBullhornExportJobId('');
		setFile(null);
		setBullhornZipFile(null);
		setBullhornCandidateAttachmentEntries([]);
		setPreview(null);
		setImportView('mapping');
		setPreviewEntityTab(PREVIEW_ENTITY_KEYS[0]);
		setResult(null);
		const nextGenericEntry = createGenericBatchEntry();
		setGenericBatchEntries([nextGenericEntry]);
		setActiveBatchEntryId(nextGenericEntry.id);
		const nextBullhornEntry = createBullhornBatchEntry();
		setBullhornBatchEntries([nextBullhornEntry]);
		setActiveBullhornBatchEntryId(nextBullhornEntry.id);
		const nextZohoEntry = createZohoBatchEntry();
		setZohoBatchEntries([nextZohoEntry]);
		setActiveZohoBatchEntryId(nextZohoEntry.id);
		markAsClean({
			sourceType,
			fileName: '',
			genericBatchEntries: [],
			bullhornBatchEntries: [],
			zohoBatchEntries: [],
			importView: 'mapping',
			hasPreview: false,
			hasResult: false
		});
	}

	return (
		<AdminGate>
			<section className="module-page">
				<header className="module-header">
					<div>
						<Link href="/admin" className="module-back-link" aria-label="Back to List">&larr; Back</Link>
						<h2>Data Import</h2>
						<p>Import core ATS entities and custom field definitions from Hire Gnome exports, generic CSV files, Bullhorn CSV, or Zoho Recruit CSV files.</p>
					</div>
				</header>

				{!result ? (
				<article className="panel panel-spacious">
					<section className="form-section">
						<div className="admin-import-primary-row">
							<FormField label="Source Type">
								<select
									className="admin-import-source-select"
									value={sourceType}
									onChange={(event) => switchSourceType(event.target.value)}
									disabled={busy}
								>
									{visibleSourceOptions.map((option) => (
										<option key={option.value} value={option.value}>
											{option.label}
										</option>
									))}
								</select>
							</FormField>

							{isGenericCsvZip ? (
								<FormField
									label="ZIP Batch File"
									hint="Upload one ZIP containing the migration CSV files."
								>
									<div className="admin-import-single-file-picker">
										<div className="admin-import-primary-actions">
											<label className="btn-secondary admin-import-primary-action">
												<FileSpreadsheet size={16} aria-hidden="true" />
												<span>Upload ZIP Batch</span>
												<input
													type="file"
													accept=".zip,application/zip"
													onChange={(event) => importGenericBatchZip(event.target.files?.[0] || null)}
													disabled={busy}
													style={{ display: 'none' }}
												/>
											</label>
											{sampleDownload ? (
												<a href={sampleDownload.href} download className="btn-link admin-import-sample-link">
													<Download size={16} aria-hidden="true" />
													<span>{sampleDownload.label}</span>
												</a>
											) : null}
										</div>
										{activeGenericEntries.length > 0 ? (
											<p className="panel-subtext">
												{activeGenericEntries.length} extracted CSV file{activeGenericEntries.length === 1 ? '' : 's'} loaded
											</p>
										) : null}
									</div>
								</FormField>
							) : isGenericCsvManual ? (
								<FormField
									label="Batch Files"
									hint="Start the batch by adding the first CSV file."
								>
									<div className="admin-import-single-file-picker">
										<div className="admin-import-primary-actions">
											<button type="button" className="btn-secondary admin-import-primary-action" onClick={addGenericBatchEntry} disabled={busy}>
												<Plus size={16} aria-hidden="true" />
												<span>Add CSV File</span>
											</button>
											{sampleDownload ? (
												<a href={sampleDownload.href} download className="btn-link admin-import-sample-link">
													<Download size={16} aria-hidden="true" />
													<span>{sampleDownload.label}</span>
												</a>
											) : null}
										</div>
									</div>
								</FormField>
							) : isBullhornZip ? (
								<FormField
									label="Bullhorn ZIP File"
									hint="Upload one ZIP containing the Bullhorn CSV export files."
								>
									<div className="admin-import-single-file-picker">
										<div className="admin-import-primary-actions">
											<label className="btn-secondary admin-import-primary-action">
												<FileSpreadsheet size={16} aria-hidden="true" />
												<span>Upload Bullhorn ZIP</span>
												<input
													type="file"
													accept=".zip,application/zip"
													onChange={(event) => importBullhornBatchZip(event.target.files?.[0] || null)}
													disabled={busy}
													style={{ display: 'none' }}
												/>
											</label>
											{sampleDownload ? (
												<a href={sampleDownload.href} download className="btn-link admin-import-sample-link">
													<Download size={16} aria-hidden="true" />
													<span>{sampleDownload.label}</span>
												</a>
											) : null}
										</div>
										{activeBullhornBatchEntries.length > 0 ? (
											<p className="panel-subtext">
												{activeBullhornBatchEntries.length} extracted CSV file{activeBullhornBatchEntries.length === 1 ? '' : 's'} loaded
											</p>
										) : null}
									</div>
								</FormField>
							) : isBullhornManual ? (
								<FormField
									label="Bullhorn Files"
									hint="Start the batch by adding the first Bullhorn CSV file."
								>
									<div className="admin-import-single-file-picker">
										<div className="admin-import-primary-actions">
											<button type="button" className="btn-secondary admin-import-primary-action" onClick={addBullhornBatchEntry} disabled={busy}>
												<Plus size={16} aria-hidden="true" />
												<span>Add Bullhorn CSV</span>
											</button>
											{sampleDownload ? (
												<a href={sampleDownload.href} download className="btn-link admin-import-sample-link">
													<Download size={16} aria-hidden="true" />
													<span>{sampleDownload.label}</span>
												</a>
											) : null}
										</div>
									</div>
								</FormField>
							) : isZohoZip ? (
								<FormField
									label="Zoho ZIP File"
									hint="Upload one ZIP containing the Zoho Recruit CSV export files."
								>
									<div className="admin-import-single-file-picker">
										<div className="admin-import-primary-actions">
											<label className="btn-secondary admin-import-primary-action">
												<FileSpreadsheet size={16} aria-hidden="true" />
												<span>Upload Zoho ZIP</span>
												<input
													type="file"
													accept=".zip,application/zip"
													onChange={(event) => importZohoBatchZip(event.target.files?.[0] || null)}
													disabled={busy}
													style={{ display: 'none' }}
												/>
											</label>
											{sampleDownload ? (
												<a href={sampleDownload.href} download className="btn-link admin-import-sample-link">
													<Download size={16} aria-hidden="true" />
													<span>{sampleDownload.label}</span>
												</a>
											) : null}
										</div>
										{activeZohoBatchEntries.length > 0 ? (
											<p className="panel-subtext">
												{activeZohoBatchEntries.length} extracted CSV file{activeZohoBatchEntries.length === 1 ? '' : 's'} loaded
											</p>
										) : null}
									</div>
								</FormField>
							) : isZohoManual ? (
								<FormField
									label="Zoho Files"
									hint="Start the batch by adding the first Zoho Recruit CSV file."
								>
									<div className="admin-import-single-file-picker">
										<div className="admin-import-primary-actions">
											<button type="button" className="btn-secondary admin-import-primary-action" onClick={addZohoBatchEntry} disabled={busy}>
												<Plus size={16} aria-hidden="true" />
												<span>Add Zoho CSV</span>
											</button>
											{sampleDownload ? (
												<a href={sampleDownload.href} download className="btn-link admin-import-sample-link">
													<Download size={16} aria-hidden="true" />
													<span>{sampleDownload.label}</span>
												</a>
											) : null}
										</div>
									</div>
								</FormField>
							) : (
								<FormField
									label="Import File"
									hint={
										isCsvSource
											? `Upload one ${isBullhorn ? 'Bullhorn' : 'Zoho Recruit'} CSV file at a time using the selected profile.`
											: 'Use files generated by Admin Data Export.'
									}
								>
									<div className="admin-import-single-file-picker">
										<div className="admin-import-primary-actions">
											<label className="btn-secondary admin-import-primary-action">
												<FileSpreadsheet size={16} aria-hidden="true" />
												<span>Upload Hire Gnome Export</span>
												<input
													type="file"
													accept={fileAccept}
													onChange={async (event) => {
														const nextFile = event.target.files?.[0] || null;
														setFile(nextFile);
														setPreview(null);
														setImportView('mapping');
														setResult(null);
													}}
													disabled={busy}
													style={{ display: 'none' }}
												/>
											</label>
											{sampleDownload ? (
												<a href={sampleDownload.href} download className="btn-link admin-import-sample-link">
													<Download size={16} aria-hidden="true" />
													<span>{sampleDownload.label}</span>
												</a>
											) : null}
										</div>
										{file ? <p className="panel-subtext">Selected file: {file.name}</p> : null}
									</div>
								</FormField>
							)}
						</div>

						{!isGenericCsv && !isBullhornBatch && !isZohoBatch && importView !== 'preview' ? (
							<section className="import-mapping-section">
								<div className="import-mapping-header">
									<div>
										<h4>Hire Gnome Export</h4>
										<p className="panel-subtext">
											Upload a Hire Gnome Admin Data Export file to preview creates, updates, skips, and relationship remaps before applying the import.
										</p>
									</div>
								</div>
							</section>
						) : null}

						{!isGenericCsv && !isBullhornBatch && !isZohoBatch && importView !== 'preview' && file ? (
							<div className="import-next-step">
								<div>
									<h4>Next Step</h4>
									<p className="panel-subtext">
										File loaded. Preview the safety check before applying the import.
									</p>
								</div>
								<div className="form-actions import-preview-actions">
									<button
										type="button"
										className="btn-secondary"
										onClick={() => runImport('preview')}
										disabled={!file || busy}
									>
										{runningMode === 'preview' ? 'Previewing...' : 'Preview Import'}
									</button>
								</div>
							</div>
						) : null}

						{isGenericCsv ? (
							<>
								<section className="import-mapping-section">
									<div className="import-mapping-header">
										<div>
										<h4>{isGenericCsvZip ? 'ZIP Migration Batch' : 'Manual Migration Batch'}</h4>
											<p className="panel-subtext">
												{isGenericCsvZip
													? 'Upload one ZIP containing CSV files. Hire Gnome will unpack the batch, let you review mappings, and then import in dependency order so clients can be created before contacts, contacts before job orders, and so on.'
													: 'Upload one or more CSV files manually. Hire Gnome will preview and import them in dependency order so clients can be created before contacts, contacts before job orders, and so on.'}
											</p>
										</div>
									</div>
									{importView === 'mapping' && (!isGenericCsvZip || activeGenericEntries.length > 0) ? (
										<div className="import-batch-tabs" role="tablist" aria-label="Generic CSV batch files">
											{genericBatchEntries.map((entry, index) => {
												const missingRequiredFields = missingRequiredFieldsForEntry(entry);
												const mappedCount = mappedFieldCountForEntry(entry);
												const ready = Boolean(entry.file) && missingRequiredFields.length <= 0 && mappedCount > 0;
												return (
													<button
														key={entry.id}
														type="button"
														role="tab"
														aria-selected={activeBatchEntry?.id === entry.id}
														className={`import-batch-tab import-batch-tab-${entry.entity} ${activeBatchEntry?.id === entry.id ? 'is-active' : ''}`}
														onClick={() => selectGenericBatchEntry(entry.id)}
													>
														<span>{importEntityLabel(entry.entity)}</span>
														<span className="import-batch-tab-meta">{entry.file ? (ready ? 'Ready' : 'Needs Mapping') : 'No File'}</span>
													</button>
												);
											})}
										</div>
									) : null}
									{isGenericCsvZip && importView === 'mapping' && activeGenericEntries.length > 0 ? (
										<div className="import-next-step">
											<div>
												<h4>Next Step</h4>
												<p className="panel-subtext">
													{genericBatchReady
														? 'ZIP batch loaded. Review any mappings you want, then return to the preview safety check.'
														: `${readyBatchEntryCount} ready, ${incompleteBatchEntryCount} still needing mapping. Finish the mappings, then preview the import.`}
												</p>
											</div>
											<div className="form-actions">
												{preview ? (
													<button
														type="button"
														className="btn-secondary"
														onClick={() => setImportView('preview')}
														disabled={busy}
													>
														Return To Preview
													</button>
												) : (
													<button
														type="button"
														className="btn-secondary"
														onClick={() => runImport('preview')}
														disabled={busy || !genericBatchReady}
													>
														{runningMode === 'preview' ? 'Previewing...' : 'Preview Import'}
													</button>
												)}
											</div>
										</div>
									) : null}
									{!isGenericCsvZip ? (
										<div className="import-next-step">
											<div>
												<h4>Next Step</h4>
												<p className="panel-subtext">
													{genericBatchReady
														? `All ${readyBatchEntryCount} uploaded batch file${readyBatchEntryCount === 1 ? '' : 's'} are mapped and ready. Preview the import safety check before applying it.`
														: `${readyBatchEntryCount} ready, ${incompleteBatchEntryCount} still needing mapping${missingBatchFileCount > 0 ? `, ${missingBatchFileCount} without files` : ''}. Finish the mappings, then preview the import.`}
												</p>
											</div>
											<div className="form-actions">
												<button
													type="button"
													className="btn-secondary"
													onClick={() => runImport('preview')}
													disabled={busy || !genericBatchReady}
												>
													{runningMode === 'preview' ? 'Previewing...' : 'Preview Import'}
												</button>
											</div>
										</div>
									) : null}
									{activeBatchEntry && importView === 'mapping' && (!isGenericCsvZip || activeGenericEntries.length > 0) ? (() => {
										const entry = activeBatchEntry;
										const profile = getGenericImportProfile(entry.entity);
										const fieldOptions = uniqueFieldOptions(profile?.fields || []);
										const missingRequiredFields = missingRequiredFieldsForEntry(entry);
										const entryIndex = genericBatchEntries.findIndex((candidate) => candidate.id === entry.id);
										return (
											<section
												ref={mappingSectionRef}
												className={`import-batch-item import-batch-item-${entry.entity}`}
											>
												<div className="import-batch-item-header">
													<div>
														<h4>{importEntityLabel(entry.entity)} Mapping</h4>
														<p className="panel-subtext">
															{entry.file
																? `Editing ${entry.file.name}. ${profile?.description || ''}`.trim()
																: profile?.description}
														</p>
													</div>
													<div className="form-actions">
														<button type="button" className="btn-secondary" onClick={() => downloadGenericCsvTemplate(entry.entity)} disabled={busy}>
															<FileSpreadsheet size={16} aria-hidden="true" />
															<span>Template</span>
														</button>
														<button type="button" className="btn-secondary" onClick={() => removeGenericBatchEntry(entry.id)} disabled={busy}>
															<Trash2 size={16} aria-hidden="true" />
															<span>Remove</span>
														</button>
													</div>
												</div>

												<div className="import-batch-item-grid">
													<FormField label="Entity Profile">
														<select
															value={entry.entity}
															onChange={(event) => updateGenericBatchEntity(entry.id, event.target.value)}
															disabled={busy}
														>
															{GENERIC_IMPORT_ENTITY_OPTIONS.map((option) => (
																<option key={option.value} value={option.value}>
																	{option.label}
																</option>
															))}
														</select>
													</FormField>
													<FormField
														label="CSV File"
														hint={
															isGenericCsvZip
																? 'ZIP mode extracts these files automatically. Replace a specific extracted CSV here only if needed.'
																: 'Upload the export or spreadsheet file for this entity.'
														}
													>
														<input
															type="file"
															accept=".csv,text/csv"
															onChange={(event) => updateGenericBatchFile(entry.id, event.target.files?.[0] || null)}
														/>
													</FormField>
												</div>

												{entry.headers.length > 0 ? (
													<>
														<div className="import-mapping-header">
															<div>
																<h4>Column Mapping</h4>
																<p className="panel-subtext">
																	Map source columns into {profile?.label?.toLowerCase()} fields.
																</p>
															</div>
															<div className="form-actions">
																<button type="button" className="btn-secondary" onClick={() => applyAutoMapping(entry.id)} disabled={busy}>
																	<WandSparkles size={16} aria-hidden="true" />
																	<span>Auto-Map</span>
																</button>
																<button type="button" className="btn-secondary" onClick={() => clearGenericMapping(entry.id)} disabled={busy}>
																	<Eraser size={16} aria-hidden="true" />
																	<span>Clear Mapping</span>
																</button>
															</div>
														</div>
														<div className="info-list snapshot-grid snapshot-grid-four">
															<p><span>Columns</span><strong>{entry.headers.length}</strong></p>
															<p><span>Preview Rows</span><strong>{entry.sampleRows.length}</strong></p>
															<p><span>Mapped Fields</span><strong>{mappedFieldCountForEntry(entry)}</strong></p>
															<p><span>Required Missing</span><strong>{missingRequiredFields.length}</strong></p>
														</div>
														{missingRequiredFields.length > 0 ? (
															<p className="panel-subtext">
																Missing required fields: {missingRequiredFields.map((field) => field.label).join(', ')}
															</p>
														) : null}
														<div className="import-mapping-list">
															{entry.headers.map((header) => (
																<div key={header.key} className="import-mapping-row">
																	<div className="import-mapping-source">
																		<strong>{header.label}</strong>
																		<div className="import-mapping-source-samples">
																			<span className="import-mapping-source-label">CSV samples</span>
																			<span className="panel-subtext">
																				{entry.sampleRows
																					.map((row) => row[header.key])
																					.filter(Boolean)
																					.slice(0, 2)
																					.join(' | ') || 'No sample values'}
																			</span>
																		</div>
																	</div>
																	<div className="import-mapping-target">
																		<select
																			value={entry.mapping[header.key] || ''}
																			onChange={(event) => updateGenericColumnMapping(entry.id, header.key, event.target.value)}
																			disabled={busy}
																		>
																			<option value="">Ignore Column</option>
																			{fieldOptions.map((field) => (
																				<option key={field.value} value={field.value}>
																					{field.label}{field.required ? ' *' : ''}
																				</option>
																			))}
																		</select>
																	</div>
																</div>
															))}
														</div>
													</>
												) : null}
											</section>
										);
									})() : null}
								</section>
							</>
						) : null}

						{isBullhornBatch ? (
							<section className="import-mapping-section">
								<div className="import-mapping-header">
									<div>
										<h4>{isBullhornZip ? 'Bullhorn ZIP Batch' : 'Bullhorn Manual Batch'}</h4>
										<p className="panel-subtext">
											{isBullhornZip
												? 'Upload one ZIP containing Bullhorn CSV exports. Hire Gnome will unpack the batch, let you review the detected entity files, and import them in dependency order so clients are created before contacts and job orders.'
												: 'Upload one or more Bullhorn CSV files manually. Hire Gnome will preview and import them in dependency order so clients are created before contacts and job orders.'}
										</p>
									</div>
								</div>
								{importView === 'mapping' && (!isBullhornZip || activeBullhornBatchEntries.length > 0) ? (
									<div className="import-batch-tabs" role="tablist" aria-label="Bullhorn batch files">
										{bullhornBatchEntries.map((entry) => {
											const ready = Boolean(entry.file) && Boolean(entry.entity);
											return (
												<button
													key={entry.id}
													type="button"
													role="tab"
													aria-selected={activeBullhornBatchEntry?.id === entry.id}
													className={`import-batch-tab ${activeBullhornBatchEntry?.id === entry.id ? 'is-active' : ''}`}
													onClick={() => selectBullhornBatchEntry(entry.id)}
												>
													<span>{importEntityLabel(entry.entity)}</span>
													<span className="import-batch-tab-meta">{entry.file ? (ready ? 'Ready' : 'Needs Review') : 'No File'}</span>
												</button>
											);
										})}
									</div>
								) : null}
								{isBullhornZip && importView === 'mapping' && activeBullhornBatchEntries.length > 0 ? (
									<div className="import-next-step">
										<div>
											<h4>Next Step</h4>
											<p className="panel-subtext">
												{bullhornBatchReady
													? 'Bullhorn batch loaded. Review any file assignments you want, then return to the preview safety check.'
													: `${readyBullhornBatchEntryCount} ready, ${missingBullhornBatchFileCount} without files. Finish the batch, then preview the import.`}
											</p>
										</div>
										<div className="form-actions">
											{preview ? (
												<button
													type="button"
													className="btn-secondary"
													onClick={() => setImportView('preview')}
													disabled={busy}
												>
													Return To Preview
												</button>
											) : (
												<button
													type="button"
													className="btn-secondary"
													onClick={() => runImport('preview')}
													disabled={busy || !bullhornBatchReady}
												>
													{runningMode === 'preview' ? 'Previewing...' : 'Preview Import'}
												</button>
											)}
										</div>
									</div>
								) : null}
								{!isBullhornZip ? (
									<div className="import-next-step">
										<div>
											<h4>Next Step</h4>
											<p className="panel-subtext">
												{bullhornBatchReady
													? `All ${readyBullhornBatchEntryCount} uploaded Bullhorn file${readyBullhornBatchEntryCount === 1 ? '' : 's'} are ready. Preview the import safety check before applying it.`
													: `${readyBullhornBatchEntryCount} ready${missingBullhornBatchFileCount > 0 ? `, ${missingBullhornBatchFileCount} without files` : ''}. Finish the batch, then preview the import.`}
											</p>
										</div>
										<div className="form-actions">
											<button
												type="button"
												className="btn-secondary"
												onClick={() => runImport('preview')}
												disabled={busy || !bullhornBatchReady}
											>
												{runningMode === 'preview' ? 'Previewing...' : 'Preview Import'}
											</button>
										</div>
									</div>
								) : null}
								{activeBullhornBatchEntry && importView === 'mapping' && (!isBullhornZip || activeBullhornBatchEntries.length > 0) ? (
									<section
										ref={mappingSectionRef}
										className="import-batch-item"
									>
										<div className="import-batch-item-header">
											<div>
												<h4>{importEntityLabel(activeBullhornBatchEntry.entity)} Bullhorn File</h4>
												<p className="panel-subtext">
													{activeBullhornBatchEntry.file
														? `Editing ${activeBullhornBatchEntry.file.name}. Review the detected entity type before previewing the import.`
														: 'Upload or replace the CSV file for this Bullhorn entity.'}
												</p>
											</div>
											<div className="form-actions">
												<button type="button" className="btn-secondary" onClick={() => downloadBullhornCsvTemplate(activeBullhornBatchEntry.entity)} disabled={busy}>
													<FileSpreadsheet size={16} aria-hidden="true" />
													<span>Template</span>
												</button>
												<button type="button" className="btn-secondary" onClick={() => removeBullhornBatchEntry(activeBullhornBatchEntry.id)} disabled={busy}>
													<Trash2 size={16} aria-hidden="true" />
													<span>Remove</span>
												</button>
											</div>
										</div>

										<div className="import-batch-item-grid">
											<FormField label="Entity Profile">
												<select
													value={activeBullhornBatchEntry.entity}
													onChange={(event) => updateBullhornBatchEntity(activeBullhornBatchEntry.id, event.target.value)}
													disabled={busy}
												>
													{BULLHORN_CSV_ENTITY_OPTIONS.map((option) => (
														<option key={option.value} value={option.value}>
															{option.label}
														</option>
													))}
												</select>
											</FormField>
											<FormField
												label="CSV File"
												hint={
													isBullhornZip
														? 'ZIP mode extracts these files automatically. Replace a specific extracted CSV here only if needed.'
														: 'Upload the Bullhorn CSV file for this entity.'
												}
											>
												<input
													type="file"
													accept=".csv,text/csv"
													onChange={(event) => updateBullhornBatchFile(activeBullhornBatchEntry.id, event.target.files?.[0] || null)}
												/>
											</FormField>
										</div>

										{activeBullhornBatchEntry.headers.length > 0 ? (
											<>
												<div className="info-list snapshot-grid snapshot-grid-four">
													<p><span>Columns</span><strong>{activeBullhornBatchEntry.headers.length}</strong></p>
													<p><span>Preview Rows</span><strong>{activeBullhornBatchEntry.sampleRows.length}</strong></p>
													<p><span>Detected Entity</span><strong>{importEntityLabel(activeBullhornBatchEntry.entity)}</strong></p>
													<p><span>Status</span><strong>{activeBullhornBatchEntry.file ? 'Ready' : 'Missing File'}</strong></p>
												</div>
												<div className="import-mapping-list">
													{activeBullhornBatchEntry.headers.map((header) => (
														<div key={header.key} className="import-mapping-row">
															<div className="import-mapping-source">
																<strong>{header.label}</strong>
																<div className="import-mapping-source-samples">
																	<span className="import-mapping-source-label">CSV samples</span>
																	<span className="panel-subtext">
																		{activeBullhornBatchEntry.sampleRows
																			.map((row) => row[header.key])
																			.filter(Boolean)
																			.slice(0, 2)
																			.join(' | ') || 'No sample values'}
																	</span>
																</div>
															</div>
														</div>
													))}
												</div>
											</>
										) : null}
									</section>
								) : null}
							</section>
						) : null}

						{isZohoBatch ? (
							<section className="import-mapping-section">
								<div className="import-mapping-header">
									<div>
										<h4>{isZohoZip ? 'Zoho Recruit ZIP Batch' : 'Zoho Recruit Manual Batch'}</h4>
										<p className="panel-subtext">
											{isZohoZip
												? 'Upload one ZIP containing Zoho Recruit CSV exports. Hire Gnome will unpack the batch, let you review the detected entity files, and import them in dependency order so accounts are created before contacts and job orders.'
												: 'Upload one or more Zoho Recruit CSV files manually. Hire Gnome will preview and import them in dependency order so accounts are created before contacts and job orders.'}
										</p>
									</div>
								</div>
								{importView === 'mapping' && (!isZohoZip || activeZohoBatchEntries.length > 0) ? (
									<div className="import-batch-tabs" role="tablist" aria-label="Zoho Recruit batch files">
										{zohoBatchEntries.map((entry) => {
											const ready = Boolean(entry.file) && Boolean(entry.entity);
											return (
												<button
													key={entry.id}
													type="button"
													role="tab"
													aria-selected={activeZohoBatchEntry?.id === entry.id}
													className={`import-batch-tab ${activeZohoBatchEntry?.id === entry.id ? 'is-active' : ''}`}
													onClick={() => selectZohoBatchEntry(entry.id)}
												>
													<span>{importEntityLabel(entry.entity)}</span>
													<span className="import-batch-tab-meta">{entry.file ? (ready ? 'Ready' : 'Needs Review') : 'No File'}</span>
												</button>
											);
										})}
									</div>
								) : null}
								{isZohoZip && importView === 'mapping' && activeZohoBatchEntries.length > 0 ? (
									<div className="import-next-step">
										<div>
											<h4>Next Step</h4>
											<p className="panel-subtext">
												{zohoBatchReady
													? 'Zoho Recruit batch loaded. Review any file assignments you want, then return to the preview safety check.'
													: `${readyZohoBatchEntryCount} ready, ${missingZohoBatchFileCount} without files. Finish the batch, then preview the import.`}
											</p>
										</div>
										<div className="form-actions">
											{preview ? (
												<button
													type="button"
													className="btn-secondary"
													onClick={() => setImportView('preview')}
													disabled={busy}
												>
													Return To Preview
												</button>
											) : (
												<button
													type="button"
													className="btn-secondary"
													onClick={() => runImport('preview')}
													disabled={busy || !zohoBatchReady}
												>
													{runningMode === 'preview' ? 'Previewing...' : 'Preview Import'}
												</button>
											)}
										</div>
									</div>
								) : null}
								{!isZohoZip ? (
									<div className="import-next-step">
										<div>
											<h4>Next Step</h4>
											<p className="panel-subtext">
												{zohoBatchReady
													? `All ${readyZohoBatchEntryCount} uploaded Zoho Recruit file${readyZohoBatchEntryCount === 1 ? '' : 's'} are ready. Preview the import safety check before applying it.`
													: `${readyZohoBatchEntryCount} ready${missingZohoBatchFileCount > 0 ? `, ${missingZohoBatchFileCount} without files` : ''}. Finish the batch, then preview the import.`}
											</p>
										</div>
										<div className="form-actions">
											<button
												type="button"
												className="btn-secondary"
												onClick={() => runImport('preview')}
												disabled={busy || !zohoBatchReady}
											>
												{runningMode === 'preview' ? 'Previewing...' : 'Preview Import'}
											</button>
										</div>
									</div>
								) : null}
								{activeZohoBatchEntry && importView === 'mapping' && (!isZohoZip || activeZohoBatchEntries.length > 0) ? (
									<section
										ref={mappingSectionRef}
										className="import-batch-item"
									>
										<div className="import-batch-item-header">
											<div>
												<h4>{importEntityLabel(activeZohoBatchEntry.entity)} Zoho Recruit File</h4>
												<p className="panel-subtext">
													{activeZohoBatchEntry.file
														? `Editing ${activeZohoBatchEntry.file.name}. Review the detected entity type before previewing the import.`
														: 'Upload or replace the CSV file for this Zoho Recruit entity.'}
												</p>
											</div>
											<div className="form-actions">
												<button type="button" className="btn-secondary" onClick={() => downloadZohoCsvTemplate(activeZohoBatchEntry.entity)} disabled={busy}>
													<FileSpreadsheet size={16} aria-hidden="true" />
													<span>Template</span>
												</button>
												<button type="button" className="btn-secondary" onClick={() => removeZohoBatchEntry(activeZohoBatchEntry.id)} disabled={busy}>
													<Trash2 size={16} aria-hidden="true" />
													<span>Remove</span>
												</button>
											</div>
										</div>

										<div className="import-batch-item-grid">
											<FormField label="Entity Profile">
												<select
													value={activeZohoBatchEntry.entity}
													onChange={(event) => updateZohoBatchEntity(activeZohoBatchEntry.id, event.target.value)}
													disabled={busy}
												>
													{ZOHO_CSV_ENTITY_OPTIONS.map((option) => (
														<option key={option.value} value={option.value}>
															{option.label}
														</option>
													))}
												</select>
											</FormField>
											<FormField
												label="CSV File"
												hint={
													isZohoZip
														? 'ZIP mode extracts these files automatically. Replace a specific extracted CSV here only if needed.'
														: 'Upload the Zoho Recruit CSV file for this entity.'
												}
											>
												<input
													type="file"
													accept=".csv,text/csv"
													onChange={(event) => updateZohoBatchFile(activeZohoBatchEntry.id, event.target.files?.[0] || null)}
												/>
											</FormField>
										</div>

										{activeZohoBatchEntry.headers.length > 0 ? (
											<>
												<div className="info-list snapshot-grid snapshot-grid-four">
													<p><span>Columns</span><strong>{activeZohoBatchEntry.headers.length}</strong></p>
													<p><span>Preview Rows</span><strong>{activeZohoBatchEntry.sampleRows.length}</strong></p>
													<p><span>Detected Entity</span><strong>{importEntityLabel(activeZohoBatchEntry.entity)}</strong></p>
													<p><span>Status</span><strong>{activeZohoBatchEntry.file ? 'Ready' : 'Missing File'}</strong></p>
												</div>
												<div className="import-mapping-list">
													{activeZohoBatchEntry.headers.map((header) => (
														<div key={header.key} className="import-mapping-row">
															<div className="import-mapping-source">
																<strong>{header.label}</strong>
																<div className="import-mapping-source-samples">
																	<span className="import-mapping-source-label">CSV samples</span>
																	<span className="panel-subtext">
																		{activeZohoBatchEntry.sampleRows
																			.map((row) => row[header.key])
																			.filter(Boolean)
																			.slice(0, 2)
																			.join(' | ') || 'No sample values'}
																	</span>
																</div>
															</div>
														</div>
													))}
												</div>
											</>
										) : null}
									</section>
								) : null}
							</section>
						) : null}

						{(isBullhorn && !isBullhornBatch) || (isZoho && !isZohoBatch) ? (
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
										setImportView('mapping');
										setResult(null);
									}}
										disabled={busy}
									>
										{(isBullhorn ? BULLHORN_CSV_ENTITY_OPTIONS : ZOHO_CSV_ENTITY_OPTIONS).map((option) => (
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

					</section>
				</article>
				) : null}

					{preview && importView === 'preview' && !result ? (
						<article ref={previewSectionRef} className="panel panel-spacious">
							<div className="import-preview-header">
								<div>
									<h3>Preview Safety Check</h3>
									<p className="import-preview-subtext">Preview is a safety check. Review creates, updates, skips, and relationship warnings before applying the import.</p>
									<p className="panel-subtext">{importApplyHelperText}</p>
								</div>
								<div className="form-actions">
									<button type="button" className="btn-secondary" onClick={() => setImportView('mapping')} disabled={busy}>
										<ArrowLeft size={16} aria-hidden="true" />
										<span>Back To Mapping</span>
									</button>
									<button
										type="button"
										onClick={() => runImport('apply')}
									disabled={
										(isGenericCsv && !genericBatchReady) ||
										(isBullhornBatch && !bullhornBatchReady) ||
										(isZohoBatch && !zohoBatchReady) ||
										(!isGenericCsv && !isBullhornBatch && !isZohoBatch && !file) ||
										busy ||
										!preview
										}
									>
										<Check size={16} aria-hidden="true" />
										<span>{runningMode === 'apply' ? 'Importing...' : 'Apply Import'}</span>
									</button>
								</div>
							</div>
							<div className="import-preview-tabs" role="tablist" aria-label="Import preview entities">
							{visiblePreviewEntityKeys.map((entityKey) => {
								const entityPreview = preview?.details?.[entityKey];
								const incomingCount = formatCount(entityPreview?.incoming);
								return (
									<button
										key={entityKey}
										type="button"
										role="tab"
										aria-selected={previewEntityTab === entityKey}
										className={`import-preview-tab import-preview-tab-${entityKey} ${previewEntityTab === entityKey ? 'is-active' : ''}`}
										onClick={() => setPreviewEntityTab(entityKey)}
									>
										<span>{importEntityLabel(entityKey)}</span>
										<span className="import-preview-tab-count">{incomingCount}</span>
									</button>
								);
							})}
						</div>
						{preview?.details?.[previewEntityTab] ? (
							<div className={`import-preview-panel import-preview-panel-${previewEntityTab}`}>
								<div className="info-list snapshot-grid snapshot-grid-four">
									<p><span>Incoming</span><strong>{formatCount(preview.details[previewEntityTab].incoming)}</strong></p>
									<p><span>Create</span><strong>{formatCount(preview.details[previewEntityTab].create)}</strong></p>
									<p><span>Update</span><strong>{formatCount(preview.details[previewEntityTab].update)}</strong></p>
									<p><span>Skip</span><strong>{formatCount(preview.details[previewEntityTab].skip)}</strong></p>
								</div>
								{Array.isArray(preview.details[previewEntityTab].warnings) && preview.details[previewEntityTab].warnings.length > 0 ? (
									<div className="import-preview-warning-list">
										{preview.details[previewEntityTab].warnings.map((warning, index) => (
											<p key={`${previewEntityTab}-warning-${index}`} className="panel-subtext error">
												{warning}
											</p>
										))}
									</div>
								) : (
									<p className="panel-subtext success">No warnings for this entity in preview.</p>
								)}
								<div className="workspace-scroll-area">
									<ul className="workspace-list">
										{preview.details[previewEntityTab].rows.map((row, index) => (
											<li key={`${previewEntityTab}-row-${index}`} className="workspace-item import-preview-row">
												<div className="workspace-item-header">
													<strong>{row.label}</strong>
													<span className={`chip import-preview-action-chip import-preview-action-${row.action}`}>{row.action}</span>
												</div>
												{row.note ? <p>{row.note}</p> : null}
												{row.matchReason ? <p className="import-preview-row-meta">Matched by: {row.matchReason}</p> : null}
											</li>
										))}
									</ul>
								</div>
							</div>
						) : null}
					</article>
				) : null}

				{result ? (
					<article className="panel panel-spacious">
						<div className="import-preview-header">
							<div>
								<h3>Import Result</h3>
								<p className="import-preview-subtext">The import is complete. Review the final outcome below or start a new import.</p>
							</div>
							<div className="form-actions">
								<button type="button" className="btn-secondary" onClick={resetImportFlow}>
									<Plus size={16} aria-hidden="true" />
									<span>Start New Import</span>
								</button>
							</div>
						</div>
						<div className="info-list snapshot-grid snapshot-grid-four import-result-summary">
							<p>
								<span>Created</span>
								<strong>{visiblePreviewEntityKeys.reduce((sum, entity) => sum + formatCount(result?.created?.[entity]), 0)}</strong>
							</p>
							<p>
								<span>Updated</span>
								<strong>{visiblePreviewEntityKeys.reduce((sum, entity) => sum + formatCount(result?.updated?.[entity]), 0)}</strong>
							</p>
							<p>
								<span>Skipped</span>
								<strong>{visiblePreviewEntityKeys.reduce((sum, entity) => sum + formatCount(result?.skipped?.[entity]), 0)}</strong>
							</p>
							<p>
								<span>Warnings</span>
								<strong>{Array.isArray(result?.errors) ? result.errors.length : 0}</strong>
							</p>
						</div>
						{result?.files?.candidateAttachments ? (
							<div className="info-list snapshot-grid snapshot-grid-three import-result-summary">
								<p>
									<span>Candidate Files Imported</span>
									<strong>{formatCount(result?.files?.candidateAttachments?.created)}</strong>
								</p>
								<p>
									<span>Candidate Files Skipped</span>
									<strong>{formatCount(result?.files?.candidateAttachments?.skipped)}</strong>
								</p>
								<p>
									<span>File Warnings</span>
									<strong>{Array.isArray(result?.files?.candidateAttachments?.errors) ? result.files.candidateAttachments.errors.length : 0}</strong>
								</p>
							</div>
						) : null}
						<div className="import-result-grid">
							{visiblePreviewEntityKeys.map((entity) => (
								<section key={entity} className={`import-result-card import-result-card-${entity}`}>
									<div className="import-result-card-header">
										<h4>{importEntityLabel(entity)}</h4>
									</div>
									<div className="import-result-card-metrics">
										<span className="chip import-result-chip import-result-chip-create">Created {formatCount(result?.created?.[entity])}</span>
										<span className="chip import-result-chip import-result-chip-update">Updated {formatCount(result?.updated?.[entity])}</span>
										<span className="chip import-result-chip import-result-chip-skip">Skipped {formatCount(result?.skipped?.[entity])}</span>
									</div>
								</section>
							))}
						</div>
						<div className="import-preview-tabs" role="tablist" aria-label="Import result entities">
							{visiblePreviewEntityKeys.map((entityKey) => {
								const entityDetails = result?.details?.[entityKey];
								const activityCount =
									formatCount(entityDetails?.create) +
									formatCount(entityDetails?.update) +
									formatCount(entityDetails?.skip);
								return (
									<button
										key={`result-${entityKey}`}
										type="button"
										role="tab"
										aria-selected={resultEntityTab === entityKey}
										className={`import-preview-tab import-preview-tab-${entityKey} ${resultEntityTab === entityKey ? 'is-active' : ''}`}
										onClick={() => setResultEntityTab(entityKey)}
									>
										<span>{importEntityLabel(entityKey)}</span>
										<span className="import-preview-tab-count">{activityCount}</span>
									</button>
								);
							})}
						</div>
						{result?.details?.[resultEntityTab] ? (
							<div className={`import-preview-panel import-preview-panel-${resultEntityTab}`}>
								<div className="info-list snapshot-grid snapshot-grid-four">
									<p><span>Incoming</span><strong>{formatCount(result.details[resultEntityTab].incoming)}</strong></p>
									<p><span>Create</span><strong>{formatCount(result.details[resultEntityTab].create)}</strong></p>
									<p><span>Update</span><strong>{formatCount(result.details[resultEntityTab].update)}</strong></p>
									<p><span>Skip</span><strong>{formatCount(result.details[resultEntityTab].skip)}</strong></p>
								</div>
								{Array.isArray(result.details[resultEntityTab].warnings) && result.details[resultEntityTab].warnings.length > 0 ? (
									<div className="import-preview-warning-list">
										{result.details[resultEntityTab].warnings.map((warning, index) => (
											<p key={`result-${resultEntityTab}-warning-${index}`} className="panel-subtext error">
												{warning}
											</p>
										))}
									</div>
								) : (
									<p className="panel-subtext success">No warnings recorded for this entity in the applied import.</p>
								)}
								<div className="workspace-scroll-area">
									<ul className="workspace-list">
										{result.details[resultEntityTab].rows.map((row, index) => (
											<li key={`result-${resultEntityTab}-row-${index}`} className="workspace-item import-preview-row">
												<div className="workspace-item-header">
													<strong>{row.label}</strong>
													<span className={`chip import-preview-action-chip import-preview-action-${row.action}`}>{row.action}</span>
												</div>
												{row.note ? <p>{row.note}</p> : null}
												{row.matchReason ? <p className="import-preview-row-meta">Matched by: {row.matchReason}</p> : null}
											</li>
										))}
									</ul>
								</div>
							</div>
						) : null}
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
