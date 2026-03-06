export const INDUSTRY_OPTIONS = [
	{ value: 'Accounting/Finance', label: 'Accounting/Finance' },
	{ value: 'Construction', label: 'Construction' },
	{ value: 'Education', label: 'Education' },
	{ value: 'Energy', label: 'Energy' },
	{ value: 'Engineering', label: 'Engineering' },
	{ value: 'Financial Services', label: 'Financial Services' },
	{ value: 'Government', label: 'Government' },
	{ value: 'Healthcare', label: 'Healthcare' },
	{ value: 'Information Technology', label: 'Information Technology' },
	{ value: 'Legal', label: 'Legal' },
	{ value: 'Logistics & Supply Chain', label: 'Logistics & Supply Chain' },
	{ value: 'Manufacturing', label: 'Manufacturing' },
	{ value: 'Professional Services', label: 'Professional Services' },
	{ value: 'Real Estate', label: 'Real Estate' },
	{ value: 'Retail', label: 'Retail' },
	{ value: 'Telecommunications', label: 'Telecommunications' },
	{ value: 'Transportation', label: 'Transportation' },
	{ value: 'Other', label: 'Other' }
];

const industryValueSet = new Set(INDUSTRY_OPTIONS.map((option) => option.value));

export function normalizeIndustryValue(value) {
	const industry = typeof value === 'string' ? value.trim() : '';
	if (!industry) return '';
	return industryValueSet.has(industry) ? industry : 'Other';
}
