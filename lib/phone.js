export function normalizePhoneNumber(value) {
	if (!value) return '';
	const digits = String(value).replace(/\D/g, '');
	if (!digits) return '';
	if (digits.length === 11 && digits.startsWith('1')) {
		return digits.slice(1);
	}
	if (digits.length > 10) {
		return digits.slice(-10);
	}
	return digits;
}

function formatTenDigitPhone(digits) {
	if (!digits) return '';
	if (digits.length <= 3) return digits;
	if (digits.length <= 6) {
		return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
	}
	return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

export function formatPhoneInput(value) {
	if (!value) return '';
	const digits = String(value).replace(/\D/g, '');
	if (!digits) return '';

	let mainDigits = digits.slice(0, 10);
	let extensionDigits = digits.slice(10);
	let countryPrefix = '';

	if (digits.length > 10 && digits.startsWith('1')) {
		mainDigits = digits.slice(1, 11);
		extensionDigits = digits.slice(11);
		countryPrefix = '+1 ';
	}

	const formattedMain = formatTenDigitPhone(mainDigits);
	if (!formattedMain) return '';
	if (!extensionDigits) {
		return `${countryPrefix}${formattedMain}`.trim();
	}

	return `${countryPrefix}${formattedMain} x${extensionDigits}`.trim();
}
