import { toNullable, toNullableDate } from '@/lib/value-utils';

function asTrimmedString(value) {
	return typeof value === 'string' ? value.trim() : '';
}

function normalizeDate(value) {
	return toNullableDate(asTrimmedString(value) || value);
}

export function normalizeCandidateEducationRecords(recordsInput) {
	if (!Array.isArray(recordsInput)) return [];

	return recordsInput
		.map((record) => {
			const schoolName = asTrimmedString(record?.schoolName);
			if (!schoolName) return null;

			const isCurrent = Boolean(record?.isCurrent);
			const endDate = isCurrent ? null : normalizeDate(record?.endDate);

			return {
				schoolName,
				degree: toNullable(asTrimmedString(record?.degree)),
				fieldOfStudy: toNullable(asTrimmedString(record?.fieldOfStudy)),
				startDate: normalizeDate(record?.startDate),
				endDate,
				isCurrent,
				description: toNullable(asTrimmedString(record?.description))
			};
		})
		.filter(Boolean);
}

export function normalizeCandidateWorkExperienceRecords(recordsInput) {
	if (!Array.isArray(recordsInput)) return [];

	return recordsInput
		.map((record) => {
			const companyName = asTrimmedString(record?.companyName);
			if (!companyName) return null;

			const isCurrent = Boolean(record?.isCurrent);
			const endDate = isCurrent ? null : normalizeDate(record?.endDate);

			return {
				companyName,
				title: toNullable(asTrimmedString(record?.title)),
				location: toNullable(asTrimmedString(record?.location)),
				startDate: normalizeDate(record?.startDate),
				endDate,
				isCurrent,
				description: toNullable(asTrimmedString(record?.description))
			};
		})
		.filter(Boolean);
}
