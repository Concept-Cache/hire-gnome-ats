'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import LookupTypeaheadSelect from '@/app/components/lookup-typeahead-select';
import { USER_ROLE_OPTIONS } from '@/app/constants/access-control-options';
import AdminGate from '@/app/components/admin-gate';
import FormField from '@/app/components/form-field';
import { useToast } from '@/app/components/toast-provider';
import useUnsavedChangesGuard from '@/app/hooks/use-unsaved-changes-guard';

const initialForm = {
	firstName: '',
	lastName: '',
	email: '',
	password: '',
	role: 'RECRUITER',
	divisionId: '',
	isActive: true
};

export default function NewUserPage() {
	const router = useRouter();
	const [form, setForm] = useState(initialForm);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState('');
	const toast = useToast();
	useUnsavedChangesGuard(form);

	useEffect(() => {
		if (error) {
			toast.error(error);
		}
	}, [error, toast]);

	async function onSubmit(event) {
		event.preventDefault();
		setError('');
		setSaving(true);

		const payload = {
			...form,
			divisionId: form.role === 'ADMINISTRATOR' ? form.divisionId || '' : form.divisionId
		};

		const res = await fetch('/api/users', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});

		if (!res.ok) {
			const data = await res.json().catch(() => ({}));
			setSaving(false);
			setError(data.error || 'Failed to create user.');
			return;
		}

		const user = await res.json();
		router.push(`/admin/users/${user.id}`);
	}

	return (
		<AdminGate>
			<section className="module-page">
				<header className="module-header">
					<div>
						<Link href="/admin/users" className="module-back-link" aria-label="Back to List">&larr; Back</Link>
						<h2>New User</h2>
						<p>Create users and assign their role and division scope.</p>
					</div>
				</header>

				<article className="panel panel-narrow">
					<h3>Add User</h3>
					<form onSubmit={onSubmit}>
						<div className="form-grid-2">
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
								onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
								required
							/>
						</FormField>
						<FormField label="Password" required>
							<input
								type="password"
								autoComplete="new-password"
								value={form.password}
								onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
								required
							/>
						</FormField>
						<div className="form-grid-2">
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
								<span className="switch-hint">Can be selected as an owner.</span>
							</span>
						</label>
						<button type="submit" disabled={saving}>
							{saving ? 'Saving...' : 'Save User'}
						</button>
					</form>
				</article>
			</section>
		</AdminGate>
	);
}
