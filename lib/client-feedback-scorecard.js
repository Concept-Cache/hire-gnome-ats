export const CLIENT_FEEDBACK_SCORECARD_FIELDS = Object.freeze([
	{ key: 'communicationScore', label: 'Communication' },
	{ key: 'technicalFitScore', label: 'Technical Fit' },
	{ key: 'cultureFitScore', label: 'Culture Fit' },
	{ key: 'overallRecommendationScore', label: 'Overall Recommendation' }
]);

export const CLIENT_FEEDBACK_SCORE_OPTIONS = Object.freeze([
	{ value: 1, label: '1 - Poor' },
	{ value: 2, label: '2 - Fair' },
	{ value: 3, label: '3 - Good' },
	{ value: 4, label: '4 - Strong' },
	{ value: 5, label: '5 - Excellent' }
]);

export const CLIENT_FEEDBACK_RECOMMENDATION_OPTIONS = Object.freeze([
	{ value: 1, label: '1 - No' },
	{ value: 2, label: '2 - Lean No' },
	{ value: 3, label: '3 - Maybe' },
	{ value: 4, label: '4 - Yes' },
	{ value: 5, label: '5 - Strong Yes' }
]);

export function normalizeClientFeedbackScore(value) {
	if (value === '' || value == null) return null;
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) return null;
	return parsed;
}

export function parseClientFeedbackScorecard(input) {
	const source = input && typeof input === 'object' ? input : {};
	return {
		communicationScore: normalizeClientFeedbackScore(source.communicationScore),
		technicalFitScore: normalizeClientFeedbackScore(source.technicalFitScore),
		cultureFitScore: normalizeClientFeedbackScore(source.cultureFitScore),
		overallRecommendationScore: normalizeClientFeedbackScore(source.overallRecommendationScore)
	};
}

export function hasAnyClientFeedbackScorecard(scorecard) {
	return CLIENT_FEEDBACK_SCORECARD_FIELDS.some((field) => Number.isInteger(Number(scorecard?.[field.key])));
}

export function formatClientFeedbackScore(value, fieldKey) {
	const normalized = normalizeClientFeedbackScore(value);
	if (!normalized) return '-';
	const options =
		fieldKey === 'overallRecommendationScore'
			? CLIENT_FEEDBACK_RECOMMENDATION_OPTIONS
			: CLIENT_FEEDBACK_SCORE_OPTIONS;
	const match = options.find((option) => option.value === normalized);
	return match ? match.label : String(normalized);
}
