import { toNullable, toNullableInt, toNullableNumber } from '@/lib/value-utils';

function toNullableCustomFields(value) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const entries = Object.entries(value);
	if (entries.length <= 0) return null;
	return Object.fromEntries(entries);
}

export function normalizeCandidateData(data) {
	return {
		firstName: data.firstName,
		lastName: data.lastName,
		email: data.email,
		mobile: toNullable(data.mobile),
		status: data.status,
		source: toNullable(data.source),
		owner: toNullable(data.owner),
		ownerId: toNullableInt(data.ownerId),
		divisionId: toNullableInt(data.divisionId),
		currentJobTitle: toNullable(data.currentJobTitle),
		currentEmployer: toNullable(data.currentEmployer),
		experienceYears: toNullableNumber(data.experienceYears),
		address: toNullable(data.address),
		addressPlaceId: toNullable(data.addressPlaceId),
		addressLatitude: toNullableNumber(data.addressLatitude),
		addressLongitude: toNullableNumber(data.addressLongitude),
		city: toNullable(data.city),
		state: toNullable(data.state),
		zipCode: toNullable(data.zipCode),
		website: toNullable(data.website),
		linkedinUrl: toNullable(data.linkedinUrl),
		skillSet: toNullable(data.skillSet),
		summary: toNullable(data.summary),
		customFields: toNullableCustomFields(data.customFields)
	};
}
