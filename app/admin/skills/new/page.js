'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import AdminGate from '@/app/components/admin-gate';
import FormField from '@/app/components/form-field';
import { useToast } from '@/app/components/toast-provider';
import useUnsavedChangesGuard from '@/app/hooks/use-unsaved-changes-guard';
import { SKILL_CATEGORY_OPTIONS, normalizeSkillCategory } from '@/lib/skill-category-options';

const initialForm = {
	name: '',
	category: '',
	isActive: true
};

export default function NewSkillPage() {
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

		const res = await fetch('/api/skills', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(form)
		});

		if (!res.ok) {
			const data = await res.json().catch(() => ({}));
			setSaving(false);
			setError(data.error || 'Failed to create skill.');
			return;
		}

		const skill = await res.json();
		router.push(`/admin/skills/${skill.id}`);
	}

	const canSave = Boolean(form.name.trim() && form.category);

	return (
		<AdminGate>
			<section className="module-page">
				<header className="module-header">
					<div>
						<Link href="/admin/skills" className="module-back-link" aria-label="Back to List">&larr; Back</Link>
						<h2>New Skill</h2>
						<p>Add a skill to the reusable candidate skill catalog.</p>
					</div>
				</header>

				<article className="panel panel-narrow">
					<h3>Add Skill</h3>
					<form onSubmit={onSubmit}>
						<FormField label="Skill Name" required>
							<input
								value={form.name}
								onChange={(event) =>
									setForm((current) => ({ ...current, name: event.target.value }))
								}
								required
							/>
						</FormField>
						<FormField label="Category" required>
							<select
								value={form.category}
								onChange={(event) =>
									setForm((current) => ({
										...current,
										category: normalizeSkillCategory(event.target.value)
									}))
								}
								required
							>
								<option value="">Select category</option>
								{SKILL_CATEGORY_OPTIONS.map((option) => (
									<option key={option} value={option}>
										{option}
									</option>
								))}
							</select>
						</FormField>
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
								<span className="switch-label">Active Skill</span>
								<span className="switch-hint">Available in candidate skill picker.</span>
							</span>
						</label>
						<button type="submit" disabled={saving || !canSave}>
							{saving ? 'Saving...' : 'Save Skill'}
						</button>
					</form>
				</article>
			</section>
		</AdminGate>
	);
}
