'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import FormField from '@/app/components/form-field';
import LoadingIndicator from '@/app/components/loading-indicator';
import { useToast } from '@/app/components/toast-provider';

const initialPasswordForm = {
	currentPassword: '',
	newPassword: '',
	confirmPassword: ''
};

const initialSettingsForm = {
	notifyCareerSiteApplications: true,
	notifyClientPortalFeedback: true
};

export default function AccountSettingsPage() {
	const toast = useToast();
	const [loading, setLoading] = useState(true);
	const [loadingError, setLoadingError] = useState('');
	const [profile, setProfile] = useState({
		firstName: '',
		lastName: '',
		email: ''
	});
	const [settingsForm, setSettingsForm] = useState(initialSettingsForm);
	const [savedSettingsForm, setSavedSettingsForm] = useState(initialSettingsForm);
	const [settingsState, setSettingsState] = useState({ saving: false });
	const [passwordForm, setPasswordForm] = useState(initialPasswordForm);
	const [passwordState, setPasswordState] = useState({ saving: false });

	const canSaveSettings = useMemo(
		() =>
			(
				settingsForm.notifyCareerSiteApplications !== savedSettingsForm.notifyCareerSiteApplications
				|| settingsForm.notifyClientPortalFeedback !== savedSettingsForm.notifyClientPortalFeedback
			) &&
			!loading,
		[
			settingsForm.notifyCareerSiteApplications,
			settingsForm.notifyClientPortalFeedback,
			savedSettingsForm.notifyCareerSiteApplications,
			savedSettingsForm.notifyClientPortalFeedback,
			loading
		]
	);
	const canChangePassword =
		Boolean(passwordForm.currentPassword.trim()) &&
		Boolean(passwordForm.newPassword.trim()) &&
		Boolean(passwordForm.confirmPassword.trim());

	useEffect(() => {
		let cancelled = false;

		async function loadSettings() {
			setLoading(true);
			setLoadingError('');
			const res = await fetch('/api/session/settings', { cache: 'no-store' });
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				if (cancelled) return;
				const message = data.error || 'Failed to load account settings.';
				setLoadingError(message);
				toast.error(message);
				setLoading(false);
				return;
			}

			const data = await res.json().catch(() => ({}));
			if (cancelled) return;
			const nextSettings = {
				notifyCareerSiteApplications: Boolean(data.notifyCareerSiteApplications),
				notifyClientPortalFeedback: Boolean(data.notifyClientPortalFeedback)
			};
			setProfile({
				firstName: data.firstName || '',
				lastName: data.lastName || '',
				email: data.email || ''
			});
			setSettingsForm(nextSettings);
			setSavedSettingsForm(nextSettings);
			setLoading(false);
		}

		loadSettings();
		return () => {
			cancelled = true;
		};
	}, [toast]);

	async function onSaveSettings(event) {
		event.preventDefault();
		if (settingsState.saving || !canSaveSettings) return;

		setSettingsState({ saving: true });
		const res = await fetch('/api/session/settings', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(settingsForm)
		});
		const data = await res.json().catch(() => ({}));
		if (!res.ok) {
			toast.error(data?.error || 'Failed to update notification settings.');
			setSettingsState({ saving: false });
			return;
		}

		const nextSettings = {
			notifyCareerSiteApplications: Boolean(data?.settings?.notifyCareerSiteApplications),
			notifyClientPortalFeedback: Boolean(data?.settings?.notifyClientPortalFeedback)
		};
		setSettingsForm(nextSettings);
		setSavedSettingsForm(nextSettings);
		toast.success(data?.message || 'Settings updated.');
		setSettingsState({ saving: false });
	}

	async function onChangePassword(event) {
		event.preventDefault();
		if (passwordState.saving) return;

		setPasswordState({ saving: true });
		const res = await fetch('/api/session/change-password', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(passwordForm)
		});

		const data = await res.json().catch(() => ({}));
		if (!res.ok) {
			const message =
				data?.errors?.fieldErrors?.currentPassword?.[0] ||
				data?.errors?.fieldErrors?.newPassword?.[0] ||
				data?.errors?.fieldErrors?.confirmPassword?.[0] ||
				data?.error ||
				'Failed to update password.';
			toast.error(message);
			setPasswordState({ saving: false });
			return;
		}

		setPasswordForm(initialPasswordForm);
		toast.success(data?.message || 'Password updated.');
		setPasswordState({ saving: false });
	}

	return (
		<section className="module-page">
			<header className="module-header">
				<div>
					<Link href="/" className="module-back-link" aria-label="Back to Dashboard">&larr; Back</Link>
					<h2>Account Settings</h2>
					<p>
						{profile.firstName || profile.lastName
							? `${profile.firstName} ${profile.lastName}`.trim()
							: 'Current User'}
						{profile.email ? ` | ${profile.email}` : ''}
					</p>
				</div>
			</header>

			{loading ? <LoadingIndicator className="page-loading-indicator" label="Loading account settings" /> : null}
			{!loading && loadingError ? <p>{loadingError}</p> : null}

			{!loading && !loadingError ? (
				<div className="table-shell">
					<article className="panel panel-spacious panel-narrow">
						<h3>Notifications</h3>
						<p className="panel-subtext">Control which account alerts are emailed to you.</p>
						<form onSubmit={onSaveSettings} className="detail-form">
							<label className="switch-field">
								<input
									type="checkbox"
									className="switch-input"
									checked={settingsForm.notifyCareerSiteApplications}
									onChange={(event) =>
										setSettingsForm((current) => ({
											...current,
											notifyCareerSiteApplications: event.target.checked
										}))
									}
								/>
								<span className="switch-track" aria-hidden="true">
									<span className="switch-thumb" />
								</span>
								<span className="switch-copy">
									<span className="switch-label">Career Site Application Emails</span>
									<span className="switch-hint">
										Email me when someone applies to a job order I own.
									</span>
								</span>
							</label>
							<label className="switch-field">
								<input
									type="checkbox"
									className="switch-input"
									checked={settingsForm.notifyClientPortalFeedback}
									onChange={(event) =>
										setSettingsForm((current) => ({
											...current,
											notifyClientPortalFeedback: event.target.checked
										}))
									}
								/>
								<span className="switch-track" aria-hidden="true">
									<span className="switch-thumb" />
								</span>
								<span className="switch-copy">
									<span className="switch-label">Client Feedback Notifications</span>
									<span className="switch-hint">
										Notify me when a client comments, requests an interview, or passes through the portal.
									</span>
								</span>
							</label>
							<div className="auth-reset-actions">
								<button type="submit" disabled={settingsState.saving || !canSaveSettings}>
									{settingsState.saving ? 'Saving...' : 'Save Notification Settings'}
								</button>
							</div>
						</form>
					</article>

					<article className="panel panel-spacious panel-narrow">
						<h3>Password</h3>
						<p className="panel-subtext">Change your login password.</p>
						<form onSubmit={onChangePassword} className="detail-form">
							<FormField label="Current Password" required>
								<input
									type="password"
									autoComplete="current-password"
									value={passwordForm.currentPassword}
									onChange={(event) =>
										setPasswordForm((current) => ({ ...current, currentPassword: event.target.value }))
									}
									required
								/>
							</FormField>
							<FormField label="New Password" required hint="Minimum 8 characters">
								<input
									type="password"
									autoComplete="new-password"
									value={passwordForm.newPassword}
									onChange={(event) =>
										setPasswordForm((current) => ({ ...current, newPassword: event.target.value }))
									}
									required
								/>
							</FormField>
							<FormField label="Confirm New Password" required>
								<input
									type="password"
									autoComplete="new-password"
									value={passwordForm.confirmPassword}
									onChange={(event) =>
										setPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))
									}
									required
								/>
							</FormField>
							<div className="auth-reset-actions">
								<button type="submit" disabled={passwordState.saving || !canChangePassword}>
									{passwordState.saving ? 'Updating...' : 'Update Password'}
								</button>
							</div>
						</form>
					</article>
				</div>
			) : null}
		</section>
	);
}
