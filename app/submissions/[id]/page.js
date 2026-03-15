'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowUpRight, Copy, LoaderCircle, Lock, MoreVertical, Sparkles } from 'lucide-react';
import FormField from '@/app/components/form-field';
import CustomFieldsSection, { areRequiredCustomFieldsComplete } from '@/app/components/custom-fields-section';
import LoadingIndicator from '@/app/components/loading-indicator';
import AuditTrailPanel from '@/app/components/audit-trail-panel';
import { useToast } from '@/app/components/toast-provider';
import useUnsavedChangesGuard from '@/app/hooks/use-unsaved-changes-guard';
import { useConfirmDialog } from '@/app/components/confirm-dialog';
import { formatDateTimeAt } from '@/lib/date-format';

const initialForm = {
	candidateId: '',
	jobOrderId: '',
	status: 'submitted',
	notes: '',
	aiWriteUp: '',
	customFields: {}
};

function formatSubmissionStatusLabel(value) {
	const normalized = String(value || '').trim().toLowerCase();
	if (normalized === 'under_review') return 'Under Review';
	if (normalized === 'submitted') return 'Submitted';
	if (normalized === 'qualified') return 'Qualified';
	if (normalized === 'rejected') return 'Rejected';
	if (normalized === 'offered') return 'Offered';
	if (normalized === 'hired') return 'Hired';
	if (normalized === 'placed') return 'Placed';
	return normalized ? normalized.replaceAll('_', ' ').replace(/\b\w/g, (match) => match.toUpperCase()) : '-';
}

function toForm(row) {
	if (!row) return initialForm;
	return {
		candidateId: String(row.candidateId || ''),
		jobOrderId: String(row.jobOrderId || ''),
		status: row.status || 'submitted',
		notes: row.notes || '',
		aiWriteUp: row.aiWriteUp || '',
		customFields:
			row.customFields && typeof row.customFields === 'object' && !Array.isArray(row.customFields)
				? row.customFields
				: {}
	};
}

function formatDate(value) {
	return formatDateTimeAt(value);
}

