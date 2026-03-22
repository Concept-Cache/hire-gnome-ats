'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, Eraser, Filter, Plus, X } from 'lucide-react';
import {
	createDefaultJobOrderAdvancedCriterion,
	getJobOrderAdvancedFieldDefinitions,
	getJobOrderAdvancedOperatorOptions,
	isJobOrderAdvancedCriterionComplete,
	normalizeJobOrderAdvancedCriteria
} from '@/lib/job-order-advanced-search';

function criterionRequiresRangeValue(criterion) {
	return criterion?.operator === 'between';
}

function criterionUsesNumericValue(fieldType, criterion) {
	return fieldType === 'number' || (fieldType === 'date' && criterion?.operator === 'in_past_days');
}

function defaultValueForFieldType(fieldType) {
	if (fieldType === 'number') return '0';
	if (fieldType === 'date') return '';
	return '';
}

function nextCriterionForField(fieldDefinitions, fieldKey) {
	const definition = fieldDefinitions.find((field) => field.key === fieldKey) || fieldDefinitions[0];
	const defaultOperator = getJobOrderAdvancedOperatorOptions(definition?.key || '')[0]?.value || 'is';
	const defaultOptionValue = definition?.options?.[0]?.value || '';
	return {
		field: definition?.key || '',
		operator: defaultOperator,
		value: definition?.type === 'select' ? defaultOptionValue : defaultValueForFieldType(definition?.type),
		valueTo: ''
	};
}

