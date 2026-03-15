export const WEB_RESPONSE_NOTE_PREFIX = '[WEB_RESPONSE]';
const WEB_RESPONSE_SUBMISSION_NOTES_MAX_LENGTH = 180;

function safeTrim(value) {
	return typeof value === 'string' ? value.trim() : '';
}

export function isWebResponseSubmission(submission) {
	const notes = safeTrim(submission?.notes);
	if (!notes) return false;
	return notes.startsWith(WEB_RESPONSE_NOTE_PREFIX);
}

export function submissionCreatedByLabel(submission) {
	if (submission?.createdByUser) {
		return `${submission.createdByUser.firstName} ${submission.createdByUser.lastName}`.trim();
	}
	if (isWebResponseSubmission(submission)) return 'Web Response';
	return 'Unknown User';
}

export function buildWebResponseSubmissionNotes({
	jobOrderTitle,
	applicantName,
	email,
	mobile,
	zipCode,
	currentJobTitle,
	currentEmployer,
	linkedinUrl,
	resumeFileName
}) {
	const parts = [
		WEB_RESPONSE_NOTE_PREFIX,
		'Career Site',
		`Job: ${safeTrim(jobOrderTitle) || '-'}`,
		`Applicant: ${safeTrim(applicantName) || '-'}`,
		`Email: ${safeTrim(email) || '-'}`,
		`Mobile: ${safeTrim(mobile) || '-'}`,
		`Zip: ${safeTrim(zipCode) || '-'}`,
		`Resume: ${safeTrim(resumeFileName) || '-'}`
	];

	const compact = parts.join(' | ');
	if (compact.length <= WEB_RESPONSE_SUBMISSION_NOTES_MAX_LENGTH) {
		return compact;
	}

	return `${compact.slice(0, WEB_RESPONSE_SUBMISSION_NOTES_MAX_LENGTH - 1)}…`;
}
