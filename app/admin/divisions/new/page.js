'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DIVISION_ACCESS_MODE_OPTIONS } from '@/app/constants/access-control-options';
import AdminGate from '@/app/components/admin-gate';
import FormField from '@/app/components/form-field';
import SaveActionButton from '@/app/components/save-action-button';
import { useToast } from '@/app/components/toast-provider';
import useUnsavedChangesGuard from '@/app/hooks/use-unsaved-changes-guard';

const initialForm = {
	name: '',
	accessMode: 'COLLABORATIVE'
};

export default function NewDivisionPage() {
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

		const res = await fetch('/api/divisions', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(form)
		});

		if (!res.ok) {
			const data = await res.json().catch(() => ({}));
			setSaving(false);
			setError(data.error || 'Failed to create division.');
			return;
		}

		const division = await res.json();
		router.push(`/admin/divisions/${division.id}`);
	}

	return (
		<AdminGate>
			<section className="module-page">
				<header className="module-header">
					<div>
						<Link href="/admin/divisions" className="module-back-link" aria-label="Back to List">&larr; Back</Link>
						<h2>New Division</h2>
						<p>Create a division and choose how recruiter visibility works.</p>
					</div>
				</header>

				<article className="panel panel-narrow">
					<h3>Add Division</h3>
					<form onSubmit={onSubmit}>
						<FormField label="Division Name" required>
							<input
								value={form.name}
								onChange={(event) =>
									setForm((current) => ({ ...current, name: event.target.value }))
								}
								required
							/>
						</FormField>
						<FormField label="Access Mode">
							<select
								value={form.accessMode}
								onChange={(event) =>
									setForm((current) => ({ ...current, accessMode: event.target.value }))
								}
							>
								{DIVISION_ACCESS_MODE_OPTIONS.map((option) => (
									<option key={option.value} value={option.value}>
										{option.label}
									</option>
								))}
							</select>
						</FormField>
						<SaveActionButton
							saving={saving}
							disabled={saving}
							label="Save Division"
							savingLabel="Saving Division..."
						/>
					</form>
				</article>
			</section>
		</AdminGate>
	);
}
