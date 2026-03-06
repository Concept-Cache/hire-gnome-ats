'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import LookupTypeaheadSelect from '@/app/components/lookup-typeahead-select';
import AddressTypeaheadInput from '@/app/components/address-typeahead-input';
import FormField from '@/app/components/form-field';
import PhoneInput from '@/app/components/phone-input';
import { useToast } from '@/app/components/toast-provider';
import useUnsavedChangesGuard from '@/app/hooks/use-unsaved-changes-guard';
import { INDUSTRY_OPTIONS } from '@/app/constants/industry-options';
import { isValidOptionalHttpUrl } from '@/lib/url-validation';
import { CLIENT_STATUS_OPTIONS, normalizeClientStatusValue } from '@/lib/client-status-options';
import { fetchUnassignedDivisionOption } from '@/lib/default-division-client';

const initialForm = {
	name: '',
	industry: '',
	status: 'Prospect',
	divisionId: '',
	ownerId: '',
	phone: '',
	address: '',
	city: '',
	state: '',
	zipCode: '',
	website: '',
	description: ''
};

function normalizeZipFromPlace(postalCode) {
	const match = String(postalCode || '').match(/\d{5}/);
	return match ? match[0] : '';
}

function NewClientsPageContent() {
	const router = useRouter();
	const [actingUser, setActingUser] = useState(null);
	const [form, setForm] = useState(initialForm);
	const [error, setError] = useState('');
	const [saving, setSaving] = useState(false);
	const toast = useToast();
	const { markAsClean } = useUnsavedChangesGuard(form);
	const isAdmin = actingUser?.role === 'ADMINISTRATOR';
	const hasValidWebsite = isValidOptionalHttpUrl(form.website);
	const canSave = Boolean(
		form.name.trim() &&
		form.status &&
		form.ownerId &&
		form.zipCode.trim() &&
		hasValidWebsite &&
		(!isAdmin || form.divisionId)
	);
	const websiteError =
		form.website.trim() && !hasValidWebsite ? 'Enter a valid website URL, including http:// or https://.' : '';

	useEffect(() => {
		let cancelled = false;

		async function loadSessionUser() {
			const sessionRes = await fetch('/api/session/acting-user');
			const sessionData = await sessionRes.json().catch(() => ({ user: null }));
			if (cancelled) return;
			setActingUser(sessionData?.user || null);
		}

		loadSessionUser();
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		if (error) {
			toast.error(error);
		}
	}, [error, toast]);

	useEffect(() => {
		let active = true;
		if (!actingUser) {
			return () => {
				active = false;
			};
		}

		if (actingUser.role === 'ADMINISTRATOR') {
			fetchUnassignedDivisionOption()
				.then((option) => {
					if (!active) return;
					const unassignedDivisionId = option?.value ? String(option.value) : '';
					if (!unassignedDivisionId) return;
					setForm((current) => {
						if (current.divisionId) return current;
						const nextForm = {
							...current,
							divisionId: unassignedDivisionId
						};
						markAsClean(nextForm);
						return nextForm;
					});
				})
				.catch(() => null);
			return () => {
				active = false;
			};
		}

		const userDivisionId = actingUser?.divisionId ? String(actingUser.divisionId) : '';
		if (!userDivisionId) {
			return () => {
				active = false;
			};
		}
		setForm((current) => {
			const nextForm = {
				...current,
				divisionId: userDivisionId
			};
			markAsClean(nextForm);
			return nextForm;
		});

		return () => {
			active = false;
		};
	}, [actingUser]);

	async function onManualSubmit(e) {
		e.preventDefault();
		setError('');
		if (!canSave) {
			setError(
				isAdmin
					? 'Client Name, Status, Division, Zip Code, and Owner are required.'
					: 'Client Name, Status, Zip Code, and Owner are required.'
			);
			return;
		}
		setSaving(true);

		try {
			const res = await fetch('/api/clients', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(form)
			});

			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				setError(data.error || 'Failed to save client.');
				return;
			}

			const client = await res.json();
			router.push(`/clients/${client.id}`);
		} finally {
			setSaving(false);
		}
	}

	return (
		<section className="module-page">
			<header className="module-header">
				<div>
					<Link href="/clients" className="module-back-link" aria-label="Back to List">&larr; Back</Link>
					<h2>New Client</h2>
					<p>Create clients manually.</p>
				</div>
			</header>

			<article className="panel panel-narrow">
				<div className="method-content">
					<h3>Add Client</h3>
					<form onSubmit={onManualSubmit}>
						<FormField label="Client Name" required>
							<input
								value={form.name}
								onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
								required
							/>
						</FormField>
						<div className="form-grid-2">
							<FormField label="Industry">
								<select
									value={form.industry}
									onChange={(e) => setForm((f) => ({ ...f, industry: e.target.value }))}
								>
									<option value="">Select industry</option>
									{INDUSTRY_OPTIONS.map((option) => (
										<option key={option.value} value={option.value}>
											{option.label}
										</option>
									))}
								</select>
							</FormField>
							<FormField label="Status" required>
								<select
									value={form.status}
									onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
									required
								>
									<option value="">Select status</option>
									{CLIENT_STATUS_OPTIONS.map((option) => (
										<option key={option.value} value={option.value}>
											{option.label}
										</option>
									))}
								</select>
							</FormField>
						</div>
						<div className="form-grid-2">
							{isAdmin ? (
								<FormField label="Division" required>
									<LookupTypeaheadSelect
										entity="divisions"
										lookupParams={{}}
										value={form.divisionId}
										onChange={(nextValue) =>
											setForm((f) => ({
												...f,
												divisionId: nextValue,
									ownerId: ''
											}))
										}
										placeholder="Search division"
										label="Division"
										emptyLabel="No matching divisions."
									/>
								</FormField>
							) : null}
							<FormField label="Owner" required>
								<LookupTypeaheadSelect
									entity="users"
									lookupParams={isAdmin && form.divisionId ? { divisionId: form.divisionId } : {}}
									value={form.ownerId}
									onChange={(nextValue) => setForm((f) => ({ ...f, ownerId: nextValue }))}
									placeholder={isAdmin && !form.divisionId ? 'Select division first' : 'Search owner'}
									label="Owner"
									disabled={isAdmin && !form.divisionId}
									emptyLabel="No matching users."
								/>
							</FormField>
							<FormField label="Main Phone">
								<PhoneInput
									value={form.phone}
									onChange={(nextValue) => setForm((f) => ({ ...f, phone: nextValue }))}
								/>
							</FormField>
						</div>
						<FormField label="Street Address">
							<AddressTypeaheadInput
								value={form.address}
								onChange={(nextValue) =>
									setForm((f) => ({
										...f,
										address: nextValue
									}))
								}
								onPlaceDetailsChange={(details) =>
									setForm((f) => ({
										...f,
										city: details?.city ?? f.city,
										state: details?.state ?? f.state,
										zipCode: details?.postalCode ? normalizeZipFromPlace(details.postalCode) : f.zipCode
									}))
								}
								placeholder="Search address or enter manually"
								label="Street Address"
							/>
						</FormField>
						<div className="form-grid-3">
							<FormField label="City">
								<input
									value={form.city}
									onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
								/>
							</FormField>
							<FormField label="State">
								<input
									value={form.state}
									onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
								/>
							</FormField>
							<FormField label="Zip Code" required>
								<input
									value={form.zipCode}
									onChange={(e) => setForm((f) => ({ ...f, zipCode: e.target.value }))}
									required
								/>
							</FormField>
						</div>
						<FormField label="Website">
							<input
								type="url"
								placeholder="https://example.com"
								value={form.website}
								onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
							/>
						</FormField>
						{websiteError ? <p className="panel-subtext error">{websiteError}</p> : null}
						<FormField label="Description">
							<textarea
								placeholder="Company description"
								value={form.description}
								onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
							/>
						</FormField>
						<button type="submit" disabled={saving || !canSave}>
							{saving ? 'Saving...' : 'Save Client'}
						</button>
					</form>
				</div>
			</article>
		</section>
	);
}

export default function NewClientsPage() {
	return (
		<Suspense
			fallback={
				<section className="module-page">
					<p>Loading client setup...</p>
				</section>
			}
		>
			<NewClientsPageContent />
		</Suspense>
	);
}
