'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCcw } from 'lucide-react';
import { formatSelectValueLabel } from '@/lib/select-value-label';
import { formatDateTimeAt } from '@/lib/date-format';
import LoadingIndicator from '@/app/components/loading-indicator';

const FIELD_LABELS = {
	id: 'ID',
	recordId: 'Record ID',
	firstName: 'First Name',
	lastName: 'Last Name',
	email: 'Email',
	phone: 'Phone',
	mobile: 'Mobile',
	status: 'Status',
	source: 'Source',
	owner: 'Owner',
	ownerId: 'Owner',
	divisionId: 'Division',
	clientId: 'Client',
	contactId: 'Hiring Manager',
	candidateId: 'Candidate',
	jobOrderId: 'Job Order',
	interviewId: 'Interview',
	submissionId: 'Submission',
	offerId: 'Placement',
	title: 'Title',
	subject: 'Subject',
	description: 'Description',
	publicDescription: 'Public Description',
	location: 'Location',
	interviewMode: 'Type',
	interviewer: 'Interviewer',
	interviewerEmail: 'Interviewer Email',
	startsAt: 'Start Time',
	endsAt: 'End Time',
	notes: 'Notes',
	website: 'Website',
	linkedinUrl: 'LinkedIn URL',
	industry: 'Industry',
	openings: 'Openings',
	employmentType: 'Employment Type',
	publishToCareerSite: 'Post To Career Site',
	salaryMin: 'Salary Min',
	salaryMax: 'Salary Max',
	city: 'City',
	state: 'State',
	zipCode: 'Zip Code',
	address: 'Address',
	addressPlaceId: 'Address Place ID',
	addressLatitude: 'Address Latitude',
	addressLongitude: 'Address Longitude',
	locationPlaceId: 'Location Place ID',
	locationLatitude: 'Location Latitude',
	locationLongitude: 'Location Longitude',
	videoLink: 'Video Link',
	optionalParticipants: 'Optional Participants',
	withdrawnReason: 'Withdraw Reason',
	placementType: 'Placement Type',
	compensationType: 'Compensation Type',
	currency: 'Currency',
	hourlyRtBillRate: 'RT Bill Rate',
	hourlyRtPayRate: 'RT Pay Rate',
	hourlyOtBillRate: 'OT Bill Rate',
	hourlyOtPayRate: 'OT Pay Rate',
	dailyBillRate: 'Daily Bill Rate',
	dailyPayRate: 'Daily Pay Rate',
	yearlyCompensation: 'Yearly Compensation',
	offeredOn: 'Offered On',
	expectedJoinDate: 'Start Date',
	endDate: 'End Date',
	createdByUserId: 'Created By',
	uploadedByUserId: 'Uploaded By',
	isActive: 'Active',
	notifyCareerSiteApplications: 'Career Site Application Emails',
	careerSiteEnabled: 'Career Site Enabled',
	siteName: 'Site Name',
	siteTitle: 'Site Name',
	logoStorageProvider: 'Logo Storage Provider',
	logoStorageBucket: 'Logo Storage Bucket',
	logoStorageKey: 'Logo Storage Key',
	logoContentType: 'Logo Content Type',
	logoFileName: 'Logo File Name',
	themeKey: 'Theme Preset',
	accessMode: 'Access Mode'
};

function formatDateTime(value) {
	return formatDateTimeAt(value);
}

function formatActionLabel(value) {
	const normalized = String(value || '').trim().toUpperCase();
	if (!normalized) return 'Unknown';
	if (normalized === 'CREATE') return 'Created';
	if (normalized === 'UPDATE') return 'Updated';
	if (normalized === 'DELETE') return 'Deleted';
	return `${normalized.slice(0, 1)}${normalized.slice(1).toLowerCase()}`;
}

function actorName(log) {
	if (!log?.actorUser) return 'System';
	const firstName = String(log.actorUser.firstName || '').trim();
	const lastName = String(log.actorUser.lastName || '').trim();
	const fullName = `${firstName} ${lastName}`.trim();
	return fullName || log.actorUser.email || 'System';
}

function actionChipClass(action) {
	const normalized = String(action || '').trim().toUpperCase();
	if (normalized === 'CREATE') return 'chip audit-action-chip audit-action-chip-create';
	if (normalized === 'UPDATE') return 'chip audit-action-chip audit-action-chip-update';
	if (normalized === 'DELETE') return 'chip audit-action-chip audit-action-chip-delete';
	return 'chip audit-action-chip';
}

function prettyJson(value) {
	if (value == null) return '';
	try {
		return JSON.stringify(value, null, '\t');
	} catch {
		return String(value);
	}
}

function normalizeValue(value) {
	if (value == null || value === '') return '-';
	if (Array.isArray(value)) {
		return value.length === 0 ? '-' : value.map((entry) => normalizeValue(entry)).join(', ');
	}
	if (typeof value === 'boolean') return value ? 'Yes' : 'No';
	if (typeof value === 'string') {
		const trimmed = value.trim();
		if (!trimmed) return '-';
		const isoDate = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(trimmed);
		if (isoDate) {
			const formatted = formatDateTime(trimmed);
			return formatted === '-' ? trimmed : formatted;
		}
		if (trimmed.includes('_') || /^[a-z]/.test(trimmed)) {
			return formatSelectValueLabel(trimmed);
		}
		return trimmed;
	}
	if (typeof value === 'number') return String(value);
	if (value instanceof Date) return formatDateTime(value);
	return String(value);
}

function toLabel(field) {
	if (FIELD_LABELS[field]) return FIELD_LABELS[field];
	return field.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (value) => value.toUpperCase());
}

