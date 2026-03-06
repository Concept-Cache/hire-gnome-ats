export function isValidHttpUrl(value) {
	if (typeof value !== 'string') return false;
	const trimmedValue = value.trim();
	if (!trimmedValue) return false;

	try {
		const parsed = new URL(trimmedValue);
		if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
			return false;
		}

		const hostname = String(parsed.hostname || '').trim().toLowerCase();
		if (!hostname) return false;
		if (hostname === 'localhost') return true;

		// Allow literal IPv4 hosts.
		if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
			const octets = hostname.split('.').map(Number);
			return octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255);
		}

		// Allow literal IPv6 hosts.
		if (hostname.includes(':')) {
			return /^[a-f0-9:]+$/i.test(hostname);
		}

		// Require a multi-label domain like example.com.
		const domainParts = hostname.split('.');
		if (domainParts.length < 2) return false;

		return domainParts.every((part) => {
			if (!part) return false;
			if (part.startsWith('-') || part.endsWith('-')) return false;
			return /^[a-z0-9-]+$/i.test(part);
		});
	} catch {
		return false;
	}
}

export function isValidOptionalHttpUrl(value) {
	if (value == null) return true;
	if (typeof value !== 'string') return false;
	const trimmedValue = value.trim();
	if (!trimmedValue) return true;
	return isValidHttpUrl(trimmedValue);
}

function stripWrappingPunctuation(value) {
	return String(value || '')
		.trim()
		.replace(/^["'(\[\s]+/, '')
		.replace(/[)"'\],.;:!?]+$/, '');
}

export function normalizeHttpUrl(value) {
	const trimmedValue = stripWrappingPunctuation(value);
	if (!trimmedValue) return '';

	if (isValidHttpUrl(trimmedValue)) {
		return trimmedValue;
	}

	if (trimmedValue.startsWith('//')) {
		const candidate = `https:${trimmedValue}`;
		return isValidHttpUrl(candidate) ? candidate : trimmedValue;
	}

	if (/^www\./i.test(trimmedValue)) {
		const candidate = `https://${trimmedValue}`;
		return isValidHttpUrl(candidate) ? candidate : trimmedValue;
	}

	if (/^(?:[a-z0-9-]+\.)+[a-z]{2,}(?:[/?#].*)?$/i.test(trimmedValue)) {
		const candidate = `https://${trimmedValue}`;
		return isValidHttpUrl(candidate) ? candidate : trimmedValue;
	}

	return trimmedValue;
}
