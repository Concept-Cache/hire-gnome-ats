function toCleanString(value) {
	return String(value || '').trim();
}

function parseDelimitedCount(value) {
	if (!toCleanString(value)) return 0;
	return toCleanString(value)
		.split(/[,;\n|/]+/)
		.map((item) => item.trim())
		.filter(Boolean).length;
}

function scoreCustomFields(definitions, values) {
	const requiredDefinitions = Array.isArray(definitions)
		? definitions.filter((definition) => Boolean(definition?.isRequired))
		: [];
	if (requiredDefinitions.length === 0) {
		return { score: 10, maxScore: 10, missingLabel: '' };
	}

	const inputValues = values && typeof values === 'object' && !Array.isArray(values) ? values : {};
	const completedCount = requiredDefinitions.filter((definition) => {
		const value = inputValues[definition.fieldKey];
		if (value == null) return false;
		if (typeof value === 'boolean') return value === true;
		if (Array.isArray(value)) return value.length > 0;
		if (typeof value === 'number') return Number.isFinite(value);
		return toCleanString(value).length > 0;
	}).length;

	const ratio = completedCount / requiredDefinitions.length;
	return {
		score: Math.round(ratio * 10),
		maxScore: 10,
		missingLabel: completedCount < requiredDefinitions.length ? 'Complete required custom fields' : ''
	};
}

export function getCandidateCompleteness({
	candidate,
	editForm,
	customFieldDefinitions
}) {
	const attachments = Array.isArray(candidate?.attachments) ? candidate.attachments : [];
	const workHistory = Array.isArray(candidate?.candidateWorkExperiences) ? candidate.candidateWorkExperiences : [];
	const educationHistory = Array.isArray(candidate?.candidateEducations) ? candidate.candidateEducations : [];
	const selectedSkillCount = Array.isArray(editForm?.skillIds) ? editForm.skillIds.filter(Boolean).length : 0;
	const otherSkillCount = parseDelimitedCount(editForm?.skillSet);
	const totalSkillCount = selectedSkillCount + otherSkillCount;
	const hasLocation = Boolean(
		toCleanString(editForm?.address) ||
			toCleanString(editForm?.city) ||
			toCleanString(editForm?.state) ||
			toCleanString(editForm?.zipCode)
	);
	const summaryLength = toCleanString(editForm?.summary).length;
	const hasPrimaryResume = attachments.some((attachment) => attachment?.isResume);

	const customFieldScore = scoreCustomFields(customFieldDefinitions, editForm?.customFields);
	const sections = [
		{
			label: 'Identity',
			score:
				(toCleanString(editForm?.firstName) ? 4.5 : 0) +
				(toCleanString(editForm?.lastName) ? 4.5 : 0) +
				(toCleanString(editForm?.email) ? 4.5 : 0) +
				(toCleanString(editForm?.mobile) ? 4.5 : 0),
			maxScore: 18,
			missingLabel: 'Complete core contact fields'
		},
		{
			label: 'Pipeline',
			score:
				(toCleanString(editForm?.status) ? 4 : 0) +
				(toCleanString(editForm?.source) ? 4 : 0) +
				(toCleanString(editForm?.ownerId) ? 4 : 0),
			maxScore: 12,
			missingLabel: 'Set status, source, and owner'
		},
		{
			label: 'Current Role',
			score:
				(toCleanString(editForm?.currentJobTitle) ? 4 : 0) +
				(toCleanString(editForm?.currentEmployer) ? 4 : 0) +
				(hasLocation ? 4 : 0),
			maxScore: 12,
			missingLabel: 'Add current role and location'
		},
		{
			label: 'Links',
			score: (toCleanString(editForm?.linkedinUrl) ? 4 : 0) + (toCleanString(editForm?.website) ? 2 : 0),
			maxScore: 6,
			missingLabel: 'Add LinkedIn or website'
		},
		{
			label: 'Resume Summary',
			score: summaryLength >= 220 ? 14 : summaryLength >= 120 ? 11 : summaryLength >= 40 ? 6 : 0,
			maxScore: 14,
			missingLabel: 'Add a stronger resume summary'
		},
		{
			label: 'Skills',
			score: totalSkillCount >= 6 ? 12 : totalSkillCount >= 3 ? 8 : totalSkillCount >= 1 ? 4 : 0,
			maxScore: 12,
			missingLabel: 'Add more skills'
		},
		{
			label: 'Work History',
			score: workHistory.length >= 2 ? 12 : workHistory.length >= 1 ? 7 : 0,
			maxScore: 12,
			missingLabel: 'Add work history'
		},
		{
			label: 'Education',
			score: educationHistory.length >= 1 ? 6 : 0,
			maxScore: 6,
			missingLabel: 'Add education'
		},
		{
			label: 'Primary Resume',
			score: hasPrimaryResume ? 8 : 0,
			maxScore: 8,
			missingLabel: 'Upload or label a primary resume'
		},
		{
			label: 'Custom Fields',
			score: customFieldScore.score,
			maxScore: customFieldScore.maxScore,
			missingLabel: customFieldScore.missingLabel
		}
	];

	const totalScore = sections.reduce((sum, section) => sum + section.score, 0);
	const totalMaxScore = sections.reduce((sum, section) => sum + section.maxScore, 0) || 100;
	const scorePercent = Math.max(0, Math.min(100, Math.round((totalScore / totalMaxScore) * 100)));
	const incompleteSections = sections
		.filter((section) => section.score < section.maxScore && section.missingLabel)
		.sort((left, right) => (right.maxScore - right.score) - (left.maxScore - left.score));

	let levelLabel = 'Needs Work';
	if (scorePercent >= 85) levelLabel = 'Strong';
	else if (scorePercent >= 65) levelLabel = 'Good';

	return {
		scorePercent,
		levelLabel,
		topGaps: incompleteSections.slice(0, 4).map((section) => section.missingLabel),
		completedSections: sections.filter((section) => section.score >= section.maxScore).length,
		totalSections: sections.length
	};
}
