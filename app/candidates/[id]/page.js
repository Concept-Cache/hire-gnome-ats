'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Download, LoaderCircle, MoreVertical, RefreshCcw, Trash2 } from 'lucide-react';
import LookupTypeaheadSelect from '@/app/components/lookup-typeahead-select';
import PhoneInput from '@/app/components/phone-input';
import AddressTypeaheadInput from '@/app/components/address-typeahead-input';
import FormField from '@/app/components/form-field';
import LoadingIndicator from '@/app/components/loading-indicator';
import SkillChipSelect from '@/app/components/skill-chip-select';
import ListSortControls from '@/app/components/list-sort-controls';
import AuditTrailPanel from '@/app/components/audit-trail-panel';
import { useToast } from '@/app/components/toast-provider';
import { useConfirmDialog } from '@/app/components/confirm-dialog';
import {
	CANDIDATE_SOURCE_OPTIONS,
	normalizeCandidateSourceValue
} from '@/app/constants/candidate-source-options';
import useUnsavedChangesGuard from '@/app/hooks/use-unsaved-changes-guard';
import { candidateAttachmentAcceptString } from '@/lib/candidate-attachment-options';
import { formatDateTimeAt } from '@/lib/date-format';
import { isValidEmailAddress } from '@/lib/email-validation';
import { formatSelectValueLabel } from '@/lib/select-value-label';
import { sortByConfig } from '@/lib/list-sort';
import { submissionCreatedByLabel } from '@/lib/submission-origin';
import { isValidOptionalHttpUrl } from '@/lib/url-validation';
import { CANDIDATE_STATUS_OPTIONS, isCandidateQualifiedForPipeline } from '@/lib/candidate-status';

const initialActivity = {
	type: 'call',
	subject: '',
	description: '',
	dueAt: '',
	status: 'open'
};

const initialEducationForm = {
	schoolName: '',
	degree: '',
	fieldOfStudy: '',
	startDate: '',
	endDate: '',
	isCurrent: false,
	description: ''
};

const initialWorkExperienceForm = {
	companyName: '',
	title: '',
	location: '',
	startDate: '',
	endDate: '',
	isCurrent: false,
	description: ''
};

const initialEditForm = {
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
	stageChangeReason: '',
	summary: ''
};

function normalizeSkillKey(value) {
	return String(value || '')
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '');
}

function uniqueSkillNames(values) {
	const seen = new Set();
	const result = [];

	for (const rawValue of values) {
		const value = String(rawValue || '').trim();
		if (!value) continue;
		const key = normalizeSkillKey(value);
		if (!key || seen.has(key)) continue;
		seen.add(key);
		result.push(value);
	}

	return result;
}

function sanitizeOtherSkillSet(skillSetValue, row, availableSkills = []) {
	const otherSkills = uniqueSkillNames(String(skillSetValue || '').split(/[,;\n|/]+/));
	if (otherSkills.length === 0) return '';

	const knownSkills = uniqueSkillNames([
		...availableSkills.filter((skill) => skill?.isActive).map((skill) => skill?.name),
		...(Array.isArray(row?.candidateSkills)
			? row.candidateSkills.map((candidateSkill) => candidateSkill?.skill?.name)
			: [])
	]);
	if (knownSkills.length === 0) {
		return otherSkills.join(', ');
	}

	const knownKeys = new Set(knownSkills.map((skillName) => normalizeSkillKey(skillName)));
	const filteredOtherSkills = otherSkills.filter(
		(skillName) => !knownKeys.has(normalizeSkillKey(skillName))
	);
	return filteredOtherSkills.join(', ');
}

function toForm(row, availableSkills = []) {
	if (!row) return initialEditForm;

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
			skillSet: sanitizeOtherSkillSet(row.skillSet, row, availableSkills),
			stageChangeReason: '',
			summary: row.summary || ''
	};
}

function formatDate(value) {
	return formatDateTimeAt(value);
}

