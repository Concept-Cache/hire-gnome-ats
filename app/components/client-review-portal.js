'use client';

import { useMemo, useState } from 'react';
import { ArrowUpRight, FileText, LoaderCircle } from 'lucide-react';
import { useConfirmDialog } from '@/app/components/confirm-dialog';

const ACTION_BUTTONS = [
	{ value: 'comment', label: 'Save Comment', requiresComment: true, className: 'btn-secondary' },
	{ value: 'request_interview', label: 'Request Interview', className: 'btn-primary' },
	{ value: 'pass', label: 'Pass', className: 'btn-secondary btn-danger-soft' }
];

function formatDateTime(value) {
	try {
		return new Intl.DateTimeFormat(undefined, {
			month: 'numeric',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		}).format(new Date(value));
	} catch {
		return value || '-';
	}
}

export default function ClientReviewPortal({ initialData, token }) {
	const [portalData, setPortalData] = useState(initialData);
	const [savingActionKey, setSavingActionKey] = useState('');
	const [error, setError] = useState('');
	const [success, setSuccess] = useState('');
	const { requestConfirm } = useConfirmDialog();
	const [commentDrafts, setCommentDrafts] = useState(() => {
		const next = {};
		for (const submission of initialData?.submissions || []) {
			next[String(submission.id)] = '';
		}
		return next;
	});

	const submissions = useMemo(
		() => (Array.isArray(portalData?.submissions) ? portalData.submissions : []),
		[portalData]
	);

	async function onAction(submissionId, actionType, requiresComment = false) {
		const key = String(submissionId);
		const actionKey = `${key}:${actionType}`;
		const targetSubmission = submissions.find((submission) => String(submission.id) === key);
		if (targetSubmission?.hasClientPassed) {
			setError('This submission has already been passed.');
			setSuccess('');
			return;
		}
		const comment = String(commentDrafts[key] || '').trim();
		if (requiresComment && !comment) {
			setError('Add a comment before saving.');
			setSuccess('');
			return;
		}
		if (actionType === 'pass') {
			const confirmed = await requestConfirm({
				title: 'Pass On Candidate',
				message: 'Pass on this candidate? This will disable any further actions for this submission.',
				confirmLabel: 'Pass',
				cancelLabel: 'Cancel',
				isDanger: true
			});
			if (!confirmed) return;
		}

		setSavingActionKey(actionKey);
		setError('');
		setSuccess('');

		try {
			const response = await fetch(`/api/client-review/${encodeURIComponent(token)}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					submissionId,
					actionType,
					comment
				})
			});
			const data = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(data.error || 'Failed to save your response.');
			}

			setPortalData(data.portal || portalData);
			setCommentDrafts((current) => ({ ...current, [key]: '' }));
			setSuccess(data.message || 'Response saved.');
		} catch (requestError) {
			setError(requestError instanceof Error ? requestError.message : 'Failed to save your response.');
		} finally {
			setSavingActionKey('');
		}
	}

	return (
		<section className="client-portal-page">
			<div className="client-portal-shell">
				<header className="client-portal-hero">
					<div className="client-portal-brand">
						<img src={portalData?.branding?.logoUrl || '/branding/hire-gnome.png'} alt={portalData?.branding?.siteName || 'Hire Gnome ATS'} />
						<div>
							<p className="client-portal-kicker">Client Review Portal</p>
							<h1>{portalData?.portal?.jobOrder?.title || 'Submitted Candidates'}</h1>
							<p>
								{portalData?.portal?.jobOrder?.clientName || 'Client'} | {portalData?.portal?.contact?.name || 'Client Contact'}
							</p>
						</div>
					</div>
					<div className="client-portal-hero-meta">
						<p><strong>Portal Contact: </strong>{portalData?.portal?.contact?.email ? ` ${portalData.portal.contact.email}` : ''}</p>
						<p><strong>Last Viewed: </strong> {portalData?.portal?.lastViewedAt ? formatDateTime(portalData.portal.lastViewedAt) : 'Now'}</p>
					</div>
				</header>

				{error ? <p className="portal-inline-alert portal-inline-alert-error">{error}</p> : null}
				{success ? <p className="portal-inline-alert portal-inline-alert-success">{success}</p> : null}

				{!submissions.length ? (
					<article className="panel client-portal-empty">
						<h2>No submitted candidates yet</h2>
						<p>The recruiting team has not shared any active submissions on this job order yet.</p>
					</article>
				) : (
					<div className="client-portal-grid">
						{submissions.map((submission) => {
							const submissionKey = String(submission.id);
							const isLocked = Boolean(submission.hasClientPassed);
							const isSavingSubmission = savingActionKey.startsWith(`${submissionKey}:`);
							return (
								<article key={submission.id} className="panel client-portal-card">
								<div className="client-portal-card-head">
									<div>
										<p className="client-portal-rank">Priority #{submission.submissionPriority || 0}</p>
										<h2>{submission.candidate?.name || submission.recordId}</h2>
										<p className="client-portal-role-line">
											{submission.candidate?.currentJobTitle || 'Candidate'}{submission.candidate?.currentEmployer ? ` | ${submission.candidate.currentEmployer}` : ''}
										</p>
										{submission.candidate?.location ? <p className="client-portal-subtle">{submission.candidate.location}</p> : null}
									</div>
									<span className="chip client-portal-status-chip">{String(submission.status || '').replaceAll('_', ' ')}</span>
								</div>

								{submission.clientWriteUp ? (
									<div className="client-portal-section">
										<h3>Recruiter Summary</h3>
										<p>{submission.clientWriteUp}</p>
									</div>
								) : null}

								{submission.candidate?.summary ? (
									<div className="client-portal-section">
										<h3>Candidate Snapshot</h3>
										<p>{submission.candidate.summary}</p>
									</div>
								) : null}

								<div className="client-portal-section">
									<h3>Resume</h3>
									{submission.files?.length ? (
										<ul className="client-portal-file-list">
											{submission.files.map((file) => (
												<li key={file.id}>
													<a href={file.downloadHref} target="_blank" rel="noreferrer">
														<FileText aria-hidden="true" />
														<span>{file.fileName}</span>
														<ArrowUpRight aria-hidden="true" className="snapshot-link-icon" />
													</a>
												</li>
											))}
										</ul>
									) : (
										<p className="client-portal-subtle">No resume available.</p>
									)}
								</div>

								<div className="client-portal-section">
									<h3>Share Feedback</h3>
									{isLocked ? (
										<p className="client-portal-subtle">This submission has been passed. Further client actions are disabled.</p>
									) : null}
									<textarea
										rows={4}
										value={commentDrafts[submissionKey] || ''}
										onChange={(event) =>
											setCommentDrafts((current) => ({
												...current,
												[submissionKey]: event.target.value
											}))
										}
										placeholder="Add context, concerns, or follow-up requests."
										disabled={isLocked || isSavingSubmission}
									/>
									<div className="client-portal-action-row">
										{ACTION_BUTTONS.map((action) => (
											<button
												key={action.value}
												type="button"
												className={`${action.className} client-portal-action-button`}
												onClick={() => onAction(submission.id, action.value, action.requiresComment)}
												disabled={isLocked || isSavingSubmission}
											>
												{savingActionKey === `${submission.id}:${action.value}` ? (
													<span className="client-portal-button-busy">
														<LoaderCircle aria-hidden="true" className="client-portal-button-spinner" />
														Saving...
													</span>
												) : (
													action.label
												)}
											</button>
										))}
									</div>
								</div>

								{submission.feedback?.length ? (
									<div className="client-portal-section">
										<h3>Activity</h3>
										<ul className="simple-list client-portal-feedback-list">
											{submission.feedback.map((entry) => (
												<li key={entry.id}>
													<div>
														<strong>{entry.actionLabel}</strong>
														{entry.comment ? <p>{entry.comment}</p> : null}
														<p className="simple-list-meta">
															By {entry.clientName || 'Client Contact'} @ <span className="meta-emphasis-time">{formatDateTime(entry.createdAt)}</span>
														</p>
													</div>
												</li>
											))}
										</ul>
									</div>
								) : null}
								</article>
							);
						})}
					</div>
				)}

				<footer className="client-portal-footer">
					<p>Powered by {portalData?.branding?.siteName || 'Hire Gnome ATS'}</p>
					<a href="https://hiregnome.com" target="_blank" rel="noreferrer">Learn more</a>
				</footer>
			</div>
		</section>
	);
}
