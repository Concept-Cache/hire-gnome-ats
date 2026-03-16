'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowUpRight, Lock, MoreVertical } from 'lucide-react';
import LookupTypeaheadSelect from '@/app/components/lookup-typeahead-select';
import FormField from '@/app/components/form-field';
import CustomFieldsSection, { areRequiredCustomFieldsComplete } from '@/app/components/custom-fields-section';
import LoadingIndicator from '@/app/components/loading-indicator';
import AuditTrailPanel from '@/app/components/audit-trail-panel';
import { useToast } from '@/app/components/toast-provider';
import { useConfirmDialog } from '@/app/components/confirm-dialog';
import useArchivedEntities from '@/app/hooks/use-archived-entities';
import useUnsavedChangesGuard from '@/app/hooks/use-unsaved-changes-guard';
import { formatDateTimeAt } from '@/lib/date-format';
import { formatCurrencyInput, normalizeCurrencyInput, parseCurrencyInput } from '@/lib/currency-input';

const initialForm = {
	status: 'planned',
	placementType: 'temp',
	compensationType: 'hourly',
	currency: 'USD',
	hourlyRtBillRate: '',
	hourlyRtPayRate: '',
	hourlyOtBillRate: '',
	hourlyOtPayRate: '',
	dailyBillRate: '',
	dailyPayRate: '',
	yearlyCompensation: '',
	offeredOn: '',
	expectedJoinDate: '',
	endDate: '',
	withdrawnReason: '',
	notes: '',
	candidateId: '',
	jobOrderId: '',
	customFields: {}
};

function withCompensationType(formValues, nextCompensationType) {
	if (nextCompensationType === 'hourly') {
		return {
			...formValues,
			compensationType: nextCompensationType,
			dailyBillRate: '',
			dailyPayRate: '',
			yearlyCompensation: ''
		};
	}

	if (nextCompensationType === 'daily') {
		return {
			...formValues,
			compensationType: nextCompensationType,
			hourlyRtBillRate: '',
			hourlyRtPayRate: '',
			hourlyOtBillRate: '',
			hourlyOtPayRate: '',
			yearlyCompensation: ''
		};
	}

	if (nextCompensationType === 'salary') {
		return {
			...formValues,
			compensationType: nextCompensationType,
			hourlyRtBillRate: '',
			hourlyRtPayRate: '',
			hourlyOtBillRate: '',
			hourlyOtPayRate: '',
			dailyBillRate: '',
			dailyPayRate: ''
		};
	}

	return {
		...formValues,
		compensationType: nextCompensationType
	};
}

function toDateOnly(value) {
	if (!value) return '';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return '';
	return date.toISOString().slice(0, 10);
}

function detectCompensationType(row) {
	if (row.placementType === 'perm') return 'salary';
	if (row.compensationType) return row.compensationType;
	if (row.payPeriod === 'hourly') return 'hourly';
	if (row.payPeriod === 'daily') return 'daily';
	return 'salary';
}

