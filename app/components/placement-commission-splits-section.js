'use client';

import { Plus, Trash2 } from 'lucide-react';
import FormField from '@/app/components/form-field';
import LookupTypeaheadSelect from '@/app/components/lookup-typeahead-select';
import {
	formatPlacementCommissionRoleLabel,
	normalizePlacementCommissionSplits,
	validatePlacementCommissionSplits
} from '@/lib/placement-commission';

function sanitizeDecimalInput(value) {
	const cleaned = String(value || '').replace(/[^\d.]/g, '');
	const firstDotIndex = cleaned.indexOf('.');
	if (firstDotIndex < 0) return cleaned;
	return `${cleaned.slice(0, firstDotIndex + 1)}${cleaned.slice(firstDotIndex + 1).replace(/\./g, '')}`;
}

function createEmptySplit(role) {
	return {
		recordId: '',
		userId: '',
		role,
		splitPercent: '',
		commissionPercent: '',
		_key: `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
	};
}

export default function PlacementCommissionSplitsSection({
	splits,
	onChange,
	disabled = false
}) {
	const normalized = normalizePlacementCommissionSplits(splits);
	const { totals } = validatePlacementCommissionSplits(normalized);

	function updateSplit(index, updates) {
		onChange(
			normalized.map((split, currentIndex) =>
				currentIndex === index ? { ...split, ...updates } : split
			)
		);
	}

	function removeSplit(index) {
		onChange(normalized.filter((_, currentIndex) => currentIndex !== index));
	}

	function addSplit(role) {
		onChange([...normalized, createEmptySplit(role)]);
	}

	function addSplitAfter(index, role) {
		const next = [...normalized];
		next.splice(index + 1, 0, createEmptySplit(role));
		onChange(next);
	}

	return (
		<section className="placement-commission-splits-section">
			{normalized.length === 0 ? (
				<div className="placement-commission-split-empty">
					<p className="panel-subtext">No commission splits yet.</p>
					<button
						type="button"
						className="placement-commission-split-action"
						onClick={() => addSplit('recruiter')}
						disabled={disabled}
						aria-label="Add commission split"
						title="Add split"
					>
						<Plus aria-hidden="true" className="btn-refresh-icon-svg" />
					</button>
				</div>
			) : null}
			<div className="placement-commission-split-list">
				{normalized.map((split, index) => (
					<div key={split._key || `${split.role}-${index}`} className="placement-commission-split-card">
						<div className="detail-form-grid-5 placement-commission-split-row">
							<FormField label="User" className="placement-commission-user-field">
								<LookupTypeaheadSelect
									entity="users"
									lookupParams={{}}
									value={split.userId}
									onChange={(nextValue) => updateSplit(index, { userId: nextValue })}
									placeholder="Search user"
									label="User"
									emptyLabel="No matching users."
									disabled={disabled}
								/>
							</FormField>
							<FormField label="Role" className="placement-commission-role-field">
								<select
									value={split.role}
									onChange={(event) => updateSplit(index, { role: event.target.value })}
									disabled={disabled}
								>
									<option value="recruiter">{formatPlacementCommissionRoleLabel('recruiter')}</option>
									<option value="sales_rep">{formatPlacementCommissionRoleLabel('sales_rep')}</option>
								</select>
							</FormField>
							<FormField label="Split %" className="placement-commission-split-percent-field">
								<input
									type="text"
									inputMode="decimal"
									value={split.splitPercent}
									onChange={(event) =>
										updateSplit(index, { splitPercent: sanitizeDecimalInput(event.target.value) })
									}
									disabled={disabled}
									placeholder="0"
								/>
							</FormField>
							<FormField label="Commission %" className="placement-commission-commission-percent-field">
								<input
									type="text"
									inputMode="decimal"
									value={split.commissionPercent}
									onChange={(event) =>
										updateSplit(index, { commissionPercent: sanitizeDecimalInput(event.target.value) })
									}
									disabled={disabled}
									placeholder="0"
								/>
							</FormField>
							<div className="placement-commission-split-row-actions">
								<button
									type="button"
									className="placement-commission-split-action submission-write-up-action"
									onClick={() => addSplitAfter(index, split.role)}
									disabled={disabled}
									aria-label={`Add ${formatPlacementCommissionRoleLabel(split.role)} split`}
									title={`Add ${formatPlacementCommissionRoleLabel(split.role)} split`}
								>
									<Plus aria-hidden="true" className="btn-refresh-icon-svg" />
								</button>
								<button
									type="button"
									className="placement-commission-split-action placement-commission-split-action-danger submission-write-up-action"
									onClick={() => removeSplit(index)}
									disabled={disabled}
									aria-label="Remove commission split"
									title="Remove split"
								>
									<Trash2 aria-hidden="true" className="btn-refresh-icon-svg" />
								</button>
							</div>
						</div>
					</div>
				))}
			</div>
			{normalized.length > 0 ? (
				<div className="placement-commission-split-totals">
					<span
						className={
							Math.abs(totals.recruiter - 100) <= 0.01
								? 'chip placement-commission-total-chip placement-commission-total-chip-valid'
								: 'chip placement-commission-total-chip placement-commission-total-chip-invalid'
						}
					>
						Recruiter {totals.recruiter.toLocaleString(undefined, { maximumFractionDigits: 2 })}%
					</span>
					<span
						className={
							Math.abs(totals.sales_rep - 100) <= 0.01
								? 'chip placement-commission-total-chip placement-commission-total-chip-valid'
								: 'chip placement-commission-total-chip placement-commission-total-chip-invalid'
						}
					>
						Sales Rep {totals.sales_rep.toLocaleString(undefined, { maximumFractionDigits: 2 })}%
					</span>
				</div>
			) : null}
		</section>
	);
}