function changedFieldKeys(log) {
	const before = log?.beforeData && typeof log.beforeData === 'object' ? log.beforeData : {};
	const after = log?.afterData && typeof log.afterData === 'object' ? log.afterData : {};

	if (Array.isArray(log?.changedFields) && log.changedFields.length > 0) {
		return log.changedFields;
	}

	if (String(log?.action || '').toUpperCase() === 'CREATE') {
		return Object.keys(after);
	}

	if (String(log?.action || '').toUpperCase() === 'DELETE') {
		return Object.keys(before);
	}

	const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
	return [...keys].filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
}

function diffRows(log) {
	const before = log?.beforeData && typeof log.beforeData === 'object' ? log.beforeData : {};
	const after = log?.afterData && typeof log.afterData === 'object' ? log.afterData : {};
	const keys = changedFieldKeys(log);

	return keys.map((field) => ({
		field,
		label: toLabel(field),
		before: normalizeValue(before[field]),
		after: normalizeValue(after[field])
	}));
}

export default function AuditTrailPanel({ entityType, entityId, visible, limit = 50 }) {
	const panelRef = useRef(null);
	const [logs, setLogs] = useState([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');

	const normalizedType = useMemo(() => String(entityType || '').trim().toUpperCase(), [entityType]);
	const normalizedId = useMemo(() => {
		const parsed = Number(entityId);
		return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
	}, [entityId]);

	const load = useCallback(async () => {
		if (!visible) return;
		if (!normalizedType || !normalizedId) {
			setLogs([]);
			setError('Audit trail is unavailable for this record.');
			setLoading(false);
			return;
		}

		setLoading(true);
		setError('');
		const query = new URLSearchParams({
			entityType: normalizedType,
			entityId: String(normalizedId),
			limit: String(limit)
		});

		const res = await fetch(`/api/audit-logs?${query.toString()}`);
		if (!res.ok) {
			const data = await res.json().catch(() => ({}));
			setLogs([]);
			setError(data.error || 'Failed to load audit trail.');
			setLoading(false);
			return;
		}

		const data = await res.json();
		const rows = Array.isArray(data) ? data : [];
		setLogs(
			rows.filter((log) => String(log?.action || '').trim().toUpperCase() === 'UPDATE')
		);
		setLoading(false);
	}, [limit, normalizedId, normalizedType, visible]);

	useEffect(() => {
		if (!visible) return;
		load();
	}, [load, visible]);

	useEffect(() => {
		if (!visible) return;
		const timer = window.setTimeout(() => {
			panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
		}, 60);
		return () => window.clearTimeout(timer);
	}, [visible]);

	if (!visible) return null;

	return (
		<article className="panel panel-spacious" ref={panelRef}>
			<div className="audit-trail-toolbar">
				<div>
					<h3>Audit Trail</h3>
					<p className="panel-subtext">Who changed what, and when.</p>
				</div>
				<button
					type="button"
					className="btn-secondary btn-link-icon btn-refresh-icon audit-trail-refresh"
					onClick={load}
					disabled={loading}
					aria-label={loading ? 'Refreshing audit trail' : 'Refresh audit trail'}
					title={loading ? 'Refreshing audit trail' : 'Refresh audit trail'}
				>
					<RefreshCcw
						aria-hidden="true"
						className={loading ? 'btn-refresh-icon-svg row-action-icon-spinner' : 'btn-refresh-icon-svg'}
					/>
				</button>
			</div>
			<div className="audit-trail-content">
				{error ? <p className="panel-subtext error">{error}</p> : null}

				{!error && loading ? <LoadingIndicator className="list-loading-indicator" label="Loading audit trail" /> : null}

				{!error && !loading && logs.length === 0 ? (
					<p className="panel-subtext">No update entries yet.</p>
				) : null}

				{!error && !loading && logs.length > 0 ? (
					<ul className="simple-list audit-trail-list">
						{logs.map((log) => {
							const rows = diffRows(log);
							return (
								<li key={log.id}>
									<div>
										<strong>{log.summary || `${formatActionLabel(log.action)} ${normalizedType}`}</strong>
										<p className="simple-list-meta">
											By {actorName(log)} @ <span className="meta-emphasis-time">{formatDateTime(log.createdAt)}</span>
										</p>
										{rows.length > 0 ? (
											<div className="audit-change-list" role="table" aria-label="Audit field changes">
												<div className="audit-change-head" role="row">
													<span role="columnheader">Field</span>
													<span role="columnheader">Old Value</span>
													<span role="columnheader">New Value</span>
												</div>
												{rows.map((row) => (
													<div key={`${log.id}-${row.field}`} className="audit-change-row" role="row">
														<span role="cell">{row.label}</span>
														<span role="cell">{row.before}</span>
														<span role="cell">{row.after}</span>
													</div>
												))}
											</div>
										) : null}
										{log.beforeData || log.afterData ? (
											<details className="audit-entry-details">
												<summary>View raw payload</summary>
												<div className="audit-entry-grid">
													{log.beforeData ? (
														<div>
															<p className="audit-entry-label">Before</p>
															<pre>{prettyJson(log.beforeData)}</pre>
														</div>
													) : null}
													{log.afterData ? (
														<div>
															<p className="audit-entry-label">After</p>
															<pre>{prettyJson(log.afterData)}</pre>
														</div>
													) : null}
												</div>
											</details>
										) : null}
									</div>
									<div className="simple-list-actions simple-list-indicators">
										<span className={actionChipClass(log.action)}>{formatActionLabel(log.action)}</span>
									</div>
								</li>
							);
						})}
					</ul>
				) : null}
			</div>
		</article>
	);
}
