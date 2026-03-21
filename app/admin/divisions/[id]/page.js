'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
	DIVISION_ACCESS_MODE_OPTIONS,
	divisionAccessModeLabel
} from '@/app/constants/access-control-options';
import AdminGate from '@/app/components/admin-gate';
import FormField from '@/app/components/form-field';
import LoadingIndicator from '@/app/components/loading-indicator';
import SaveActionButton from '@/app/components/save-action-button';
import { useToast } from '@/app/components/toast-provider';
import useUnsavedChangesGuard from '@/app/hooks/use-unsaved-changes-guard';
import { formatDateTimeAt } from '@/lib/date-format';

const initialForm = {
	name: '',
	accessMode: 'COLLABORATIVE'
};

function toForm(division) {
	if (!division) return initialForm;
	return {
		name: division.name || '',
		accessMode: division.accessMode || 'COLLABORATIVE'
	};
}

function formatDate(value) {
	return formatDateTimeAt(value);
}

export default function DivisionDetailsPage() {
	const { id } = useParams();
	const router = useRouter();
	const [division, setDivision] = useState(null);
	const [form, setForm] = useState(initialForm);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [saveState, setSaveState] = useState({ saving: false, error: '', success: '' });
	const toast = useToast();
	const { markAsClean } = useUnsavedChangesGuard(form, {
		enabled: !loading && Boolean(division)
	});

	useEffect(() => {
		let cancelled = false;

		async function load() {
			setLoading(true);
			setError('');

			const res = await fetch(`/api/divisions/${id}`);
			if (!res.ok) {
				if (!cancelled) {
					setError('Division not found.');
					setLoading(false);
				}
				return;
			}

			const data = await res.json();
			if (!cancelled) {
				const nextForm = toForm(data);
				setDivision(data);
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

		const res = await fetch(`/api/divisions/${id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(form)
		});

		if (!res.ok) {
			const data = await res.json().catch(() => ({}));
			setSaveState({ saving: false, error: data.error || 'Failed to update division.', success: '' });
			return;
		}

		const updated = await res.json();
		const nextForm = toForm(updated);
		setDivision(updated);
		setForm(nextForm);
		markAsClean(nextForm);
		setSaveState({ saving: false, error: '', success: 'Division updated.' });
	}

	if (loading) {
		return (
			<AdminGate>
				<section className="module-page">
					<LoadingIndicator className="page-loading-indicator" label="Loading division details" />
				</section>
			</AdminGate>
		);
	}

	if (error || !division) {
		return (
			<AdminGate>
				<section className="module-page">
					<p>{error || 'Division not found.'}</p>
					<button type="button" onClick={() => router.push('/admin/divisions')}>
						Back to Divisions
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
						<Link href="/admin/divisions" className="module-back-link" aria-label="Back to List">&larr; Back</Link>
						<h2>{division.name}</h2>
						<p>{divisionAccessModeLabel(division.accessMode)}</p>
					</div>
				</header>

				<div className="detail-layout">
					<article className="panel panel-spacious">
						<h3>Division Settings</h3>
						<p className="panel-subtext">Set whether recruiters collaborate across division records.</p>
						<form onSubmit={onSave} className="detail-form">
							<section className="form-section">
								<FormField label="Division Name" required>
									<input
										value={form.name}
										onChange={(event) =>
											setForm((current) => ({ ...current, name: event.target.value }))
										}
										required
									/>
								</FormField>
								<FormField label="Access Mode">
									<select
										value={form.accessMode}
										onChange={(event) =>
											setForm((current) => ({ ...current, accessMode: event.target.value }))
										}
									>
										{DIVISION_ACCESS_MODE_OPTIONS.map((option) => (
											<option key={option.value} value={option.value}>
												{option.label}
											</option>
										))}
									</select>
								</FormField>
							</section>
							<div className="form-actions">
								<SaveActionButton
									saving={saveState.saving}
									disabled={saveState.saving}
									label="Save Division"
									savingLabel="Saving Division..."
								/>
								<span className="form-actions-meta">
									<span>Updated:</span>
									<strong>{formatDate(division.updatedAt)}</strong>
								</span>
							</div>
						</form>
					</article>

					<div className="stack-panels">
						<article className="panel">
							<h3>Snapshot</h3>
							<div className="info-list snapshot-grid">
								<p>
									<span>Users</span>
									<strong>{division._count?.users ?? 0}</strong>
								</p>
								<p>
									<span>Candidates</span>
									<strong>{division._count?.candidates ?? 0}</strong>
								</p>
								<p>
									<span>Clients</span>
									<strong>{division._count?.clients ?? 0}</strong>
								</p>
								<p>
									<span>Contacts</span>
									<strong>{division._count?.contacts ?? 0}</strong>
								</p>
								<p>
									<span>Job Orders</span>
									<strong>{division._count?.jobOrders ?? 0}</strong>
								</p>
							</div>
						</article>
					</div>
				</div>
			</section>
		</AdminGate>
	);
}
