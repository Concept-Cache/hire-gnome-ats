'use client';

import { useEffect, useState } from 'react';
import { ArrowUpRight, Copy, Link2, LoaderCircle, Mail, ShieldOff, X } from 'lucide-react';
import { useToast } from '@/app/components/toast-provider';
import { isValidEmailAddress } from '@/lib/email-validation';

const initialState = {
	loading: false,
	error: '',
	contactRequired: false,
	contact: null,
	access: null
};

export default function ClientPortalModal({ open, onClose, jobOrderId, jobOrderTitle }) {
	const [state, setState] = useState(initialState);
	const [busyAction, setBusyAction] = useState('');
	const toast = useToast();

	useEffect(() => {
		if (!open || !jobOrderId) return;
		let cancelled = false;

		async function load() {
			setState((current) => ({ ...current, loading: true, error: '' }));
			try {
				const response = await fetch(`/api/job-orders/${jobOrderId}/client-portal`);
				const data = await response.json().catch(() => ({}));
				if (!response.ok) {
					throw new Error(data.error || 'Failed to load client portal.');
				}
				if (!cancelled) {
					setState({
						loading: false,
						error: '',
						contactRequired: Boolean(data.contactRequired),
						contact: data.contact || null,
						access: data.access || null
					});
				}
			} catch (error) {
				if (!cancelled) {
					setState((current) => ({
						...current,
						loading: false,
						error: error instanceof Error ? error.message : 'Failed to load client portal.'
					}));
				}
			}
		}

		load();
		return () => {
			cancelled = true;
		};
	}, [open, jobOrderId]);

	async function onEnsurePortal() {
		setBusyAction('create');
		try {
			const response = await fetch(`/api/job-orders/${jobOrderId}/client-portal`, {
				method: 'POST'
			});
			const data = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(data.error || 'Failed to create client portal.');
			}
			setState((current) => ({ ...current, access: data.access || null }));
			toast.success('Client portal link is ready.');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Failed to create client portal.');
		} finally {
			setBusyAction('');
		}
	}

	async function onTogglePortal(action) {
		setBusyAction(action);
		try {
			const response = await fetch(`/api/job-orders/${jobOrderId}/client-portal`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action })
			});
			const data = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(data.error || 'Failed to update client portal.');
			}
			setState((current) => ({ ...current, access: data.access || null }));
			toast.success(action === 'revoke' ? 'Client portal disabled.' : 'Client portal restored.');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Failed to update client portal.');
		} finally {
			setBusyAction('');
		}
	}

	async function onSendLink() {
		setBusyAction('send');
		try {
			const response = await fetch(`/api/job-orders/${jobOrderId}/client-portal`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'send' })
			});
			const data = await response.json().catch(() => ({}));
			if (!response.ok) {
				throw new Error(data.error || 'Failed to send client portal email.');
			}
			setState((current) => ({ ...current, access: data.access || current.access }));
			if (data.testMode && Array.isArray(data.deliveredTo) && data.deliveredTo.length) {
				toast.success(`Portal link emailed in test mode to ${data.deliveredTo.join(', ')}.`);
				return;
			}
			toast.success('Client portal link emailed to the assigned contact.');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Failed to send client portal email.');
		} finally {
			setBusyAction('');
		}
	}

	async function onCopyLink() {
		const portalUrl = String(state.access?.portalUrl || '').trim();
		if (!portalUrl || state.access?.isRevoked || busyAction) return;
		try {
			await navigator.clipboard.writeText(portalUrl);
			toast.success('Client portal link copied.');
		} catch {
			toast.error('Failed to copy client portal link.');
		}
	}

	if (!open) return null;

	const contactEmail = String(state.contact?.email || '').trim();
	const hasValidContactEmail = isValidEmailAddress(contactEmail);
	const isBusy = Boolean(busyAction);

	return (
		<div className="confirm-overlay" onClick={onClose}>
			<div
				className="confirm-dialog report-detail-modal client-portal-modal"
				role="dialog"
				aria-modal="true"
				aria-labelledby="client-portal-modal-title"
				onClick={(event) => event.stopPropagation()}
			>
				<div className="report-detail-modal-head">
					<div>
						<h3 id="client-portal-modal-title" className="confirm-title">Client Review Portal</h3>
						<p className="panel-subtext">{jobOrderTitle || 'Job Order'}</p>
					</div>
					<button
						type="button"
						className="btn-secondary btn-link-icon report-detail-modal-close"
						onClick={onClose}
						aria-label="Close client review portal"
						title="Close"
					>
						<X aria-hidden="true" className="btn-refresh-icon-svg" />
					</button>
				</div>
				<div className="report-detail-modal-body client-portal-modal-body">
					{state.loading ? (
						<p className="panel-subtext">Loading portal details...</p>
					) : state.error ? (
						<p className="portal-inline-alert portal-inline-alert-error">{state.error}</p>
					) : state.contactRequired ? (
						<p className="panel-subtext">Assign a client contact to this job order before creating a review link.</p>
					) : (
						<>
							<div className="client-portal-modal-card">
								<h4>Portal Contact</h4>
								<p>
									<strong>{state.contact?.firstName || ''} {state.contact?.lastName || ''}</strong>
								</p>
								<p>{state.contact?.title || '-'}</p>
								<p>{state.contact?.email || '-'}</p>
							</div>

							{state.access ? (
								<div className="client-portal-modal-card">
									<h4>Portal Link</h4>
									<p className="panel-subtext">
										This link stays valid for the life of the job unless you disable it.
									</p>
									<input readOnly value={state.access.portalUrl || ''} />
									<div className="submission-write-up-toolbar email-draft-toolbar client-portal-modal-toolbar">
										<button
											type="button"
											className="row-action-icon submission-write-up-action"
											onClick={onCopyLink}
											disabled={isBusy || !state.access.portalUrl || state.access.isRevoked}
											aria-label="Copy portal link"
											title="Copy portal link"
										>
											<Copy aria-hidden="true" />
										</button>
										<button
											type="button"
											className="row-action-icon submission-write-up-action"
											onClick={onSendLink}
											disabled={isBusy || state.access.isRevoked || !hasValidContactEmail}
											aria-label="Email portal link to contact"
											title={
												hasValidContactEmail
													? 'Email portal link to contact'
													: 'Assigned client contact needs a valid email address'
											}
										>
											{busyAction === 'send' ? (
												<LoaderCircle aria-hidden="true" className="row-action-icon-spinner" />
											) : (
												<Mail aria-hidden="true" />
											)}
										</button>
										<a
											href={state.access.portalUrl || '#'}
											target="_blank"
											rel="noreferrer"
											className={`row-action-icon submission-write-up-action${state.access.isRevoked || isBusy ? ' is-disabled' : ''}`}
											aria-label="Open portal"
											title="Open portal"
											onClick={(event) => {
												if (state.access.isRevoked || isBusy) {
													event.preventDefault();
												}
											}}
										>
											<ArrowUpRight aria-hidden="true" />
										</a>
										<button
											type="button"
											className="row-action-icon submission-write-up-action"
											onClick={() => onTogglePortal(state.access.isRevoked ? 'restore' : 'revoke')}
											disabled={isBusy}
											aria-label={state.access.isRevoked ? 'Restore portal' : 'Disable portal'}
											title={state.access.isRevoked ? 'Restore portal' : 'Disable portal'}
										>
											{busyAction === 'revoke' || busyAction === 'restore' ? (
												<LoaderCircle aria-hidden="true" className="row-action-icon-spinner" />
											) : (
												<ShieldOff aria-hidden="true" />
											)}
										</button>
									</div>
									{state.access.isRevoked ? (
										<p className="panel-subtext">This portal link is currently disabled. Restore it to let the client use the same bookmarked link again.</p>
									) : null}
									{!hasValidContactEmail ? (
										<p className="panel-subtext">Add a valid email address to the assigned client contact to send the portal link from the app.</p>
									) : null}
									<p className="simple-list-meta">
										Last viewed: <span className="meta-emphasis-time">{state.access.lastViewedAt ? new Date(state.access.lastViewedAt).toLocaleString() : 'Never'}</span>
									</p>
									<p className="simple-list-meta">
										Last emailed: <span className="meta-emphasis-time">{state.access.lastEmailedAt ? new Date(state.access.lastEmailedAt).toLocaleString() : 'Never'}</span>
									</p>
								</div>
							) : (
								<div className="client-portal-modal-card">
									<h4>Create Portal Link</h4>
									<p className="panel-subtext">
										Create a persistent magic link for this contact to review submitted candidates without a login.
									</p>
									<button
										type="button"
										className="btn-primary client-portal-create-button"
										onClick={onEnsurePortal}
										disabled={isBusy}
									>
										{busyAction === 'create' ? (
											<>
												<LoaderCircle aria-hidden="true" className="row-action-icon-spinner" />
												Creating...
											</>
										) : (
											<>
												<Link2 aria-hidden="true" /> 
												Create Client Portal Link
											</>
										)}
									</button>
								</div>
							)}
						</>
					)}
				</div>
			</div>
		</div>
	);
}
