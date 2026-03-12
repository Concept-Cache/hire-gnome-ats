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
import {
	CUSTOM_FIELD_MODULE_OPTIONS,
	CUSTOM_FIELD_TYPE_OPTIONS,
	customFieldModuleLabel
} from '@/app/constants/custom-field-options';

const initialForm = {
	moduleKey: 'candidates',
	label: '',
	fieldKey: '',
	fieldType: 'text',
	selectOptionsText: '',
	placeholder: '',
	helpText: '',
	sortOrder: '0',
	isRequired: false,
	isActive: true
};

function parseSortOrder(value) {
	const parsed = Number(value);
	return Number.isInteger(parsed) ? parsed : 0;
}

function toSelectOptionsPayload(value) {
	return String(value || '')
		.split(/\r?\n|,/)
		.map((token) => token.trim())
		.filter(Boolean);
}

function toForm(row) {
	if (!row) return initialForm;
	return {
		moduleKey: row.moduleKey || 'candidates',
		label: row.label || '',
		fieldKey: row.fieldKey || '',
		fieldType: row.fieldType || 'text',
		selectOptionsText: Array.isArray(row.selectOptions) ? row.selectOptions.join('\n') : '',
		placeholder: row.placeholder || '',
		helpText: row.helpText || '',
		sortOrder: Number.isInteger(Number(row.sortOrder)) ? String(row.sortOrder) : '0',
		isRequired: Boolean(row.isRequired),
		isActive: Boolean(row.isActive)
	};
}

function formatDate(value) {
	return formatDateTimeAt(value);
}