export default function JobOrderAdvancedSearchModal({
	open = false,
	criteria = [],
	clientOptions = [],
	ownerOptions = [],
	onApply,
	onClose
}) {
	const fieldDefinitions = useMemo(
		() => getJobOrderAdvancedFieldDefinitions({ clientOptions, ownerOptions }),
		[clientOptions, ownerOptions]
	);
	const [draftCriteria, setDraftCriteria] = useState(() => normalizeJobOrderAdvancedCriteria(criteria));

	useEffect(() => {
		if (!open) return;
		setDraftCriteria(normalizeJobOrderAdvancedCriteria(criteria));
	}, [criteria, open]);

	const completeCriteriaCount = draftCriteria.filter(isJobOrderAdvancedCriterionComplete).length;
	const hasIncompleteCriteria = draftCriteria.some((criterion) => !isJobOrderAdvancedCriterionComplete(criterion));

	if (!open) return null;

	function updateCriterion(index, patch) {
		setDraftCriteria((current) =>
			current.map((criterion, criterionIndex) =>
				criterionIndex === index ? { ...criterion, ...patch } : criterion
			)
		);
	}

	function onFieldChange(index, fieldKey) {
		const nextCriterion = nextCriterionForField(fieldDefinitions, fieldKey);
		updateCriterion(index, nextCriterion);
	}

	function onOperatorChange(index, operator) {
		updateCriterion(index, { operator, value: '', valueTo: '' });
	}

	function addCriterion() {
		setDraftCriteria((current) => [...current, createDefaultJobOrderAdvancedCriterion()]);
	}

	function removeCriterion(index) {
		setDraftCriteria((current) => {
			return current.filter((_, criterionIndex) => criterionIndex !== index);
		});
	}

	function clearCriteria() {
		setDraftCriteria([]);
	}

	function applyCriteria() {
		const nextCriteria = normalizeJobOrderAdvancedCriteria(draftCriteria).filter(isJobOrderAdvancedCriterionComplete);
		onApply?.(nextCriteria);
	}

	return (
		<div className="confirm-overlay" role="presentation">
			<div className="job-order-advanced-search-modal" role="dialog" aria-modal="true" aria-labelledby="job-order-advanced-search-title">
				<div className="job-order-advanced-search-modal-head">
					<div>
						<p className="job-order-advanced-search-eyebrow">Job Orders</p>
						<h3 id="job-order-advanced-search-title">Advanced Search</h3>
						<p className="job-order-advanced-search-copy">
							Build structured criteria for the list. Quick search stays separate.
						</p>
					</div>
					<button
						type="button"
						className="btn-secondary btn-link-icon report-detail-modal-close"
						onClick={onClose}
						aria-label="Close advanced search"
					>
						<X aria-hidden="true" />
					</button>
				</div>

				<div className="job-order-advanced-search-body">
					<div className="job-order-advanced-search-rows">
						{draftCriteria.length === 0 ? (
							<div className="job-order-advanced-search-empty">
								No advanced filters yet. Add a filter to narrow the list beyond quick search.
							</div>
						) : null}
						{draftCriteria.map((criterion, index) => {
							const fieldDefinition =
								fieldDefinitions.find((field) => field.key === criterion.field) || fieldDefinitions[0];
							const operatorOptions = getJobOrderAdvancedOperatorOptions(fieldDefinition.key);
							const useNumericInput = criterionUsesNumericValue(fieldDefinition.type, criterion);
							const inputType = useNumericInput ? 'number' : fieldDefinition.type === 'date' ? 'date' : 'text';
							return (
								<div key={`${criterion.field}-${index}`} className="job-order-advanced-search-row">
									<select
										value={criterion.field}
										onChange={(event) => onFieldChange(index, event.target.value)}
									>
										{fieldDefinitions.map((field) => (
											<option key={field.key} value={field.key}>
												{field.label}
											</option>
										))}
									</select>
									<select
										value={criterion.operator}
										onChange={(event) => onOperatorChange(index, event.target.value)}
									>
										{operatorOptions.map((option) => (
											<option key={option.value} value={option.value}>
												{option.label}
											</option>
										))}
									</select>
									{fieldDefinition.type === 'select' ? (
										<select
											value={criterion.value}
											onChange={(event) => updateCriterion(index, { value: event.target.value })}
										>
											<option value="">Select</option>
											{(fieldDefinition.options || []).map((option) => (
												<option key={option.value} value={option.value}>
													{option.label}
												</option>
											))}
										</select>
									) : (
										<input
											type={inputType}
											value={criterion.value}
											onChange={(event) => updateCriterion(index, { value: event.target.value })}
											placeholder={criterion.operator === 'in_past_days' ? 'Days' : 'Value'}
											min={useNumericInput ? '0' : undefined}
										/>
									)}
									{criterionRequiresRangeValue(criterion) ? (
										<input
											type={fieldDefinition.type === 'number' ? 'number' : fieldDefinition.type === 'date' ? 'date' : 'text'}
											value={criterion.valueTo}
											onChange={(event) => updateCriterion(index, { valueTo: event.target.value })}
											placeholder="And"
											min={fieldDefinition.type === 'number' ? '0' : undefined}
										/>
									) : (
										<div className="job-order-advanced-search-row-spacer" aria-hidden="true" />
									)}
									<button
										type="button"
										className="table-toolbar-button job-order-advanced-search-remove"
										onClick={() => removeCriterion(index)}
										aria-label={`Remove filter row ${index + 1}`}
										title="Remove filter"
									>
										<X aria-hidden="true" />
									</button>
								</div>
							);
						})}
					</div>

					<div className="job-order-advanced-search-toolbar">
						<button type="button" className="btn-secondary job-order-advanced-search-action" onClick={addCriterion}>
							<Plus aria-hidden="true" />
							Add Filter
						</button>
						<button type="button" className="btn-secondary job-order-advanced-search-action" onClick={clearCriteria}>
							<Eraser aria-hidden="true" />
							Clear
						</button>
					</div>
				</div>

				<div className="job-order-advanced-search-footer">
					<div className="job-order-advanced-search-footer-note">
						<Filter aria-hidden="true" />
						<span>
							{hasIncompleteCriteria
								? 'Complete each criteria row before applying.'
								: 'Advanced search is additive to the quick filters above the list.'}
						</span>
					</div>
					<div className="job-order-advanced-search-footer-actions">
						<button type="button" className="btn-secondary" onClick={onClose}>
							Cancel
						</button>
						<button
							type="button"
							className="btn-link job-order-advanced-search-apply"
							onClick={applyCriteria}
							disabled={hasIncompleteCriteria || completeCriteriaCount === 0}
						>
							<Check aria-hidden="true" className="btn-refresh-icon-svg" />
							Apply
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
