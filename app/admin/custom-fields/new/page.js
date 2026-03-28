'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import AdminGate from '@/app/components/admin-gate';
import FormField from '@/app/components/form-field';
import SaveActionButton from '@/app/components/save-action-button';
import { useToast } from '@/app/components/toast-provider';
import useUnsavedChangesGuard from '@/app/hooks/use-unsaved-changes-guard';
import {
	CUSTOM_FIELD_MODULE_OPTIONS,
	CUSTOM_FIELD_TYPE_OPTIONS
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

export default function NewCustomFieldPage() {
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

	const isSelectType = form.fieldType === 'select';
	const hasSelectOptions = toSelectOptionsPayload(form.selectOptionsText).length > 0;
	const canSave = useMemo(
		() => Boolean(form.moduleKey && form.label.trim() && form.fieldType && (!isSelectType || hasSelectOptions)),
		[form.fieldType, form.label, form.moduleKey, hasSelectOptions, isSelectType]
	);

	async function onSubmit(event) {
		event.preventDefault();
		setError('');
		setSaving(true);

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

		const res = await fetch('/api/admin/custom-fields', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});

		if (!res.ok) {
			const data = await res.json().catch(() => ({}));
			setSaving(false);
			setError(data.error || 'Failed to create custom field.');
			return;
		}

		const created = await res.json();
		router.push(`/admin/custom-fields/${created.id}`);
	}

	return (
		<AdminGate>
			<section className="module-page">
				<header className="module-header">
					<div>
						<Link href="/admin/custom-fields" className="module-back-link" aria-label="Back to List">&larr; Back</Link>
						<h2>New Custom Field</h2>
						<p>Define organization-specific fields for core record forms.</p>
					</div>
				</header>

				<article className="panel panel-narrow">
					<h3>Add Custom Field</h3>
					<form onSubmit={onSubmit}>
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
						<div className="form-grid-2">
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
						<SaveActionButton
							saving={saving}
							disabled={saving || !canSave}
							label="Save Custom Field"
							savingLabel="Saving Custom Field..."
						/>
					</form>
				</article>
			</section>
		</AdminGate>
	);
}
