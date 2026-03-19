function normalizedStatus(value) {
	return String(value || '').trim().toLowerCase();
}

export function getEffectiveSubmissionStatus(submission) {
	if (submission?.offer?.id) return 'placed';
	return normalizedStatus(submission?.status) || 'submitted';
}

export function isSubmissionPlacementLocked(submission) {
	return Boolean(submission?.offer?.id);
}
