export class ValidationError extends Error {
	constructor(message = 'Invalid request data.') {
		super(message);
		this.name = 'ValidationError';
		this.status = 400;
	}
}

function asTrimmedString(value) {
	if (value == null) return '';
	return String(value).trim();
}

function toPositiveInt(value) {
	const number = Number(asTrimmedString(value));
	if (!Number.isInteger(number) || number <= 0) {
		return null;
	}

	return number;
}

export function parsePositiveInt(value, fieldName = 'id') {
	const parsed = toPositiveInt(value);
	if (parsed == null) {
		throw new ValidationError(`${fieldName} must be a positive whole number.`);
	}

	return parsed;
}

export function parseRouteId(params, fieldName = 'id') {
	const rawId = params ? params[fieldName] : null;
	return parsePositiveInt(rawId, fieldName);
}

export async function parseJsonBody(req) {
	let body;
	try {
		body = await req.json();
	} catch {
		throw new ValidationError('Invalid or empty JSON body.');
	}

	if (!body || typeof body !== 'object' || Array.isArray(body)) {
		throw new ValidationError('Request payload must be a JSON object.');
	}

	return body;
}
