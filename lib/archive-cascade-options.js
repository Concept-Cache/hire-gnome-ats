const ARCHIVE_CASCADE_OPTIONS = Object.freeze({
	CANDIDATE: [
		{
			key: 'includeSubmissions',
			label: 'Archive submissions',
			description: 'Also archive submissions linked to this candidate.'
		},
		{
			key: 'includeInterviews',
			label: 'Archive interviews',
			description: 'Also archive interviews linked to this candidate.'
		},
		{
			key: 'includePlacements',
			label: 'Archive placements',
			description: 'Also archive placements linked to this candidate.'
		}
	],
	JOB_ORDER: [
		{
			key: 'includeSubmissions',
			label: 'Archive submissions',
			description: 'Also archive submissions linked to this job order.'
		},
		{
			key: 'includeInterviews',
			label: 'Archive interviews',
			description: 'Also archive interviews linked to this job order.'
		},
		{
			key: 'includePlacements',
			label: 'Archive placements',
			description: 'Also archive placements linked to this job order.'
		}
	],
	CLIENT: [
		{
			key: 'includeContacts',
			label: 'Archive contacts',
			description: 'Also archive contacts linked to this client.'
		},
		{
			key: 'includeJobOrders',
			label: 'Archive job orders',
			description: 'Also archive job orders linked to this client.'
		},
		{
			key: 'includeSubmissions',
			label: 'Archive submissions',
			description: 'Also archive submissions tied to this client’s job orders.'
		},
		{
			key: 'includeInterviews',
			label: 'Archive interviews',
			description: 'Also archive interviews tied to this client’s job orders.'
		},
		{
			key: 'includePlacements',
			label: 'Archive placements',
			description: 'Also archive placements tied to this client’s job orders.'
		}
	]
});

function normalizeEntityType(value) {
	return String(value || '').trim().toUpperCase();
}

export function getArchiveCascadeOptions(entityType) {
	const normalized = normalizeEntityType(entityType);
	const options = ARCHIVE_CASCADE_OPTIONS[normalized] || [];
	return options.map((option) => ({
		id: option.key,
		label: option.label,
		description: option.description
	}));
}

export function normalizeArchiveCascadeSelection(entityType, input) {
	const normalized = normalizeEntityType(entityType);
	const optionKeys = (ARCHIVE_CASCADE_OPTIONS[normalized] || []).map((option) => option.key);
	const source = input && typeof input === 'object' ? input : {};
	const next = {};

	for (const key of optionKeys) {
		next[key] = Boolean(source[key]);
	}

	return next;
}

export function cascadeSelectionFromIds(entityType, selectedIds = []) {
	const normalized = normalizeEntityType(entityType);
	const selected = new Set((Array.isArray(selectedIds) ? selectedIds : []).map((value) => String(value || '').trim()));
	const optionKeys = (ARCHIVE_CASCADE_OPTIONS[normalized] || []).map((option) => option.key);
	const next = {};

	for (const key of optionKeys) {
		next[key] = selected.has(key);
	}

	return next;
}