export default function SubmissionDetailsPage() {
	const { id } = useParams();
	const router = useRouter();
	const actionsMenuRef = useRef(null);
	const [submission, setSubmission] = useState(null);
	const [aiAvailable, setAiAvailable] = useState(false);
	const [form, setForm] = useState(initialForm);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [saveState, setSaveState] = useState({ saving: false, error: '', success: '' });
	const [convertState, setConvertState] = useState({ converting: false, error: '' });
	const [writeUpState, setWriteUpState] = useState({ generating: false, error: '' });
	const [actionsOpen, setActionsOpen] = useState(false);
	const [showAuditTrail, setShowAuditTrail] = useState(false);
	const [customFieldDefinitions, setCustomFieldDefinitions] = useState([]);
	const toast = useToast();
	const { requestConfirm } = useConfirmDialog();
	const { markAsClean, confirmNavigation } = useUnsavedChangesGuard(form, {
		enabled: !loading && Boolean(submission)
	});
	const isConvertedToPlacement = Boolean(submission?.offer?.id);
	const customFieldsComplete = areRequiredCustomFieldsComplete(
		customFieldDefinitions,
		form.customFields
	);

	async function load() {
		setLoading(true);
		setError('');

		const [submissionRes, settingsRes] = await Promise.all([
			fetch(`/api/submissions/${id}`),
			fetch('/api/system-settings', { cache: 'no-store' })
		]);

		if (!submissionRes.ok) {
			const data = await submissionRes.json().catch(() => ({}));
			setError(data.error || 'Failed to load submission.');
			setLoading(false);
			return;
		}

		const submissionData = await submissionRes.json();
		const settingsData = settingsRes.ok ? await settingsRes.json().catch(() => ({})) : {};

		const nextForm = toForm(submissionData);
		setAiAvailable(Boolean(settingsData?.aiAvailable));
		setSubmission(submissionData);
		setForm(nextForm);
		markAsClean(nextForm);
		setConvertState({ converting: false, error: '' });
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
		if (convertState.error) {
			toast.error(convertState.error);
		}
	}, [convertState.error, toast]);

	useEffect(() => {
		if (writeUpState.error) {
			toast.error(writeUpState.error);
		}
	}, [writeUpState.error, toast]);

	async function onSave(e) {
		e.preventDefault();
		if (isConvertedToPlacement) {
			setSaveState({
				saving: false,
				error: 'Submission is locked after conversion to placement.',
				success: ''
			});
			return;
		}

		if (!form.candidateId || !form.jobOrderId) {
			setSaveState({ saving: false, error: 'Candidate and Job Order are required.', success: '' });
			return;
		}
		if (!customFieldsComplete) {
			setSaveState({ saving: false, error: 'Complete all required custom fields before saving.', success: '' });
			return;
		}

		setSaveState({ saving: true, error: '', success: '' });

		const res = await fetch(`/api/submissions/${id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(form)
		});

		if (!res.ok) {
			const data = await res.json().catch(() => ({}));
			setSaveState({ saving: false, error: data.error || 'Failed to update submission.', success: '' });
			return;
		}

		const updated = await res.json();
		const nextForm = toForm(updated);
		setSubmission(updated);
		setForm(nextForm);
		markAsClean(nextForm);
		setSaveState({ saving: false, error: '', success: 'Submission updated.' });
	}

	async function onScheduleInterview() {
		if (!submission) return;
		setActionsOpen(false);
		if (!(await confirmNavigation())) return;

		const query = new URLSearchParams();
		query.set('candidateId', String(submission.candidateId));
		query.set('jobOrderId', String(submission.jobOrderId));

		const candidateName = `${submission.candidate?.firstName || ''} ${submission.candidate?.lastName || ''}`.trim();
		const jobOrderTitle = submission.jobOrder?.title || '';
		if (candidateName || jobOrderTitle) {
			query.set(
				'subject',
				`Interview: ${candidateName || 'Candidate'}${jobOrderTitle ? ` - ${jobOrderTitle}` : ''}`
			);
		}

		router.push(`/interviews/new?${query.toString()}`);
	}

	async function onOpenCandidate() {
		if (!submission?.candidateId) return;
		if (!(await confirmNavigation())) return;
		router.push(`/candidates/${submission.candidateId}`);
	}

	async function onOpenJobOrder() {
		if (!submission?.jobOrderId) return;
		if (!(await confirmNavigation())) return;
		router.push(`/job-orders/${submission.jobOrderId}`);
	}

	async function onConvertToPlacement() {
		if (!submission) return;
		if (!(await confirmNavigation())) return;

		const candidateName = `${submission.candidate?.firstName || ''} ${submission.candidate?.lastName || ''}`.trim() || '-';
		const jobOrderTitle = submission.jobOrder?.title || '-';
		const confirmed = await requestConfirm({
			message: `Convert this submission to a placement?\n\nCandidate: ${candidateName}\nJob Order: ${jobOrderTitle}`
		});
		if (!confirmed) return;

		setActionsOpen(false);
		setConvertState({ converting: true, error: '' });

		try {
			const res = await fetch(`/api/submissions/${id}/convert-to-placement`, {
				method: 'POST'
			});
			const data = await res.json().catch(() => ({}));
			const placement = data.placement || data.offer;

			if (!res.ok) {
				setConvertState({
					converting: false,
					error: data.error || 'Failed to convert submission to placement.'
				});
				return;
			}

			if (!placement?.id) {
				setConvertState({
					converting: false,
					error: 'Placement conversion did not return a placement id.'
				});
				return;
			}

			router.push(`/placements/${placement.id}`);
		} catch {
			setConvertState({ converting: false, error: 'Failed to convert submission to placement.' });
		}
	}

	async function onGenerateWriteUp() {
		if (!submission || writeUpState.generating || isConvertedToPlacement) return;

		setActionsOpen(false);
		setWriteUpState({ generating: true, error: '' });

		try {
			const res = await fetch(`/api/submissions/${id}/generate-write-up`, {
				method: 'POST'
			});
			const data = await res.json().catch(() => ({}));

			if (!res.ok) {
				setWriteUpState({
					generating: false,
					error: data.error || 'Failed to generate submission write-up.'
				});
				return;
			}

			const nextForm = toForm(data);
			setSubmission(data);
			setForm(nextForm);
			markAsClean(nextForm);
			setWriteUpState({ generating: false, error: '' });
			toast.success(submission.aiWriteUp ? 'Submission write-up refreshed.' : 'Submission write-up generated.');
		} catch {
			setWriteUpState({ generating: false, error: 'Failed to generate submission write-up.' });
		}
	}

	function onToggleAuditTrail() {
		setActionsOpen(false);
		setShowAuditTrail((current) => !current);
	}

	async function onCopyWriteUp() {
		const value = String(form.aiWriteUp || '').trim();
		if (!value) return;
		try {
			await navigator.clipboard.writeText(value);
			toast.success('Client write-up copied.');
		} catch {
			toast.error('Failed to copy client write-up.');
		}
	}

	if (loading) {
		return (
			<section className="module-page">
				<LoadingIndicator className="page-loading-indicator" label="Loading submission details" />
			</section>
		);
	}

	if (error || !submission) {
		return (
			<section className="module-page">
				<p>{error || 'Submission not found.'}</p>
				<button type="button" onClick={() => router.push('/submissions')}>
					Back to Submissions
				</button>
			</section>
		);
	}

	return (
		<section className="module-page">
			<header className="module-header">
				<div>
					<Link href="/submissions" className="module-back-link" aria-label="Back to List">&larr; Back</Link>
					<h2>Submission #{submission.id}</h2>
					<p>
						{submission.candidate?.firstName || '-'} {submission.candidate?.lastName || ''} |{' '}
						{submission.jobOrder?.title || '-'}
					</p>
				</div>
				<div className="module-header-actions">
					<button
						type="button"
						className="btn-secondary"
						onClick={onOpenCandidate}
						disabled={!submission.candidateId || saveState.saving || convertState.converting}
					>
						Candidate
					</button>
					<button
						type="button"
						className="btn-secondary"
						onClick={onOpenJobOrder}
						disabled={!submission.jobOrderId || saveState.saving || convertState.converting}
					>
						Job Order
					</button>
					<div className="actions-menu" ref={actionsMenuRef}>
						<button
							type="button"
							className="btn-secondary actions-menu-toggle"
							onClick={() => setActionsOpen((current) => !current)}
							aria-haspopup="menu"
							aria-expanded={actionsOpen}
							aria-label="Open submission actions"
							title="Actions"
							>
								<span className="actions-menu-icon" aria-hidden="true">
									<MoreVertical />
								</span>
							</button>
						{actionsOpen ? (
							<div className="actions-menu-list" role="menu" aria-label="Submission actions">
								<button
									type="button"
									role="menuitem"
									className="actions-menu-item"
									onClick={onScheduleInterview}
									disabled={convertState.converting || saveState.saving}
								>
									Schedule Interview
								</button>
								{submission.offer?.id ? (
									<Link
										href={`/placements/${submission.offer.id}`}
										className="actions-menu-item"
										role="menuitem"
										onClick={() => setActionsOpen(false)}
									>
										Open Placement
									</Link>
								) : (
									<button
										type="button"
										role="menuitem"
										className="actions-menu-item"
										onClick={onConvertToPlacement}
										disabled={convertState.converting || saveState.saving}
									>
										{convertState.converting ? 'Converting...' : 'Convert to Placement'}
									</button>
								)}
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
				<div className="info-list snapshot-grid">
					<p>
						<span>Record ID</span>
						<strong>{submission.recordId || '-'}</strong>
					</p>
					<p>
						<span>Client</span>
						<strong>
							{submission.jobOrder?.client?.id ? (
								<Link href={`/clients/${submission.jobOrder.client.id}`}>
									{submission.jobOrder.client.name}{' '}
									<ArrowUpRight aria-hidden="true" className="snapshot-link-icon" />
								</Link>
							) : (
								submission.jobOrder?.client?.name || '-'
							)}
						</strong>
					</p>
					<p>
						<span>Hiring Manager</span>
						<strong>
							{submission.jobOrder?.contact?.id ? (
								<Link href={`/contacts/${submission.jobOrder.contact.id}`}>
									{submission.jobOrder.contact.firstName} {submission.jobOrder.contact.lastName}{' '}
									<ArrowUpRight aria-hidden="true" className="snapshot-link-icon" />
								</Link>
							) : submission.jobOrder?.contact
								? `${submission.jobOrder.contact.firstName} ${submission.jobOrder.contact.lastName}`
								: '-'}
						</strong>
					</p>
				</div>
			</article>

			<article className="panel panel-spacious">
				<h3>Submission Details</h3>
				<p className="panel-subtext">Edit submission details and save updates.</p>
				{isConvertedToPlacement ? (
					<p className="panel-subtext">This submission is read-only because it has been converted to a placement.</p>
				) : null}
				<form onSubmit={onSave} className="detail-form">
					<section className="form-section">
						<h4>Assignment</h4>
						<div className="detail-form-grid-3">
							<FormField label="Candidate" required>
								<div className="locked-field">
									<input
										value={`${submission.candidate?.firstName || '-'} ${submission.candidate?.lastName || ''}`.trim()}
										disabled
										readOnly
									/>
									<span className="locked-field-icon" aria-label="Locked field" title="Locked field">
										<Lock aria-hidden="true" />
									</span>
								</div>
							</FormField>
							<FormField label="Job Order" required>
								<div className="locked-field">
									<input value={submission.jobOrder?.title || '-'} disabled readOnly />
									<span className="locked-field-icon" aria-label="Locked field" title="Locked field">
										<Lock aria-hidden="true" />
									</span>
								</div>
							</FormField>
							<FormField label="Status">
								{isConvertedToPlacement ? (
									<div className="locked-field">
										<input value={formatSubmissionStatusLabel(form.status)} disabled readOnly />
										<span className="locked-field-icon" aria-label="Locked field" title="Locked field">
											<Lock aria-hidden="true" />
										</span>
									</div>
								) : (
									<select
										value={form.status}
										onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
									>
										<option value="submitted">Submitted</option>
										<option value="under_review">Under Review</option>
										<option value="qualified">Qualified</option>
										<option value="rejected">Rejected</option>
										<option value="offered">Offered</option>
										<option value="hired">Hired</option>
										<option value="placed">Placed</option>
									</select>
								)}
							</FormField>
						</div>
						<FormField label="Notes">
							<textarea
								placeholder="Submission notes"
								value={form.notes}
								onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
								disabled={isConvertedToPlacement}
							/>
						</FormField>
						<div className="form-field">
							<div className="form-label-row submission-write-up-label-row">
								<label className="form-label">Client Write-Up</label>
								<div className="submission-write-up-toolbar">
									<button
										type="button"
										className="row-action-icon submission-write-up-action"
										onClick={onGenerateWriteUp}
										disabled={
											convertState.converting ||
											saveState.saving ||
											writeUpState.generating ||
											isConvertedToPlacement ||
											!aiAvailable
										}
										aria-label={form.aiWriteUp ? 'Refresh client write-up' : 'Generate client write-up'}
										title={
											aiAvailable
												? form.aiWriteUp
													? 'Refresh client write-up'
													: 'Generate client write-up'
												: 'Enable OpenAI in Admin Area > System Settings to use this.'
										}
									>
										{writeUpState.generating ? (
											<LoaderCircle aria-hidden="true" className="row-action-icon-spinner" />
										) : (
											<Sparkles aria-hidden="true" />
										)}
									</button>
									<button
										type="button"
										className="row-action-icon submission-write-up-action"
										onClick={onCopyWriteUp}
										disabled={!form.aiWriteUp.trim()}
										aria-label="Copy client write-up"
										title="Copy client write-up"
									>
										<Copy aria-hidden="true" />
									</button>
								</div>
							</div>
							{!aiAvailable ? (
								<p className="panel-subtext">Enable OpenAI in Admin Area &gt; System Settings to use this.</p>
							) : null}
							<textarea
								rows={10}
								placeholder={
									isConvertedToPlacement
										? 'Client write-up is locked after conversion to placement.'
										: 'Use the tools above to generate or copy the client write-up.'
								}
								value={form.aiWriteUp}
								onChange={(e) => setForm((f) => ({ ...f, aiWriteUp: e.target.value }))}
								disabled={isConvertedToPlacement}
							/>
						</div>
						{submission.aiWriteUpGeneratedAt ? (
							<p className="simple-list-meta submission-ai-meta">
								Generated by{' '}
								{submission.aiWriteUpGeneratedByUser
									? `${submission.aiWriteUpGeneratedByUser.firstName} ${submission.aiWriteUpGeneratedByUser.lastName}`
									: 'Unknown user'}{' '}
								@ {formatDate(submission.aiWriteUpGeneratedAt)}
							</p>
						) : null}
						<CustomFieldsSection
							moduleKey="submissions"
							values={form.customFields}
							onChange={(nextCustomFields) =>
								setForm((f) => ({
									...f,
									customFields: nextCustomFields
								}))
							}
							onDefinitionsChange={setCustomFieldDefinitions}
							disabled={isConvertedToPlacement}
						/>
					</section>

					<div className="form-actions">
						<button
							type="submit"
							disabled={saveState.saving || isConvertedToPlacement || !customFieldsComplete}
						>
							{saveState.saving ? 'Saving...' : 'Save Submission'}
						</button>
						<p className="form-actions-meta">
							<span>Updated:</span>
							<strong>{formatDate(submission.updatedAt)}</strong>
						</p>
					</div>
				</form>
			</article>
			<AuditTrailPanel entityType="SUBMISSION" entityId={id} visible={showAuditTrail} />
		</section>
	);
}
