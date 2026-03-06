'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import LookupTypeaheadSelect from '@/app/components/lookup-typeahead-select';
import PhoneInput from '@/app/components/phone-input';
import AddressTypeaheadInput from '@/app/components/address-typeahead-input';
import FormField from '@/app/components/form-field';
import SkillChipSelect from '@/app/components/skill-chip-select';
import { useToast } from '@/app/components/toast-provider';
import useUnsavedChangesGuard from '@/app/hooks/use-unsaved-changes-guard';
import {
	CANDIDATE_SOURCE_OPTIONS,
	normalizeCandidateSourceValue
} from '@/app/constants/candidate-source-options';
import { formatDateTimeAt } from '@/lib/date-format';
import { isValidEmailAddress } from '@/lib/email-validation';
import { isValidOptionalHttpUrl } from '@/lib/url-validation';
import { CANDIDATE_STATUS_OPTIONS } from '@/lib/candidate-status';
import { fetchUnassignedDivisionOption } from '@/lib/default-division-client';
import {
	RESUME_UPLOAD_MAX_BYTES,
	isAllowedResumeUploadFileName,
	resumeUploadAcceptString
} from '@/lib/candidate-attachment-options';

const initialForm = {
	firstName: '',
	lastName: '',
	email: '',
	mobile: '',
	status: 'new',
	source: '',
	divisionId: '',
	ownerId: '',
	currentJobTitle: '',
	currentEmployer: '',
	address: '',
	addressPlaceId: '',
	addressLatitude: '',
	addressLongitude: '',
	city: '',
	state: '',
	zipCode: '',
	website: '',
	linkedinUrl: '',
	skillIds: undefined,
	skillSet: '',
	summary: ''
};

function toForm(row) {
	return {
		firstName: row.firstName || '',
		lastName: row.lastName || '',
		email: row.email || '',
		mobile: row.mobile || row.phone || '',
		status: row.status || 'new',
		source: normalizeCandidateSourceValue(row.source),
		divisionId: row.divisionId == null ? '' : String(row.divisionId),
		ownerId: row.ownerId == null ? '' : String(row.ownerId),
		currentJobTitle: row.currentJobTitle || '',
		currentEmployer: row.currentEmployer || '',
		address: row.address || '',
		addressPlaceId: row.addressPlaceId || '',
		addressLatitude: row.addressLatitude ?? '',
		addressLongitude: row.addressLongitude ?? '',
		city: row.city || '',
		state: row.state || '',
		zipCode: row.zipCode || '',
		website: row.website || '',
		linkedinUrl: row.linkedinUrl || '',
		skillIds: Array.isArray(row.candidateSkills) && row.candidateSkills.length > 0
			? row.candidateSkills
					.map((candidateSkill) => candidateSkill?.skill?.id)
					.filter(Boolean)
					.map((skillId) => String(skillId))
			: undefined,
		skillSet: row.skillSet || '',
		summary: row.summary || ''
	};
}

function formatDate(value) {
	return formatDateTimeAt(value);
}

function normalizeSkillKey(value) {
	return String(value || '')
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '');
}

function uniqueStrings(values) {
	const seen = new Set();
	const result = [];

	for (const rawValue of values) {
		const value = String(rawValue || '').trim();
		if (!value) continue;
		const key = value.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		result.push(value);
	}

	return result;
}

function mapParsedSkillsToForm(parsedSkillsInput, availableSkills) {
	const parsedSkills = uniqueStrings(parsedSkillsInput);
	if (parsedSkills.length === 0) {
		return {
			parsedSkillNames: [],
			matchedSkillIds: [],
			otherSkills: ''
		};
	}

	const activeSkills = Array.isArray(availableSkills)
		? availableSkills.filter((skill) => skill?.isActive)
		: [];
	const skillIdByKey = new Map(
		activeSkills.map((skill) => [normalizeSkillKey(skill.name), String(skill.id)])
	);

	const matchedSkillIds = [];
	const otherSkills = [];

	for (const parsedSkill of parsedSkills) {
		const matchedSkillId = skillIdByKey.get(normalizeSkillKey(parsedSkill));
		if (matchedSkillId) {
			if (!matchedSkillIds.includes(matchedSkillId)) {
				matchedSkillIds.push(matchedSkillId);
			}
		} else {
			otherSkills.push(parsedSkill);
		}
	}

	return {
		parsedSkillNames: parsedSkills,
		matchedSkillIds,
		otherSkills: uniqueStrings(otherSkills).join(', ')
	};
}

