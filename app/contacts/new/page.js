'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import LookupTypeaheadSelect from '@/app/components/lookup-typeahead-select';
import PhoneInput from '@/app/components/phone-input';
import FormField from '@/app/components/form-field';
import CustomFieldsSection, { areRequiredCustomFieldsComplete } from '@/app/components/custom-fields-section';
import { useToast } from '@/app/components/toast-provider';
import useUnsavedChangesGuard from '@/app/hooks/use-unsaved-changes-guard';
import { CONTACT_SOURCE_OPTIONS } from '@/app/constants/contact-source-options';
import { fetchLookupOptionById } from '@/lib/lookup-client';
import { isValidOptionalHttpUrl } from '@/lib/url-validation';
import { fetchUnassignedDivisionOption } from '@/lib/default-division-client';

const initialForm = {
	firstName: '',
	lastName: '',
	email: '',
	phone: '',
	title: '',
	department: '',
	linkedinUrl: '',
	source: '',
	divisionId: '',
	ownerId: '',
	clientId: '',
	customFields: {}
};

function NewContactsPageContent() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const prefillClientId = searchParams.get('clientId');
	const parsedPrefillClientId = Number(prefillClientId);
	const presetClientId =
		Number.isInteger(parsedPrefillClientId) && parsedPrefillClientId > 0
			? String(parsedPrefillClientId)
			: '';
	const clientLocked = Boolean(presetClientId);
	const [actingUser, setActingUser] = useState(null);
	const [form, setForm] = useState(initialForm);
	const [customFieldDefinitions, setCustomFieldDefinitions] = useState([]);
	const [error, setError] = useState('');
	const [saving, setSaving] = useState(false);
	const toast = useToast();
	const { markAsClean } = useUnsavedChangesGuard(form);
	const isAdmin = actingUser?.role === 'ADMINISTRATOR';
	const hasValidLinkedinUrl = isValidOptionalHttpUrl(form.linkedinUrl);
	const linkedinUrlError =
		form.linkedinUrl.trim() && !hasValidLinkedinUrl
			? 'Enter a valid LinkedIn URL, including http:// or https://.'
			: '';
	const customFieldsComplete = areRequiredCustomFieldsComplete(
		customFieldDefinitions,
		form.customFields
	);

	const canSave = useMemo(
		() =>
			Boolean(
				form.firstName.trim() &&
					form.lastName.trim() &&
					form.email.trim() &&
					form.phone.trim() &&
					form.source &&
					form.ownerId &&
					form.clientId &&
					(!isAdmin || form.divisionId) &&
					customFieldsComplete &&
					hasValidLinkedinUrl
			),
		[customFieldsComplete, form, hasValidLinkedinUrl, isAdmin]
	);

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
		let active = true;
		if (!actingUser || clientLocked) {
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
	}, [actingUser, clientLocked]);

	useEffect(() => {
		const nextForm = { ...initialForm, clientId: presetClientId };
		setForm((current) => {
			const isSameForm = Object.keys(nextForm).every((key) => current[key] === nextForm[key]);
			if (isSameForm) return current;
			markAsClean(nextForm);
			return nextForm;
		});
		setError('');
	}, [presetClientId, markAsClean]);

	useEffect(() => {
		let active = true;

		async function applyClientOwnerDefault() {
			if (form.clientId && presetClientId) return;
			const selectedClientId = form.clientId || presetClientId;
			if (!selectedClientId) return;
			const shouldMarkAsClean =
				clientLocked && String(selectedClientId) === String(presetClientId);

			const clientOption = await fetchLookupOptionById('clients', selectedClientId, {});
			if (!active) return;

			const ownerId = clientOption?.ownerId ? String(clientOption.ownerId) : '';
			if (!ownerId) return;

			setForm((current) => {
				if (String(current.clientId || '') !== String(selectedClientId)) {
					return current;
				}
				if (String(current.ownerId || '') === ownerId) {
					return current;
				}
				const nextForm = {
					...current,
					ownerId
				};
				if (shouldMarkAsClean) {
					markAsClean(nextForm);
				}
				return nextForm;
			});
		}

		applyClientOwnerDefault();

		return () => {
			active = false;
		};
	}, [clientLocked, form.clientId, presetClientId]);

	useEffect(() => {
		let active = true;
		if (!clientLocked || !presetClientId) return () => {
			active = false;
		};

		fetchLookupOptionById('clients', presetClientId, {})
			.then((option) => {
				if (!active) return;
				const clientDivisionId = option?.divisionId ? String(option.divisionId) : '';
				if (!clientDivisionId) return;
				setForm((current) => {
					const nextForm = {
						...current,
						divisionId: clientDivisionId
					};
					markAsClean(nextForm);
					return nextForm;
				});
			})
			.catch(() => null);

		return () => {
			active = false;
		};
	}, [clientLocked, presetClientId]);

	useEffect(() => {
		if (error) {
			toast.error(error);
		}
	}, [error, toast]);

	async function onManualSubmit(e) {
		e.preventDefault();
		setError('');
		if (!form.email.trim()) {
			setError('Email is required.');
			return;
		}
		if (!form.phone.trim()) {
			setError('Phone is required.');
			return;
		}
		if (!form.source) {
			setError('Source is required.');
			return;
		}
		if (isAdmin && !form.divisionId) {
			setError('Division is required.');
			return;
		}
		if (!form.ownerId) {
			setError('Owner is required.');
			return;
		}
		if (!form.clientId) {
			setError('Client is required.');
			return;
		}
		setSaving(true);

		try {
			const res = await fetch('/api/contacts', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(form)
			});

			if (!res.ok) {
				setError('Failed to save contact.');
				return;
			}

			const contact = await res.json();
			router.push(`/contacts/${contact.id}`);
		} finally {
			setSaving(false);
		}
	}

	return (
		<section className="module-page">
			<header className="module-header">
				<div>
					<Link href="/contacts" className="module-back-link" aria-label="Back to List">&larr; Back</Link>
					<h2>New Contact</h2>
					<p>Create contacts manually.</p>
				</div>
			</header>

			<article className="panel panel-narrow">
				<div className="method-content">
					<h3>Add Contact</h3>
					<p className="panel-subtext">Required: Name, Email, Phone, Source, Owner, Client.</p>
					<form onSubmit={onManualSubmit}>
						<div className="form-grid-2">
							<FormField label="First Name" required>
								<input
									value={form.firstName}
									onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
									required
								/>
							</FormField>
							<FormField label="Last Name" required>
								<input
									value={form.lastName}
									onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
									required
								/>
							</FormField>
						</div>
						<FormField label="Email" required>
							<input
								placeholder="name@company.com"
								type="email"
								value={form.email}
								onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
								required
							/>
						</FormField>
						<div className="form-grid-2">
							<FormField label="Phone" required>
								<PhoneInput
									placeholder="(555) 555-5555"
									value={form.phone}
									onChange={(phone) => setForm((f) => ({ ...f, phone }))}
									required
								/>
							</FormField>
							<FormField label="Title">
								<input
									value={form.title}
									onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
								/>
							</FormField>
						</div>
						<div className="form-grid-2">
							<FormField label="Department">
								<input
									value={form.department}
									onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
								/>
							</FormField>
							<FormField label="LinkedIn URL">
								<input
									type="url"
									placeholder="https://linkedin.com/in/..."
									value={form.linkedinUrl}
									onChange={(e) => setForm((f) => ({ ...f, linkedinUrl: e.target.value }))}
								/>
							</FormField>
						</div>
						{linkedinUrlError ? <p className="panel-subtext error">{linkedinUrlError}</p> : null}
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
											ownerId: '',
											clientId: clientLocked ? f.clientId : ''
										}))
										}
										placeholder={clientLocked ? 'Division locked by client' : 'Search division'}
										label="Division"
										disabled={clientLocked}
										emptyLabel="No matching divisions."
									/>
								</FormField>
							) : null}
							<FormField label="Source" required>
								<select
									value={form.source}
									onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
									required
								>
									<option value="">Select source</option>
									{CONTACT_SOURCE_OPTIONS.map((option) => (
										<option key={option.value} value={option.value}>
											{option.label}
										</option>
									))}
								</select>
							</FormField>
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
						</div>
						<FormField label="Client" required>
							<LookupTypeaheadSelect
								entity="clients"
								lookupParams={isAdmin && form.divisionId ? { divisionId: form.divisionId } : {}}
								value={form.clientId}
								onChange={(nextValue) => setForm((f) => ({ ...f, clientId: nextValue }))}
					onSelectOption={(option) => {
						const ownerId = option?.ownerId ? String(option.ownerId) : '';
						if (!ownerId) return;
						setForm((current) => ({ ...current, ownerId }));
					}}
								placeholder={isAdmin && !form.divisionId ? 'Select division first' : 'Search client'}
								label="Client"
								emptyLabel="No matching clients."
								disabled={clientLocked || (isAdmin && !form.divisionId)}
							/>
						</FormField>
						<CustomFieldsSection
							moduleKey="contacts"
							values={form.customFields}
							onChange={(nextCustomFields) =>
								setForm((f) => ({
									...f,
									customFields: nextCustomFields
								}))
							}
							onDefinitionsChange={setCustomFieldDefinitions}
						/>
						<button type="submit" disabled={saving || !canSave}>
							{saving ? 'Saving...' : 'Save Contact'}
						</button>
					</form>
				</div>
			</article>
		</section>
	);
}

export default function NewContactsPage() {
	return (
		<Suspense
			fallback={
				<section className="module-page">
					<p>Loading contact setup...</p>
				</section>
			}
		>
			<NewContactsPageContent />
		</Suspense>
	);
}
