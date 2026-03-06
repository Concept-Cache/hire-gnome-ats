export function formatSelectValueLabel(value, fallback = '-') {
	const normalized = String(value ?? '').trim();
	if (!normalized) return fallback;

	return normalized
		.split(/[_\s-]+/)
		.filter(Boolean)
		.map((token) => {
			if (/^[A-Z0-9]+$/.test(token)) return token;
			return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
		})
		.join(' ');
}