function toForm(row) {
	if (!row) return initialForm;
	const compensationType = detectCompensationType(row);

	return {
		status: row.status || 'planned',
		placementType: row.placementType || 'temp',
		compensationType,
		currency: row.currency || 'USD',
		hourlyRtBillRate:
			row.hourlyRtBillRate == null
				? row.regularRate == null
					? compensationType === 'hourly' && row.amount != null
						? formatCurrencyInput(String(row.amount), row.currency || 'USD')
						: ''
					: formatCurrencyInput(String(row.regularRate), row.currency || 'USD')
				: formatCurrencyInput(String(row.hourlyRtBillRate), row.currency || 'USD'),
		hourlyRtPayRate:
			row.hourlyRtPayRate == null
				? row.regularRate == null
					? compensationType === 'hourly' && row.amount != null
						? formatCurrencyInput(String(row.amount), row.currency || 'USD')
						: ''
					: formatCurrencyInput(String(row.regularRate), row.currency || 'USD')
				: formatCurrencyInput(String(row.hourlyRtPayRate), row.currency || 'USD'),
		hourlyOtBillRate:
			row.hourlyOtBillRate == null
				? row.overtimeRate == null
					? ''
					: formatCurrencyInput(String(row.overtimeRate), row.currency || 'USD')
				: formatCurrencyInput(String(row.hourlyOtBillRate), row.currency || 'USD'),
		hourlyOtPayRate:
			row.hourlyOtPayRate == null
				? row.overtimeRate == null
					? ''
					: formatCurrencyInput(String(row.overtimeRate), row.currency || 'USD')
				: formatCurrencyInput(String(row.hourlyOtPayRate), row.currency || 'USD'),
		dailyBillRate:
			row.dailyBillRate == null
				? row.dailyRate == null
					? compensationType === 'daily' && row.amount != null
						? formatCurrencyInput(String(row.amount), row.currency || 'USD')
						: ''
					: formatCurrencyInput(String(row.dailyRate), row.currency || 'USD')
				: formatCurrencyInput(String(row.dailyBillRate), row.currency || 'USD'),
		dailyPayRate:
			row.dailyPayRate == null
				? row.dailyRate == null
					? compensationType === 'daily' && row.amount != null
						? formatCurrencyInput(String(row.amount), row.currency || 'USD')
						: ''
					: formatCurrencyInput(String(row.dailyRate), row.currency || 'USD')
				: formatCurrencyInput(String(row.dailyPayRate), row.currency || 'USD'),
		yearlyCompensation:
			row.yearlyCompensation == null
				? row.annualSalary == null
					? compensationType === 'salary' && row.amount != null
						? formatCurrencyInput(String(row.amount), row.currency || 'USD')
						: ''
					: formatCurrencyInput(String(row.annualSalary), row.currency || 'USD')
				: formatCurrencyInput(String(row.yearlyCompensation), row.currency || 'USD'),
		offeredOn: toDateOnly(row.offeredOn),
		expectedJoinDate: toDateOnly(row.expectedJoinDate),
		endDate: toDateOnly(row.endDate),
		withdrawnReason: row.withdrawnReason || '',
		notes: row.notes || '',
		candidateId: String(row.candidateId || ''),
		jobOrderId: String(row.jobOrderId || ''),
		customFields:
			row.customFields && typeof row.customFields === 'object' && !Array.isArray(row.customFields)
				? row.customFields
				: {}
	};
}

function formatDate(value) {
	return formatDateTimeAt(value);
}

function formatPlacementType(value) {
	if (value === 'perm') return 'Perm';
	if (value === 'temp') return 'Temp';
	return '-';
}

function formatCurrency(currency, value) {
	const parsed = parseCurrencyInput(value);
	if (parsed == null) return '-';
	return `${currency || 'USD'} ${parsed.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function formatCompensationSummary(row) {
	if (row.compensationType === 'hourly') {
		const hourlyPay = row.hourlyRtPayRate ?? row.regularRate ?? row.amount;
		return `Hourly Pay ${formatCurrency(row.currency, hourlyPay)}`;
	}

	if (row.compensationType === 'daily') {
		const dailyPay = row.dailyPayRate ?? row.dailyRate ?? row.amount;
		return `Daily Pay ${formatCurrency(row.currency, dailyPay)}`;
	}

	if (row.compensationType === 'salary') {
		const baseSalary = row.yearlyCompensation ?? row.annualSalary ?? row.amount;
		return `Base Salary ${formatCurrency(row.currency, baseSalary)}`;
	}

	return row.amount == null ? '-' : formatCurrency(row.currency, row.amount);
}

function parsePlacementStartDate(value) {
	if (!value) return null;
	const raw = String(value).trim();
	if (!raw) return null;
	const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00`) : new Date(raw);
	if (Number.isNaN(date.getTime())) return null;
	return date;
}

function hasPlacementStarted(value) {
	const startDate = parsePlacementStartDate(value);
	if (!startDate) return false;
	return Date.now() >= startDate.getTime();
}

