export const MODULE_HELP_DOCS = [
	{
		slug: 'dashboard',
		title: 'Dashboard',
		moduleHref: '/',
		docFile: 'dashboard.md'
	},
	{
		slug: 'candidates',
		title: 'Candidates',
		moduleHref: '/candidates',
		docFile: 'candidates.md'
	},
	{
		slug: 'clients',
		title: 'Clients',
		moduleHref: '/clients',
		docFile: 'clients.md'
	},
	{
		slug: 'contacts',
		title: 'Contacts',
		moduleHref: '/contacts',
		docFile: 'contacts.md'
	},
	{
		slug: 'job-orders',
		title: 'Job Orders',
		moduleHref: '/job-orders',
		docFile: 'job-orders.md'
	},
	{
		slug: 'submissions',
		title: 'Submissions',
		moduleHref: '/submissions',
		docFile: 'submissions.md'
	},
	{
		slug: 'interviews',
		title: 'Interviews',
		moduleHref: '/interviews',
		docFile: 'interviews.md'
	},
	{
		slug: 'placements',
		title: 'Placements',
		moduleHref: '/placements',
		docFile: 'placements.md'
	},
	{
		slug: 'reports',
		title: 'Reports',
		moduleHref: '/reports',
		docFile: 'reports.md'
	},
	{
		slug: 'archive',
		title: 'Archive',
		moduleHref: '/archive',
		docFile: 'archive.md'
	},
	{
		slug: 'admin-area',
		title: 'Admin Area',
		moduleHref: '/admin',
		docFile: 'admin-area.md'
	}
];

export const MODULE_HELP_BY_SLUG = Object.freeze(
	Object.fromEntries(MODULE_HELP_DOCS.map((entry) => [entry.slug, entry]))
);

export const MODULE_HELP_BY_MODULE_HREF = Object.freeze(
	Object.fromEntries(MODULE_HELP_DOCS.map((entry) => [entry.moduleHref, entry]))
);

export function getModuleHelpHrefByModuleHref(moduleHref) {
	const entry = MODULE_HELP_BY_MODULE_HREF[String(moduleHref || '').trim()];
	if (!entry) return '';
	return `/help/${entry.slug}`;
}
