import { toNullable, toNullableDate, toNullableInt, toNullableNumber } from '@/lib/value-utils';
import { sanitizeRichTextHtml } from '@/lib/rich-text';
import { isValidEmailAddress } from '@/lib/email-validation';
import { normalizeClientStatusValue } from '@/lib/client-status-options';

function toNullableCustomFields(value) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const entries = Object.entries(value);
	if (entries.length <= 0) return null;
	return Object.fromEntries(entries);
}

function normalizeEmailList(values) {
	if (!Array.isArray(values)) return [];

	const seen = new Set();
	const normalized = [];
	for (const value of values) {
		const email = String(value || '').trim().toLowerCase();
		if (!email || !isValidEmailAddress(email)) continue;
		if (seen.has(email)) continue;
		seen.add(email);
		normalized.push(email);
	}

	return normalized;
}

export function normalizeClientData(data) {
	return {
		name: data.name,
		industry: toNullable(data.industry),
		status: normalizeClientStatusValue(data.status),
		owner: toNullable(data.owner),
		phone: toNullable(data.phone),
		address: toNullable(data.address),
		city: toNullable(data.city),
		state: toNullable(data.state),
		zipCode: toNullable(data.zipCode),
		ownerId: toNullableInt(data.ownerId),
		divisionId: toNullableInt(data.divisionId),
		website: toNullable(data.website),
		description: toNullable(data.description),
		customFields: toNullableCustomFields(data.customFields)
	};
}

export function normalizeContactData(data) {
	return {
		firstName: data.firstName,
		lastName: data.lastName,
		email: toNullable(data.email),
		phone: toNullable(data.phone),
		address: toNullable(data.address),
		addressPlaceId: toNullable(data.addressPlaceId),
		addressLatitude: toNullableNumber(data.addressLatitude),
		addressLongitude: toNullableNumber(data.addressLongitude),
		title: toNullable(data.title),
		department: toNullable(data.department),
		linkedinUrl: toNullable(data.linkedinUrl),
		source: toNullable(data.source),
		owner: toNullable(data.owner),
		ownerId: toNullableInt(data.ownerId),
		divisionId: toNullableInt(data.divisionId),
		clientId: data.clientId,
		customFields: toNullableCustomFields(data.customFields)
	};
}

export function normalizeJobOrderData(data) {
	const publicDescription = sanitizeRichTextHtml(data.publicDescription);
	const currencyCode =
		typeof data.currency === 'string' && data.currency.toUpperCase() === 'CAD' ? 'CAD' : 'USD';

	return {
		title: data.title,
		description: toNullable(data.description),
		publicDescription,
		location: toNullable(data.location),
		locationPlaceId: toNullable(data.locationPlaceId),
		locationLatitude: toNullableNumber(data.locationLatitude),
		locationLongitude: toNullableNumber(data.locationLongitude),
		city: toNullable(data.city),
		state: toNullable(data.state),
		zipCode: toNullable(data.zipCode),
		status: data.status,
		employmentType: toNullable(data.employmentType),
		openings: toNullableInt(data.openings) ?? 1,
		currency: currencyCode,
		salaryMin: toNullableNumber(data.salaryMin),
		salaryMax: toNullableNumber(data.salaryMax),
		publishToCareerSite: Boolean(data.publishToCareerSite),
		publishedAt: data.publishToCareerSite ? toNullableDate(data.publishedAt) || new Date() : null,
		ownerId: toNullableInt(data.ownerId),
		divisionId: toNullableInt(data.divisionId),
		clientId: data.clientId,
		contactId: Number(data.contactId),
		customFields: toNullableCustomFields(data.customFields)
	};
}

export function normalizeInterviewData(data) {
	const optionalParticipants = normalizeEmailList(data.optionalParticipantEmails);

	return {
		interviewMode: data.interviewMode,
		status: data.status,
		subject: data.subject,
		interviewer: toNullable(data.interviewer),
		interviewerEmail: toNullable(data.interviewerEmail),
		optionalParticipants: optionalParticipants.length > 0 ? optionalParticipants : null,
		startsAt: toNullableDate(data.startsAt),
		endsAt: toNullableDate(data.endsAt),
		location: toNullable(data.location),
		locationPlaceId: toNullable(data.locationPlaceId),
		locationLatitude: toNullableNumber(data.locationLatitude),
		locationLongitude: toNullableNumber(data.locationLongitude),
		videoLink: toNullable(data.videoLink),
		aiQuestionSet: toNullable(data.aiQuestionSet),
		customFields: toNullableCustomFields(data.customFields),
		candidateId: data.candidateId,
		jobOrderId: data.jobOrderId
	};
}

export function normalizeOfferData(data) {
	const compensationType = data.compensationType || 'hourly';
	const hourlyRtBillRate = toNullableNumber(data.hourlyRtBillRate);
	const hourlyRtPayRate = toNullableNumber(data.hourlyRtPayRate);
	const hourlyOtBillRate = toNullableNumber(data.hourlyOtBillRate);
	const hourlyOtPayRate = toNullableNumber(data.hourlyOtPayRate);
	const dailyBillRate = toNullableNumber(data.dailyBillRate);
	const dailyPayRate = toNullableNumber(data.dailyPayRate);
	const yearlyCompensation = toNullableNumber(data.yearlyCompensation);
	let amount = toNullableNumber(data.amount);
	let payPeriod = toNullable(data.payPeriod);

	if (compensationType === 'hourly') {
		amount = hourlyRtPayRate ?? hourlyRtBillRate;
		payPeriod = 'hourly';
	} else if (compensationType === 'daily') {
		amount = dailyPayRate ?? dailyBillRate;
		payPeriod = 'daily';
	} else if (compensationType === 'salary') {
		amount = yearlyCompensation;
		payPeriod = 'annual';
	}

	return {
		status: data.status,
		version: toNullableInt(data.version) ?? 1,
		placementType: data.placementType || 'temp',
		compensationType,
		currency: data.currency,
		amount,
		payPeriod,
		hourlyRtBillRate,
		hourlyRtPayRate,
		hourlyOtBillRate,
		hourlyOtPayRate,
		dailyBillRate,
		dailyPayRate,
		yearlyCompensation,
		regularRate: hourlyRtPayRate,
		overtimeRate: hourlyOtPayRate,
		dailyRate: dailyPayRate,
		annualSalary: yearlyCompensation,
		offeredOn: toNullableDate(data.offeredOn),
		expectedJoinDate: toNullableDate(data.expectedJoinDate),
		endDate: toNullableDate(data.endDate),
		withdrawnReason: toNullable(data.withdrawnReason),
		notes: toNullable(data.notes),
		customFields: toNullableCustomFields(data.customFields),
		candidateId: data.candidateId,
		jobOrderId: data.jobOrderId
	};
}

export function normalizeUserData(data) {
	return {
		firstName: data.firstName,
		lastName: data.lastName,
		email: data.email,
		role: data.role || 'RECRUITER',
		divisionId: toNullableInt(data.divisionId),
		isActive: Boolean(data.isActive)
	};
}

export function normalizeSkillData(data) {
	return {
		name: data.name.trim(),
		category: toNullable(data.category),
		isActive: Boolean(data.isActive)
	};
}
