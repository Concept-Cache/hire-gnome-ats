'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BriefcaseBusiness, Building2, MapPin } from 'lucide-react';
import { useToast } from '@/app/components/toast-provider';
import { formatPhoneInput } from '@/lib/phone';
import { isValidOptionalHttpUrl } from '@/lib/url-validation';
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
	zipCode: '',
	currentJobTitle: '',
	currentEmployer: '',
	linkedinUrl: '',
	faxNumber: ''
};

const CAREER_APPLY_SESSION_KEY = 'careerQuickApplyForm';

function toStoredFormValue(value) {
	return {
		firstName: String(value?.firstName || ''),
		lastName: String(value?.lastName || ''),
		email: String(value?.email || ''),
		mobile: String(value?.mobile || ''),
		zipCode: String(value?.zipCode || ''),
		currentJobTitle: String(value?.currentJobTitle || ''),
		currentEmployer: String(value?.currentEmployer || ''),
		linkedinUrl: String(value?.linkedinUrl || ''),
		faxNumber: ''
	};
}

function loadStoredApplyForm() {
	if (typeof window === 'undefined') {
		return initialForm;
	}

	try {
		const raw = window.sessionStorage.getItem(CAREER_APPLY_SESSION_KEY);
		if (!raw) return initialForm;
		return {
			...initialForm,
			...toStoredFormValue(JSON.parse(raw))
		};
	} catch {
		return initialForm;
	}
}

function formatCurrencyRange(min, max, currency = 'USD') {
	const hasMin = Number.isFinite(Number(min));
	const hasMax = Number.isFinite(Number(max));
	if (!hasMin && !hasMax) return 'Compensation discussed during interview.';

	const formatter = new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: currency === 'CAD' ? 'CAD' : 'USD',
		maximumFractionDigits: 0
	});

	if (hasMin && hasMax) {
		return `${formatter.format(Number(min))} - ${formatter.format(Number(max))}`;
	}
	if (hasMin) return `${formatter.format(Number(min))}+`;
	return `Up to ${formatter.format(Number(max))}`;
}

function formatDate(value) {
	if (!value) return '-';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return '-';
	return date.toLocaleDateString(undefined, {
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	});
}

