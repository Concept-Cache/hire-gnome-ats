function currencyAffixes(currencyCode) {
	if (!currencyCode) {
		return { prefix: '', suffix: '' };
	}

	try {
		const parts = new Intl.NumberFormat(undefined, {
			style: 'currency',
			currency: currencyCode,
			minimumFractionDigits: 0,
			maximumFractionDigits: 0
		}).formatToParts(0);
		const integerIndex = parts.findIndex((part) => part.type === 'integer');
		if (integerIndex === -1) {
			return { prefix: `${currencyCode} `, suffix: '' };
		}

		return {
			prefix: parts.slice(0, integerIndex).map((part) => part.value).join(''),
			suffix: parts.slice(integerIndex + 1).map((part) => part.value).join('')
		};
	} catch {
		return { prefix: `${currencyCode} `, suffix: '' };
	}
}

export function formatCurrencyInput(value, currencyCode = '') {
	const raw = String(value ?? '').replace(/[^0-9.]/g, '');
	if (!raw) return '';

	const hasTrailingDot = raw.endsWith('.');
	const [intPartRaw = '', decimalPartRaw = ''] = raw.split('.');
	const intPartNormalized = intPartRaw.replace(/^0+(?=\d)/, '') || '0';
	const intPartFormatted = intPartNormalized.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
	const decimalPart = decimalPartRaw.slice(0, 2);

	if (hasTrailingDot && decimalPart.length === 0) {
		const baseValue = `${intPartFormatted}.`;
		if (!currencyCode) return baseValue;
		const affixes = currencyAffixes(currencyCode);
		return `${affixes.prefix}${baseValue}${affixes.suffix}`;
	}

	const baseValue = decimalPart ? `${intPartFormatted}.${decimalPart}` : intPartFormatted;
	if (!currencyCode) return baseValue;
	const affixes = currencyAffixes(currencyCode);
	return `${affixes.prefix}${baseValue}${affixes.suffix}`;
}

export function normalizeCurrencyInput(value) {
	return String(value ?? '')
		.replace(/[^0-9.-]/g, '')
		.trim();
}

export function parseCurrencyInput(value) {
	const normalized = normalizeCurrencyInput(value);
	if (!normalized) return null;

	const parsed = Number(normalized);
	if (!Number.isFinite(parsed)) return null;
	return parsed;
}
