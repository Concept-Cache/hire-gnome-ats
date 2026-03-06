export const SKILL_CATEGORY_OPTIONS = [
	'Engineering',
	'Data',
	'Cloud/DevOps',
	'Security/Compliance',
	'Business/Operations',
	'Finance/Accounting',
	'HR/People',
	'Legal/Compliance',
	'Sales/Marketing',
	'Manufacturing/Industrial',
	'Healthcare'
];

export function normalizeSkillCategory(value) {
	const category = String(value || '').trim();
	return SKILL_CATEGORY_OPTIONS.includes(category) ? category : '';
}