function formatFileSize(bytes) {
	const value = Number(bytes);
	if (!Number.isFinite(value) || value <= 0) return '-';
	if (value < 1024) return `${value} B`;
	if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
	return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateOnly(value) {
	if (!value) return '';
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return '';
	return date.toLocaleDateString();
}

function formatDateRange(startDate, endDate, isCurrent) {
	const start = formatDateOnly(startDate) || 'Start n/a';
	const end = isCurrent ? 'Present' : formatDateOnly(endDate) || 'End n/a';
	return `${start} - ${end}`;
}

export default function CandidateDetailsPage() {
	const { id } = useParams();
	const router = useRouter();
	const searchParams = useSearchParams();
	const [actingUser, setActingUser] = useState(null);
	const [candidate, setCandidate] = useState(null);
	const [skills, setSkills] = useState([]);
	const [editForm, setEditForm] = useState(initialEditForm);
	const [loading, setLoading] = useState(true);
	const [noteContent, setNoteContent] = useState('');
	const [activityForm, setActivityForm] = useState(initialActivity);
	const [educationForm, setEducationForm] = useState(initialEducationForm);
	const [workExperienceForm, setWorkExperienceForm] = useState(initialWorkExperienceForm);
	const [error, setError] = useState('');
	const [saveState, setSaveState] = useState({ saving: false, error: '', success: '' });
	const [noteState, setNoteState] = useState({ saving: false, error: '' });
	const [activityState, setActivityState] = useState({ saving: false, error: '' });
	const [educationState, setEducationState] = useState({ saving: false, deletingId: null, error: '' });
	const [workExperienceState, setWorkExperienceState] = useState({
		saving: false,
		deletingId: null,
		error: ''
	});
	const [attachmentState, setAttachmentState] = useState({
		uploading: false,
		deletingId: null,
		error: '',
		success: ''
	});
	const [attachmentFile, setAttachmentFile] = useState(null);
	const [attachmentInputKey, setAttachmentInputKey] = useState(0);
	const [workspaceTab, setWorkspaceTab] = useState('notes');
	const [detailsPanelHeight, setDetailsPanelHeight] = useState(0);
	const [notesSort, setNotesSort] = useState({ field: 'createdAt', direction: 'desc' });
	const [activitiesSort, setActivitiesSort] = useState({ field: 'createdAt', direction: 'desc' });
	const [submissionsSort, setSubmissionsSort] = useState({ field: 'createdAt', direction: 'desc' });
	const [filesSort, setFilesSort] = useState({ field: 'createdAt', direction: 'desc' });
	const [educationSort, setEducationSort] = useState({ field: 'startDate', direction: 'desc' });
	const [workSort, setWorkSort] = useState({ field: 'startDate', direction: 'desc' });
	const [jobMatchesSort, setJobMatchesSort] = useState({ field: 'scorePercent', direction: 'desc' });
	const [jobMatchState, setJobMatchState] = useState({
		loading: false,
		error: '',
		computedAt: '',
		totalJobOrdersEvaluated: 0,
		activeHiringJobOrders: 0,
		matches: [],
		submittingJobOrderId: ''
	});
	const detailsPanelRef = useRef(null);
	const actionsMenuRef = useRef(null);
	const [actionsOpen, setActionsOpen] = useState(false);
	const [showAuditTrail, setShowAuditTrail] = useState(false);
	const toast = useToast();
	const { requestConfirm } = useConfirmDialog();
	const { markAsClean, confirmNavigation } = useUnsavedChangesGuard(editForm, {
		enabled: !loading && Boolean(candidate)
	});

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
	const isAdmin = actingUser?.role === 'ADMINISTRATOR';
	const hasRequiredFields = Boolean(
		editForm.firstName.trim() &&
			editForm.lastName.trim() &&
			editForm.email.trim() &&
			editForm.mobile.trim() &&
			editForm.status.trim() &&
			editForm.source.trim() &&
			(!isAdmin || editForm.divisionId.trim()) &&
			editForm.ownerId.trim() &&
			editForm.currentJobTitle.trim() &&
			editForm.currentEmployer.trim()
	);
	const hasValidEmail = isValidEmailAddress(editForm.email);
	const hasValidWebsite = isValidOptionalHttpUrl(editForm.website);
	const hasValidLinkedinUrl = isValidOptionalHttpUrl(editForm.linkedinUrl);
	const statusIsChanging =
		Boolean(candidate) && String(editForm.status || '').trim() !== String(candidate?.status || '').trim();
	const hasStageChangeReason = !statusIsChanging || Boolean(editForm.stageChangeReason.trim());
	const canSaveCandidate =
		hasRequiredFields &&
		hasValidEmail &&
		hasValidWebsite &&
		hasValidLinkedinUrl &&
		hasStageChangeReason;
	const candidateQualifiedForSubmissionInterview = isCandidateQualifiedForPipeline(candidate?.status);
	const emailError =
		editForm.email.trim() && !hasValidEmail ? 'Enter a valid email address.' : '';
	const websiteError =
		editForm.website.trim() && !hasValidWebsite ? 'Enter a valid website URL, including http:// or https://.' : '';
	const linkedinUrlError =
		editForm.linkedinUrl.trim() && !hasValidLinkedinUrl
			? 'Enter a valid LinkedIn URL, including http:// or https://.'
			: '';
	const stageChangeReasonError =
		statusIsChanging && !editForm.stageChangeReason.trim()
			? 'Status change reason is required.'
			: '';

	const submissionRows = useMemo(() => {
		if (!candidate) return [];

		return candidate.submissions.map((submission) => ({
			id: submission.id,
			jobOrder: submission.jobOrder?.title || '-',
			client: submission.jobOrder?.client?.name || '-',
			status: formatSelectValueLabel(submission.status),
			createdAt: formatDate(submission.createdAt),
			createdAtRaw: submission.createdAt || '',
			createdBy: submissionCreatedByLabel(submission)
		}));
	}, [candidate]);

	const sortedNotes = useMemo(
		() =>
			sortByConfig(candidate?.notes || [], notesSort, (note, field) => {
				if (field === 'createdAt') return note.createdAt || '';
				if (field === 'author') {
					return note.createdByUser
						? `${note.createdByUser.firstName} ${note.createdByUser.lastName}`
						: '';
				}
				if (field === 'content') return note.content || '';
				return '';
			}),
		[candidate?.notes, notesSort]
	);

	const sortedActivities = useMemo(
		() =>
			sortByConfig(candidate?.activities || [], activitiesSort, (activity, field) => {
				if (field === 'createdAt') return activity.dueAt || activity.createdAt || '';
				if (field === 'subject') return activity.subject || '';
				if (field === 'status') return formatSelectValueLabel(activity.status);
				if (field === 'type') return activity.type || '';
				return '';
			}),
		[candidate?.activities, activitiesSort]
	);

	const sortedSubmissions = useMemo(
		() =>
			sortByConfig(submissionRows, submissionsSort, (submission, field) => {
				if (field === 'createdAt') return submission.createdAtRaw || '';
				if (field === 'jobOrder') return submission.jobOrder || '';
				if (field === 'client') return submission.client || '';
				if (field === 'status') return submission.status || '';
				return '';
			}),
		[submissionRows, submissionsSort]
	);

	const sortedAttachments = useMemo(
		() =>
			sortByConfig(candidate?.attachments || [], filesSort, (attachment, field) => {
				if (field === 'createdAt') return attachment.createdAt || '';
				if (field === 'fileName') return attachment.fileName || '';
				if (field === 'sizeBytes') return Number(attachment.sizeBytes || 0);
				if (field === 'uploadedBy') {
					return attachment.uploadedByUser
						? `${attachment.uploadedByUser.firstName} ${attachment.uploadedByUser.lastName}`
						: '';
				}
				return '';
			}),
		[candidate?.attachments, filesSort]
	);

	const sortedEducations = useMemo(
		() =>
			sortByConfig(candidate?.candidateEducations || [], educationSort, (education, field) => {
				if (field === 'startDate') return education.startDate || '';
				if (field === 'schoolName') return education.schoolName || '';
				if (field === 'degree') return education.degree || '';
				return '';
			}),
		[candidate?.candidateEducations, educationSort]
	);

	const sortedWorkExperiences = useMemo(
		() =>
			sortByConfig(candidate?.candidateWorkExperiences || [], workSort, (workExperience, field) => {
				if (field === 'startDate') return workExperience.startDate || '';
				if (field === 'companyName') return workExperience.companyName || '';
				if (field === 'title') return workExperience.title || '';
				return '';
			}),
		[candidate?.candidateWorkExperiences, workSort]
	);

	const sortedJobMatches = useMemo(
		() =>
			sortByConfig(jobMatchState.matches || [], jobMatchesSort, (match, field) => {
				if (field === 'scorePercent') return Number(match.scorePercent || 0);
				if (field === 'jobOrder') return match.jobOrderTitle || '';
				if (field === 'client') return match.clientName || '';
				if (field === 'location') return match.location || '';
				return '';
			}),
		[jobMatchState.matches, jobMatchesSort]
	);

	async function load() {
		setLoading(true);
		setError('');

		const [candidateRes, skillsRes] = await Promise.all([
			fetch(`/api/candidates/${id}`),
			fetch('/api/skills?active=true')
		]);
		if (!candidateRes.ok) {
			setError('Candidate not found.');
			setLoading(false);
			return;
		}

		const [candidateData, skillData] = await Promise.all([
			candidateRes.json(),
			skillsRes.ok ? skillsRes.json() : Promise.resolve([])
		]);
		const normalizedSkills = Array.isArray(skillData) ? skillData : [];
		const nextEditForm = toForm(candidateData, normalizedSkills);
		setCandidate(candidateData);
		setSkills(normalizedSkills);
		setEditForm(nextEditForm);
		markAsClean(nextEditForm);
		setLoading(false);
	}

	async function loadJobMatches(options = {}) {
		if (!id) return;
		const { keepResults = true } = options;

		setJobMatchState((current) => ({
			...current,
			loading: true,
			error: '',
			matches: keepResults ? current.matches : []
		}));

		const res = await fetch(`/api/candidates/${id}/matches?includeSubmitted=false&limit=10`);
		if (!res.ok) {
			const data = await res.json().catch(() => ({}));
			setJobMatchState((current) => ({
				...current,
				loading: false,
				error: data.error || 'Failed to load job order matches.'
			}));
			return;
		}

		const data = await res.json();
		setJobMatchState((current) => ({
			...current,
			loading: false,
			error: '',
			computedAt: data.computedAt || '',
			totalJobOrdersEvaluated: Number(data.totalJobOrdersEvaluated || 0),
			activeHiringJobOrders: Number(data.activeHiringJobOrders || 0),
			matches: Array.isArray(data.matches) ? data.matches : []
		}));
	}

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
		load();
	}, [id]);

	useEffect(() => {
		if (!candidate?.id) return;
		loadJobMatches({ keepResults: false });
	}, [candidate?.id]);

		useEffect(() => {
			const panel = detailsPanelRef.current;
			if (!panel || typeof ResizeObserver === 'undefined') return;

		const updateHeight = () => {
			setDetailsPanelHeight(panel.getBoundingClientRect().height);
		};
		updateHeight();

		const observer = new ResizeObserver(updateHeight);
		observer.observe(panel);
		return () => observer.disconnect();
		}, [candidate, editForm, saveState.saving, workspaceTab]);

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

	useEffect(() => {
		if (noteState.error) {
			toast.error(noteState.error);
		}
	}, [noteState.error, toast]);

	useEffect(() => {
		if (activityState.error) {
			toast.error(activityState.error);
		}
	}, [activityState.error, toast]);

	useEffect(() => {
		if (attachmentState.error) {
			toast.error(attachmentState.error);
		}
	}, [attachmentState.error, toast]);

	useEffect(() => {
		if (attachmentState.success) {
			toast.success(attachmentState.success);
		}
	}, [attachmentState.success, toast]);

	useEffect(() => {
		if (educationState.error) {
			toast.error(educationState.error);
		}
	}, [educationState.error, toast]);

	useEffect(() => {
		if (workExperienceState.error) {
			toast.error(workExperienceState.error);
		}
	}, [workExperienceState.error, toast]);

	useEffect(() => {
		if (jobMatchState.error) {
			toast.error(jobMatchState.error);
		}
	}, [jobMatchState.error, toast]);

	async function onAddSubmission() {
		if (!candidate) return;
		setActionsOpen(false);
		if (!candidateQualifiedForSubmissionInterview) {
			toast.error('Candidate must be Qualified or beyond before adding a submission.');
			return;
		}
		if (!(await confirmNavigation())) return;

		const query = new URLSearchParams();
		query.set('candidateId', String(candidate.id));
		router.push(`/submissions/new?${query.toString()}`);
	}

	async function onAddInterview() {
		if (!candidate) return;
		setActionsOpen(false);
		if (!candidateQualifiedForSubmissionInterview) {
			toast.error('Candidate must be Qualified or beyond before scheduling an interview.');
			return;
		}
		if (!(await confirmNavigation())) return;

		const query = new URLSearchParams();
		query.set('candidateId', String(candidate.id));
		const candidateName = `${candidate.firstName || ''} ${candidate.lastName || ''}`.trim();
		if (candidateName) {
			query.set('subject', `Interview: ${candidateName}`);
		}
		router.push(`/interviews/new?${query.toString()}`);
	}

	async function onAddPlacement() {
		if (!candidate) return;
		setActionsOpen(false);
		if (!(await confirmNavigation())) return;

		const query = new URLSearchParams();
		query.set('candidateId', String(candidate.id));
		router.push(`/placements/new?${query.toString()}`);
	}

	function onToggleAuditTrail() {
		setActionsOpen(false);
		setShowAuditTrail((current) => !current);
	}

	async function onCreateMatchedSubmission(match) {
		if (!candidate?.id || !match?.jobOrderId) return;
		if (!candidateQualifiedForSubmissionInterview) {
			setJobMatchState((current) => ({
				...current,
				error: 'Candidate must be Qualified or beyond before creating submissions.'
			}));
			return;
		}

		setJobMatchState((current) => ({
			...current,
			submittingJobOrderId: String(match.jobOrderId),
			error: ''
		}));

		const res = await fetch('/api/submissions', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				candidateId: candidate.id,
				jobOrderId: match.jobOrderId,
				status: 'submitted',
				notes: ''
			})
		});

		if (!res.ok) {
			const data = await res.json().catch(() => ({}));
			setJobMatchState((current) => ({
				...current,
				submittingJobOrderId: '',
				error: data.error || 'Failed to create submission from match.'
			}));
			return;
		}

		const createdSubmission = await res.json();
		setCandidate((current) => {
			if (!current) return current;
			const alreadyExists = current.submissions.some(
				(submission) => submission.id === createdSubmission.id
			);
			const nextSubmissions = alreadyExists
				? current.submissions
				: [createdSubmission, ...current.submissions];
			return { ...current, submissions: nextSubmissions };
		});
		setJobMatchState((current) => ({ ...current, submittingJobOrderId: '' }));
		await loadJobMatches();
	}

	async function onSaveProfile(e) {
		e.preventDefault();
		if (!canSaveCandidate) {
			setSaveState({
				saving: false,
				error:
					isAdmin
						? 'Complete required fields (First Name, Last Name, Email, Mobile, Stage, Source, Division, Owner), use valid email/URLs, and add a status change reason when changing status.'
						: 'Complete required fields (First Name, Last Name, Email, Mobile, Stage, Source, Owner), use valid email/URLs, and add a status change reason when changing status.',
				success: ''
			});
			return;
		}
		setSaveState({ saving: true, error: '', success: '' });

		const res = await fetch(`/api/candidates/${id}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(editForm)
		});

		if (!res.ok) {
			const data = await res.json().catch(() => ({}));
			setSaveState({ saving: false, error: data.error || 'Failed to save candidate.', success: '' });
			return;
		}

		const updated = await res.json();
		const nextEditForm = toForm(updated, skills);
		setCandidate((current) => (current ? { ...current, ...updated } : current));
		setEditForm(nextEditForm);
		markAsClean(nextEditForm);
		setSaveState({ saving: false, error: '', success: 'Candidate updated.' });
	}

	async function onAddNote(e) {
		e.preventDefault();
		if (!noteContent.trim()) return;
		setNoteState({ saving: true, error: '' });

		try {
			const res = await fetch(`/api/candidates/${id}/notes`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ content: noteContent })
			});

			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				setNoteState({ saving: false, error: data.error || 'Failed to save note.' });
				return;
			}

			setNoteContent('');
			await load();
			setNoteState({ saving: false, error: '' });
		} catch {
			setNoteState({ saving: false, error: 'Failed to save note.' });
		}
	}

	async function onAddActivity(e) {
		e.preventDefault();
		setActivityState({ saving: true, error: '' });

		try {
			const res = await fetch(`/api/candidates/${id}/activities`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(activityForm)
			});

			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				setActivityState({ saving: false, error: data.error || 'Failed to save activity.' });
				return;
			}

			setActivityForm(initialActivity);
			await load();
			setActivityState({ saving: false, error: '' });
		} catch {
			setActivityState({ saving: false, error: 'Failed to save activity.' });
		}
	}

	async function onAddEducation(e) {
		e.preventDefault();
		if (!educationForm.schoolName.trim()) {
			setEducationState({ saving: false, deletingId: null, error: 'School is required.' });
			return;
		}

		setEducationState({ saving: true, deletingId: null, error: '' });
		try {
			const res = await fetch(`/api/candidates/${id}/educations`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(educationForm)
			});

			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				setEducationState({
					saving: false,
					deletingId: null,
					error: data.error || 'Failed to save education.'
				});
				return;
			}

			setEducationForm(initialEducationForm);
			await load();
			setEducationState({ saving: false, deletingId: null, error: '' });
		} catch {
			setEducationState({ saving: false, deletingId: null, error: 'Failed to save education.' });
		}
	}

	async function onDeleteEducation(education) {
		if (!education) return;
		const confirmed = await requestConfirm({
			message: `Delete education record for "${education.schoolName}"?`,
			confirmLabel: 'Delete',
			cancelLabel: 'Keep',
			isDanger: true
		});
		if (!confirmed) return;

		setEducationState({ saving: false, deletingId: education.id, error: '' });
		try {
			const res = await fetch(`/api/candidates/${id}/educations/${education.id}`, {
				method: 'DELETE'
			});

			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				setEducationState({
					saving: false,
					deletingId: null,
					error: data.error || 'Failed to delete education.'
				});
				return;
			}

			await load();
			setEducationState({ saving: false, deletingId: null, error: '' });
		} catch {
			setEducationState({ saving: false, deletingId: null, error: 'Failed to delete education.' });
		}
	}

	async function onAddWorkExperience(e) {
		e.preventDefault();
		if (!workExperienceForm.companyName.trim()) {
			setWorkExperienceState({ saving: false, deletingId: null, error: 'Company is required.' });
			return;
		}

		setWorkExperienceState({ saving: true, deletingId: null, error: '' });
		try {
			const res = await fetch(`/api/candidates/${id}/work-experiences`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(workExperienceForm)
			});

			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				setWorkExperienceState({
					saving: false,
					deletingId: null,
					error: data.error || 'Failed to save work experience.'
				});
				return;
			}

			setWorkExperienceForm(initialWorkExperienceForm);
			await load();
			setWorkExperienceState({ saving: false, deletingId: null, error: '' });
		} catch {
			setWorkExperienceState({ saving: false, deletingId: null, error: 'Failed to save work experience.' });
		}
	}

	async function onDeleteWorkExperience(workExperience) {
		if (!workExperience) return;
		const confirmed = await requestConfirm({
			message: `Delete work experience at "${workExperience.companyName}"?`,
			confirmLabel: 'Delete',
			cancelLabel: 'Keep',
			isDanger: true
		});
		if (!confirmed) return;

		setWorkExperienceState({ saving: false, deletingId: workExperience.id, error: '' });
		try {
			const res = await fetch(`/api/candidates/${id}/work-experiences/${workExperience.id}`, {
				method: 'DELETE'
			});

			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				setWorkExperienceState({
					saving: false,
					deletingId: null,
					error: data.error || 'Failed to delete work experience.'
				});
				return;
			}

			await load();
			setWorkExperienceState({ saving: false, deletingId: null, error: '' });
		} catch {
			setWorkExperienceState({ saving: false, deletingId: null, error: 'Failed to delete work experience.' });
		}
	}

	async function onUploadAttachment(e) {
		e.preventDefault();
		if (!attachmentFile) {
			setAttachmentState({ uploading: false, deletingId: null, error: 'Select a file to upload.', success: '' });
			return;
		}

		setAttachmentState((current) => ({ ...current, uploading: true, error: '', success: '' }));

		try {
			const formData = new FormData();
			formData.append('file', attachmentFile);

			const res = await fetch(`/api/candidates/${id}/files`, {
				method: 'POST',
				body: formData
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				setAttachmentState({
					uploading: false,
					deletingId: null,
					error: data.error || 'Failed to upload file.',
					success: ''
				});
				return;
			}

			setAttachmentFile(null);
			setAttachmentInputKey((value) => value + 1);
			await load();
			setAttachmentState({ uploading: false, deletingId: null, error: '', success: 'File uploaded.' });
		} catch {
			setAttachmentState({ uploading: false, deletingId: null, error: 'Failed to upload file.', success: '' });
		}
	}

	async function onDeleteAttachment(attachment) {
		if (!attachment) return;
		const confirmed = await requestConfirm({
			message: `Delete file "${attachment.fileName}"?`,
			confirmLabel: 'Delete',
			cancelLabel: 'Keep',
			isDanger: true
		});
		if (!confirmed) return;

		setAttachmentState((current) => ({
			...current,
			deletingId: attachment.id,
			error: '',
			success: ''
		}));

		try {
			const res = await fetch(`/api/candidates/${id}/files/${attachment.id}`, {
				method: 'DELETE'
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				setAttachmentState((current) => ({
					...current,
					deletingId: null,
					error: data.error || 'Failed to delete file.',
					success: ''
				}));
				return;
			}

			await load();
			setAttachmentState((current) => ({
				...current,
				deletingId: null,
				error: '',
				success: 'File deleted.'
			}));
		} catch {
			setAttachmentState((current) => ({
				...current,
				deletingId: null,
				error: 'Failed to delete file.',
				success: ''
			}));
		}
	}

	if (loading) {
		return (
			<section className="module-page">
				<LoadingIndicator className="page-loading-indicator" label="Loading candidate details" />
			</section>
		);
	}

	if (error || !candidate) {
		return (
			<section className="module-page">
				<p>{error || 'Candidate not found.'}</p>
				<button type="button" onClick={() => router.push('/candidates')}>
					Back to Candidates
				</button>
			</section>
		);
	}

	const workspacePanelStyle =
		detailsPanelHeight > 0 ? { height: `${detailsPanelHeight}px`, maxHeight: `${detailsPanelHeight}px` } : undefined;
	const attachmentUploadWarning = searchParams.get('attachmentUpload') === 'failed';

	return (
		<section className="module-page">
			<header className="module-header">
				<div>
					<Link href="/candidates" className="module-back-link" aria-label="Back to List">&larr; Back</Link>
					<h2>
						{candidate.firstName} {candidate.lastName}
					</h2>
					<p>
						{candidate.email} | Stage: {candidate.status}
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
								aria-label="Open candidate actions"
								title="Actions"
								>
									<span className="actions-menu-icon" aria-hidden="true">
										<MoreVertical />
									</span>
								</button>
							{actionsOpen ? (
								<div className="actions-menu-list" role="menu" aria-label="Candidate actions">
									<button
										type="button"
										role="menuitem"
										className="actions-menu-item"
										onClick={onAddSubmission}
										disabled={!candidateQualifiedForSubmissionInterview}
									>
										Add Submission
									</button>
									<button
										type="button"
										role="menuitem"
										className="actions-menu-item"
										onClick={onAddInterview}
										disabled={!candidateQualifiedForSubmissionInterview}
									>
										Add Interview
									</button>
									<button
										type="button"
										role="menuitem"
										className="actions-menu-item"
										onClick={onAddPlacement}
									>
										Add Placement
									</button>
									<button
										type="button"
										role="menuitem"
										className="actions-menu-item"
										onClick={onToggleAuditTrail}
									>
										{showAuditTrail ? 'Hide Audit Trail' : 'View Audit Trail'}
									</button>
								</div>
							) : null}
						</div>
					</div>
				</header>
			{attachmentUploadWarning ? (
				<p className="panel-subtext error">
					Candidate was created, but auto-attaching the parsed resume failed. Upload the file in Workspace {'>'} Files.
				</p>
			) : null}

			<article className="panel">
				<h3>Snapshot</h3>
				<div className="info-list snapshot-grid snapshot-grid-four">
					<p>
						<span>Record ID</span>
						<strong>{candidate.recordId || '-'}</strong>
					</p>
					<p>
						<span>Current Employer</span>
						<strong>{candidate.currentEmployer || '-'}</strong>
					</p>
					<p>
						<span>Current Job Title</span>
						<strong>{candidate.currentJobTitle || '-'}</strong>
					</p>
					<p>
						<span>Email</span>
						<strong>
							{candidate.email ? <a href={`mailto:${candidate.email}`}>{candidate.email}</a> : '-'}
						</strong>
					</p>
				</div>
			</article>

			<div className="detail-layout detail-layout-equal">
				<article className="panel panel-spacious" ref={detailsPanelRef}>
					<h3>Candidate Details</h3>
					<p className="panel-subtext">Edit profile fields and save updates.</p>
					<form onSubmit={onSaveProfile} className="detail-form">
					<section className="form-section">
						<h4>Contact</h4>
						<div className="detail-form-grid-2">
							<FormField label="First Name" required>
								<input
									value={editForm.firstName}
									onChange={(e) => setEditForm((f) => ({ ...f, firstName: e.target.value }))}
									required
								/>
							</FormField>
							<FormField label="Last Name" required>
								<input
									value={editForm.lastName}
									onChange={(e) => setEditForm((f) => ({ ...f, lastName: e.target.value }))}
									required
								/>
							</FormField>
						</div>
						<div className="detail-form-grid-2">
							<FormField label="Email" required>
								<input
									placeholder="name@email.com"
									type="email"
									value={editForm.email}
									onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))}
									required
								/>
							</FormField>
							<FormField label="Mobile" required>
								<PhoneInput
									placeholder="(555) 555-5555"
									value={editForm.mobile}
									onChange={(mobile) => setEditForm((f) => ({ ...f, mobile }))}
									required
								/>
							</FormField>
						</div>
						{emailError ? <p className="panel-subtext error">{emailError}</p> : null}
						<FormField label="Address">
							<AddressTypeaheadInput
								value={editForm.address}
								onChange={(nextValue) =>
									setEditForm((f) => ({
										...f,
										address: nextValue
									}))
								}
								onPlaceDetailsChange={(details) =>
									setEditForm((f) => ({
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
						<div className="detail-form-grid-3">
							<FormField label="City">
								<input
									value={editForm.city}
									onChange={(e) => setEditForm((f) => ({ ...f, city: e.target.value }))}
								/>
							</FormField>
							<FormField label="State">
								<input
									value={editForm.state}
									onChange={(e) => setEditForm((f) => ({ ...f, state: e.target.value }))}
								/>
							</FormField>
							<FormField label="Zip Code">
								<input
									value={editForm.zipCode}
									onChange={(e) => setEditForm((f) => ({ ...f, zipCode: e.target.value }))}
								/>
							</FormField>
						</div>
						<div className="detail-form-grid-2">
							<FormField label="Website">
								<input
									type="url"
									placeholder="https://example.com"
									value={editForm.website}
									onChange={(e) => setEditForm((f) => ({ ...f, website: e.target.value }))}
								/>
							</FormField>
							<FormField label="LinkedIn URL">
								<input
									type="url"
									placeholder="https://linkedin.com/in/..."
									value={editForm.linkedinUrl}
									onChange={(e) => setEditForm((f) => ({ ...f, linkedinUrl: e.target.value }))}
								/>
							</FormField>
						</div>
						{websiteError ? <p className="panel-subtext error">{websiteError}</p> : null}
						{linkedinUrlError ? <p className="panel-subtext error">{linkedinUrlError}</p> : null}
					</section>

					<section className="form-section">
						<h4>Pipeline</h4>
						<div className="detail-form-grid-2">
							<FormField label="Status" required>
								<select
									value={editForm.status}
									onChange={(e) => setEditForm((f) => ({ ...f, status: e.target.value }))}
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
									value={editForm.source}
									onChange={(e) => setEditForm((f) => ({ ...f, source: e.target.value }))}
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
						<div className="detail-form-grid-2">
							{isAdmin ? (
								<FormField label="Division" required>
									<LookupTypeaheadSelect
										entity="divisions"
										lookupParams={{}}
										value={editForm.divisionId}
										onChange={(nextValue) =>
											setEditForm((f) => ({
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
									lookupParams={isAdmin && editForm.divisionId ? { divisionId: editForm.divisionId } : {}}
									value={editForm.ownerId}
									onChange={(nextValue) => setEditForm((f) => ({ ...f, ownerId: nextValue }))}
									placeholder={isAdmin && !editForm.divisionId ? 'Select division first' : 'Search owner'}
									label="Owner"
									disabled={isAdmin && !editForm.divisionId}
									emptyLabel="No matching users."
								/>
							</FormField>
						</div>
						{statusIsChanging ? (
							<FormField label="Status Change Reason" required>
								<textarea
									rows={3}
									value={editForm.stageChangeReason}
									onChange={(e) =>
										setEditForm((f) => ({ ...f, stageChangeReason: e.target.value }))
									}
									required
								/>
							</FormField>
						) : null}
						{stageChangeReasonError ? <p className="panel-subtext error">{stageChangeReasonError}</p> : null}
					</section>

					<section className="form-section">
						<h4>Current Role</h4>
						<div className="detail-form-grid-2">
							<FormField label="Current Job Title" required>
								<input
									value={editForm.currentJobTitle}
									onChange={(e) => setEditForm((f) => ({ ...f, currentJobTitle: e.target.value }))}
									required
								/>
							</FormField>
							<FormField label="Current Employer" required>
								<input
									value={editForm.currentEmployer}
									onChange={(e) => setEditForm((f) => ({ ...f, currentEmployer: e.target.value }))}
									required
								/>
							</FormField>
						</div>
					</section>

					<section className="form-section">
						<h4>Skills</h4>
						<div className="form-field">
							<SkillChipSelect
								options={skillOptions}
								values={editForm.skillIds || []}
								onChange={(nextSkillIds) => setEditForm((f) => ({ ...f, skillIds: nextSkillIds }))}
								placeholder="Type to search and add a skill"
							/>
						</div>
						<div className="form-field">
							<input
								value={editForm.skillSet}
								onChange={(e) => setEditForm((f) => ({ ...f, skillSet: e.target.value }))}
							/>
						</div>
					</section>

					<section className="form-section">
						<h4>Resume</h4>
						<div className="form-field">
							<textarea
								rows={8}
								value={editForm.summary}
								onChange={(e) => setEditForm((f) => ({ ...f, summary: e.target.value }))}
							/>
						</div>
					</section>

					<div className="form-actions">
						<button type="submit" disabled={saveState.saving || !canSaveCandidate}>
							{saveState.saving ? 'Saving...' : 'Save Candidate'}
						</button>
						<span className="form-actions-meta">
							<span>Updated:</span>
							<strong>{formatDate(candidate.updatedAt)}</strong>
						</span>
					</div>
				</form>
				</article>

					<article className="panel workspace-panel workspace-panel-lock-height" style={workspacePanelStyle}>
						<h3>Candidate Workspace</h3>
						<div
							className="side-tabs side-tabs-four side-tabs-warm side-tabs-counted"
							role="tablist"
							aria-label="Candidate workspace tabs"
						>
						<button
							type="button"
							role="tab"
							aria-selected={workspaceTab === 'notes'}
							className={workspaceTab === 'notes' ? 'side-tab active' : 'side-tab'}
							onClick={() => setWorkspaceTab('notes')}
						>
							<span>Notes</span>
							<span className="side-tab-count" aria-hidden="true">{candidate.notes?.length ?? 0}</span>
						</button>
						<button
							type="button"
							role="tab"
							aria-selected={workspaceTab === 'activities'}
							className={workspaceTab === 'activities' ? 'side-tab active' : 'side-tab'}
							onClick={() => setWorkspaceTab('activities')}
						>
							<span>Activities</span>
							<span className="side-tab-count" aria-hidden="true">{candidate.activities?.length ?? 0}</span>
						</button>
						<button
							type="button"
							role="tab"
							aria-selected={workspaceTab === 'submissions'}
							className={workspaceTab === 'submissions' ? 'side-tab active' : 'side-tab'}
							onClick={() => setWorkspaceTab('submissions')}
						>
							<span>Submissions</span>
							<span className="side-tab-count" aria-hidden="true">{submissionRows.length}</span>
						</button>
							<button
								type="button"
								role="tab"
								aria-selected={workspaceTab === 'files'}
							className={workspaceTab === 'files' ? 'side-tab active' : 'side-tab'}
							onClick={() => setWorkspaceTab('files')}
						>
								<span>Files</span>
								<span className="side-tab-count" aria-hidden="true">{candidate.attachments?.length ?? 0}</span>
							</button>
							<button
								type="button"
								role="tab"
								aria-selected={workspaceTab === 'education'}
								className={workspaceTab === 'education' ? 'side-tab active' : 'side-tab'}
								onClick={() => setWorkspaceTab('education')}
							>
								<span>Education</span>
								<span className="side-tab-count" aria-hidden="true">{candidate.candidateEducations?.length ?? 0}</span>
							</button>
							<button
								type="button"
								role="tab"
								aria-selected={workspaceTab === 'work'}
								className={workspaceTab === 'work' ? 'side-tab active' : 'side-tab'}
								onClick={() => setWorkspaceTab('work')}
							>
								<span>Work</span>
								<span className="side-tab-count" aria-hidden="true">{candidate.candidateWorkExperiences?.length ?? 0}</span>
							</button>
							<button
								type="button"
								role="tab"
								aria-selected={workspaceTab === 'matches'}
								className={workspaceTab === 'matches' ? 'side-tab active' : 'side-tab'}
								onClick={() => setWorkspaceTab('matches')}
							>
								<span>Matches</span>
								<span className="side-tab-count" aria-hidden="true">{jobMatchState.matches.length}</span>
							</button>
							<button
								type="button"
								role="tab"
								aria-selected={workspaceTab === 'status-history'}
								className={workspaceTab === 'status-history' ? 'side-tab active' : 'side-tab'}
								onClick={() => setWorkspaceTab('status-history')}
							>
								<span>Stage History</span>
								<span className="side-tab-count" aria-hidden="true">
									{candidate.statusChanges?.length ?? 0}
								</span>
							</button>
						</div>

					{workspaceTab === 'notes' ? (
						<div className="side-tab-content side-tab-content-with-scroll">
							<form onSubmit={onAddNote}>
								<FormField label="Note" required>
									<textarea
										placeholder="Add candidate note"
										value={noteContent}
										onChange={(e) => setNoteContent(e.target.value)}
										required
									/>
								</FormField>
								<button type="submit" disabled={noteState.saving}>
									{noteState.saving ? 'Saving...' : 'Save Note'}
								</button>
							</form>
							<h4 className="side-section-title">Saved Notes</h4>
							<div className="workspace-scroll-area">
								<ListSortControls
									label="Sort Notes"
									value={notesSort.field}
									direction={notesSort.direction}
									onValueChange={(field) => setNotesSort((current) => ({ ...current, field }))}
									onDirectionToggle={() =>
										setNotesSort((current) => ({
											...current,
											direction: current.direction === 'asc' ? 'desc' : 'asc'
										}))
									}
									options={[
										{ value: 'createdAt', label: 'Created Date' },
										{ value: 'author', label: 'Author' },
										{ value: 'content', label: 'Note Content' }
									]}
									disabled={sortedNotes.length < 2}
								/>
								{candidate.notes?.length === 0 ? (
									<p className="panel-subtext">No notes yet.</p>
								) : (
									<ul className="simple-list">
										{sortedNotes.map((note) => (
											<li key={note.id}>
												<div>
													<p>{note.content}</p>
													<p className="simple-list-meta">
														By{' '}
														{note.createdByUser
															? `${note.createdByUser.firstName} ${note.createdByUser.lastName}`
															: 'Unknown user'}{' '}
														@ {formatDate(note.createdAt)}
													</p>
												</div>
											</li>
										))}
									</ul>
								)}
							</div>
						</div>
					) : null}

					{workspaceTab === 'activities' ? (
						<div className="side-tab-content side-tab-content-with-scroll">
							<form onSubmit={onAddActivity}>
								<div className="detail-form-grid-2">
									<FormField label="Activity Type">
										<select
											value={activityForm.type}
											onChange={(e) => setActivityForm((f) => ({ ...f, type: e.target.value }))}
										>
											<option value="call">Call</option>
											<option value="email">Email</option>
											<option value="meeting">Meeting</option>
											<option value="task">Task</option>
										</select>
									</FormField>
									<FormField label="Status">
										<select
											value={activityForm.status}
											onChange={(e) => setActivityForm((f) => ({ ...f, status: e.target.value }))}
										>
											<option value="open">Open</option>
											<option value="completed">Completed</option>
										</select>
									</FormField>
								</div>
								<FormField label="Subject" required>
									<input
										placeholder="Activity subject"
										value={activityForm.subject}
										onChange={(e) => setActivityForm((f) => ({ ...f, subject: e.target.value }))}
										required
									/>
								</FormField>
								<FormField label="Due At">
									<input
										type="datetime-local"
										value={activityForm.dueAt}
										onChange={(e) => setActivityForm((f) => ({ ...f, dueAt: e.target.value }))}
									/>
								</FormField>
								<FormField label="Details">
									<textarea
										placeholder="Activity details"
										value={activityForm.description}
										onChange={(e) => setActivityForm((f) => ({ ...f, description: e.target.value }))}
									/>
								</FormField>
								<button type="submit" disabled={activityState.saving}>
									{activityState.saving ? 'Saving...' : 'Save Activity'}
								</button>
							</form>
							<h4 className="side-section-title">Activity Log</h4>
							<div className="workspace-scroll-area">
								<ListSortControls
									label="Sort Activities"
									value={activitiesSort.field}
									direction={activitiesSort.direction}
									onValueChange={(field) => setActivitiesSort((current) => ({ ...current, field }))}
									onDirectionToggle={() =>
										setActivitiesSort((current) => ({
											...current,
											direction: current.direction === 'asc' ? 'desc' : 'asc'
										}))
									}
									options={[
										{ value: 'createdAt', label: 'Due/Created Date' },
										{ value: 'subject', label: 'Subject' },
										{ value: 'status', label: 'Status' },
										{ value: 'type', label: 'Type' }
									]}
									disabled={sortedActivities.length < 2}
								/>
								{candidate.activities?.length === 0 ? (
									<p className="panel-subtext">No activities logged yet.</p>
								) : (
									<ul className="simple-list">
										{sortedActivities.map((activity) => (
											<li key={activity.id}>
												<div>
													<strong>{activity.subject}</strong>
													<p>
														{activity.type} | {formatSelectValueLabel(activity.status)}
													</p>
													<p className="simple-list-meta">@ {formatDate(activity.dueAt || activity.createdAt)}</p>
												</div>
											</li>
										))}
									</ul>
								)}
							</div>
						</div>
					) : null}

					{workspaceTab === 'submissions' ? (
						<div className="side-tab-content side-tab-content-list-only">
							<div className="workspace-scroll-area">
								<ListSortControls
									label="Sort Submissions"
									value={submissionsSort.field}
									direction={submissionsSort.direction}
									onValueChange={(field) => setSubmissionsSort((current) => ({ ...current, field }))}
									onDirectionToggle={() =>
										setSubmissionsSort((current) => ({
											...current,
											direction: current.direction === 'asc' ? 'desc' : 'asc'
										}))
									}
									options={[
										{ value: 'createdAt', label: 'Submitted Date' },
										{ value: 'jobOrder', label: 'Job Order' },
										{ value: 'client', label: 'Client' },
										{ value: 'status', label: 'Status' }
									]}
									disabled={sortedSubmissions.length < 2}
								/>
								{submissionRows.length === 0 ? (
									<p className="panel-subtext">No submissions yet.</p>
								) : (
									<ul className="simple-list">
										{sortedSubmissions.map((submission) => (
											<li key={submission.id}>
												<div>
													<strong>
														<Link href={`/submissions/${submission.id}`}>{submission.jobOrder}</Link>
													</strong>
													<p>{submission.client}</p>
													<p className="simple-list-meta">By {submission.createdBy} @ {submission.createdAt}</p>
												</div>
												<div className="simple-list-actions simple-list-indicators">
													<span className="chip">{submission.status}</span>
												</div>
											</li>
										))}
									</ul>
								)}
							</div>
						</div>
					) : null}

						{workspaceTab === 'files' ? (
							<div className="side-tab-content side-tab-content-with-scroll">
							<form onSubmit={onUploadAttachment}>
								<FormField label="Attachment File" required>
									<input
										key={attachmentInputKey}
										type="file"
										accept={candidateAttachmentAcceptString()}
										onChange={(e) => {
											const file = e.target.files?.[0] || null;
											setAttachmentFile(file);
										}}
										required
									/>
								</FormField>
								{attachmentFile ? (
									<p className="panel-subtext">Selected: {attachmentFile.name}</p>
								) : null}
								<button type="submit" disabled={attachmentState.uploading || !attachmentFile}>
									{attachmentState.uploading ? 'Uploading...' : 'Upload File'}
								</button>
							</form>
							<h4 className="side-section-title">Uploaded Files</h4>
							<div className="workspace-scroll-area">
								<ListSortControls
									label="Sort Files"
									value={filesSort.field}
									direction={filesSort.direction}
									onValueChange={(field) => setFilesSort((current) => ({ ...current, field }))}
									onDirectionToggle={() =>
										setFilesSort((current) => ({
											...current,
											direction: current.direction === 'asc' ? 'desc' : 'asc'
										}))
									}
									options={[
										{ value: 'createdAt', label: 'Upload Date' },
										{ value: 'fileName', label: 'File Name' },
										{ value: 'sizeBytes', label: 'File Size' },
										{ value: 'uploadedBy', label: 'Uploaded By' }
									]}
									disabled={sortedAttachments.length < 2}
								/>
								{!candidate.attachments || candidate.attachments.length === 0 ? (
									<p className="panel-subtext">No files uploaded.</p>
								) : (
									<ul className="simple-list">
										{sortedAttachments.map((attachment) => (
											<li key={attachment.id}>
												<div>
													<strong>{attachment.fileName}</strong>
													<p>{formatFileSize(attachment.sizeBytes)}</p>
													<p className="simple-list-meta">
														By{' '}
														{attachment.uploadedByUser
															? `${attachment.uploadedByUser.firstName} ${attachment.uploadedByUser.lastName}`
															: 'Unknown user'}{' '}
														@ {formatDate(attachment.createdAt)}
													</p>
												</div>
												<div className="simple-list-actions">
													<div className="row-actions row-actions-right">
														<a
															href={`/api/candidates/${id}/files/${attachment.id}/download`}
															className="row-action-icon"
															aria-label="Download file"
															title="Download file"
														>
															<Download aria-hidden="true" className="row-action-lucide" />
														</a>
														<button
															type="button"
															className="row-action-icon"
															aria-label="Delete file"
															title="Delete file"
															disabled={
																attachmentState.uploading ||
																attachmentState.deletingId === attachment.id
															}
															onClick={() => onDeleteAttachment(attachment)}
														>
															{attachmentState.deletingId === attachment.id ? (
																<LoaderCircle
																	aria-hidden="true"
																	className="row-action-lucide row-action-icon-spinner"
																/>
															) : (
																<Trash2 aria-hidden="true" className="row-action-lucide" />
															)}
														</button>
													</div>
												</div>
											</li>
										))}
									</ul>
								)}
							</div>
							</div>
						) : null}
						{workspaceTab === 'education' ? (
							<div className="side-tab-content side-tab-content-with-scroll">
								<form onSubmit={onAddEducation}>
									<FormField label="School" required>
										<input
											value={educationForm.schoolName}
											onChange={(e) =>
												setEducationForm((current) => ({ ...current, schoolName: e.target.value }))
											}
											required
										/>
									</FormField>
									<div className="detail-form-grid-2">
										<FormField label="Degree">
											<input
												value={educationForm.degree}
												onChange={(e) =>
													setEducationForm((current) => ({ ...current, degree: e.target.value }))
												}
											/>
										</FormField>
										<FormField label="Field Of Study">
											<input
												value={educationForm.fieldOfStudy}
												onChange={(e) =>
													setEducationForm((current) => ({ ...current, fieldOfStudy: e.target.value }))
												}
											/>
										</FormField>
									</div>
									<div className="detail-form-grid-2">
										<FormField label="Start Date">
											<input
												type="date"
												value={educationForm.startDate}
												onChange={(e) =>
													setEducationForm((current) => ({ ...current, startDate: e.target.value }))
												}
											/>
										</FormField>
										<FormField label="End Date">
											<input
												type="date"
												value={educationForm.endDate}
												onChange={(e) =>
													setEducationForm((current) => ({ ...current, endDate: e.target.value }))
												}
												disabled={educationForm.isCurrent}
											/>
										</FormField>
									</div>
									<label className="switch-field">
										<input
											type="checkbox"
											className="switch-input"
											checked={educationForm.isCurrent}
											onChange={(event) =>
												setEducationForm((current) => ({
													...current,
													isCurrent: event.target.checked,
													endDate: event.target.checked ? '' : current.endDate
												}))
											}
										/>
										<span className="switch-track" aria-hidden="true">
											<span className="switch-thumb" />
										</span>
										<span className="switch-copy">
											<span className="switch-label">Currently Enrolled</span>
											<span className="switch-hint">Enable if this education is in progress.</span>
										</span>
									</label>
									<FormField label="Description">
										<textarea
											value={educationForm.description}
											onChange={(e) =>
												setEducationForm((current) => ({ ...current, description: e.target.value }))
											}
										/>
									</FormField>
									<button type="submit" disabled={educationState.saving}>
										{educationState.saving ? 'Saving...' : 'Save Education'}
									</button>
								</form>
								<h4 className="side-section-title">Education History</h4>
								<div className="workspace-scroll-area">
									<ListSortControls
										label="Sort Education"
										value={educationSort.field}
										direction={educationSort.direction}
										onValueChange={(field) => setEducationSort((current) => ({ ...current, field }))}
										onDirectionToggle={() =>
											setEducationSort((current) => ({
												...current,
												direction: current.direction === 'asc' ? 'desc' : 'asc'
											}))
										}
										options={[
											{ value: 'startDate', label: 'Start Date' },
											{ value: 'schoolName', label: 'School' },
											{ value: 'degree', label: 'Degree' }
										]}
										disabled={sortedEducations.length < 2}
									/>
									{candidate.candidateEducations?.length === 0 ? (
										<p className="panel-subtext">No education history yet.</p>
									) : (
										<ul className="simple-list">
											{sortedEducations.map((education) => (
												<li key={education.id}>
													<div>
														<strong>{education.schoolName}</strong>
														<p>
															{education.degree || '-'}
															{education.fieldOfStudy ? ` | ${education.fieldOfStudy}` : ''}
														</p>
														<p>{formatDateRange(education.startDate, education.endDate, education.isCurrent)}</p>
													</div>
													<div className="simple-list-actions">
														<div className="row-actions row-actions-right">
															<button
																type="button"
																className="row-action-icon"
																aria-label="Delete education"
																title="Delete education"
																disabled={
																	educationState.saving ||
																	educationState.deletingId === education.id
																}
																onClick={() => onDeleteEducation(education)}
															>
																{educationState.deletingId === education.id ? (
																	<LoaderCircle
																		aria-hidden="true"
																		className="row-action-lucide row-action-icon-spinner"
																	/>
																) : (
																	<Trash2 aria-hidden="true" className="row-action-lucide" />
																)}
															</button>
														</div>
													</div>
												</li>
											))}
										</ul>
									)}
								</div>
							</div>
						) : null}
						{workspaceTab === 'work' ? (
							<div className="side-tab-content side-tab-content-with-scroll">
								<form onSubmit={onAddWorkExperience}>
									<FormField label="Company" required>
										<input
											value={workExperienceForm.companyName}
											onChange={(e) =>
												setWorkExperienceForm((current) => ({ ...current, companyName: e.target.value }))
											}
											required
										/>
									</FormField>
									<div className="detail-form-grid-2">
										<FormField label="Job Title">
											<input
												value={workExperienceForm.title}
												onChange={(e) =>
													setWorkExperienceForm((current) => ({ ...current, title: e.target.value }))
												}
											/>
										</FormField>
										<FormField label="Location">
											<input
												value={workExperienceForm.location}
												onChange={(e) =>
													setWorkExperienceForm((current) => ({ ...current, location: e.target.value }))
												}
											/>
										</FormField>
									</div>
									<div className="detail-form-grid-2">
										<FormField label="Start Date">
											<input
												type="date"
												value={workExperienceForm.startDate}
												onChange={(e) =>
													setWorkExperienceForm((current) => ({ ...current, startDate: e.target.value }))
												}
											/>
										</FormField>
										<FormField label="End Date">
											<input
												type="date"
												value={workExperienceForm.endDate}
												onChange={(e) =>
													setWorkExperienceForm((current) => ({ ...current, endDate: e.target.value }))
												}
												disabled={workExperienceForm.isCurrent}
											/>
										</FormField>
									</div>
									<label className="switch-field">
										<input
											type="checkbox"
											className="switch-input"
											checked={workExperienceForm.isCurrent}
											onChange={(event) =>
												setWorkExperienceForm((current) => ({
													...current,
													isCurrent: event.target.checked,
													endDate: event.target.checked ? '' : current.endDate
												}))
											}
										/>
										<span className="switch-track" aria-hidden="true">
											<span className="switch-thumb" />
										</span>
										<span className="switch-copy">
											<span className="switch-label">Current Role</span>
											<span className="switch-hint">Enable if this role is still active.</span>
										</span>
									</label>
									<FormField label="Description">
										<textarea
											value={workExperienceForm.description}
											onChange={(e) =>
												setWorkExperienceForm((current) => ({ ...current, description: e.target.value }))
											}
										/>
									</FormField>
									<button type="submit" disabled={workExperienceState.saving}>
										{workExperienceState.saving ? 'Saving...' : 'Save Work Experience'}
									</button>
								</form>
								<h4 className="side-section-title">Work Experience</h4>
								<div className="workspace-scroll-area">
									<ListSortControls
										label="Sort Work"
										value={workSort.field}
										direction={workSort.direction}
										onValueChange={(field) => setWorkSort((current) => ({ ...current, field }))}
										onDirectionToggle={() =>
											setWorkSort((current) => ({
												...current,
												direction: current.direction === 'asc' ? 'desc' : 'asc'
											}))
										}
										options={[
											{ value: 'startDate', label: 'Start Date' },
											{ value: 'companyName', label: 'Company' },
											{ value: 'title', label: 'Title' }
										]}
										disabled={sortedWorkExperiences.length < 2}
									/>
									{candidate.candidateWorkExperiences?.length === 0 ? (
										<p className="panel-subtext">No work experience history yet.</p>
									) : (
										<ul className="simple-list">
											{sortedWorkExperiences.map((workExperience) => (
												<li key={workExperience.id}>
													<div>
														<strong>{workExperience.companyName}</strong>
														<p>{workExperience.title || '-'}</p>
														<p>{formatDateRange(workExperience.startDate, workExperience.endDate, workExperience.isCurrent)}</p>
													</div>
													<div className="simple-list-actions">
														<div className="row-actions row-actions-right">
															<button
																type="button"
																className="row-action-icon"
																aria-label="Delete work experience"
																title="Delete work experience"
																disabled={
																	workExperienceState.saving ||
																	workExperienceState.deletingId === workExperience.id
																}
																onClick={() => onDeleteWorkExperience(workExperience)}
															>
																{workExperienceState.deletingId === workExperience.id ? (
																	<LoaderCircle
																		aria-hidden="true"
																		className="row-action-lucide row-action-icon-spinner"
																	/>
																) : (
																	<Trash2 aria-hidden="true" className="row-action-lucide" />
																)}
															</button>
														</div>
													</div>
												</li>
											))}
										</ul>
									)}
								</div>
							</div>
						) : null}
						{workspaceTab === 'matches' ? (
							<div className="side-tab-content side-tab-content-with-scroll">
								<div className="form-actions">
									<button
										type="button"
										className="btn-secondary btn-link-icon btn-refresh-icon"
										onClick={() => loadJobMatches()}
										disabled={jobMatchState.loading || !!jobMatchState.submittingJobOrderId}
										aria-label={jobMatchState.loading ? 'Refreshing matches' : 'Refresh matches'}
										title={jobMatchState.loading ? 'Refreshing matches' : 'Refresh matches'}
									>
										<RefreshCcw
											aria-hidden="true"
											className={jobMatchState.loading ? 'btn-refresh-icon-svg row-action-icon-spinner' : 'btn-refresh-icon-svg'}
										/>
									</button>
									{jobMatchState.computedAt ? (
										<span className="form-actions-meta">
											<span>Updated:</span>
											<strong>{formatDate(jobMatchState.computedAt)}</strong>
										</span>
									) : null}
								</div>
								<div className="workspace-scroll-area">
									<ListSortControls
										label="Sort Matches"
										value={jobMatchesSort.field}
										direction={jobMatchesSort.direction}
										onValueChange={(field) => setJobMatchesSort((current) => ({ ...current, field }))}
										onDirectionToggle={() =>
											setJobMatchesSort((current) => ({
												...current,
												direction: current.direction === 'asc' ? 'desc' : 'asc'
											}))
										}
										options={[
											{ value: 'scorePercent', label: 'Match Score' },
											{ value: 'jobOrder', label: 'Job Order' },
											{ value: 'client', label: 'Client' },
											{ value: 'location', label: 'Location' }
										]}
										disabled={sortedJobMatches.length < 2}
									/>
									{!jobMatchState.loading && sortedJobMatches.length === 0 ? (
										<p className="panel-subtext">
											No open active job order matches available for this candidate.
										</p>
									) : (
										<ul className="simple-list">
											{sortedJobMatches.map((match) => {
												const isSubmitting =
													jobMatchState.submittingJobOrderId === String(match.jobOrderId);
												return (
													<li key={match.jobOrderId}>
														<div>
															<strong>
																<Link href={`/job-orders/${match.jobOrderId}`}>{match.jobOrderTitle}</Link>
															</strong>
															<p>
																{match.clientName || '-'}
																{match.contactName ? ` | ${match.contactName}` : ''}
															</p>
															<p>
																Match score: <strong>{match.scorePercent}%</strong>
															</p>
															{Array.isArray(match.reasons) && match.reasons.length > 0 ? (
																<p>{match.reasons.join(' • ')}</p>
															) : null}
															{Array.isArray(match.risks) && match.risks.length > 0 ? (
																<p className="panel-subtext error">{match.risks.join(' • ')}</p>
															) : null}
														</div>
														<div className="simple-list-actions">
															<button
																type="button"
																onClick={() => onCreateMatchedSubmission(match)}
																disabled={isSubmitting || jobMatchState.loading}
															>
																{isSubmitting ? 'Submitting...' : 'Add Submission'}
															</button>
														</div>
													</li>
												);
											})}
										</ul>
									)}
								</div>
								<p className="panel-subtext">
									Evaluated {jobMatchState.totalJobOrdersEvaluated} open job orders;{' '}
									{jobMatchState.activeHiringJobOrders} currently active for hiring.
								</p>
							</div>
						) : null}

						{workspaceTab === 'status-history' ? (
							<div className="side-tab-content side-tab-content-with-scroll">
								<h4 className="side-section-title">Status Changes</h4>
								<div className="workspace-scroll-area">
									{candidate.statusChanges?.length === 0 ? (
										<p className="panel-subtext">No status changes logged yet.</p>
									) : (
										<ul className="simple-list">
											{candidate.statusChanges.map((statusChange) => (
												<li key={statusChange.id}>
													<div>
														<strong>
															{statusChange.fromStatus
																? formatSelectValueLabel(statusChange.fromStatus)
																: 'Initial'}{' '}
															{'->'} {formatSelectValueLabel(statusChange.toStatus)}
														</strong>
														{statusChange.reason ? <p>{statusChange.reason}</p> : null}
														<p className="simple-list-meta">
															By{' '}
															{statusChange.changedByUser
																? `${statusChange.changedByUser.firstName} ${statusChange.changedByUser.lastName}`
																: 'Unknown user'}{' '}
															@ {formatDate(statusChange.createdAt)}
														</p>
													</div>
												</li>
											))}
										</ul>
									)}
								</div>
							</div>
						) : null}
					</article>
			</div>
			<AuditTrailPanel entityType="CANDIDATE" entityId={id} visible={showAuditTrail} />
		</section>
	);
}
