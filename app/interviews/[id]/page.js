'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Lock, MoreVertical } from 'lucide-react';
import LookupTypeaheadSelect from '@/app/components/lookup-typeahead-select';
import FormField from '@/app/components/form-field';
import CustomFieldsSection, { areRequiredCustomFieldsComplete } from '@/app/components/custom-fields-section';
import AddressTypeaheadInput from '@/app/components/address-typeahead-input';
import EmailChipInput from '@/app/components/email-chip-input';
import LoadingIndicator from '@/app/components/loading-indicator';
import AuditTrailPanel from '@/app/components/audit-trail-panel';
import { useToast } from '@/app/components/toast-provider';
import { useConfirmDialog } from '@/app/components/confirm-dialog';
import useUnsavedChangesGuard from '@/app/hooks/use-unsaved-changes-guard';
import { INTERVIEW_TYPE_OPTIONS, normalizeInterviewType } from '@/app/constants/interview-type-options';
import { formatDateTimeAt } from '@/lib/date-format';
import { isValidOptionalHttpUrl, normalizeHttpUrl } from '@/lib/url-validation';
import {
	VIDEO_CALL_PROVIDER_OPTIONS,
	getVideoCallLinkPlaceholder,
	getVideoCallProviderTemplate,
	inferVideoCallProviderFromLink,
	normalizeVideoCallProvider
} from '@/lib/video-call-links';

const initialForm = {
	interviewMode: 'phone',
	status: 'scheduled',
	subject: '',
	interviewer: '',
	interviewerEmail: '',
	startsAt: '',
	endsAt: '',
	location: '',
	locationPlaceId: '',
	locationLatitude: '',
	locationLongitude: '',
	videoCallProvider: '',
	videoLink: '',
	optionalParticipantEmails: [],
	candidateId: '',
	jobOrderId: '',
	customFields: {}
};

function toLocalDateTime(value) {
	if (!value) return '';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return '';
	return date.toISOString().slice(0, 16);
}

function normalizeInterviewStatus(value) {
	const normalized = String(value || '').trim().toLowerCase();
	if (normalized === 'completed') return 'completed';
	if (normalized === 'cancelled') return 'cancelled';
	return 'scheduled';
}

function toForm(row) {
	if (!row) return initialForm;

	const optionalParticipantEmails = Array.isArray(row.optionalParticipants)
		? row.optionalParticipants
				.map((value) =>
					typeof value === 'string'
						? value
						: typeof value?.email === 'string'
							? value.email
							: ''
				)
				.map((value) => String(value || '').trim().toLowerCase())
				.filter(Boolean)
		: [];

	return {
		interviewMode: normalizeInterviewType(row.interviewMode),
		status: normalizeInterviewStatus(row.status),
		subject: row.subject || '',
		interviewer: row.interviewer || '',
		interviewerEmail: row.interviewerEmail || '',
		startsAt: toLocalDateTime(row.startsAt),
		endsAt: toLocalDateTime(row.endsAt),
		location: row.location || '',
		locationPlaceId: row.locationPlaceId || '',
		locationLatitude: row.locationLatitude ?? '',
		locationLongitude: row.locationLongitude ?? '',
		videoCallProvider: inferVideoCallProviderFromLink(row.videoLink),
		videoLink: row.videoLink || '',
		optionalParticipantEmails,
		candidateId: String(row.candidateId || ''),
		jobOrderId: String(row.jobOrderId || ''),
		customFields:
			row.customFields && typeof row.customFields === 'object' && !Array.isArray(row.customFields)
				? row.customFields
				: {}
	};
}

function formatDate(value) {
	return formatDateTimeAt(value);
}

function parseFilenameFromDisposition(disposition) {
	if (!disposition) return '';
	const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
	if (utf8Match?.[1]) {
		return decodeURIComponent(utf8Match[1]);
	}

	const quotedMatch = disposition.match(/filename="([^"]+)"/i);
	if (quotedMatch?.[1]) {
		return quotedMatch[1];
	}

	const plainMatch = disposition.match(/filename=([^;]+)/i);
	return plainMatch?.[1]?.trim() || '';
}

