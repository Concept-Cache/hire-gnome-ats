export const CANDIDATE_SOURCE_OPTIONS = [
	{ value: 'Career Site', label: 'Career Site' },
	{ value: 'LinkedIn', label: 'LinkedIn' },
	{ value: 'Indeed', label: 'Indeed' },
	{ value: 'ZipRecruiter', label: 'ZipRecruiter' },
	{ value: 'Dice', label: 'Dice' },
	{ value: 'Built In', label: 'Built In' },
	{ value: 'Wellfound', label: 'Wellfound' },
	{ value: 'Google Jobs', label: 'Google Jobs' },
	{ value: 'Job Board', label: 'Job Board' },
	{ value: 'Social Media', label: 'Social Media' },
	{ value: 'Referral', label: 'Referral' },
	{ value: 'Internal Database', label: 'Internal Database' },
	{ value: 'Re-Engaged Candidate', label: 'Re-Engaged Candidate' },
	{ value: 'Direct Sourcing', label: 'Direct Sourcing' },
	{ value: 'Networking Event', label: 'Networking Event' },
	{ value: 'Professional Community', label: 'Professional Community' },
	{ value: 'Other', label: 'Other' }
];

const candidateSourceValueSet = new Set(CANDIDATE_SOURCE_OPTIONS.map((option) => option.value));
const legacyCandidateSourceMap = new Map([
	['CareerBuilder', 'Job Board'],
	['Glassdoor', 'Job Board'],
	['Monster', 'Job Board'],
	['The Ladders', 'Job Board'],
	['Facebook', 'Social Media'],
	['Job Fair/Tradeshow', 'Networking Event'],
	['Networking', 'Networking Event'],
	['Professional Association', 'Professional Community'],
	['Previously Placed', 'Re-Engaged Candidate']
]);

export function normalizeCandidateSourceValue(value) {
	const source = typeof value === 'string' ? value.trim() : '';
	if (!source) return '';
	if (candidateSourceValueSet.has(source)) return source;
	const mappedValue = legacyCandidateSourceMap.get(source);
	if (mappedValue && candidateSourceValueSet.has(mappedValue)) {
		return mappedValue;
	}
	return 'Other';
}

