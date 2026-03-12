'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import LookupTypeaheadSelect from '@/app/components/lookup-typeahead-select';
import AddressTypeaheadInput from '@/app/components/address-typeahead-input';
import FormField from '@/app/components/form-field';
import CustomFieldsSection, { areRequiredCustomFieldsComplete } from '@/app/components/custom-fields-section';
import RichTextEditor from '@/app/components/rich-text-editor';
import { useToast } from '@/app/components/toast-provider';
import useUnsavedChangesGuard from '@/app/hooks/use-unsaved-changes-guard';
import { JOB_ORDER_EMPLOYMENT_TYPES } from '@/lib/job-order-options';
import { hasMeaningfulRichTextContent } from '@/lib/rich-text';
import { formatCurrencyInput, parseCurrencyInput } from '@/lib/currency-input';
import { fetchLookupOptionById } from '@/lib/lookup-client';
import { fetchUnassignedDivisionOption } from '@/lib/default-division-client';
import { toBooleanFlag } from '@/lib/boolean-flag';

const JOB_ORDER_CURRENCIES = ['USD', 'CAD'];

const initialForm = {
	title: '',
	description: '',
	publicDescription: '',
	location: '',
	locationPlaceId: '',
	locationLatitude: '',
	locationLongitude: '',
	city: '',
	state: '',
	zipCode: '',
	status: 'open',
	employmentType: '',
	openings: '1',
	currency: 'USD',
	salaryMin: '',
	salaryMax: '',
	publishToCareerSite: false,
	divisionId: '',
	ownerId: '',
	clientId: '',
	contactId: '',
	customFields: {}
};

function toSalaryPayloadValue(value) {
	const parsed = parseCurrencyInput(value);
	return parsed == null ? '' : parsed;
}

function normalizeZipValue(value) {
	const rawValue = String(value || '').trim();
	if (!rawValue) return '';
	const match = rawValue.match(/\d{5}/);
	return match ? match[0] : rawValue;
}

function toJobOrderPayload(formValue) {
	const currency = JOB_ORDER_CURRENCIES.includes(formValue.currency) ? formValue.currency : 'USD';
	return {
		...formValue,
		currency,
		salaryMin: toSalaryPayloadValue(formValue.salaryMin),
		salaryMax: toSalaryPayloadValue(formValue.salaryMax)
	};
}