export default function InterviewDetailsPage() {
	const { id } = useParams();
	const router = useRouter();
	const actionsMenuRef = useRef(null);
	const [interview, setInterview] = useState(null);
	const [form, setForm] = useState(initialForm);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [saveState, setSaveState] = useState({ saving: false, error: '', success: '' });
	const [inviteState, setInviteState] = useState({ downloading: false, error: '' });
	const [cancelState, setCancelState] = useState({ canceling: false, error: '' });
	const [actionsOpen, setActionsOpen] = useState(false);
	const [showAuditTrail, setShowAuditTrail] = useState(false);
	const [customFieldDefinitions, setCustomFieldDefinitions] = useState([]);
	const toast = useToast();
	const { requestConfirm } = useConfirmDialog();
	const { markAsClean } = useUnsavedChangesGuard(form, {
		enabled: !loading && Boolean(interview)
	});

	const hasRequiredFields = Boolean(
		form.subject.trim() &&
			form.candidateId &&
			form.jobOrderId &&
			form.interviewer.trim() &&
			form.interviewerEmail.trim()
	);
	const hasValidEmail = /\S+@\S+\.\S+/.test(form.interviewerEmail.trim());
	const hasValidVideoLink = isValidOptionalHttpUrl(form.videoLink);
	const customFieldsComplete = areRequiredCustomFieldsComplete(
		customFieldDefinitions,
		form.customFields
	);
	const canSave = hasRequiredFields && hasValidEmail && hasValidVideoLink && customFieldsComplete;
	const relationshipsLocked = Boolean(interview?.id);
	const isCancelled = form.status === 'cancelled';
	const emailError =
		form.interviewerEmail.trim() && !hasValidEmail ? 'Enter a valid interviewer email address.' : '';
	const videoLinkError =
		form.videoLink.trim() && !hasValidVideoLink
			? 'Enter a valid video call link URL, including http:// or https://.'
			: '';

	async function load() {
		setLoading(true);
		setError('');

		const interviewRes = await fetch(`/api/interviews/${id}`);

		if (!interviewRes.ok) {
			setError('Interview not found.');
			setLoading(false);
			return;
		}

		const interviewData = await interviewRes.json();

		const nextForm = toForm(interviewData);
		setInterview(interviewData);
		setForm(nextForm);
		markAsClean(nextForm);
		setInviteState({ downloading: false, error: '' });
		setCancelState({ canceling: false, error: '' });
		setActionsOpen(false);
		setLoading(false);
	}

	useEffect(() => {
		load();
	}, [id]);

	useEffect(() => {
		function onMouseDown(event) {
			if (!actionsMenuRef.current) return;
			if (actionsMenuRef.current.contains(event.target)) return;
			setActionsOpen(false);
		}

		function onKeyDown(event) {
			if (event.key === 'Escape') {
				setActionsOpen(false);
			}
		}

		document.addEventListener('mousedown', onMouseDown);
		document.addEventListener('keydown', onKeyDown);
		return () => {
			document.removeEventListener('mousedown', onMouseDown);
			document.removeEventListener('keydown', onKeyDown);
		};
	}, []);

	useEffect(() => {
		if (saveState.error) {
			toast.error(saveState.error);
		}
	}, [saveState.error, toast]);

	useEffect(() => {
		if (saveState.success) {
			toast.success(saveState.success);
		}
	}, [saveState.success, toast]);

	useEffect(() => {
		if (inviteState.error) {
			toast.error(inviteState.error);
		}
	}, [inviteState.error, toast]);

	useEffect(() => {
		if (cancelState.error) {
			toast.error(cancelState.error);
		}
	}, [cancelState.error, toast]);

	async function onSave(e) {
		e.preventDefault();
		if (!canSave) {
			setSaveState({
				saving: false,
				error:
					'Complete required fields (Subject, Candidate, Job Order, Interviewer, Interviewer Email), required custom fields, and use a valid interviewer email address.',
				success: ''
			});
			return;
		}

		setSaveState({ saving: true, error: '', success: '' });
		const { videoCallProvider: _videoCallProvider, ...formPayload } = form;

		const res = await fetch(`/api/interviews/${id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(formPayload)
		});

		if (!res.ok) {
			const data = await res.json().catch(() => ({}));
			setSaveState({ saving: false, error: data.error || 'Failed to update interview.', success: '' });
			return;
		}

		const updated = await res.json();
		const nextForm = toForm(updated);
		setInterview((current) => (current ? { ...current, ...updated } : current));
		setForm(nextForm);
		markAsClean(nextForm);
		setSaveState({ saving: false, error: '', success: 'Interview updated.' });
	}

	async function onDownloadInvite() {
		setActionsOpen(false);
		setInviteState({ downloading: true, error: '' });

		try {
			const response = await fetch(`/api/interviews/${id}/invite`);
			if (!response.ok) {
				const data = await response.json().catch(() => ({}));
				setInviteState({
					downloading: false,
					error: data.error || 'Failed to generate interview invite.'
				});
				return;
			}

			const blob = await response.blob();
			const disposition = response.headers.get('content-disposition');
			const filename = parseFilenameFromDisposition(disposition) || `interview-${id}.ics`;
			const objectUrl = URL.createObjectURL(blob);
			const anchor = document.createElement('a');
			anchor.href = objectUrl;
			anchor.download = filename;
			document.body.appendChild(anchor);
			anchor.click();
			anchor.remove();
			URL.revokeObjectURL(objectUrl);

			setInviteState({ downloading: false, error: '' });
		} catch {
			setInviteState({ downloading: false, error: 'Failed to download interview invite.' });
		}
	}

	async function onCancelInterview() {
		if (!interview) return;
		if (isCancelled) {
			setActionsOpen(false);
			return;
		}

		const candidateName = `${interview.candidate?.firstName || ''} ${interview.candidate?.lastName || ''}`.trim() || '-';
		const jobOrderTitle = interview.jobOrder?.title || '-';
		const startsAt = formatDate(interview.startsAt);
		const confirmed = await requestConfirm({
			message: `Cancel this interview?\n\nCandidate: ${candidateName}\nJob Order: ${jobOrderTitle}\nStart: ${startsAt}`,
			confirmLabel: 'Cancel Interview',
			cancelLabel: 'Keep'
		});
		if (!confirmed) return;

		setActionsOpen(false);
		setCancelState({ canceling: true, error: '' });
		setSaveState((current) => ({ ...current, error: '', success: '' }));

		try {
			const payloadSourceForm = toForm(interview);
			const { videoCallProvider: _videoCallProvider, ...payloadForm } = payloadSourceForm;
			const payload = { ...payloadForm, status: 'cancelled' };
			const res = await fetch(`/api/interviews/${id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});

			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				setCancelState({
					canceling: false,
					error: data.error || 'Failed to cancel interview.'
				});
				return;
			}

			const updated = await res.json();
			const nextForm = toForm(updated);
			setInterview((current) => (current ? { ...current, ...updated } : current));
			setForm(nextForm);
			markAsClean(nextForm);
			setCancelState({ canceling: false, error: '' });
			setSaveState({ saving: false, error: '', success: 'Interview cancelled.' });
		} catch {
			setCancelState({ canceling: false, error: 'Failed to cancel interview.' });
		}
	}

	function onToggleAuditTrail() {
		setActionsOpen(false);
		setShowAuditTrail((current) => !current);
	}

	if (loading) {
		return (
			<section className="module-page">
				<LoadingIndicator className="page-loading-indicator" label="Loading interview details" />
			</section>
		);
	}

	if (error || !interview) {
		return (
			<section className="module-page">
				<p>{error || 'Interview not found.'}</p>
				<button type="button" onClick={() => router.push('/interviews')}>
					Back to Interviews
				</button>
			</section>
		);
	}

	return (
		<section className="module-page">
			<header className="module-header">
				<div>
					<Link href="/interviews" className="module-back-link" aria-label="Back to List">&larr; Back</Link>
					<h2>{interview.subject}</h2>
					<p>
						{interview.candidate?.firstName || '-'} {interview.candidate?.lastName || ''} |{' '}
						{interview.jobOrder?.title || '-'}
					</p>
				</div>
				<div className="module-header-actions">
										<div className="actions-menu" ref={actionsMenuRef}>
						<button
							type="button"
							className="btn-secondary actions-menu-toggle"
							onClick={() => setActionsOpen((current) => !current)}
							aria-haspopup="menu"
							aria-expanded={actionsOpen}
							aria-label="Open interview actions"
							title="Actions"
							>
								<span className="actions-menu-icon" aria-hidden="true">
									<MoreVertical />
								</span>
							</button>
						{actionsOpen ? (
							<div className="actions-menu-list" role="menu" aria-label="Interview actions">
								<button
									type="button"
									role="menuitem"
									className="actions-menu-item"
									onClick={onDownloadInvite}
									disabled={inviteState.downloading || saveState.saving || cancelState.canceling}
								>
									{inviteState.downloading ? 'Generating .ics...' : 'Download .ics Invite'}
								</button>
								<button
									type="button"
									role="menuitem"
									className="actions-menu-item actions-menu-item-danger"
									onClick={onCancelInterview}
									disabled={inviteState.downloading || saveState.saving || cancelState.canceling || isCancelled}
								>
									{cancelState.canceling ? 'Cancelling...' : isCancelled ? 'Interview Cancelled' : 'Cancel Interview'}
								</button>
								<button type="button" role="menuitem" className="actions-menu-item" onClick={onToggleAuditTrail}>
									{showAuditTrail ? 'Hide Audit Trail' : 'View Audit Trail'}
								</button>
							</div>
						) : null}
					</div>
				</div>
			</header>

			<article className="panel">
				<h3>Snapshot</h3>
					<div className="info-list snapshot-grid snapshot-grid-four">
					<p>
						<span>Record ID</span>
						<strong>{interview.recordId || '-'}</strong>
					</p>
					<p>
						<span>Candidate</span>
						<strong>
							{interview.candidate?.id ? (
								<Link href={`/candidates/${interview.candidate.id}`}>
									{interview.candidate?.firstName || '-'} {interview.candidate?.lastName || ''}
								</Link>
							) : (
								`${interview.candidate?.firstName || '-'} ${interview.candidate?.lastName || ''}`
							)}
						</strong>
					</p>
					<p>
						<span>Client</span>
						<strong>
							{interview.jobOrder?.client?.id ? (
								<Link href={`/clients/${interview.jobOrder.client.id}`}>{interview.jobOrder?.client?.name || '-'}</Link>
							) : (
								interview.jobOrder?.client?.name || '-'
							)}
						</strong>
					</p>
					<p>
						<span>Job Order</span>
						<strong>
							{interview.jobOrder?.id ? (
								<Link href={`/job-orders/${interview.jobOrder.id}`}>{interview.jobOrder?.title || '-'}</Link>
							) : (
								interview.jobOrder?.title || '-'
							)}
						</strong>
					</p>
				</div>
			</article>

			<article className="panel panel-spacious">
				<h3>Interview Details</h3>
				<p className="panel-subtext">Edit interview details and save updates.</p>
				<form onSubmit={onSave} className="detail-form">
					<section className="form-section">
						<h4>Scheduling</h4>
						<div className="detail-form-grid-3">
							<FormField label="Type">
								<select
									value={form.interviewMode}
									onChange={(e) =>
										setForm((f) =>
											normalizeInterviewType(e.target.value) === 'video'
												? {
														...f,
														interviewMode: normalizeInterviewType(e.target.value),
														location: '',
														locationPlaceId: '',
														locationLatitude: '',
														locationLongitude: ''
													}
												: { ...f, interviewMode: normalizeInterviewType(e.target.value) }
										)
									}
								>
									{INTERVIEW_TYPE_OPTIONS.map((option) => (
										<option key={option.value} value={option.value}>
											{option.label}
										</option>
									))}
								</select>
							</FormField>
							<FormField label="Status">
								{isCancelled ? (
									<div className="locked-field">
										<input value="Cancelled" disabled readOnly />
										<span className="locked-field-icon" aria-label="Locked field" title="Locked field">
											<Lock aria-hidden="true" />
										</span>
									</div>
								) : (
									<select
										value={form.status}
										onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
									>
										<option value="scheduled">Scheduled</option>
										<option value="completed">Completed</option>
									</select>
								)}
							</FormField>
							<FormField label="Subject" required>
								<input
									value={form.subject}
									onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
									required
								/>
							</FormField>
						</div>
						<div className="detail-form-grid-2">
							<FormField label="Candidate" required>
								<div className={relationshipsLocked ? 'locked-field' : ''}>
									<LookupTypeaheadSelect
										entity="candidates"
										lookupParams={{}}
										value={form.candidateId}
										onChange={(nextValue) => setForm((f) => ({ ...f, candidateId: nextValue }))}
										placeholder="Search candidate"
										label="Candidate"
										emptyLabel="No matching candidates."
										disabled={relationshipsLocked}
									/>
									{relationshipsLocked ? (
										<span className="locked-field-icon" aria-label="Locked field" title="Locked field">
											<Lock aria-hidden="true" />
										</span>
									) : null}
								</div>
							</FormField>
							<FormField label="Job Order" required>
								<div className={relationshipsLocked ? 'locked-field' : ''}>
									<LookupTypeaheadSelect
										entity="job-orders"
										lookupParams={{}}
										value={form.jobOrderId}
										onChange={(nextValue) => setForm((f) => ({ ...f, jobOrderId: nextValue }))}
										placeholder="Search job order"
										label="Job Order"
										emptyLabel="No matching job orders."
										disabled={relationshipsLocked}
									/>
									{relationshipsLocked ? (
										<span className="locked-field-icon" aria-label="Locked field" title="Locked field">
											<Lock aria-hidden="true" />
										</span>
									) : null}
								</div>
							</FormField>
						</div>
						<div className="detail-form-grid-2">
							<FormField label="Interviewer" required>
								<input
									value={form.interviewer}
									onChange={(e) => setForm((f) => ({ ...f, interviewer: e.target.value }))}
									required
								/>
							</FormField>
							<FormField label="Interviewer Email" required>
								<input
									type="email"
									value={form.interviewerEmail}
									onChange={(e) => setForm((f) => ({ ...f, interviewerEmail: e.target.value }))}
									required
								/>
							</FormField>
						</div>
						<FormField label="Optional Participants" hint="Press Enter or comma to add">
							<EmailChipInput
								values={form.optionalParticipantEmails}
								onChange={(nextValues) => setForm((f) => ({ ...f, optionalParticipantEmails: nextValues }))}
								placeholder="participant@company.com"
								emptyLabel="No optional participants."
							/>
						</FormField>
						<div className="detail-form-grid-time-location">
							<FormField label="Start Time">
								<input
									type="datetime-local"
									value={form.startsAt}
									onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))}
								/>
							</FormField>
							<FormField label="End Time">
								<input
									type="datetime-local"
									value={form.endsAt}
									onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))}
								/>
							</FormField>
							{form.interviewMode === 'video' ? null : (
								<FormField label="Location">
									<AddressTypeaheadInput
										value={form.location}
										onChange={(nextValue) => setForm((f) => ({ ...f, location: nextValue }))}
										onPlaceDetailsChange={(details) =>
											setForm((f) => ({
												...f,
												locationPlaceId: details?.placeId || '',
												locationLatitude: details?.latitude ?? '',
												locationLongitude: details?.longitude ?? ''
											}))
										}
										placeholder="Search address or enter manually"
										label="Location"
									/>
								</FormField>
							)}
						</div>
						<div className="detail-form-grid-2">
							<FormField label="Video Call Provider">
								<select
									value={form.videoCallProvider}
									onChange={(e) => {
										const nextProvider = normalizeVideoCallProvider(e.target.value);
										setForm((f) => {
											const nextLink = f.videoLink.trim()
												? f.videoLink
												: getVideoCallProviderTemplate(nextProvider);
											return {
												...f,
												videoCallProvider: nextProvider,
												videoLink: nextLink
											};
										});
									}}
								>
									<option value="">Select provider</option>
									{VIDEO_CALL_PROVIDER_OPTIONS.map((option) => (
										<option key={option.value} value={option.value}>
											{option.label}
										</option>
									))}
								</select>
							</FormField>
							<FormField label="Video Call Link">
								<input
									type="url"
									value={form.videoLink}
									placeholder={getVideoCallLinkPlaceholder(form.videoCallProvider)}
									onChange={(e) => setForm((f) => ({ ...f, videoLink: e.target.value }))}
									onBlur={(e) =>
										setForm((f) => ({
											...f,
											videoLink: normalizeHttpUrl(e.target.value)
										}))
									}
								/>
							</FormField>
						</div>
						{emailError ? <p className="panel-subtext error">{emailError}</p> : null}
						{videoLinkError ? <p className="panel-subtext error">{videoLinkError}</p> : null}
						<CustomFieldsSection
							moduleKey="interviews"
							values={form.customFields}
							onChange={(nextCustomFields) =>
								setForm((f) => ({
									...f,
									customFields: nextCustomFields
								}))
							}
							onDefinitionsChange={setCustomFieldDefinitions}
						/>
					</section>

					<div className="form-actions">
						<button type="submit" disabled={saveState.saving || cancelState.canceling || !canSave}>
							{saveState.saving ? 'Saving...' : 'Save Interview'}
						</button>
						<span className="form-actions-meta">
							<span>Updated:</span>
							<strong>{formatDate(interview.updatedAt)}</strong>
						</span>
					</div>
				</form>
			</article>
			<AuditTrailPanel entityType="INTERVIEW" entityId={id} visible={showAuditTrail} />
		</section>
	);
}
