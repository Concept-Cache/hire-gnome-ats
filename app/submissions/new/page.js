'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import LookupTypeaheadSelect from '@/app/components/lookup-typeahead-select';
import FormField from '@/app/components/form-field';
import { useToast } from '@/app/components/toast-provider';
import useUnsavedChangesGuard from '@/app/hooks/use-unsaved-changes-guard';
import { fetchLookupOptionById } from '@/lib/lookup-client';
import { formatCandidateStatusLabel, isCandidateQualifiedForPipeline } from '@/lib/candidate-status';

const initialForm = {
	candidateId: '',
	jobOrderId: '',
	status: 'submitted',
	notes: ''
};

function NewSubmissionsPageContent() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const prefillCandidateId = searchParams.get('candidateId') || '';
	const prefillJobOrderId = searchParams.get('jobOrderId') || '';
	const [selectedCandidateStatus, setSelectedCandidateStatus] = useState(null);
	const [form, setForm] = useState({
		...initialForm,
		candidateId: prefillCandidateId,
		jobOrderId: prefillJobOrderId
	});
	const [error, setError] = useState('');
	const [saving, setSaving] = useState(false);
	const toast = useToast();
	useUnsavedChangesGuard(form);
	const selectedCandidateIsQualified =
		!form.candidateId ||
		!selectedCandidateStatus ||
		isCandidateQualifiedForPipeline(selectedCandidateStatus);

	useEffect(() => {
		let active = true;

		async function loadSelectedCandidate() {
			if (!form.candidateId) {
				if (active) {
					setSelectedCandidateStatus(null);
				}
				return;
			}

			const option = await fetchLookupOptionById('candidates', form.candidateId, {});
			if (!active) return;
			setSelectedCandidateStatus(option?.status || null);
		}

		loadSelectedCandidate();
		return () => {
			active = false;
		};
	}, [form.candidateId]);

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
		if (!selectedCandidateIsQualified) {
			setError(
				`Candidate must be Qualified or beyond before submitting. Current status: ${formatCandidateStatusLabel(
					selectedCandidateStatus
				)}.`
			);
			return;
		}
		setSaving(true);

		try {
			const res = await fetch('/api/submissions', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(form)
			});

			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				setError(data.error || 'Failed to create submission.');
				return;
			}

			const submission = await res.json();
			router.push(`/submissions/${submission.id}`);
		} finally {
			setSaving(false);
		}
	}

	return (
		<section className="module-page">
			<header className="module-header">
				<div>
					<Link href="/submissions" className="module-back-link" aria-label="Back to List">&larr; Back</Link>
					<h2>New Submission</h2>
					<p>Create candidate submission records for job orders.</p>
				</div>
			</header>

			<article className="panel panel-narrow">
				<h3>Add Submission</h3>
				<form onSubmit={onSubmit}>
					<FormField label="Candidate" required>
						<LookupTypeaheadSelect
							entity="candidates"
							lookupParams={{ qualifiedOnly: 'true' }}
							value={form.candidateId}
							onChange={(nextValue) => setForm((f) => ({ ...f, candidateId: nextValue }))}
							onSelectOption={(option) => setSelectedCandidateStatus(option?.status || null)}
							placeholder="Search candidate"
							label="Candidate"
							emptyLabel="No qualified candidates available."
						/>
					</FormField>
					{!selectedCandidateIsQualified ? (
						<p className="panel-subtext error">
							Candidate must be Qualified or beyond before submitting.
						</p>
					) : null}
					<FormField label="Job Order" required>
						<LookupTypeaheadSelect
							entity="job-orders"
							lookupParams={{}}
							value={form.jobOrderId}
							onChange={(nextValue) => setForm((f) => ({ ...f, jobOrderId: nextValue }))}
							placeholder="Search job order"
							label="Job Order"
							emptyLabel="No matching job orders."
						/>
					</FormField>
					<FormField label="Status">
						<select
							value={form.status}
							onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
						>
							<option value="submitted">Submitted</option>
							<option value="under_review">Under Review</option>
							<option value="qualified">Qualified</option>
							<option value="rejected">Rejected</option>
							<option value="offered">Offered</option>
							<option value="hired">Hired</option>
							<option value="placed">Placed</option>
						</select>
					</FormField>
					<FormField label="Notes">
						<textarea
							placeholder="Submission notes"
							value={form.notes}
							onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
						/>
					</FormField>
					<button type="submit" disabled={saving || !selectedCandidateIsQualified}>
						{saving ? 'Saving...' : 'Create Submission'}
					</button>
				</form>
			</article>
		</section>
	);
}

export default function NewSubmissionsPage() {
	return (
		<Suspense
			fallback={
				<section className="module-page">
					<p>Loading submission setup...</p>
				</section>
			}
		>
			<NewSubmissionsPageContent />
		</Suspense>
	);
}