function NewJobOrdersPageContent() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const prefillClientId = searchParams.get('clientId');
	const prefillContactId = searchParams.get('contactId');
	const parsedPrefillClientId = Number(prefillClientId);
	const parsedPrefillContactId = Number(prefillContactId);
	const presetClientId =
		Number.isInteger(parsedPrefillClientId) && parsedPrefillClientId > 0
			? String(parsedPrefillClientId)
			: '';
	const presetContactId =
		Number.isInteger(parsedPrefillContactId) && parsedPrefillContactId > 0
			? String(parsedPrefillContactId)
			: '';
	const clientLocked = Boolean(presetClientId);
	const contactLocked = clientLocked && Boolean(presetContactId);
	const [actingUser, setActingUser] = useState(null);
	const [selectedClientDivisionId, setSelectedClientDivisionId] = useState(null);
	const [presetClientDivisionId, setPresetClientDivisionId] = useState(null);
	const [careerSiteEnabled, setCareerSiteEnabled] = useState(false);
	const [form, setForm] = useState(initialForm);
	const [customFieldDefinitions, setCustomFieldDefinitions] = useState([]);
	const [error, setError] = useState('');
	const [saving, setSaving] = useState(false);
	const toast = useToast();
	const { markAsClean } = useUnsavedChangesGuard(form);
	const isAdmin = actingUser?.role === 'ADMINISTRATOR';

	const ownerLookupParams = useMemo(
		() =>
			clientLocked && presetClientDivisionId
				? { divisionId: String(presetClientDivisionId) }
				: isAdmin && form.divisionId
					? { divisionId: form.divisionId }
					: {},
		[clientLocked, form.divisionId, isAdmin, presetClientDivisionId]
	);
	const clientLookupParams = useMemo(
		() =>
			isAdmin && form.divisionId
				? { divisionId: form.divisionId }
				: {},
		[form.divisionId, isAdmin]
	);
	const contactLookupParams = useMemo(() => {
		const params = {};
		if (form.clientId) {
			params.clientId = form.clientId;
		}
		if (isAdmin && form.divisionId) {
			params.divisionId = String(form.divisionId);
		}
		return params;
	}, [form.clientId, form.divisionId, isAdmin]);

	useEffect(() => {
		let cancelled = false;

		async function loadSessionUser() {
			const [sessionRes, settingsRes] = await Promise.all([
				fetch('/api/session/acting-user'),
				fetch('/api/system-settings', { cache: 'no-store' })
			]);
				const sessionData = await sessionRes.json().catch(() => ({ user: null }));
				const settingsData = await settingsRes.json().catch(() => ({}));
				if (cancelled) return;
				setActingUser(sessionData?.user || null);
				setCareerSiteEnabled(toBooleanFlag(settingsData?.careerSiteEnabled, false));
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
		const nextForm = {
			...initialForm,
			clientId: presetClientId,
			contactId: contactLocked ? presetContactId : ''
		};
		setForm((current) => {
			const isSameForm = Object.keys(nextForm).every((key) => current[key] === nextForm[key]);
			if (isSameForm) return current;
			markAsClean(nextForm);
			return nextForm;
		});
		setError('');
	}, [contactLocked, presetClientId, presetContactId, markAsClean]);

	useEffect(() => {
		let active = true;
		if (!clientLocked || !presetClientId) {
			setPresetClientDivisionId(null);
			return () => {
				active = false;
			};
		}

		fetchLookupOptionById('clients', presetClientId, {})
			.then((option) => {
				if (!active) return;
				setPresetClientDivisionId(option?.divisionId ?? null);
				setSelectedClientDivisionId(option?.divisionId ?? null);
				if (option?.divisionId) {
					setForm((current) => {
						const nextForm = {
							...current,
							divisionId: String(option.divisionId)
						};
						markAsClean(nextForm);
						return nextForm;
					});
				}
			})
			.catch(() => {
				if (!active) return;
				setPresetClientDivisionId(null);
			});

		return () => {
			active = false;
		};
	}, [clientLocked, presetClientId]);

	useEffect(() => {
		let active = true;
		if (!form.clientId) {
			setSelectedClientDivisionId(clientLocked ? presetClientDivisionId : null);
			return () => {
				active = false;
			};
		}

		fetchLookupOptionById('clients', form.clientId, {})
			.then((option) => {
				if (!active) return;
				setSelectedClientDivisionId(option?.divisionId ?? null);
			})
			.catch(() => {
				if (!active) return;
				setSelectedClientDivisionId(null);
			});

		return () => {
			active = false;
		};
	}, [clientLocked, form.clientId, presetClientDivisionId]);

	useEffect(() => {
		if (isAdmin && !form.divisionId) {
			setForm((f) => {
				if (clientLocked) return f;
				const nextOwnerId = '';
				const nextClientId = '';
				const nextContactId = '';
				if (
					f.ownerId === nextOwnerId &&
					f.clientId === nextClientId &&
					f.contactId === nextContactId
				) {
					return f;
				}
				return {
					...f,
					ownerId: nextOwnerId,
					clientId: nextClientId,
					contactId: nextContactId
				};
			});
			return;
		}

		if (isAdmin && form.clientId && form.divisionId && selectedClientDivisionId != null) {
			if (Number(form.divisionId) === Number(selectedClientDivisionId)) return;
			setForm((f) => {
				const nextOwnerId = clientLocked ? f.ownerId : '';
				const nextClientId = clientLocked ? f.clientId : '';
				const nextContactId = contactLocked ? f.contactId : '';
				if (
					f.ownerId === nextOwnerId &&
					f.clientId === nextClientId &&
					f.contactId === nextContactId
				) {
					return f;
				}
				return {
					...f,
					ownerId: nextOwnerId,
					clientId: nextClientId,
					contactId: nextContactId
				};
			});
		}
	}, [clientLocked, contactLocked, form.clientId, form.divisionId, isAdmin, selectedClientDivisionId]);

	useEffect(() => {
		if (!form.clientId && !contactLocked) {
			setForm((f) => (f.contactId ? { ...f, contactId: '' } : f));
		}
	}, [contactLocked, form.clientId]);

	useEffect(() => {
		if (error) {
			toast.error(error);
		}
	}, [error, toast]);

	useEffect(() => {
		if (!careerSiteEnabled && form.publishToCareerSite) {
			setForm((current) => ({ ...current, publishToCareerSite: false }));
			return;
		}
		if (!hasMeaningfulRichTextContent(form.publicDescription) && form.publishToCareerSite) {
			setForm((current) => ({ ...current, publishToCareerSite: false }));
		}
	}, [careerSiteEnabled, form.publicDescription, form.publishToCareerSite]);

	const requiresPublicDescription = careerSiteEnabled && form.publishToCareerSite;
	const hasPublicDescription = hasMeaningfulRichTextContent(form.publicDescription);
	const canPublishToCareerSite = careerSiteEnabled && hasPublicDescription;
	const salaryMinValue = parseCurrencyInput(form.salaryMin);
	const salaryMaxValue = parseCurrencyInput(form.salaryMax);
	const hasSalaryRangeError =
		salaryMinValue != null && salaryMaxValue != null && salaryMinValue > salaryMaxValue;
	const customFieldsComplete = areRequiredCustomFieldsComplete(
		customFieldDefinitions,
		form.customFields
	);
	const canSave =
		form.title.trim().length > 0 &&
		Boolean(form.status) &&
		Boolean(form.ownerId) &&
		Boolean(form.clientId) &&
		Boolean(form.contactId) &&
		(!isAdmin || Boolean(form.divisionId)) &&
		Boolean(form.zipCode.trim()) &&
		!hasSalaryRangeError &&
		customFieldsComplete &&
		(!requiresPublicDescription || hasPublicDescription) &&
		!saving;

	async function onManualSubmit(e) {
		e.preventDefault();
		setError('');
		if (isAdmin && !form.divisionId) {
			setError('Division is required.');
			return;
		}
		if (!form.ownerId) {
			setError('Owner is required.');
			return;
		}
		if (!form.status) {
			setError('Status is required.');
			return;
		}
		if (!form.clientId) {
			setError('Client is required.');
			return;
		}
		if (!form.contactId) {
			setError('Hiring Manager is required.');
			return;
		}
		if (!form.zipCode.trim()) {
			setError('Zip code is required.');
			return;
		}
		if (hasSalaryRangeError) {
			setError('Salary Min cannot be greater than Salary Max.');
			return;
		}
		if (requiresPublicDescription && !hasPublicDescription) {
			setError('Public description is required when posting to the career site.');
			return;
		}
		setSaving(true);

		try {
			const payload = toJobOrderPayload({
				...form,
				publishToCareerSite: careerSiteEnabled ? form.publishToCareerSite : false
			});
			const res = await fetch('/api/job-orders', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});

			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				setError(data.error || 'Failed to save job order.');
				return;
			}

			const jobOrder = await res.json();
			router.push(`/job-orders/${jobOrder.id}`);
		} finally {
			setSaving(false);
		}
	}

	return (
		<section className="module-page">
			<header className="module-header">
				<div>
					<Link href="/job-orders" className="module-back-link" aria-label="Back to List">&larr; Back</Link>
					<h2>New Job Order</h2>
					<p>Create job orders manually.</p>
				</div>
			</header>

			<article className="panel panel-narrow">
				<div className="method-content">
					<h3>Add Job Order</h3>
					<form onSubmit={onManualSubmit}>
						<FormField label="Title" required>
							<input
								placeholder="Job order title"
								value={form.title}
								onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
								required
							/>
						</FormField>
						<FormField label="Internal Description">
							<textarea
								value={form.description}
								onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
							/>
						</FormField>
						<div className="form-grid-2">
							<FormField label="Location">
								<AddressTypeaheadInput
									value={form.location}
									onChange={(nextValue) =>
										setForm((f) => ({
											...f,
											location: nextValue
										}))
									}
									onPlaceDetailsChange={(details) =>
										setForm((f) => ({
											...f,
											locationPlaceId: details?.placeId || '',
											locationLatitude: details?.latitude ?? '',
											locationLongitude: details?.longitude ?? '',
											city: details?.city ?? f.city,
											state: details?.state ?? f.state,
											zipCode: details?.postalCode ? normalizeZipValue(details.postalCode) : f.zipCode
										}))
									}
									placeholder="Search address or enter manually"
									label="Location"
								/>
							</FormField>
							<FormField label="Employment Type">
								<select
									value={form.employmentType}
									onChange={(e) => setForm((f) => ({ ...f, employmentType: e.target.value }))}
								>
									<option value="">Select employment type</option>
									{JOB_ORDER_EMPLOYMENT_TYPES.map((employmentType) => (
										<option key={employmentType} value={employmentType}>
											{employmentType}
										</option>
									))}
								</select>
							</FormField>
						</div>
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
									onChange={(e) => setForm((f) => ({ ...f, zipCode: normalizeZipValue(e.target.value) }))}
									required
								/>
							</FormField>
						</div>
							<FormField label="Status" required>
								<select
									value={form.status}
									onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
									required
								>
									<option value="open">Open</option>
									<option value="on_hold">On Hold</option>
								</select>
							</FormField>
						<div className="form-grid-4">
							<FormField label="Openings">
								<input
									type="number"
									min="1"
									value={form.openings}
									onChange={(e) => setForm((f) => ({ ...f, openings: e.target.value }))}
								/>
							</FormField>
							<FormField label="Currency">
								<select
									value={form.currency}
									onChange={(e) => {
										const nextCurrency = JOB_ORDER_CURRENCIES.includes(e.target.value)
											? e.target.value
											: 'USD';
										setForm((current) => ({
											...current,
											currency: nextCurrency,
											salaryMin: formatCurrencyInput(current.salaryMin, nextCurrency),
											salaryMax: formatCurrencyInput(current.salaryMax, nextCurrency)
										}));
									}}
								>
									<option value="USD">USD</option>
									<option value="CAD">CAD</option>
								</select>
							</FormField>
							<FormField label="Salary Min">
								<input
									type="text"
									inputMode="decimal"
									value={form.salaryMin}
									onChange={(e) =>
										setForm((f) => ({
											...f,
											salaryMin: formatCurrencyInput(e.target.value, f.currency)
										}))
									}
								/>
							</FormField>
							<FormField label="Salary Max">
								<input
									type="text"
									inputMode="decimal"
									value={form.salaryMax}
									onChange={(e) =>
										setForm((f) => ({
											...f,
											salaryMax: formatCurrencyInput(e.target.value, f.currency)
										}))
									}
								/>
							</FormField>
						</div>
						{hasSalaryRangeError ? <p className="panel-subtext error">Salary Min cannot exceed Salary Max.</p> : null}
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
											ownerId: clientLocked ? f.ownerId : '',
											clientId: clientLocked ? f.clientId : '',
											contactId: contactLocked ? f.contactId : ''
										}))
									}
									placeholder={clientLocked ? 'Division locked by client' : 'Search division'}
									label="Division"
									disabled={clientLocked}
									emptyLabel="No matching divisions."
								/>
							</FormField>
						) : null}
							<FormField label="Owner" required>
								<LookupTypeaheadSelect
									entity="users"
									lookupParams={ownerLookupParams}
									value={form.ownerId}
									onChange={(nextValue) => setForm((f) => ({ ...f, ownerId: nextValue }))}
									placeholder={isAdmin && !form.divisionId ? 'Select division first' : 'Search owner (required)'}
									label="Owner"
									disabled={isAdmin && !form.divisionId}
									emptyLabel="No matching users."
								/>
							</FormField>
						<FormField label="Client" required>
							<LookupTypeaheadSelect
								entity="clients"
								lookupParams={clientLookupParams}
								value={form.clientId}
								onChange={(nextValue) =>
									setForm((f) => ({
										...f,
										clientId: nextValue,
										contactId: contactLocked ? f.contactId : ''
									}))
								}
								onSelectOption={(option) => setSelectedClientDivisionId(option?.divisionId ?? null)}
								placeholder={
									isAdmin && !form.divisionId
										? 'Select division first'
										: form.ownerId
											? 'Search client'
											: 'Select owner first'
								}
								label="Client"
								emptyLabel="No matching clients."
								disabled={clientLocked || (isAdmin ? !form.divisionId : !form.ownerId)}
							/>
						</FormField>
						<FormField label="Hiring Manager" required>
							<LookupTypeaheadSelect
								entity="contacts"
								lookupParams={contactLookupParams}
								value={form.contactId}
								onChange={(nextValue) => setForm((f) => ({ ...f, contactId: nextValue }))}
								placeholder={
									contactLocked
										? 'Hiring manager locked from source contact'
										: (isAdmin && !form.divisionId)
											? 'Select division first'
											: form.ownerId
											? form.clientId
												? 'Search hiring manager'
												: 'Select client first'
											: 'Select owner first'
								}
								label="Hiring Manager"
								disabled={contactLocked || (isAdmin ? !form.divisionId : !form.ownerId) || !form.clientId}
								emptyLabel="No matching contacts."
							/>
						</FormField>
							{careerSiteEnabled ? (
								<>
									<div className="checkbox-grid">
										<label className="switch-field">
											<input
												type="checkbox"
												className="switch-input"
												checked={form.publishToCareerSite}
												disabled={!form.publishToCareerSite && !canPublishToCareerSite}
												onChange={(e) => {
													const checked = e.target.checked;
													setForm((f) => ({ ...f, publishToCareerSite: checked }));
													setError('');
												}}
											/>
											<span className="switch-track" aria-hidden="true">
												<span className="switch-thumb" />
											</span>
											<span className="switch-copy">
												<span className="switch-label">Publish to Career Site</span>
												<span className="switch-hint">
													{canPublishToCareerSite
														? 'Publish the public description to your careers page.'
														: 'Add a public description before enabling career-site publishing.'}
												</span>
											</span>
										</label>
									</div>
									<FormField label="Public Description" required={form.publishToCareerSite}>
										<RichTextEditor
											value={form.publicDescription}
											onChange={(nextValue) => setForm((f) => ({ ...f, publicDescription: nextValue }))}
											ariaLabel="Public Description"
										/>
									</FormField>
								</>
							) : null}
						<CustomFieldsSection
							moduleKey="jobOrders"
							values={form.customFields}
							onChange={(nextCustomFields) =>
								setForm((f) => ({
									...f,
									customFields: nextCustomFields
								}))
							}
							onDefinitionsChange={setCustomFieldDefinitions}
						/>
						<button type="submit" disabled={!canSave}>
							{saving ? 'Saving...' : 'Save Job Order'}
						</button>
					</form>
				</div>
			</article>

		</section>
	);
}

export default function NewJobOrdersPage() {
	return (
		<Suspense
			fallback={
				<section className="module-page">
					<p>Loading job order setup...</p>
				</section>
			}
		>
			<NewJobOrdersPageContent />
		</Suspense>
	);
}
