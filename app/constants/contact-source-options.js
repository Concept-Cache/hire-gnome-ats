export const CONTACT_SOURCE_OPTIONS = [
	{ value: 'Client Referral', label: 'Client Referral' },
	{ value: 'Candidate Referral', label: 'Candidate Referral' },
	{ value: 'LinkedIn Outreach', label: 'LinkedIn Outreach' },
	{ value: 'Email Outreach', label: 'Email Outreach' },
	{ value: 'Phone Outreach', label: 'Phone Outreach' },
	{ value: 'Inbound Website', label: 'Inbound Website' },
	{ value: 'Networking Event', label: 'Networking Event' },
	{ value: 'Conference / Trade Show', label: 'Conference / Trade Show' },
	{ value: 'Marketing Campaign', label: 'Marketing Campaign' },
	{ value: 'Partner Referral', label: 'Partner Referral' },
	{ value: 'Existing Relationship', label: 'Existing Relationship' },
	{ value: 'Other', label: 'Other' }
];

const contactSourceValueSet = new Set(CONTACT_SOURCE_OPTIONS.map((option) => option.value));
const legacyContactSourceMap = new Map([
	['LinkedIn', 'LinkedIn Outreach'],
	['Referral', 'Client Referral'],
	['Networking', 'Networking Event'],
	['Job Fair/Tradeshow', 'Conference / Trade Show'],
	['Professional Association', 'Networking Event'],
	['Career Site', 'Inbound Website'],
	['Indeed', 'Inbound Website'],
	['CareerBuilder', 'Inbound Website'],
	['Glassdoor', 'Inbound Website'],
	['Monster', 'Inbound Website'],
	['The Ladders', 'Inbound Website'],
	['Previously Placed', 'Existing Relationship']
]);

export function normalizeContactSourceValue(value) {
	const source = typeof value === 'string' ? value.trim() : '';
	if (!source) return '';
	if (contactSourceValueSet.has(source)) return source;
	const mappedValue = legacyContactSourceMap.get(source);
	if (mappedValue && contactSourceValueSet.has(mappedValue)) {
		return mappedValue;
	}
	return 'Other';
}