export default function PlacementDetailsPage() {
	const { id } = useParams();
	const router = useRouter();
	const actionsMenuRef = useRef(null);
	const [placement, setPlacement] = useState(null);
	const [form, setForm] = useState(initialForm);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [saveState, setSaveState] = useState({ saving: false, error: '', success: '' });
	const [actionsOpen, setActionsOpen] = useState(false);
	const [showAuditTrail, setShowAuditTrail] = useState(false);
	const [customFieldDefinitions, setCustomFieldDefinitions] = useState([]);
	const toast = useToast();
	const { requestConfirm } = useConfirmDialog();
	const { archiveEntity } = useArchivedEntities('PLACEMENT');
	const relationshipsLocked = Boolean(placement?.id);
	const acceptedReadOnly = String(placement?.status || '').toLowerCase() === 'accepted';
	const currentStatus = String(placement?.status || '').toLowerCase();
	const nextStatus = String(form.status || '').toLowerCase();
	const placementStarted = hasPlacementStarted(form.expectedJoinDate || placement?.expectedJoinDate);
	const canWithdrawPlacement = !acceptedReadOnly && !placementStarted && nextStatus !== 'withdrawn';
	const canCancelPlacement = !acceptedReadOnly && placementStarted && nextStatus !== 'declined';
	const { markAsClean } = useUnsavedChangesGuard(form, {
		enabled: !loading && Boolean(placement) && !acceptedReadOnly
	});

	const compensationTypeOptions = useMemo(() => {
		if (form.placementType === 'perm') {
			return [{ value: 'salary', label: 'Salary' }];
		}

		return [
			{ value: 'hourly', label: 'Hourly (Regular/OT)' },
			{ value: 'daily', label: 'Daily' },
			{ value: 'salary', label: 'Salary' }
		];
	}, [form.placementType]);

	const compensationComplete = useMemo(() => {
		if (form.compensationType === 'hourly') {
			return (
				(parseCurrencyInput(form.hourlyRtBillRate) ?? 0) > 0 &&
				(parseCurrencyInput(form.hourlyRtPayRate) ?? 0) > 0 &&
				(parseCurrencyInput(form.hourlyOtBillRate) ?? 0) > 0 &&
				(parseCurrencyInput(form.hourlyOtPayRate) ?? 0) > 0
			);
		}

		if (form.compensationType === 'daily') {
			return (
				(parseCurrencyInput(form.dailyBillRate) ?? 0) > 0 &&
				(parseCurrencyInput(form.dailyPayRate) ?? 0) > 0
			);
		}

		if (form.compensationType === 'salary') {
			return (parseCurrencyInput(form.yearlyCompensation) ?? 0) > 0;
		}

		return false;
	}, [
		form.compensationType,
		form.hourlyRtBillRate,
		form.hourlyRtPayRate,
		form.hourlyOtBillRate,
		form.hourlyOtPayRate,
		form.dailyBillRate,
		form.dailyPayRate,
		form.yearlyCompensation
	]);
	const customFieldsComplete = areRequiredCustomFieldsComplete(
		customFieldDefinitions,
		form.customFields
	);

	useEffect(() => {
		let active = true;

		async function load() {
			setLoading(true);
			setError('');

			const placementRes = await fetch(`/api/placements/${id}`);

			if (!placementRes.ok) {
				if (!active) return;
				setError('Placement not found.');
				setLoading(false);
				return;
			}

			const placementData = await placementRes.json();

			if (!active) return;
			const nextForm = toForm(placementData);
			setPlacement(placementData);
			setForm(nextForm);
			markAsClean(nextForm);
			setActionsOpen(false);
			setLoading(false);
		}

		load();
		return () => {
			active = false;
		};
	}, [id]);

	useEffect(() => {
		if (form.placementType !== 'perm') return;
		if (form.compensationType === 'salary') return;
		setForm((current) => withCompensationType(current, 'salary'));
	}, [form.placementType, form.compensationType]);

	useEffect(() => {
		function onMouseDown(event) {
			if (!actionsMenuRef.current) return;
			if (actionsMenuRef.current.contains(event.target)) return;
			setActionsOpen(false);
		}

		function onKeyDown(event) {
			if (event.key === 'Escape') {
				setActionsOpen(false);
			}
		}

		document.addEventListener('mousedown', onMouseDown);
		document.addEventListener('keydown', onKeyDown);
		return () => {
			document.removeEventListener('mousedown', onMouseDown);
			document.removeEventListener('keydown', onKeyDown);
		};
	}, []);

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

	async function savePlacement(nextForm, successMessage = 'Placement updated.') {
		if (acceptedReadOnly) {
			setSaveState({
				saving: false,
				error: 'Accepted placements are read-only and cannot be changed.',
				success: ''
			});
			return null;
		}

		if (!nextForm.candidateId || !nextForm.jobOrderId) {
			setSaveState({ saving: false, error: 'Candidate and Job Order are required.', success: '' });
			return null;
		}
		if (!nextForm.offeredOn || !nextForm.expectedJoinDate) {
			setSaveState({ saving: false, error: 'Offer date and start date are required.', success: '' });
			return null;
		}
		if (!customFieldsComplete) {
			setSaveState({ saving: false, error: 'Complete all required custom fields before saving.', success: '' });
			return null;
		}

		if (nextForm.status === 'withdrawn' && !String(nextForm.withdrawnReason || '').trim()) {
			setSaveState({ saving: false, error: 'Withdrawal reason is required.', success: '' });
			return null;
		}

		const existingStatus = String(placement?.status || '').toLowerCase();
		const targetStatus = String(nextForm.status || '').toLowerCase();
		const started = hasPlacementStarted(nextForm.expectedJoinDate || placement?.expectedJoinDate);
		if (targetStatus === 'withdrawn' && existingStatus !== 'withdrawn' && started) {
			setSaveState({
				saving: false,
				error: 'Placement has started. Use Cancel Placement instead of Withdraw Placement.',
				success: ''
			});
			return null;
		}
		if (targetStatus === 'declined' && existingStatus !== 'declined' && !started) {
			setSaveState({
				saving: false,
				error: 'Placement has not started. Use Withdraw Placement instead of Cancel Placement.',
				success: ''
			});
			return null;
		}

		setSaveState({ saving: true, error: '', success: '' });
		const payload = {
			...nextForm,
			hourlyRtBillRate: normalizeCurrencyInput(nextForm.hourlyRtBillRate),
			hourlyRtPayRate: normalizeCurrencyInput(nextForm.hourlyRtPayRate),
			hourlyOtBillRate: normalizeCurrencyInput(nextForm.hourlyOtBillRate),
			hourlyOtPayRate: normalizeCurrencyInput(nextForm.hourlyOtPayRate),
			dailyBillRate: normalizeCurrencyInput(nextForm.dailyBillRate),
			dailyPayRate: normalizeCurrencyInput(nextForm.dailyPayRate),
			yearlyCompensation: normalizeCurrencyInput(nextForm.yearlyCompensation)
		};

		const res = await fetch(`/api/placements/${id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});

		if (!res.ok) {
			const data = await res.json().catch(() => ({}));
			const errors = data.errors?.fieldErrors || {};
			const firstError = Object.values(errors).flat().find(Boolean);
			setSaveState({
				saving: false,
				error: firstError || data.error || 'Failed to update placement.',
				success: ''
			});
			return null;
		}

		const updated = await res.json();
		const updatedForm = toForm(updated);
		setPlacement((current) => (current ? { ...current, ...updated } : current));
		setForm(updatedForm);
		markAsClean(updatedForm);
		setSaveState({ saving: false, error: '', success: successMessage });
		return updated;
	}

	async function onSave(e) {
		e.preventDefault();
		if (acceptedReadOnly) {
			setSaveState({
				saving: false,
				error: 'Accepted placements are read-only and cannot be changed.',
				success: ''
			});
			return;
		}

		if (form.status === 'withdrawn' && currentStatus !== 'withdrawn') {
			if (placementStarted) {
				setSaveState({
					saving: false,
					error: 'Placement has started. Use Cancel Placement instead of Withdraw Placement.',
					success: ''
				});
				return;
			}
			const reason = String(form.withdrawnReason || '').trim();
			if (!reason) {
				setSaveState({ saving: false, error: 'Withdrawal reason is required.', success: '' });
				return;
			}

			const confirmed = await requestConfirm({
				message: `Withdraw this placement?\n\nReason: ${reason}`,
				confirmLabel: 'Withdraw',
				cancelLabel: 'Keep',
				isDanger: true
			});
			if (!confirmed) return;
		}

		if (form.status === 'declined' && currentStatus !== 'declined') {
			if (!placementStarted) {
				setSaveState({
					saving: false,
					error: 'Placement has not started. Use Withdraw Placement instead of Cancel Placement.',
					success: ''
				});
				return;
			}
			const confirmed = await requestConfirm({
				message: 'Cancel this placement?',
				confirmLabel: 'Cancel',
				cancelLabel: 'Keep',
				isDanger: true
			});
			if (!confirmed) return;
		}

		await savePlacement(form, 'Placement updated.');
	}

	async function onWithdrawPlacement() {
		if (acceptedReadOnly) {
			setSaveState({
				saving: false,
				error: 'Accepted placements are read-only and cannot be changed.',
				success: ''
			});
			return;
		}
		if (!canWithdrawPlacement) {
			setSaveState({
				saving: false,
				error: 'Withdraw Placement is only allowed before the start date.',
				success: ''
			});
			return;
		}

		const reason = String(form.withdrawnReason || '').trim();
		setActionsOpen(false);
		setForm((current) => ({ ...current, status: 'withdrawn' }));

		if (!reason) {
			setSaveState({
				saving: false,
				error: 'Enter a withdrawal reason, then use Save Placement to finalize.',
				success: ''
			});
			return;
		}

		const confirmed = await requestConfirm({
			message: `Withdraw this placement?\n\nReason: ${reason}`,
			confirmLabel: 'Withdraw',
			cancelLabel: 'Keep',
			isDanger: true
		});
		if (!confirmed) return;

		await savePlacement(
			{ ...form, status: 'withdrawn', withdrawnReason: reason },
			'Placement withdrawn.'
		);
	}

	async function onCancelPlacement() {
		if (acceptedReadOnly) {
			setSaveState({
				saving: false,
				error: 'Accepted placements are read-only and cannot be changed.',
				success: ''
			});
			return;
		}
		if (!canCancelPlacement) {
			setSaveState({
				saving: false,
				error: 'Cancel Placement is only allowed on or after the start date.',
				success: ''
			});
			return;
		}

		setActionsOpen(false);
		const confirmed = await requestConfirm({
			message: 'Cancel this placement?',
			confirmLabel: 'Cancel',
			cancelLabel: 'Keep',
			isDanger: true
		});
		if (!confirmed) return;

		await savePlacement(
			{ ...form, status: 'declined' },
			'Placement cancelled.'
		);
	}

	function onToggleAuditTrail() {
		setActionsOpen(false);
		setShowAuditTrail((current) => !current);
	}

	async function onArchivePlacement() {
		if (!placement?.id) return;
		setActionsOpen(false);
		const confirmed = await requestConfirm({
			title: 'Archive Placement',
			message: `Archive ${placement.recordId || `placement #${placement.id}`}? You can restore it from Archive later.`,
			confirmLabel: 'Archive',
			cancelLabel: 'Cancel',
			destructive: true
		});
		if (!confirmed) return;
		const result = await archiveEntity(placement.id);
		if (!result.ok) {
			toast.error(result.error || 'Failed to archive placement.');
			return;
		}
		toast.success('Placement archived.');
		router.push('/placements');
	}

	if (loading) {
		return (
			<section className="module-page">
				<LoadingIndicator className="page-loading-indicator" label="Loading placement details" />
			</section>
		);
	}

	if (error || !placement) {
		return (
			<section className="module-page">
				<p>{error || 'Placement not found.'}</p>
				<button type="button" onClick={() => router.push('/placements')}>
					Back to Placements
				</button>
			</section>
		);
	}

	return (
		<section className="module-page">
			<header className="module-header">
				<div>
					<Link href="/placements" className="module-back-link" aria-label="Back to List">&larr; Back</Link>
					<h2>Placement #{placement.id}</h2>
					<p>
						{placement.candidate?.firstName || '-'} {placement.candidate?.lastName || ''} | {placement.jobOrder?.title || '-'}
					</p>
				</div>
				<div className="module-header-actions">
					<div className="actions-menu" ref={actionsMenuRef}>
						<button
							type="button"
							className="btn-secondary actions-menu-toggle"
							onClick={() => setActionsOpen((current) => !current)}
							aria-haspopup="menu"
							aria-expanded={actionsOpen}
							aria-label="Open placement actions"
							title="Actions"
							disabled={saveState.saving}
							>
								<span className="actions-menu-icon" aria-hidden="true">
									<MoreVertical />
								</span>
							</button>
						{actionsOpen ? (
							<div className="actions-menu-list" role="menu" aria-label="Placement actions">
								{acceptedReadOnly ? null : (
									<>
										<button
											type="button"
											role="menuitem"
											className="actions-menu-item"
											onClick={onWithdrawPlacement}
											disabled={saveState.saving || !canWithdrawPlacement}
											title={
												canWithdrawPlacement
													? 'Withdraw before the start date'
													: 'Withdraw is only available before the start date'
											}
										>
											Withdraw Placement
										</button>
										<button
											type="button"
											role="menuitem"
											className="actions-menu-item"
											onClick={onCancelPlacement}
											disabled={saveState.saving || !canCancelPlacement}
											title={
												canCancelPlacement
													? 'Cancel on or after the start date'
													: 'Cancel is only available on or after the start date'
											}
										>
											Cancel Placement
										</button>
									</>
									)}
								<button
									type="button"
									role="menuitem"
									className="actions-menu-item actions-menu-item-danger"
									onClick={onArchivePlacement}
									disabled={saveState.saving}
								>
									Archive Placement
								</button>
								<button type="button" role="menuitem" className="actions-menu-item" onClick={onToggleAuditTrail}>
									{showAuditTrail ? 'Hide Audit Trail' : 'View Audit Trail'}
								</button>
							</div>
						) : null}
					</div>
				</div>
			</header>

			<article className="panel">
				<h3>Snapshot</h3>
				<div className="info-list snapshot-grid">
					<p>
						<span>Record ID</span>
						<strong>{placement.recordId || '-'}</strong>
					</p>
					<p>
						<span>Candidate</span>
						<strong>
							{placement.candidate?.id ? (
								<Link href={`/candidates/${placement.candidate.id}`}>
									{placement.candidate?.firstName || '-'} {placement.candidate?.lastName || ''}{' '}
									<ArrowUpRight aria-hidden="true" className="snapshot-link-icon" />
								</Link>
							) : (
								`${placement.candidate?.firstName || '-'} ${placement.candidate?.lastName || ''}`.trim()
							)}
						</strong>
					</p>
					<p>
						<span>Client</span>
						<strong>
							{placement.jobOrder?.client?.id ? (
								<Link href={`/clients/${placement.jobOrder.client.id}`}>
									{placement.jobOrder?.client?.name || '-'}{' '}
									<ArrowUpRight aria-hidden="true" className="snapshot-link-icon" />
								</Link>
							) : (
								placement.jobOrder?.client?.name || '-'
							)}
						</strong>
					</p>
					<p>
						<span>Job Order</span>
						<strong>
							{placement.jobOrder?.id ? (
								<Link href={`/job-orders/${placement.jobOrder.id}`}>
									{placement.jobOrder?.title || '-'}{' '}
									<ArrowUpRight aria-hidden="true" className="snapshot-link-icon" />
								</Link>
							) : (
								placement.jobOrder?.title || '-'
							)}
						</strong>
					</p>
				</div>
			</article>

			<article className="panel panel-spacious">
				<h3>Placement Details</h3>
				<p className="panel-subtext">
					{acceptedReadOnly
						? 'This placement is accepted and locked for editing.'
						: 'Edit placement details and save updates.'}
				</p>
				<form onSubmit={onSave} className="detail-form">
					<fieldset className="detail-form-fieldset" disabled={saveState.saving || acceptedReadOnly}>
						<section className="form-section">
							<h4>Placement Package</h4>
							<div className="detail-form-grid-3">
								<FormField label="Status">
									<select
										value={form.status}
										onChange={(e) => setForm((current) => ({ ...current, status: e.target.value }))}
									>
										<option value="planned">Planned</option>
										<option value="made">Made</option>
										<option value="revised">Revised</option>
										<option value="accepted">Accepted</option>
										<option value="declined">Declined</option>
										<option value="withdrawn">Withdrawn</option>
									</select>
								</FormField>
								<FormField label="Candidate" required>
									{relationshipsLocked ? (
										<div className="locked-field">
											<input
												value={`${placement.candidate?.firstName || '-'} ${placement.candidate?.lastName || ''}`.trim()}
												disabled
												readOnly
											/>
											<span className="locked-field-icon" aria-label="Locked field" title="Locked field">
												<Lock aria-hidden="true" />
											</span>
										</div>
									) : (
										<LookupTypeaheadSelect
											entity="candidates"
											lookupParams={{}}
											value={form.candidateId}
											onChange={(nextValue) => setForm((current) => ({ ...current, candidateId: nextValue }))}
											placeholder="Search candidate"
											label="Candidate"
											emptyLabel="No matching candidates."
											disabled={acceptedReadOnly}
										/>
									)}
								</FormField>
								<FormField label="Job Order" required>
									{relationshipsLocked ? (
										<div className="locked-field">
											<input value={placement.jobOrder?.title || '-'} disabled readOnly />
											<span className="locked-field-icon" aria-label="Locked field" title="Locked field">
												<Lock aria-hidden="true" />
											</span>
										</div>
									) : (
										<LookupTypeaheadSelect
											entity="job-orders"
											lookupParams={{}}
											value={form.jobOrderId}
											onChange={(nextValue) => setForm((current) => ({ ...current, jobOrderId: nextValue }))}
											placeholder="Search job order"
											label="Job Order"
											emptyLabel="No matching job orders."
											disabled={acceptedReadOnly}
										/>
									)}
								</FormField>
							</div>
							<div className="detail-form-grid-3">
								<FormField label="Placement Type">
									<select
										value={form.placementType}
										onChange={(e) =>
											setForm((current) =>
												withCompensationType(
													{
														...current,
														placementType: e.target.value
													},
													e.target.value === 'perm' ? 'salary' : current.compensationType
												)
											)
										}
									>
										<option value="temp">Temporary</option>
										<option value="perm">Permanent</option>
									</select>
								</FormField>
								<FormField label="Compensation Type">
									<select
										value={form.compensationType}
										onChange={(e) =>
											setForm((current) => withCompensationType(current, e.target.value))
										}
										disabled={form.placementType === 'perm'}
									>
										{compensationTypeOptions.map((option) => (
											<option key={option.value} value={option.value}>
												{option.label}
											</option>
										))}
									</select>
								</FormField>
								<FormField label="Currency">
									<select
										value={form.currency}
										onChange={(e) =>
											setForm((current) => {
												const nextCurrency = e.target.value;
												return {
													...current,
													currency: nextCurrency,
													hourlyRtBillRate: formatCurrencyInput(
														current.hourlyRtBillRate,
														nextCurrency
													),
													hourlyRtPayRate: formatCurrencyInput(
														current.hourlyRtPayRate,
														nextCurrency
													),
													hourlyOtBillRate: formatCurrencyInput(
														current.hourlyOtBillRate,
														nextCurrency
													),
													hourlyOtPayRate: formatCurrencyInput(
														current.hourlyOtPayRate,
														nextCurrency
													),
													dailyBillRate: formatCurrencyInput(
														current.dailyBillRate,
														nextCurrency
													),
													dailyPayRate: formatCurrencyInput(
														current.dailyPayRate,
														nextCurrency
													),
													yearlyCompensation: formatCurrencyInput(
														current.yearlyCompensation,
														nextCurrency
													)
												};
											})
										}
									>
										<option value="USD">USD</option>
										<option value="CAD">CAD</option>
									</select>
								</FormField>
							</div>
							<div className="detail-form-grid-4">
								{form.compensationType === 'hourly' ? (
									<>
										<FormField label="RT Bill Rate" required>
											<input
												type="text"
												inputMode="decimal"
												value={form.hourlyRtBillRate}
												onChange={(e) =>
													setForm((current) => ({
														...current,
														hourlyRtBillRate: formatCurrencyInput(
															e.target.value,
															current.currency || 'USD'
														)
													}))
												}
											/>
										</FormField>
										<FormField label="RT Pay Rate" required>
											<input
												type="text"
												inputMode="decimal"
												value={form.hourlyRtPayRate}
												onChange={(e) =>
													setForm((current) => ({
														...current,
														hourlyRtPayRate: formatCurrencyInput(
															e.target.value,
															current.currency || 'USD'
														)
													}))
												}
											/>
										</FormField>
										<FormField label="OT Bill Rate" required>
											<input
												type="text"
												inputMode="decimal"
												value={form.hourlyOtBillRate}
												onChange={(e) =>
													setForm((current) => ({
														...current,
														hourlyOtBillRate: formatCurrencyInput(
															e.target.value,
															current.currency || 'USD'
														)
													}))
												}
											/>
										</FormField>
										<FormField label="OT Pay Rate" required>
											<input
												type="text"
												inputMode="decimal"
												value={form.hourlyOtPayRate}
												onChange={(e) =>
													setForm((current) => ({
														...current,
														hourlyOtPayRate: formatCurrencyInput(
															e.target.value,
															current.currency || 'USD'
														)
													}))
												}
											/>
										</FormField>
									</>
								) : null}
								{form.compensationType === 'daily' ? (
									<>
										<FormField label="Daily Bill Rate" required>
											<input
												type="text"
												inputMode="decimal"
												value={form.dailyBillRate}
												onChange={(e) =>
													setForm((current) => ({
														...current,
														dailyBillRate: formatCurrencyInput(
															e.target.value,
															current.currency || 'USD'
														)
													}))
												}
											/>
										</FormField>
										<FormField label="Daily Pay Rate" required>
											<input
												type="text"
												inputMode="decimal"
												value={form.dailyPayRate}
												onChange={(e) =>
													setForm((current) => ({
														...current,
														dailyPayRate: formatCurrencyInput(
															e.target.value,
															current.currency || 'USD'
														)
													}))
												}
											/>
										</FormField>
									</>
								) : null}
								{form.compensationType === 'salary' ? (
									<FormField label="Yearly Compensation" required>
										<input
											type="text"
											inputMode="decimal"
											value={form.yearlyCompensation}
											onChange={(e) =>
												setForm((current) => ({
													...current,
													yearlyCompensation: formatCurrencyInput(
														e.target.value,
														current.currency || 'USD'
													)
												}))
											}
										/>
									</FormField>
								) : null}
							</div>
							<div className="detail-form-grid-3 detail-form-grid-half">
								<FormField label="Offered On" required>
									<input
										type="date"
										value={form.offeredOn}
										onChange={(e) => setForm((current) => ({ ...current, offeredOn: e.target.value }))}
									/>
								</FormField>
								<FormField label="Start Date" required>
									<input
										type="date"
										value={form.expectedJoinDate}
										onChange={(e) => setForm((current) => ({ ...current, expectedJoinDate: e.target.value }))}
									/>
								</FormField>
								<FormField label="End Date">
									<input
										type="date"
										value={form.endDate}
										onChange={(e) => setForm((current) => ({ ...current, endDate: e.target.value }))}
									/>
								</FormField>
							</div>
							{form.status === 'withdrawn' ? (
								<FormField label="Withdrawn Reason" required>
									<input
										value={form.withdrawnReason}
										onChange={(e) => setForm((current) => ({ ...current, withdrawnReason: e.target.value }))}
									/>
								</FormField>
							) : null}
							<FormField label="Notes">
								<textarea
									placeholder="Placement notes"
									value={form.notes}
									onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))}
								/>
							</FormField>
							<CustomFieldsSection
								moduleKey="placements"
								values={form.customFields}
								onChange={(nextCustomFields) =>
									setForm((current) => ({
										...current,
										customFields: nextCustomFields
									}))
								}
								onDefinitionsChange={setCustomFieldDefinitions}
								disabled={acceptedReadOnly}
							/>
						</section>
					</fieldset>

					<div className="form-actions">
						<button
							type="submit"
							disabled={
								saveState.saving ||
								acceptedReadOnly ||
								!form.candidateId ||
								!form.jobOrderId ||
								!form.offeredOn ||
								!form.expectedJoinDate ||
								!compensationComplete ||
								!customFieldsComplete
							}
						>
							{saveState.saving ? 'Saving...' : acceptedReadOnly ? 'Accepted (Read Only)' : 'Save Placement'}
						</button>
						<span className="form-actions-meta">
							<span>Updated:</span>
							<strong>{formatDate(placement.updatedAt)}</strong>
						</span>
					</div>
				</form>
			</article>
			<AuditTrailPanel entityType="PLACEMENT" entityId={id} visible={showAuditTrail} />
		</section>
	);
}
