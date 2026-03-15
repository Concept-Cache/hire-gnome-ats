'use client';

import { useEffect, useMemo, useState } from 'react';
import { Copy, LoaderCircle, Sparkles, X } from 'lucide-react';
import { useToast } from '@/app/components/toast-provider';

const PURPOSE_OPTIONS = [
	{ value: 'introduction', label: 'Introduction' },
	{ value: 'follow-up', label: 'Follow-Up' },
	{ value: 'check-in', label: 'Check-In' },
	{ value: 'status update', label: 'Status Update' },
	{ value: 're-engagement', label: 'Re-Engagement' }
];

const TONE_OPTIONS = [
	{ value: 'professional', label: 'Professional' },
	{ value: 'warm', label: 'Warm' },
	{ value: 'direct', label: 'Direct' }
];

const initialState = {
	purpose: 'introduction',
	tone: 'professional',
	instructions: '',
	subject: '',
	body: '',
	generating: false
};

export default function EmailDraftModal({
	open,
	onClose,
	entityType,
	entityId,
	entityName,
	emailAddress
}) {
	const [state, setState] = useState(initialState);
	const toast = useToast();

	useEffect(() => {
		if (!open) {
			setState(initialState);
		}
	}, [open]);

	const hasDraft = useMemo(
		() => Boolean(state.subject.trim() || state.body.trim()),
		[state.subject, state.body]
	);

	async function onGenerate() {
		if (!entityType || !entityId || state.generating) return;
		setState((current) => ({ ...current, generating: true }));

		try {
			const response = await fetch('/api/email-drafts', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					entityType,
					entityId,
					purpose: state.purpose,
					tone: state.tone,
					instructions: state.instructions
				})
			});
			const data = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(data.error || 'Failed to generate email draft.');
			}

			setState((current) => ({
				...current,
				generating: false,
				subject: data.draft?.subject || '',
				body: data.draft?.body || ''
			}));
			toast.success(hasDraft ? 'Email draft refreshed.' : 'Email draft generated.');
		} catch (error) {
			setState((current) => ({ ...current, generating: false }));
			toast.error(error instanceof Error ? error.message : 'Failed to generate email draft.');
		}
	}

	async function onCopy() {
		if (!hasDraft) return;
		const content = [state.subject ? `Subject: ${state.subject}` : '', state.body].filter(Boolean).join('\n\n');
		try {
			await navigator.clipboard.writeText(content);
			toast.success('Email draft copied.');
		} catch {
			toast.error('Failed to copy email draft.');
		}
	}

	if (!open) return null;

	return (
		<div className="confirm-overlay" onClick={onClose}>
			<div
				className="confirm-dialog report-detail-modal email-draft-modal"
				role="dialog"
				aria-modal="true"
				aria-labelledby="email-draft-modal-title"
				onClick={(event) => event.stopPropagation()}
			>
				<div className="report-detail-modal-head">
					<div>
						<h3 id="email-draft-modal-title" className="confirm-title">Draft Email</h3>
						<p className="panel-subtext">
							{entityName || entityType} {emailAddress ? `| ${emailAddress}` : ''}
						</p>
					</div>
					<button
						type="button"
						className="btn-secondary btn-link-icon report-detail-modal-close"
						onClick={onClose}
						aria-label="Close email draft"
						title="Close"
					>
						<X aria-hidden="true" className="btn-refresh-icon-svg" />
					</button>
				</div>
				<div className="report-detail-modal-body email-draft-body">
					<div className="email-draft-controls">
						<label>
							<span className="simple-list-sort-label">Purpose</span>
							<select
								value={state.purpose}
								onChange={(event) => setState((current) => ({ ...current, purpose: event.target.value }))}
								disabled={state.generating}
							>
								{PURPOSE_OPTIONS.map((option) => (
									<option key={option.value} value={option.value}>{option.label}</option>
								))}
							</select>
						</label>
						<label>
							<span className="simple-list-sort-label">Tone</span>
							<select
								value={state.tone}
								onChange={(event) => setState((current) => ({ ...current, tone: event.target.value }))}
								disabled={state.generating}
							>
								{TONE_OPTIONS.map((option) => (
									<option key={option.value} value={option.value}>{option.label}</option>
								))}
							</select>
						</label>
					</div>
					<label className="email-draft-field">
						<span className="form-label">Additional Instructions</span>
						<textarea
							rows={4}
							value={state.instructions}
							onChange={(event) => setState((current) => ({ ...current, instructions: event.target.value }))}
							placeholder="Optional context for this draft."
							disabled={state.generating}
						/>
					</label>
					<div className="submission-write-up-toolbar email-draft-toolbar">
						<button
							type="button"
							className="row-action-icon submission-write-up-action"
							onClick={onGenerate}
							disabled={state.generating}
							aria-label={hasDraft ? 'Refresh email draft' : 'Generate email draft'}
							title={hasDraft ? 'Refresh email draft' : 'Generate email draft'}
						>
							{state.generating ? (
								<LoaderCircle aria-hidden="true" className="row-action-icon-spinner" />
							) : (
								<Sparkles aria-hidden="true" />
							)}
						</button>
						<button
							type="button"
							className="row-action-icon submission-write-up-action"
							onClick={onCopy}
							disabled={!hasDraft}
							aria-label="Copy email draft"
							title="Copy email draft"
						>
							<Copy aria-hidden="true" />
						</button>
					</div>
					<label className="email-draft-field">
						<span className="form-label">Subject</span>
						<input
							value={state.subject}
							onChange={(event) => setState((current) => ({ ...current, subject: event.target.value }))}
							placeholder="Generated subject"
						/>
					</label>
					<label className="email-draft-field">
						<span className="form-label">Body</span>
						<textarea
							rows={12}
							value={state.body}
							onChange={(event) => setState((current) => ({ ...current, body: event.target.value }))}
							placeholder="Generate an email draft to begin."
						/>
					</label>
				</div>
			</div>
		</div>
	);
}