export default function CareerJobDetailClient({ job }) {
	const toast = useToast();
	const [form, setForm] = useState(loadStoredApplyForm);
	const [startedAtMs, setStartedAtMs] = useState(() => String(Date.now()));
	const [resumeFile, setResumeFile] = useState(null);
	const [resumeInputKey, setResumeInputKey] = useState(0);
	const [submitState, setSubmitState] = useState({ submitting: false });
	const hasValidLinkedinUrl = isValidOptionalHttpUrl(form.linkedinUrl);

	const canSubmit = useMemo(
		() =>
			Boolean(
				form.firstName.trim() &&
					form.lastName.trim() &&
					form.email.trim() &&
					form.mobile.trim() &&
					form.zipCode.trim() &&
					form.currentJobTitle.trim() &&
					form.currentEmployer.trim() &&
					resumeFile
			),
		[form, resumeFile]
	);

	useEffect(() => {
		if (typeof window === 'undefined') return;
		try {
			window.sessionStorage.setItem(
				CAREER_APPLY_SESSION_KEY,
				JSON.stringify(toStoredFormValue(form))
			);
		} catch {
			// Ignore sessionStorage failures and keep the form usable.
		}
	}, [
		form.currentEmployer,
		form.currentJobTitle,
		form.email,
		form.firstName,
		form.lastName,
		form.linkedinUrl,
		form.mobile,
		form.zipCode
	]);

	async function onSubmit(event) {
		event.preventDefault();
		if (submitState.submitting) return;
		if (!canSubmit) {
			toast.error('Complete all required fields and upload your resume before submitting.');
			return;
		}
		if (form.linkedinUrl.trim() && !hasValidLinkedinUrl) {
			toast.error('Enter a valid LinkedIn URL, including http:// or https://.');
			return;
		}
		if (!resumeFile || !isAllowedResumeUploadFileName(resumeFile.name || '')) {
			toast.error('Unsupported resume file type. Use PDF, DOC, or DOCX.');
			return;
		}
		if (resumeFile.size > RESUME_UPLOAD_MAX_BYTES) {
			toast.error(`Resume exceeds ${Math.floor(RESUME_UPLOAD_MAX_BYTES / (1024 * 1024))} MB limit.`);
			return;
		}

		setSubmitState({ submitting: true });
		try {
			const payload = new FormData();
			payload.set('firstName', form.firstName);
			payload.set('lastName', form.lastName);
			payload.set('email', form.email);
			payload.set('mobile', form.mobile);
			payload.set('zipCode', form.zipCode);
			payload.set('currentJobTitle', form.currentJobTitle);
			payload.set('currentEmployer', form.currentEmployer);
			payload.set('linkedinUrl', form.linkedinUrl);
			payload.set('faxNumber', form.faxNumber);
			payload.set('startedAtMs', startedAtMs);
			if (resumeFile) {
				payload.set('resumeFile', resumeFile);
			}

			const res = await fetch(`/api/careers/jobs/${job.id}/apply`, {
				method: 'POST',
				body: payload
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error(data.error || 'Application could not be submitted. Please try again.');
				setSubmitState({ submitting: false });
				return;
			}

			toast.success(data.message || 'Application submitted successfully.');
			setSubmitState({ submitting: false });
			setStartedAtMs(String(Date.now()));
			setResumeFile(null);
			setResumeInputKey((current) => current + 1);
			setForm((current) => ({ ...current, faxNumber: '' }));
		} catch {
			toast.error('Application could not be submitted. Please try again.');
			setSubmitState({ submitting: false });
		}
	}

	return (
		<section className="career-detail-page">
			<header className="career-detail-top">
				<Link href="/careers" className="career-back-link">
					<ArrowLeft aria-hidden="true" />
					<span>Back to open roles</span>
				</Link>
			</header>

			<div className="career-detail-layout">
				<article className="career-detail-main">
					<div className="career-detail-hero">
						<p className="careers-eyebrow">Now hiring</p>
						<h1>{job.title}</h1>
						<div className="career-detail-meta">
							<p>
								<Building2 aria-hidden="true" />
								<span>{job.client?.name || 'Confidential Client'}</span>
							</p>
							<p>
								<MapPin aria-hidden="true" />
								<span>{job.location || 'Location flexible'}</span>
							</p>
							<p>
								<BriefcaseBusiness aria-hidden="true" />
								<span>{job.employmentType || 'Role type to be discussed'}</span>
							</p>
						</div>
						<div className="career-detail-highlights">
							<p>
								<span>Compensation</span>
								<strong>{formatCurrencyRange(job.salaryMin, job.salaryMax, job.currency)}</strong>
							</p>
							<p>
								<span>Posted</span>
								<strong>{formatDate(job.publishedAt || job.openedAt)}</strong>
							</p>
						</div>
					</div>

					<div
						className="career-detail-description"
						dangerouslySetInnerHTML={{
							__html:
								job.publicDescription ||
								'<p>Full role details are available during the interview process.</p>'
						}}
					/>
				</article>

				<aside className="career-apply-card">
					<h2>Quick Apply</h2>
					<p>Submit your profile and we will connect with you if your background aligns.</p>
					<form onSubmit={onSubmit} className="career-apply-form">
						<p className="career-apply-helper">
							Your contact details stay in this browser session so you can apply to multiple roles faster.
						</p>
						<div className="career-apply-grid-2">
							<label>
								<span>First Name *</span>
								<input
									value={form.firstName}
									onChange={(event) =>
										setForm((current) => ({ ...current, firstName: event.target.value }))
									}
									required
								/>
							</label>
							<label>
								<span>Last Name *</span>
								<input
									value={form.lastName}
									onChange={(event) =>
										setForm((current) => ({ ...current, lastName: event.target.value }))
									}
									required
								/>
							</label>
						</div>

						<label>
							<span>Email *</span>
							<input
								type="email"
								value={form.email}
								onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
								required
							/>
						</label>

						<div className="career-apply-grid-2">
							<label>
								<span>Mobile *</span>
								<input
									type="tel"
									inputMode="numeric"
									autoComplete="tel"
									value={form.mobile}
									onChange={(event) =>
										setForm((current) => ({
											...current,
											mobile: formatPhoneInput(event.target.value)
										}))
									}
									required
								/>
							</label>
							<label>
								<span>Zip Code *</span>
								<input
									inputMode="numeric"
									value={form.zipCode}
									onChange={(event) => setForm((current) => ({ ...current, zipCode: event.target.value }))}
									required
								/>
							</label>
						</div>

						<div className="career-apply-grid-2">
							<label>
								<span>Current Title *</span>
								<input
									value={form.currentJobTitle}
									onChange={(event) =>
										setForm((current) => ({ ...current, currentJobTitle: event.target.value }))
									}
									required
								/>
							</label>
							<label>
								<span>Current Employer *</span>
								<input
									value={form.currentEmployer}
									onChange={(event) =>
										setForm((current) => ({ ...current, currentEmployer: event.target.value }))
									}
									required
								/>
							</label>
						</div>

						<label>
							<span>LinkedIn URL</span>
							<input
								type="url"
								value={form.linkedinUrl}
								onChange={(event) => setForm((current) => ({ ...current, linkedinUrl: event.target.value }))}
							/>
						</label>

						<label>
							<span>Resume File (PDF, DOC, DOCX) *</span>
							<input
								key={resumeInputKey}
								type="file"
								accept={resumeUploadAcceptString()}
								required
								onChange={(event) => {
									const file = event.target.files?.[0] || null;
									if (file && !isAllowedResumeUploadFileName(file.name || '')) {
										toast.error('Unsupported resume file type. Use PDF, DOC, or DOCX.');
										setResumeFile(null);
										setResumeInputKey((current) => current + 1);
										return;
									}
									if (file && file.size > RESUME_UPLOAD_MAX_BYTES) {
										toast.error(`Resume exceeds ${Math.floor(RESUME_UPLOAD_MAX_BYTES / (1024 * 1024))} MB limit.`);
										setResumeFile(null);
										setResumeInputKey((current) => current + 1);
										return;
									}
									setResumeFile(file);
								}}
							/>
						</label>
						{resumeFile ? <p className="career-apply-file-name">Selected: {resumeFile.name}</p> : null}
						<label className="career-honeypot-field" aria-hidden="true">
							<span>Fax Number</span>
							<input
								tabIndex={-1}
								autoComplete="off"
								value={form.faxNumber}
								onChange={(event) =>
									setForm((current) => ({ ...current, faxNumber: event.target.value }))
								}
							/>
						</label>
						<input type="hidden" name="startedAtMs" value={startedAtMs} readOnly />

						<button type="submit" disabled={!canSubmit || submitState.submitting}>
							{submitState.submitting ? 'Submitting...' : 'Submit Application'}
						</button>
					</form>
				</aside>
			</div>
		</section>
	);
}
