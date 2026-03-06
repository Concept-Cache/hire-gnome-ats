function normalizeZipCode(value) {
	const rawValue = String(value || '').trim();
	if (!rawValue) return '';
	const match = rawValue.match(/\d{5}/);
	return match ? match[0] : '';
}

function hasText(value) {
	return typeof value === 'string' && value.trim().length > 0;
}

export async function withInferredCityStateFromZip(db, input) {
	const base = input && typeof input === 'object' ? { ...input } : {};
	const normalizedZip = normalizeZipCode(base.zipCode);
	if (!normalizedZip) {
		return base;
	}

	base.zipCode = normalizedZip;
	if (hasText(base.city) && hasText(base.state)) {
		return base;
	}

	const zipRecord = await db.zipCode.findFirst({
		where: { zip: normalizedZip },
		orderBy: { id: 'asc' },
		select: {
			primaryCity: true,
			state: true
		}
	});
	if (!zipRecord) {
		return base;
	}

	if (!hasText(base.city)) {
		base.city = zipRecord.primaryCity || base.city;
	}
	if (!hasText(base.state)) {
		base.state = zipRecord.state || base.state;
	}

	return base;
}