export default function CustomFieldDetailsPage() {
	const { id } = useParams();
	const router = useRouter();
	const [row, setRow] = useState(null);
	const [form, setForm] = useState(initialForm);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [saveState, setSaveState] = useState({ saving: false, error: '', success: '' });
	const [deleting, setDeleting] = useState(false);
	const toast = useToast();
	const { requestConfirm } = useConfirmDialog();
	const { markAsClean } = useUnsavedChangesGuard(form, {
		enabled: !loading && Boolean(row)
	});

	useEffect(() => {
		let cancelled = false;

		async function load() {
			setLoading(true);
			setError('');
			const res = await fetch(`/api/admin/custom-fields/${id}`, { cache: 'no-store' });
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				if (!cancelled) {
					setError(data.error || 'Custom field not found.');
					setLoading(false);
				}
				return;
			}

			const data = await res.json();
			if (!cancelled) {
				const nextForm = toForm(data);
				setRow(data);
				setForm(nextForm);
				markAsClean(nextForm);
				setLoading(false);
			}
		}

		load();
		return () => {
			cancelled = true;
		};
	}, [id, markAsClean]);

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

	const isSelectType = form.fieldType === 'select';
	const hasSelectOptions = toSelectOptionsPayload(form.selectOptionsText).length > 0;
	const canSave = Boolean(
		form.moduleKey && form.label.trim() && form.fieldType && (!isSelectType || hasSelectOptions)
	);

	async function onSave(event) {
		event.preventDefault();
		setSaveState({ saving: true, error: '', success: '' });

		const payload = {
			moduleKey: form.moduleKey,
			label: form.label,
			fieldKey: form.fieldKey,
			fieldType: form.fieldType,
			selectOptions: isSelectType ? toSelectOptionsPayload(form.selectOptionsText) : [],
			placeholder: form.placeholder,
			helpText: form.helpText,
			sortOrder: parseSortOrder(form.sortOrder),
			isRequired: form.isRequired,
			isActive: form.isActive
		};

		const res = await fetch(`/api/admin/custom-fields/${id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});

		if (!res.ok) {
			const data = await res.json().catch(() => ({}));
			setSaveState({ saving: false, error: data.error || 'Failed to update custom field.', success: '' });
			return;
		}

		const updated = await res.json();
		const nextForm = toForm(updated);
		setRow(updated);
		setForm(nextForm);
		markAsClean(nextForm);
		setSaveState({ saving: false, error: '', success: 'Custom field updated.' });
	}

	async function onDelete() {
		const confirmed = await requestConfirm({
			message: 'Delete this custom field? This cannot be undone.',
			confirmLabel: 'Delete',
			cancelLabel: 'Keep',
			isDanger: true
		});
		if (!confirmed) return;

		setDeleting(true);
		setSaveState({ saving: false, error: '', success: '' });

		const res = await fetch(`/api/admin/custom-fields/${id}`, { method: 'DELETE' });
		if (!res.ok) {
			const data = await res.json().catch(() => ({}));
			setDeleting(false);
			setSaveState({ saving: false, error: data.error || 'Failed to delete custom field.', success: '' });
			return;
		}

		router.push('/admin/custom-fields');
	}

	if (loading) {
		return (
			<AdminGate>
				<section className="module-page">
					<LoadingIndicator className="page-loading-indicator" label="Loading custom field details" />
				</section>
			</AdminGate>
		);
	}

	if (error || !row) {
		return (
			<AdminGate>
				<section className="module-page">
					<p>{error || 'Custom field not found.'}</p>
					<button type="button" onClick={() => router.push('/admin/custom-fields')}>
						Back to Custom Fields
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
						<Link href="/admin/custom-fields" className="module-back-link" aria-label="Back to List">&larr; Back</Link>
						<h2>{row.label}</h2>
						<p>{customFieldModuleLabel(row.moduleKey)}</p>
					</div>
				</header>

				<article className="panel panel-spacious panel-narrow">
					<h3>Custom Field Details</h3>
					<form onSubmit={onSave} className="detail-form">
						<section className="form-section">
							<FormField label="Module" required>
								<select
									value={form.moduleKey}
									onChange={(event) =>
										setForm((current) => ({ ...current, moduleKey: event.target.value }))
									}
									required
								>
									{CUSTOM_FIELD_MODULE_OPTIONS.map((option) => (
										<option key={option.value} value={option.value}>
											{option.label}
										</option>
									))}
								</select>
							</FormField>
							<FormField label="Label" required>
								<input
									value={form.label}
									onChange={(event) =>
										setForm((current) => ({ ...current, label: event.target.value }))
									}
									required
								/>
							</FormField>
							<FormField label="Field Key">
								<input
									value={form.fieldKey}
									onChange={(event) =>
										setForm((current) => ({ ...current, fieldKey: event.target.value }))
									}
								/>
							</FormField>
							<div className="detail-form-grid-2">
								<FormField label="Type" required>
									<select
										value={form.fieldType}
										onChange={(event) =>
											setForm((current) => ({ ...current, fieldType: event.target.value }))
										}
										required
									>
										{CUSTOM_FIELD_TYPE_OPTIONS.map((option) => (
											<option key={option.value} value={option.value}>
												{option.label}
											</option>
										))}
									</select>
								</FormField>
								<FormField label="Sort Order">
									<input
										type="number"
										value={form.sortOrder}
										onChange={(event) =>
											setForm((current) => ({ ...current, sortOrder: event.target.value }))
										}
									/>
								</FormField>
							</div>
							<FormField label="Placeholder">
								<input
									value={form.placeholder}
									onChange={(event) =>
										setForm((current) => ({ ...current, placeholder: event.target.value }))
									}
								/>
							</FormField>
							<FormField label="Help Text">
								<textarea
									rows={3}
									value={form.helpText}
									onChange={(event) =>
										setForm((current) => ({ ...current, helpText: event.target.value }))
									}
								/>
							</FormField>
							{isSelectType ? (
								<FormField label="Select Options" required>
									<textarea
										rows={4}
										placeholder="One option per line"
										value={form.selectOptionsText}
										onChange={(event) =>
											setForm((current) => ({
												...current,
												selectOptionsText: event.target.value
											}))
										}
										required
									/>
								</FormField>
							) : null}
							<label className="switch-field">
								<input
									type="checkbox"
									className="switch-input"
									checked={form.isRequired}
									onChange={(event) =>
										setForm((current) => ({ ...current, isRequired: event.target.checked }))
									}
								/>
								<span className="switch-track" aria-hidden="true">
									<span className="switch-thumb" />
								</span>
								<span className="switch-copy">
									<span className="switch-label">Required Field</span>
									<span className="switch-hint">Enforced when users save this module.</span>
								</span>
							</label>
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
									<span className="switch-label">Active Field</span>
									<span className="switch-hint">Inactive fields are hidden on forms.</span>
								</span>
							</label>
						</section>

						<div className="form-actions">
							<button type="submit" disabled={saveState.saving || deleting || !canSave}>
								{saveState.saving ? 'Saving...' : 'Save Custom Field'}
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
								<strong>{formatDate(row.updatedAt)}</strong>
							</span>
						</div>
					</form>
				</article>
			</section>
		</AdminGate>
	);
}
