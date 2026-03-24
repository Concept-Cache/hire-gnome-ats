function toNamePart(value) {
	return String(value || '').trim();
}

export function formatPersonName(firstName, lastName, options = {}) {
	const first = toNamePart(firstName);
	const last = toNamePart(lastName);
	const { format = 'first-last', fallback = '' } = options;

	if (format === 'last-first') {
		if (last && first) return `${last}, ${first}`;
		return last || first || fallback;
	}

	return [first, last].filter(Boolean).join(' ') || fallback;
}

export function buildPersonNameSearchText(firstName, lastName, options = {}) {
	const fallback = options.fallback || '';
	const variants = [
		formatPersonName(firstName, lastName, { fallback }),
		formatPersonName(firstName, lastName, { format: 'last-first', fallback })
	].filter(Boolean);

	return [...new Set(variants)].join(' ');
}