function NewCandidatePageContent() {
	const router = useRouter();
	const [actingUser, setActingUser] = useState(null);
	const [skills, setSkills] = useState([]);
	const [method, setMethod] = useState('manual');
	const [form, setForm] = useState(initialForm);
	const [ownerLockedForParsedDraft, setOwnerLockedForParsedDraft] = useState(false);
	const [parsedFromResume, setParsedFromResume] = useState(false);
	const [resumeInputMode, setResumeInputMode] = useState('file');
	const [resumeText, setResumeText] = useState('');
	const [resumeFile, setResumeFile] = useState(null);
	const [parsedSkillNames, setParsedSkillNames] = useState([]);
	const [parsedEducationRecords, setParsedEducationRecords] = useState([]);
	const [parsedWorkExperienceRecords, setParsedWorkExperienceRecords] = useState([]);
	const [parsedResumeAttachmentFile, setParsedResumeAttachmentFile] = useState(null);
	const [duplicateMatches, setDuplicateMatches] = useState([]);
	const [error, setError] = useState('');
	const [saving, setSaving] = useState(false);
	const [parseState, setParseState] = useState({ parsing: false, error: '', success: '', warnings: [] });
	const toast = useToast();
	const { markAsClean } = useUnsavedChangesGuard(form);
	const isAdmin = actingUser?.role === 'ADMINISTRATOR';

	const skillOptions = useMemo(
		() =>
			skills
				.filter((skill) => skill.isActive)
				.map((skill) => ({
					value: String(skill.id),
					label: skill.name
				})),
		[skills]
	);
	const hasRequiredFields = Boolean(
		form.firstName.trim() &&
			form.lastName.trim() &&
			form.email.trim() &&
			form.mobile.trim() &&
			form.status.trim() &&
			form.source.trim() &&
			form.ownerId.trim() &&
			(!isAdmin || form.divisionId.trim()) &&
			form.currentJobTitle.trim() &&
			form.currentEmployer.trim()
	);
	const hasValidEmail = isValidEmailAddress(form.email);
	const hasValidWebsite = isValidOptionalHttpUrl(form.website);
	const hasValidLinkedinUrl = isValidOptionalHttpUrl(form.linkedinUrl);
	const canSaveCandidate = hasRequiredFields && hasValidEmail && hasValidWebsite && hasValidLinkedinUrl;
	const emailError =
		form.email.trim() && !hasValidEmail ? 'Enter a valid email address.' : '';
	const websiteError =
		form.website.trim() && !hasValidWebsite ? 'Enter a valid website URL, including http:// or https://.' : '';
	const linkedinUrlError =
		form.linkedinUrl.trim() && !hasValidLinkedinUrl
			? 'Enter a valid LinkedIn URL, including http:// or https://.'
			: '';
	const requiredFieldsMessage = isAdmin
		? 'Complete required fields (First Name, Last Name, Email, Mobile, Stage, Source, Division, Owner) and use valid email/URL values.'
		: 'Complete required fields (First Name, Last Name, Email, Mobile, Stage, Source, Owner) and use valid email/URL values.';

	useEffect(() => {
		let cancelled = false;

		async function loadUserContext() {
			const sessionRes = await fetch('/api/session/acting-user');
			const sessionData = await sessionRes.json().catch(() => ({ user: null }));

			if (cancelled) return;
			setActingUser(sessionData?.user || null);
		}

		loadUserContext();
		return () => {
			cancelled = true;
		};
	}, []);

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

	useEffect(() => {
		async function loadSkills() {
			const res = await fetch('/api/skills?active=true');
			if (!res.ok) return;
			const data = await res.json();
			if (!Array.isArray(data)) return;
			setSkills(data);
		}

		loadSkills();
	}, []);

	useEffect(() => {
		if (duplicateMatches.length > 0) {
			setDuplicateMatches([]);
		}
	}, [form.email, form.mobile]);

	useEffect(() => {
		if (error) {
			toast.error(error);
		}
	}, [error, toast]);

	useEffect(() => {
		if (parseState.error) {
			toast.error(parseState.error);
		}
	}, [parseState.error, toast]);

	useEffect(() => {
		if (parseState.success) {
			toast.success(parseState.success);
		}
	}, [parseState.success, toast]);

	async function findDuplicateMatches(payload) {
		const res = await fetch('/api/candidates/match', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				email: payload.email,
				mobile: payload.mobile
			})
		});

		if (!res.ok) {
			return [];
		}

		const data = await res.json();
		if (!Array.isArray(data.matches)) return [];
		return data.matches;
	}

	async function createCandidate(payload) {
		let res;
		if (parsedResumeAttachmentFile) {
			const formData = new FormData();
			formData.append('payload', JSON.stringify(payload));
			formData.append('file', parsedResumeAttachmentFile);

			res = await fetch('/api/candidates', {
				method: 'POST',
				body: formData
			});
		} else {
			res = await fetch('/api/candidates', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});
		}

		if (!res.ok) {
			const data = await res.json().catch(() => ({}));
			throw new Error(data.error || 'Failed to save candidate.');
		}

		return res.json();
	}

	function buildCandidatePayload() {
		return {
			...form,
			parsedFromResume,
			parsedSkillNames: parsedFromResume ? parsedSkillNames : undefined,
			educationRecords: parsedFromResume ? parsedEducationRecords : undefined,
			workExperienceRecords: parsedFromResume ? parsedWorkExperienceRecords : undefined
		};
	}

	async function getActiveUserForOwner() {
		if (actingUser) {
			return actingUser;
		}

		const res = await fetch('/api/session/acting-user');
		if (!res.ok) return null;
		const data = await res.json().catch(() => ({ user: null }));
		const user = data?.user || null;
		if (user) {
			setActingUser(user);
		}
		return user;
	}

	async function mergeIntoCandidate(id, payload) {
		const res = await fetch(`/api/candidates/${id}/merge`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});

		if (!res.ok) {
			const data = await res.json().catch(() => ({}));
			throw new Error(data.error || 'Failed to merge into existing candidate.');
		}

		const data = await res.json();
		return data?.candidate || null;
	}

	async function maybeAttachParsedResume(candidateId) {
		if (!parsedFromResume || !parsedResumeAttachmentFile) return;

		const attachmentFormData = new FormData();
		attachmentFormData.append('file', parsedResumeAttachmentFile);

		const attachmentRes = await fetch(`/api/candidates/${candidateId}/files`, {
			method: 'POST',
			body: attachmentFormData
		});

		if (!attachmentRes.ok) {
			const data = await attachmentRes.json().catch(() => ({}));
			throw new Error(data.error || 'Failed to attach parsed resume file.');
		}
	}

	async function onManualSubmit(e) {
		e.preventDefault();
		setError('');
		if (!canSaveCandidate) {
			setError(requiredFieldsMessage);
			return;
		}
		setSaving(true);

		try {
			const matches = await findDuplicateMatches(form);
			if (matches.length > 0) {
				setDuplicateMatches(matches);
				setSaving(false);
				return;
			}

			const candidate = await createCandidate(buildCandidatePayload());
			router.push(`/candidates/${candidate.id}`);
		} catch (submitError) {
			setSaving(false);
			setError(submitError.message);
		}
	}

	async function onCreateNewAnyway() {
		setError('');
		if (!canSaveCandidate) {
			setError(requiredFieldsMessage);
			return;
		}
		setSaving(true);

		try {
			const candidate = await createCandidate(buildCandidatePayload());
			router.push(`/candidates/${candidate.id}`);
		} catch (submitError) {
			setSaving(false);
			setError(submitError.message);
		}
	}

	async function onUpdateExisting(candidateId) {
		setError('');
		if (!canSaveCandidate) {
			setError(requiredFieldsMessage);
			return;
		}
		setSaving(true);

		try {
			await mergeIntoCandidate(candidateId, buildCandidatePayload());
			try {
				await maybeAttachParsedResume(candidateId);
				router.push(`/candidates/${candidateId}?merged=1`);
			} catch {
				router.push(`/candidates/${candidateId}?merged=1&attachmentUpload=failed`);
			}
		} catch (submitError) {
			setSaving(false);
			setError(submitError.message);
		}
	}

	async function onParseResumeSubmit(e) {
		e.preventDefault();
		setParseState({ parsing: true, error: '', success: '', warnings: [] });
		setError('');

		let res;
		if (resumeInputMode === 'file') {
			if (!resumeFile) {
				setParseState({
					parsing: false,
					error: 'Upload a resume file.',
					success: '',
					warnings: []
				});
				return;
			}

			const formData = new FormData();
			formData.append('file', resumeFile);
			res = await fetch('/api/candidates/parse-resume', {
				method: 'POST',
				body: formData
			});
		} else if (resumeInputMode === 'text') {
			if (!resumeText.trim()) {
				setParseState({
					parsing: false,
					error: 'Paste resume text to parse.',
					success: '',
					warnings: []
				});
				return;
			}

			res = await fetch('/api/candidates/parse-resume', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ resumeText })
			});
		} else {
			setParseState({
				parsing: false,
				error: 'Upload a resume file or paste resume text.',
				success: '',
				warnings: []
			});
			return;
		}

		const data = await res.json().catch(() => ({}));
		if (!res.ok) {
			setParseState({ parsing: false, error: data.error || 'Could not parse resume.', success: '', warnings: [] });
			return;
		}

		const activeUser = await getActiveUserForOwner();
		const activeUserCanEditParsedOwner =
			activeUser?.role === 'ADMINISTRATOR' || activeUser?.role === 'DIRECTOR';
		const shouldLockOwner = Boolean(activeUser?.id) && !activeUserCanEditParsedOwner;
		const draftForm = toForm(data.draft || {});
		const combinedParsedSkills = uniqueStrings([
			...(Array.isArray(data.parsedSkills) ? data.parsedSkills : []),
			...String(data.draft?.skillSet || '').split(/[,;\n|/]+/)
		]);
		const parsedSkillMapping = mapParsedSkillsToForm(combinedParsedSkills, skills);
		const nextEducationRecords = Array.isArray(data.educationRecords) ? data.educationRecords : [];
		const nextWorkExperienceRecords = Array.isArray(data.workExperienceRecords)
			? data.workExperienceRecords
			: [];

		setForm((current) => ({
			...current,
			...draftForm,
			source: normalizeCandidateSourceValue(data.draft?.source),
			divisionId:
				draftForm.divisionId ||
				(activeUser?.divisionId ? String(activeUser.divisionId) : '') ||
				current.divisionId,
			ownerId: activeUser?.id ? String(activeUser.id) : draftForm.ownerId || current.ownerId,
			skillIds:
				parsedSkillMapping.matchedSkillIds.length > 0
					? parsedSkillMapping.matchedSkillIds
					: draftForm.skillIds,
			skillSet: parsedSkillMapping.otherSkills || draftForm.skillSet || ''
		}));
		setOwnerLockedForParsedDraft(shouldLockOwner);
		setParsedFromResume(true);
		setParsedSkillNames(parsedSkillMapping.parsedSkillNames);
		setParsedEducationRecords(nextEducationRecords);
		setParsedWorkExperienceRecords(nextWorkExperienceRecords);
		setParsedResumeAttachmentFile(data.meta?.input === 'file' ? resumeFile : null);
		setMethod('manual');
		setDuplicateMatches([]);
		setParseState({
			parsing: false,
			error: '',
			success:
				data.meta?.input === 'file'
					? `Parsed ${data.meta?.fileName || 'file'} into a draft candidate. Review fields, then save.`
					: 'Resume text parsed into a draft candidate. Review fields, then save.',
			warnings: Array.isArray(data.warnings) ? data.warnings : []
		});
	}

	return (
		<section className="module-page">
			<header className="module-header">
				<div>
					<Link href="/candidates" className="module-back-link" aria-label="Back to List">&larr; Back</Link>
					<h2>New Candidate</h2>
					<p>Create candidates manually or via resume parse.</p>
				</div>
			</header>


			<article className="panel panel-narrow">
				<div className="method-tabs" role="tablist" aria-label="Candidate creation methods">
					<button
						type="button"
						className={method === 'manual' ? 'method-tab active' : 'method-tab'}
						onClick={() => setMethod('manual')}
					>
						Manual
					</button>
					<button
						type="button"
						className={method === 'resume' ? 'method-tab active' : 'method-tab'}
						onClick={() => {
							setMethod('resume');
							setOwnerLockedForParsedDraft(false);
							setParsedFromResume(false);
							setParsedSkillNames([]);
							setParsedEducationRecords([]);
							setParsedWorkExperienceRecords([]);
							setParsedResumeAttachmentFile(null);
						}}
					>
						Resume Parse
					</button>
				</div>

				{method === 'manual' ? (
					<div className="method-content">
						<h3>Create Candidate</h3>
						<p className="panel-subtext">Use this for one-by-one candidate entry and edits.</p>
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
									placeholder="name@email.com"
									type="email"
									value={form.email}
									onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
									required
								/>
							</FormField>
							{emailError ? <p className="panel-subtext error">{emailError}</p> : null}
							<FormField label="Mobile" required>
								<PhoneInput
									placeholder="(555) 555-5555"
									value={form.mobile}
									onChange={(mobile) => setForm((f) => ({ ...f, mobile }))}
									required
								/>
							</FormField>
							<div className="form-grid-2">
								<FormField label="Stage" required>
									<select
										value={form.status}
										onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
										required
									>
										{CANDIDATE_STATUS_OPTIONS.map((option) => (
											<option key={option.value} value={option.value}>
												{option.label}
											</option>
										))}
									</select>
								</FormField>
								<FormField label="Source" required>
									<select
										value={form.source}
										onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))}
										required
									>
										<option value="">Select source</option>
										{CANDIDATE_SOURCE_OPTIONS.map((option) => (
											<option key={option.value} value={option.value}>
												{option.label}
											</option>
										))}
									</select>
								</FormField>
							</div>
							{isAdmin ? (
								<div className="form-grid-2">
									<FormField label="Division" required>
										<LookupTypeaheadSelect
											entity="divisions"
											lookupParams={{}}
											value={form.divisionId}
											onChange={(nextValue) =>
												setForm((f) => ({
													...f,
													divisionId: nextValue,
													ownerId: ownerLockedForParsedDraft ? f.ownerId : ''
												}))
											}
											placeholder="Search division"
											label="Division"
											emptyLabel="No matching divisions."
										/>
									</FormField>
									<FormField
										label="Owner"
										required
										hint={ownerLockedForParsedDraft ? 'Locked to current user for parsed resumes' : ''}
									>
										<LookupTypeaheadSelect
											entity="users"
											lookupParams={form.divisionId ? { divisionId: form.divisionId } : {}}
											value={form.ownerId}
											onChange={(nextValue) => setForm((f) => ({ ...f, ownerId: nextValue }))}
											placeholder={
												ownerLockedForParsedDraft
													? 'Owner locked'
													: !form.divisionId
														? 'Select division first'
														: 'Search owner'
											}
											label="Owner"
											disabled={ownerLockedForParsedDraft || !form.divisionId}
											emptyLabel="No matching users."
										/>
									</FormField>
								</div>
							) : (
								<FormField
									label="Owner"
									required
									hint={ownerLockedForParsedDraft ? 'Locked to current user for parsed resumes' : ''}
								>
									<LookupTypeaheadSelect
										entity="users"
										lookupParams={{}}
										value={form.ownerId}
										onChange={(nextValue) => setForm((f) => ({ ...f, ownerId: nextValue }))}
										placeholder={ownerLockedForParsedDraft ? 'Owner locked' : 'Search owner'}
										label="Owner"
										disabled={ownerLockedForParsedDraft}
										emptyLabel="No matching users."
									/>
								</FormField>
							)}
							<div className="form-grid-2">
								<FormField label="Current Job Title" required>
									<input
										value={form.currentJobTitle}
										onChange={(e) => setForm((f) => ({ ...f, currentJobTitle: e.target.value }))}
										required
									/>
								</FormField>
								<FormField label="Current Employer" required>
									<input
										value={form.currentEmployer}
										onChange={(e) => setForm((f) => ({ ...f, currentEmployer: e.target.value }))}
										required
									/>
								</FormField>
							</div>
							<FormField label="Address">
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
											addressPlaceId: details?.placeId || '',
											addressLatitude: details?.latitude ?? '',
											addressLongitude: details?.longitude ?? '',
											city: details?.city ?? f.city,
											state: details?.state ?? f.state,
											zipCode: details?.postalCode ?? f.zipCode
										}))
									}
									placeholder="Search address or enter manually"
									label="Address"
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
								<FormField label="Zip Code">
									<input
										value={form.zipCode}
										onChange={(e) => setForm((f) => ({ ...f, zipCode: e.target.value }))}
									/>
								</FormField>
							</div>
							<div className="form-grid-2">
								<FormField label="Website">
									<input
										type="url"
										placeholder="https://example.com"
										value={form.website}
										onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
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
							{websiteError ? <p className="panel-subtext error">{websiteError}</p> : null}
							{linkedinUrlError ? <p className="panel-subtext error">{linkedinUrlError}</p> : null}
							<FormField label="Skills">
								<SkillChipSelect
									options={skillOptions}
									values={form.skillIds || []}
									onChange={(nextSkillIds) => {
										setForm((f) => ({ ...f, skillIds: nextSkillIds }));
										setParsedSkillNames([]);
									}}
									placeholder="Type to search and add a skill"
								/>
							</FormField>
							<FormField label="Other Skills">
								<input
									value={form.skillSet}
									onChange={(e) => {
										setForm((f) => ({ ...f, skillSet: e.target.value }));
										setParsedSkillNames([]);
									}}
								/>
							</FormField>
							<section className="form-section">
								<h4>Resume</h4>
								<textarea
									rows={8}
									aria-label="Resume"
									value={form.summary}
									onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
								/>
							</section>
							<button type="submit" disabled={saving || !canSaveCandidate}>
								{saving ? 'Saving...' : 'Save Candidate'}
							</button>
						</form>

						{duplicateMatches.length > 0 ? (
							<div className="inline-note">
								<p>
									Potential duplicate candidates found. Merge into an existing record or create new.
								</p>
								<ul className="simple-list">
									{duplicateMatches.map((candidate) => (
										<li key={candidate.id}>
											<div>
												<strong>
													{candidate.firstName} {candidate.lastName}
												</strong>
												<p>
													{candidate.email || '-'} | {candidate.mobile || candidate.phone || '-'}
												</p>
												<p>
													Reasons: {(candidate.matchReasons || []).join(', ') || '-'}
												</p>
												<p>Updated: {formatDate(candidate.updatedAt)}</p>
											</div>
											<div className="form-actions">
												<button
													type="button"
													className="btn-secondary btn-compact"
													onClick={() => onUpdateExisting(candidate.id)}
													disabled={saving || !canSaveCandidate}
												>
													Merge Into Existing
												</button>
											</div>
										</li>
									))}
								</ul>
								<div className="form-actions duplicate-footer-actions">
									<button
										type="button"
										onClick={onCreateNewAnyway}
										disabled={saving || !canSaveCandidate}
									>
										Create New Anyway
									</button>
									<button
										type="button"
										className="btn-secondary"
										onClick={() => setDuplicateMatches([])}
										disabled={saving}
									>
										Dismiss
									</button>
								</div>
							</div>
						) : null}
					</div>
				) : null}

					{method === 'resume' ? (
						<div className="method-content">
							<h3>Parse Resume to Draft</h3>
							<p className="panel-subtext">
								Choose file upload or copy/paste. We will extract fields into a draft.
							</p>
							<form onSubmit={onParseResumeSubmit}>
								<div className="input-mode-tabs" role="tablist" aria-label="Resume input methods">
									<button
										type="button"
										className={resumeInputMode === 'file' ? 'input-mode-tab active' : 'input-mode-tab'}
										onClick={() => setResumeInputMode('file')}
									>
										Upload File
									</button>
									<button
										type="button"
										className={resumeInputMode === 'text' ? 'input-mode-tab active' : 'input-mode-tab'}
										onClick={() => setResumeInputMode('text')}
									>
										Paste Text
									</button>
								</div>
								{resumeInputMode === 'file' ? (
									<>
										<FormField label="Resume File">
											<input
												type="file"
												accept={resumeUploadAcceptString()}
												onChange={(e) => {
													const file = e.target.files?.[0] || null;
													if (file && !isAllowedResumeUploadFileName(file.name || '')) {
														setResumeFile(null);
														setParseState((current) => ({
															...current,
															error: 'Unsupported resume file type. Use PDF, DOC, or DOCX.',
															success: '',
															warnings: []
														}));
														return;
													}
													if (file && file.size > RESUME_UPLOAD_MAX_BYTES) {
														setResumeFile(null);
														setParseState((current) => ({
															...current,
															error: `Resume exceeds ${Math.floor(RESUME_UPLOAD_MAX_BYTES / (1024 * 1024))} MB limit.`,
															success: '',
															warnings: []
														}));
														return;
													}
													setResumeFile(file);
												}}
											/>
										</FormField>
										{resumeFile ? (
											<div className="form-actions resume-file-selection">
												<small className="resume-file-selection-name">Selected file: {resumeFile.name}</small>
												<button
													type="button"
													className="btn-secondary"
													onClick={() => {
														setResumeFile(null);
														setParsedResumeAttachmentFile(null);
													}}
												>
													Remove File
												</button>
											</div>
										) : null}
									</>
								) : null}
								{resumeInputMode === 'text' ? (
									<FormField label="Resume Text">
										<textarea
											placeholder="Paste resume text"
											value={resumeText}
											onChange={(e) => setResumeText(e.target.value)}
										/>
									</FormField>
								) : null}
								<button type="submit" disabled={parseState.parsing}>
									{parseState.parsing ? 'Parsing...' : 'Parse Resume'}
								</button>
							</form>
						{parseState.warnings.length > 0 ? (
							<div className="inline-note">
								<p>Parser warnings:</p>
								<ul>
									{parseState.warnings.map((warning, index) => (
										<li key={`${warning}-${index}`}>{warning}</li>
									))}
								</ul>
							</div>
						) : null}
					</div>
				) : null}

			</article>

		</section>
	);
}

export default function NewCandidatePage() {
	return (
		<Suspense
			fallback={
				<section className="module-page">
					<p>Loading candidate setup...</p>
				</section>
			}
		>
			<NewCandidatePageContent />
		</Suspense>
	);
}
