const EMAIL_REGEX =
	/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;

export function isValidEmailAddress(value) {
	if (typeof value !== 'string') return false;
	const email = value.trim();
	if (!email) return false;
	if (email.length > 254) return false;
	if (email.includes('..')) return false;

	const parts = email.split('@');
	if (parts.length !== 2) return false;
	const [localPart, domainPart] = parts;
	if (!localPart || !domainPart) return false;
	if (localPart.length > 64 || domainPart.length > 253) return false;
	if (domainPart.startsWith('-') || domainPart.endsWith('-')) return false;
	if (!domainPart.includes('.')) return false;

	return EMAIL_REGEX.test(email);
}
