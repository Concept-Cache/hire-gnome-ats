'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import LookupTypeaheadSelect from '@/app/components/lookup-typeahead-select';
import FormField from '@/app/components/form-field';
import { useToast } from '@/app/components/toast-provider';
import useUnsavedChangesGuard from '@/app/hooks/use-unsaved-changes-guard';
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
	jobOrderId: ''
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

function NewPlacementPageContent() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const prefillCandidateId = searchParams.get('candidateId') || '';
	const prefillJobOrderId = searchParams.get('jobOrderId') || '';
	const [form, setForm] = useState({
		...initialForm,
		candidateId: prefillCandidateId,
		jobOrderId: prefillJobOrderId
	});
	const [error, setError] = useState('');
	const [saving, setSaving] = useState(false);
	const toast = useToast();
	useUnsavedChangesGuard(form);

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

	useEffect(() => {
		if (form.placementType !== 'perm') return;
		if (form.compensationType === 'salary') return;
		setForm((current) => withCompensationType(current, 'salary'));
	}, [form.placementType, form.compensationType]);

	useEffect(() => {
		if (error) {
			toast.error(error);
		}
	}, [error, toast]);

	async function onSubmit(e) {
		e.preventDefault();
		setError('');
		if (!form.candidateId || !form.jobOrderId) {
			setError('Candidate and Job Order are required.');
			return;
		}
		if (!form.offeredOn || !form.expectedJoinDate) {
			setError('Offer date and start date are required.');
			return;
		}
		setSaving(true);

		try {
			const payload = {
				...form,
				hourlyRtBillRate: normalizeCurrencyInput(form.hourlyRtBillRate),
				hourlyRtPayRate: normalizeCurrencyInput(form.hourlyRtPayRate),
				hourlyOtBillRate: normalizeCurrencyInput(form.hourlyOtBillRate),
				hourlyOtPayRate: normalizeCurrencyInput(form.hourlyOtPayRate),
				dailyBillRate: normalizeCurrencyInput(form.dailyBillRate),
				dailyPayRate: normalizeCurrencyInput(form.dailyPayRate),
				yearlyCompensation: normalizeCurrencyInput(form.yearlyCompensation)
			};

			const res = await fetch('/api/placements', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});
			const data = await res.json().catch(() => ({}));

			if (!res.ok) {
				const errors = data.errors?.fieldErrors || {};
				const firstError = Object.values(errors).flat().find(Boolean);
				setError(firstError || data.error || 'Failed to create placement.');
				return;
			}

			router.push(`/placements/${data.id}`);
		} finally {
			setSaving(false);
		}
		}
		return (
			<section className="module-page">
			<header className="module-header">
				<div>
					<Link href="/placements" className="module-back-link" aria-label="Back to List">&larr; Back</Link>
					<h2>New Placement</h2>
					<p>Create placement records for candidate and job order pairings.</p>
				</div>
			</header>

			<article className="panel panel-narrow">
				<h3>Create Placement</h3>
				<form onSubmit={onSubmit}>
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
					<div className="form-grid-2">
						<FormField label="Candidate" required>
							<LookupTypeaheadSelect
								entity="candidates"
								lookupParams={{}}
								value={form.candidateId}
								onChange={(nextValue) => setForm((current) => ({ ...current, candidateId: nextValue }))}
								placeholder="Search candidate"
								label="Candidate"
								emptyLabel="No matching candidates."
							/>
						</FormField>
						<FormField label="Job Order" required>
							<LookupTypeaheadSelect
								entity="job-orders"
								lookupParams={{}}
								value={form.jobOrderId}
								onChange={(nextValue) => setForm((current) => ({ ...current, jobOrderId: nextValue }))}
								placeholder="Search job order"
								label="Job Order"
								emptyLabel="No matching job orders."
							/>
						</FormField>
					</div>
					<div className="form-grid-3">
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
								onChange={(e) => setForm((current) => withCompensationType(current, e.target.value))}
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
								onChange={(e) => setForm((current) => ({ ...current, currency: e.target.value }))}
							>
								<option value="USD">USD</option>
								<option value="CAD">CAD</option>
							</select>
						</FormField>
					</div>
					<div className="form-grid-4">
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
												hourlyRtBillRate: formatCurrencyInput(e.target.value)
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
												hourlyRtPayRate: formatCurrencyInput(e.target.value)
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
												hourlyOtBillRate: formatCurrencyInput(e.target.value)
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
												hourlyOtPayRate: formatCurrencyInput(e.target.value)
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
												dailyBillRate: formatCurrencyInput(e.target.value)
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
												dailyPayRate: formatCurrencyInput(e.target.value)
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
											yearlyCompensation: formatCurrencyInput(e.target.value)
										}))
									}
								/>
							</FormField>
						) : null}
					</div>
					<div className="form-grid-3">
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
					<FormField label="Withdrawn Reason">
						<input
							value={form.withdrawnReason}
							onChange={(e) => setForm((current) => ({ ...current, withdrawnReason: e.target.value }))}
						/>
					</FormField>
					<FormField label="Notes">
						<textarea
							placeholder="Placement notes"
							value={form.notes}
							onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))}
						/>
					</FormField>
					<button
						type="submit"
						disabled={
							saving ||
							!form.candidateId ||
							!form.jobOrderId ||
							!form.offeredOn ||
							!form.expectedJoinDate ||
							!compensationComplete
						}
					>
						{saving ? 'Saving...' : 'Save Placement'}
					</button>
				</form>
			</article>
		</section>
	);
}

export default function NewPlacementPage() {
	return (
		<Suspense
			fallback={
				<section className="module-page">
					<p>Loading placement setup...</p>
				</section>
			}
		>
			<NewPlacementPageContent />
		</Suspense>
	);
}
