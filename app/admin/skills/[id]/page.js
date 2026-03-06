'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AdminGate from '@/app/components/admin-gate';
import FormField from '@/app/components/form-field';
import LoadingIndicator from '@/app/components/loading-indicator';
import { useToast } from '@/app/components/toast-provider';
import { useConfirmDialog } from '@/app/components/confirm-dialog';
import useUnsavedChangesGuard from '@/app/hooks/use-unsaved-changes-guard';
import { formatDateTimeAt } from '@/lib/date-format';
import { SKILL_CATEGORY_OPTIONS, normalizeSkillCategory } from '@/lib/skill-category-options';

const initialForm = {
	name: '',
	category: '',
	isActive: true
};

function toForm(skill) {
	if (!skill) return initialForm;
	return {
		name: skill.name || '',
		category: normalizeSkillCategory(skill.category),
		isActive: Boolean(skill.isActive)
	};
}

function formatDate(value) {
	return formatDateTimeAt(value);
}

export default function SkillDetailsPage() {
	const { id } = useParams();
	const router = useRouter();
	const [skill, setSkill] = useState(null);
	const [form, setForm] = useState(initialForm);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [saveState, setSaveState] = useState({ saving: false, error: '', success: '' });
	const [deleting, setDeleting] = useState(false);
	const toast = useToast();
	const { requestConfirm } = useConfirmDialog();
	const { markAsClean } = useUnsavedChangesGuard(form, {
		enabled: !loading && Boolean(skill)
	});

	useEffect(() => {
		let cancelled = false;

		async function load() {
			setLoading(true);
			setError('');
			const res = await fetch(`/api/skills/${id}`);
			if (!res.ok) {
				if (!cancelled) {
					setError('Skill not found.');
					setLoading(false);
				}
				return;
			}

			const data = await res.json();
			if (!cancelled) {
				const nextForm = toForm(data);
				setSkill(data);
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

		const res = await fetch(`/api/skills/${id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(form)
		});

		if (!res.ok) {
			const data = await res.json().catch(() => ({}));
			setSaveState({ saving: false, error: data.error || 'Failed to update skill.', success: '' });
			return;
		}

		const updated = await res.json();
		const nextForm = toForm(updated);
		setSkill(updated);
		setForm(nextForm);
		markAsClean(nextForm);
		setSaveState({ saving: false, error: '', success: 'Skill updated.' });
	}

	async function onDelete() {
		const confirmed = await requestConfirm({
			message: 'Delete this skill? This cannot be undone.',
			confirmLabel: 'Delete',
			cancelLabel: 'Keep',
			isDanger: true
		});
		if (!confirmed) return;
		setDeleting(true);
		setSaveState({ saving: false, error: '', success: '' });

		const res = await fetch(`/api/skills/${id}`, { method: 'DELETE' });
		if (!res.ok) {
			const data = await res.json().catch(() => ({}));
			setDeleting(false);
			setSaveState({ saving: false, error: data.error || 'Failed to delete skill.', success: '' });
			return;
		}

		router.push('/admin/skills');
	}

	if (loading) {
		return (
			<AdminGate>
				<section className="module-page">
					<LoadingIndicator className="page-loading-indicator" label="Loading skill details" />
				</section>
			</AdminGate>
		);
	}

	if (error || !skill) {
		return (
			<AdminGate>
				<section className="module-page">
					<p>{error || 'Skill not found.'}</p>
					<button type="button" onClick={() => router.push('/admin/skills')}>
						Back to Skills
					</button>
				</section>
			</AdminGate>
		);
	}

	const canSave = Boolean(form.name.trim() && form.category);

	return (
		<AdminGate>
			<section className="module-page">
				<header className="module-header">
					<div>
						<Link href="/admin/skills" className="module-back-link" aria-label="Back to List">&larr; Back</Link>
						<h2>{skill.name}</h2>
						<p>{skill.category || 'No category'}</p>
					</div>
				</header>

				<article className="panel panel-spacious panel-narrow">
					<h3>Skill Details</h3>
					<p className="panel-subtext">Edit skill name, category, and availability.</p>
					<form onSubmit={onSave} className="detail-form">
						<section className="form-section">
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
						</section>

						<div className="form-actions">
							<button type="submit" disabled={saveState.saving || deleting || !canSave}>
								{saveState.saving ? 'Saving...' : 'Save Skill'}
							</button>
							<button
								type="button"
								className="btn-secondary"
								onClick={onDelete}
								disabled={saveState.saving || deleting}
							>
								{deleting ? 'Deleting...' : 'Delete'}
							</button>
							<span className="form-actions-meta">
								<span>Updated:</span>
								<strong>{formatDate(skill.updatedAt)}</strong>
							</span>
						</div>
					</form>
				</article>
			</section>
		</AdminGate>
	);
}
