'use client';

import { useEffect, useMemo, useState } from 'react';
import FormField from '@/app/components/form-field';
import LoadingIndicator from '@/app/components/loading-indicator';

function toObject(value) {
	return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeFieldType(value) {
	const fieldType = String(value || '').trim().toLowerCase();
	if (!fieldType) return 'text';
	return fieldType;
}

function normalizeSelectOptions(value) {
	if (!Array.isArray(value)) return [];
	return value
		.map((option) => String(option || '').trim())
		.filter(Boolean);
}

function hasTextValue(value) {
	return String(value ?? '').trim().length > 0;
}

function hasRequiredValue(definition, value) {
	const fieldType = normalizeFieldType(definition?.fieldType);
	if (fieldType === 'boolean') {
		return value === true || value === false;
	}
	if (fieldType === 'number') {
		const parsed = Number(value);
		return Number.isFinite(parsed);
	}
	if (fieldType === 'date') {
		return hasTextValue(value);
	}
	return hasTextValue(value);
}

function toDateInputValue(value) {
	const raw = String(value || '').trim();
	if (!raw) return '';
	if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

	const parsed = new Date(raw);
	if (Number.isNaN(parsed.getTime())) return '';
	const year = String(parsed.getFullYear());
	const month = String(parsed.getMonth() + 1).padStart(2, '0');
	const day = String(parsed.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

function normalizeDefinitions(rows) {
	if (!Array.isArray(rows)) return [];
	return rows.map((row) => ({
		...row,
		fieldType: normalizeFieldType(row.fieldType),
		selectOptions: normalizeSelectOptions(row.selectOptions)
	}));
}

export function areRequiredCustomFieldsComplete(definitions, values) {
	const definitionRows = Array.isArray(definitions) ? definitions : [];
	if (definitionRows.length <= 0) return true;

	const customFieldValues = toObject(values);
	for (const definition of definitionRows) {
		if (!definition?.isRequired) continue;
		const value = customFieldValues[definition.fieldKey];
		if (!hasRequiredValue(definition, value)) {
			return false;
		}
	}
	return true;
}

export default function CustomFieldsSection({
	moduleKey,
	values,
	onChange,
	onDefinitionsChange,
	title = 'Custom Fields',
	description = 'Optional organization-specific fields.',
	disabled = false
}) {
	const [definitions, setDefinitions] = useState([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');

	const fieldValues = useMemo(() => toObject(values), [values]);

	useEffect(() => {
		let cancelled = false;
		if (!moduleKey) {
			setDefinitions([]);
			setLoading(false);
			setError('');
			return () => {
				cancelled = true;
			};
		}

		async function loadDefinitions() {
			setLoading(true);
			setError('');
			try {
				const res = await fetch(`/api/custom-fields?moduleKey=${encodeURIComponent(moduleKey)}`, {
					cache: 'no-store'
				});
				if (!res.ok) {
					const data = await res.json().catch(() => ({}));
					if (!cancelled) {
						setDefinitions([]);
						setError(data.error || 'Failed to load custom fields.');
					}
					return;
				}

				const data = await res.json().catch(() => []);
				if (!cancelled) {
					setDefinitions(normalizeDefinitions(data));
				}
			} finally {
				if (!cancelled) {
					setLoading(false);
				}
			}
		}

		loadDefinitions();
		return () => {
			cancelled = true;
		};
	}, [moduleKey]);

	useEffect(() => {
		if (typeof onDefinitionsChange === 'function') {
			onDefinitionsChange(definitions);
		}
	}, [definitions, onDefinitionsChange]);

	function setFieldValue(fieldKey, nextValue) {
		if (typeof onChange !== 'function') return;
		const nextValues = { ...fieldValues };
		const shouldClear =
			nextValue == null ||
			nextValue === '' ||
			(typeof nextValue === 'string' && nextValue.trim() === '');

		if (shouldClear) {
			delete nextValues[fieldKey];
		} else {
			nextValues[fieldKey] = nextValue;
		}
		onChange(nextValues);
	}

	if (loading) {
		return (
			<section className="form-section">
				<h4>{title}</h4>
				<LoadingIndicator className="inline-loading-indicator" label="Loading custom fields" />
			</section>
		);
	}

	if (error) {
		return (
			<section className="form-section">
				<h4>{title}</h4>
				<p className="panel-subtext error">{error}</p>
			</section>
		);
	}

	if (definitions.length <= 0) {
		return null;
	}

	return (
		<section className="form-section">
			<h4>{title}</h4>
			{description ? <p className="panel-subtext">{description}</p> : null}
			<div className="form-grid-2">
				{definitions.map((definition) => {
					const value = fieldValues[definition.fieldKey];
					const placeholder = String(definition.placeholder || '').trim();
					const helpText = String(definition.helpText || '').trim();

					return (
						<FormField
							key={definition.id || definition.fieldKey}
							label={definition.label || definition.fieldKey}
							required={Boolean(definition.isRequired)}
							hint={helpText}
						>
							{definition.fieldType === 'textarea' ? (
								<textarea
									rows={4}
									value={String(value ?? '')}
									placeholder={placeholder}
									onChange={(event) => setFieldValue(definition.fieldKey, event.target.value)}
									disabled={disabled}
								/>
							) : null}
							{definition.fieldType === 'number' ? (
								<input
									type="number"
									step="any"
									value={value == null ? '' : String(value)}
									placeholder={placeholder}
									onChange={(event) => setFieldValue(definition.fieldKey, event.target.value)}
									disabled={disabled}
								/>
							) : null}
							{definition.fieldType === 'date' ? (
								<input
									type="date"
									value={toDateInputValue(value)}
									onChange={(event) => setFieldValue(definition.fieldKey, event.target.value)}
									disabled={disabled}
								/>
							) : null}
							{definition.fieldType === 'boolean' ? (
								<select
									value={value === true ? 'true' : value === false ? 'false' : ''}
									onChange={(event) => {
										const nextValue = String(event.target.value || '').trim();
										if (!nextValue) {
											setFieldValue(definition.fieldKey, '');
											return;
										}
										setFieldValue(definition.fieldKey, nextValue === 'true');
									}}
									disabled={disabled}
								>
									<option value="">Select</option>
									<option value="true">Yes</option>
									<option value="false">No</option>
								</select>
							) : null}
							{definition.fieldType === 'select' ? (
								<select
									value={String(value ?? '')}
									onChange={(event) => setFieldValue(definition.fieldKey, event.target.value)}
									disabled={disabled}
								>
									<option value="">{placeholder || 'Select option'}</option>
									{definition.selectOptions.map((option) => (
										<option key={option} value={option}>
											{option}
										</option>
									))}
								</select>
							) : null}
							{!['textarea', 'number', 'date', 'boolean', 'select'].includes(definition.fieldType) ? (
								<input
									value={String(value ?? '')}
									placeholder={placeholder}
									onChange={(event) => setFieldValue(definition.fieldKey, event.target.value)}
									disabled={disabled}
								/>
							) : null}
						</FormField>
					);
				})}
			</div>
		</section>
	);
}
