export function toNullable(value) {
	if (value === '' || value == null) {
		return null;
	}

	return value;
}

export function toNullableNumber(value) {
	if (value === '' || value == null) {
		return null;
	}

	const number = Number(value);
	return Number.isFinite(number) ? number : null;
}

export function toNullableInt(value) {
	if (value === '' || value == null) {
		return null;
	}

	const number = Number(value);
	if (!Number.isInteger(number)) return null;
	return number;
}

export function toNullableDate(value) {
	if (value === '' || value == null) {
		return null;
	}

	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return date;
}
