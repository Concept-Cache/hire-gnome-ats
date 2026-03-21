'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import LookupTypeaheadSelect from '@/app/components/lookup-typeahead-select';
import { USER_ROLE_OPTIONS } from '@/app/constants/access-control-options';
import AdminGate from '@/app/components/admin-gate';
import FormField from '@/app/components/form-field';
import LoadingIndicator from '@/app/components/loading-indicator';
import SaveActionButton from '@/app/components/save-action-button';
import { useToast } from '@/app/components/toast-provider';
import useUnsavedChangesGuard from '@/app/hooks/use-unsaved-changes-guard';
import { formatDateTimeAt } from '@/lib/date-format';

const initialForm = {
	firstName: '',
	lastName: '',
	email: '',
	password: '',
	role: 'RECRUITER',
	divisionId: '',
	isActive: true
};

function toForm(row) {
	if (!row) return initialForm;
	return {
		firstName: row.firstName || '',
		lastName: row.lastName || '',
		email: row.email || '',
		password: '',
		role: row.role || 'RECRUITER',
		divisionId: row.divisionId == null ? '' : String(row.divisionId),
		isActive: Boolean(row.isActive)
	};
}

function formatDate(value) {
	return formatDateTimeAt(value);
}

export default function UserDetailsPage() {
	const { id } = useParams();
	const router = useRouter();
	const [user, setUser] = useState(null);
	const [form, setForm] = useState(initialForm);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [saveState, setSaveState] = useState({ saving: false, error: '', success: '' });
	const toast = useToast();
	const { markAsClean } = useUnsavedChangesGuard(form, {
		enabled: !loading && Boolean(user)
	});

	useEffect(() => {
		let cancelled = false;

		async function load() {
			setLoading(true);
			setError('');

			const userRes = await fetch(`/api/users/${id}`);
			if (!userRes.ok) {
				if (!cancelled) {
					setError('User not found.');
					setLoading(false);
				}
				return;
			}

			const userData = await userRes.json();
			if (!cancelled) {
				const nextForm = toForm(userData);
				setUser(userData);
				setForm(nextForm);
				markAsClean(nextForm);
				setLoading(false);
			}
		}

		load();
		return () => {
			cancelled = true;
		};
	}, [id]);

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

	async function onSave(event) {
		event.preventDefault();
		setSaveState({ saving: true, error: '', success: '' });

		const payload = {
			...form,
			divisionId: form.role === 'ADMINISTRATOR' ? form.divisionId || '' : form.divisionId
		};

		const res = await fetch(`/api/users/${id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});

		if (!res.ok) {
			const data = await res.json().catch(() => ({}));
			setSaveState({ saving: false, error: data.error || 'Failed to update user.', success: '' });
			return;
		}

		const updated = await res.json();
		const nextForm = toForm(updated);
		setUser(updated);
		setForm(nextForm);
		markAsClean(nextForm);
		setSaveState({ saving: false, error: '', success: 'User updated.' });
	}

	if (loading) {
		return (
			<AdminGate>
				<section className="module-page">
					<LoadingIndicator className="page-loading-indicator" label="Loading user details" />
				</section>
			</AdminGate>
		);
	}

	if (error || !user) {
		return (
			<AdminGate>
				<section className="module-page">
					<p>{error || 'User not found.'}</p>
					<button type="button" onClick={() => router.push('/admin/users')}>
						Back to Users
					</button>
				</section>
			</AdminGate>
		);
	}

	return (
		<AdminGate>
			<section className="module-page">
				<header className="module-header">
					<div>
						<Link href="/admin/users" className="module-back-link" aria-label="Back to List">&larr; Back</Link>
						<h2>
							{user.firstName} {user.lastName}
						</h2>
						<p>{user.email}</p>
					</div>
				</header>

				<div className="detail-layout">
					<article className="panel panel-spacious">
						<h3>User Details</h3>
						<p className="panel-subtext">Edit role, division, and active status.</p>
						<form onSubmit={onSave} className="detail-form">
							<section className="form-section">
								<div className="detail-form-grid-2">
									<FormField label="First Name" required>
										<input
											value={form.firstName}
											onChange={(event) =>
												setForm((current) => ({ ...current, firstName: event.target.value }))
											}
											required
										/>
									</FormField>
									<FormField label="Last Name" required>
										<input
											value={form.lastName}
											onChange={(event) =>
												setForm((current) => ({ ...current, lastName: event.target.value }))
											}
											required
										/>
									</FormField>
								</div>
								<FormField label="Email" required>
									<input
										type="email"
										value={form.email}
										onChange={(event) =>
											setForm((current) => ({ ...current, email: event.target.value }))
										}
										required
									/>
								</FormField>
								<FormField label="New Password" hint="Leave blank to keep current password.">
									<input
										type="password"
										autoComplete="new-password"
										value={form.password}
										onChange={(event) =>
											setForm((current) => ({ ...current, password: event.target.value }))
										}
									/>
								</FormField>
								<div className="detail-form-grid-2">
									<FormField label="Role">
										<select
											value={form.role}
											onChange={(event) =>
												setForm((current) => ({ ...current, role: event.target.value }))
											}
										>
											{USER_ROLE_OPTIONS.map((option) => (
												<option key={option.value} value={option.value}>
													{option.label}
												</option>
											))}
										</select>
									</FormField>
									<FormField label="Division">
										<LookupTypeaheadSelect
											entity="divisions"
											lookupParams={{}}
											value={form.divisionId}
											onChange={(nextValue) =>
												setForm((current) => ({ ...current, divisionId: nextValue }))
											}
											placeholder={
												form.role === 'ADMINISTRATOR'
													? 'Search division (optional)'
													: 'Search division'
											}
											label="Division"
											emptyLabel="No matching divisions."
										/>
									</FormField>
								</div>
								<label className="switch-field">
									<input
										type="checkbox"
										className="switch-input"
										checked={form.isActive}
										onChange={(event) =>
											setForm((current) => ({ ...current, isActive: event.target.checked }))
										}
									/>
									<span className="switch-track" aria-hidden="true">
										<span className="switch-thumb" />
									</span>
									<span className="switch-copy">
										<span className="switch-label">Active User</span>
										<span className="switch-hint">Can own and be assigned records.</span>
									</span>
								</label>
							</section>

							<div className="form-actions">
								<SaveActionButton
									saving={saveState.saving}
									disabled={saveState.saving}
									label="Save User"
									savingLabel="Saving User..."
								/>
								<span className="form-actions-meta">
									<span>Updated:</span>
									<strong>{formatDate(user.updatedAt)}</strong>
								</span>
							</div>
						</form>
					</article>

					<div className="stack-panels">
						<article className="panel">
							<h3>Ownership Snapshot</h3>
							<div className="info-list snapshot-grid snapshot-grid-two-by-two">
								<p>
									<span>Candidates</span>
									<strong>{user._count?.ownedCandidates ?? 0}</strong>
								</p>
								<p>
									<span>Clients</span>
									<strong>{user._count?.ownedClients ?? 0}</strong>
								</p>
								<p>
									<span>Contacts</span>
									<strong>{user._count?.ownedContacts ?? 0}</strong>
								</p>
								<p>
									<span>Job Orders</span>
									<strong>{user._count?.ownedJobOrders ?? 0}</strong>
								</p>
							</div>
						</article>
					</div>
				</div>
			</section>
		</AdminGate>
	);
}
