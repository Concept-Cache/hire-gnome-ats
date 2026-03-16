'use client';

import Link from 'next/link';
import { Copy, LoaderCircle, RefreshCcw, Sparkles, X } from 'lucide-react';
import LoadingIndicator from '@/app/components/loading-indicator';
import { useToast } from '@/app/components/toast-provider';
import { formatDateTimeAt } from '@/lib/date-format';
import { useEffect, useState } from 'react';

function buildEmptyState() {
	return {
		explanation: null,
		stale: false,
		loading: false,
		generating: false,
		error: ''
	};
}

export default function MatchExplanationModal({
	open,
	onClose,
	candidateId,
	candidateName,
	jobOrderId,
	jobOrderTitle,
	scorePercent,
	reasons = [],
	risks = []
}) {
	const toast = useToast();
	const [state, setState] = useState(buildEmptyState());

	useEffect(() => {
		if (!open) {
			setState(buildEmptyState());
		}
	}, [open]);

	useEffect(() => {
		if (!open || !candidateId || !jobOrderId) return;

		let cancelled = false;
		setState((current) => ({ ...current, loading: true, error: '' }));
		fetch(`/api/match-explanations?candidateId=${candidateId}&jobOrderId=${jobOrderId}`)
			.then((response) => response.json().then((data) => ({ ok: response.ok, data })))
			.then(({ ok, data }) => {
				if (cancelled) return;
				if (!ok) {
					setState((current) => ({
						...current,
						loading: false,
						error: data.error || 'Failed to load match explanation.'
					}));
					return;
				}

				setState({
					explanation: data.explanation || null,
					stale: Boolean(data.stale),
					loading: false,
					generating: false,
					error: ''
				});

				if (!data.explanation) {
					void onGenerate(false);
				}
			})
			.catch(() => {
				if (cancelled) return;
				setState((current) => ({
					...current,
					loading: false,
					error: 'Failed to load match explanation.'
				}));
			});

		return () => {
			cancelled = true;
		};
	}, [open, candidateId, jobOrderId]);

	async function onGenerate(showSuccessToast = true) {
		setState((current) => ({ ...current, generating: true, error: '' }));
		try {
			const response = await fetch('/api/match-explanations', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					candidateId,
					jobOrderId,
					scorePercent,
					reasons,
					risks
				})
			});
			const data = await response.json().catch(() => ({}));
			if (!response.ok) {
				setState((current) => ({
					...current,
					generating: false,
					error: data.error || 'Failed to generate match explanation.'
				}));
				return;
			}

			setState({
				explanation: data.explanation || null,
				stale: false,
				loading: false,
				generating: false,
				error: ''
			});
			if (showSuccessToast) {
				toast.success(state.explanation ? 'Match explanation refreshed.' : 'Match explanation generated.');
			}
		} catch {
			setState((current) => ({
				...current,
				generating: false,
				error: 'Failed to generate match explanation.'
			}));
		}
	}

	async function onCopy() {
		if (!state.explanation) return;
		const text = [
			'Why It Matches',
			state.explanation.whyItMatches || '-',
			'',
			'Potential Gaps',
			state.explanation.potentialGaps || '-',
			'',
			'What To Validate',
			state.explanation.whatToValidate || '-',
			'',
			'Recommended Positioning',
			state.explanation.recommendedPositioning || '-'
		].join('\n');

		try {
			await navigator.clipboard.writeText(text);
			toast.success('Match explanation copied.');
		} catch {
			toast.error('Failed to copy match explanation.');
		}
	}

	if (!open) return null;

	const explanation = state.explanation;

	return (
		<div className="confirm-overlay" onClick={onClose}>
			<div
				className="confirm-dialog report-detail-modal match-explanation-modal"
				role="dialog"
				aria-modal="true"
				aria-labelledby="match-explanation-modal-title"
				onClick={(event) => event.stopPropagation()}
			>
				<div className="report-detail-modal-head">
					<div>
						<h3 id="match-explanation-modal-title" className="confirm-title">
							Match Explanation
						</h3>
						<p className="panel-subtext">
							<Link href={`/candidates/${candidateId}`}>{candidateName || 'Candidate'}</Link> |{' '}
							<Link href={`/job-orders/${jobOrderId}`}>{jobOrderTitle || 'Job Order'}</Link>
						</p>
					</div>
					<div className="match-explanation-toolbar">
						<button
							type="button"
							className="row-action-icon submission-write-up-action"
							onClick={onGenerate}
							disabled={state.loading || state.generating}
							title={explanation ? 'Refresh explanation' : 'Generate explanation'}
							aria-label={explanation ? 'Refresh explanation' : 'Generate explanation'}
						>
							{state.generating ? (
								<LoaderCircle aria-hidden="true" className="row-action-icon-spinner" />
							) : explanation ? (
								<RefreshCcw aria-hidden="true" />
							) : (
								<Sparkles aria-hidden="true" />
							)}
						</button>
						<button
							type="button"
							className="row-action-icon submission-write-up-action"
							onClick={onCopy}
							disabled={!explanation}
							title="Copy explanation"
							aria-label="Copy explanation"
						>
							<Copy aria-hidden="true" />
						</button>
						<button
							type="button"
							className="btn-secondary btn-link-icon report-detail-modal-close"
							onClick={onClose}
							aria-label="Close match explanation"
							title="Close"
						>
							<X aria-hidden="true" className="btn-refresh-icon-svg" />
						</button>
					</div>
				</div>
				{state.loading ? <LoadingIndicator className="list-loading-indicator" label="Loading match explanation" /> : null}
				{state.error ? <p className="panel-subtext error">{state.error}</p> : null}
				{!state.loading && !state.error ? (
					<div className="report-detail-modal-body match-explanation-body">
						<div className="match-explanation-summary">
							<span className="chip">Score {Number.isFinite(Number(scorePercent)) ? `${Math.round(Number(scorePercent))}%` : '-'}</span>
							{state.stale ? <span className="chip">Stale</span> : null}
						</div>
						{explanation ? (
							<div className="match-explanation-sections">
								<article className="panel">
									<h4>Why It Matches</h4>
									<p>{explanation.whyItMatches || '-'}</p>
								</article>
								<article className="panel">
									<h4>Potential Gaps</h4>
									<p>{explanation.potentialGaps || '-'}</p>
								</article>
								<article className="panel">
									<h4>What To Validate</h4>
									<p>{explanation.whatToValidate || '-'}</p>
								</article>
								<article className="panel">
									<h4>Recommended Positioning</h4>
									<p>{explanation.recommendedPositioning || '-'}</p>
								</article>
								<p className="simple-list-meta submission-ai-meta">
									Generated by{' '}
									{explanation.generatedByUser
										? `${explanation.generatedByUser.firstName} ${explanation.generatedByUser.lastName}`
										: 'Unknown User'}{' '}
									@ {formatDateTimeAt(explanation.updatedAt)}
								</p>
							</div>
						) : state.generating ? (
							<p className="panel-subtext">Generating match explanation...</p>
						) : (
							<p className="panel-subtext">No explanation generated yet. Use the sparkle icon to create one.</p>
						)}
					</div>
				) : null}
			</div>
		</div>
	);
}
