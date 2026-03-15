import { z } from 'zod';
import { DIVISION_ACCESS_MODES, USER_ROLES } from '@/lib/security-constants';
import { isValidEmailAddress } from '@/lib/email-validation';
import {
	JOB_ORDER_EMPLOYMENT_TYPES,
	JOB_ORDER_STATUS_VALUES,
	normalizeJobOrderStatusInput
} from '@/lib/job-order-options';
import { hasMeaningfulRichTextContent } from '@/lib/rich-text';
import { SKILL_CATEGORY_OPTIONS } from '@/lib/skill-category-options';
import { isValidOptionalHttpUrl } from '@/lib/url-validation';
import { CLIENT_STATUS_OPTIONS } from '@/lib/client-status-options';

const optionalText = z.string().optional().or(z.literal(''));
const optionalCustomFields = z
	.union([z.record(z.string(), z.unknown()), z.null(), z.undefined()])
	.optional();

const optionalNumber = z
	.union([z.coerce.number(), z.literal(''), z.null(), z.undefined()])
	.optional();

const optionalInt = z
	.union([z.coerce.number().int(), z.literal(''), z.null(), z.undefined()])
	.optional();

const optionalPositiveInt = z
	.union([z.coerce.number().int().positive(), z.literal(''), z.null(), z.undefined()])
	.optional();

const optionalBoolean = z.union([z.coerce.boolean(), z.literal(''), z.null(), z.undefined()]).optional();
const optionalDateInput = z.union([z.string(), z.literal(''), z.null(), z.undefined()]).optional();
const optionalJobOrderEmploymentType = z
	.union([z.enum(JOB_ORDER_EMPLOYMENT_TYPES), z.literal(''), z.null(), z.undefined()])
	.optional();
const jobOrderStatus = z.preprocess(
	(value) => normalizeJobOrderStatusInput(value),
	z.enum(JOB_ORDER_STATUS_VALUES)
);
const optionalUrl = optionalText.refine((value) => isValidOptionalHttpUrl(value), {
	message: 'Enter a valid URL, including http:// or https://.'
});

export const candidateEducationSchema = z.object({
	schoolName: z.string().trim().min(1, 'School is required.'),
	degree: optionalText,
	fieldOfStudy: optionalText,
	startDate: optionalDateInput,
	endDate: optionalDateInput,
	isCurrent: optionalBoolean,
	description: optionalText
});

export const candidateWorkExperienceSchema = z.object({
	companyName: z.string().trim().min(1, 'Company is required.'),
	title: optionalText,
	location: optionalText,
	startDate: optionalDateInput,
	endDate: optionalDateInput,
	isCurrent: optionalBoolean,
	description: optionalText
});

export const userSchema = z.object({
	firstName: z.string().min(1),
	lastName: z.string().min(1),
	email: z.string().email(),
	password: optionalText.refine((value) => !value || value.trim().length >= 8, {
		message: 'Password must be at least 8 characters.'
	}),
	role: z.enum(USER_ROLES).default('RECRUITER'),
	divisionId: optionalPositiveInt,
	isActive: z.coerce.boolean().default(true)
});

export const divisionSchema = z.object({
	name: z.string().min(1),
	accessMode: z.enum(DIVISION_ACCESS_MODES).default('COLLABORATIVE')
});

export const candidateSchema = z.object({
	firstName: z.string().trim().min(1),
	lastName: z.string().trim().min(1),
	email: z
		.string()
		.trim()
		.min(1)
		.email()
		.refine((value) => isValidEmailAddress(value), {
			message: 'Enter a valid email address.'
		}),
	mobile: z.string().trim().min(1, 'Mobile phone is required.'),
	status: z.string().trim().min(1),
	stageChangeReason: optionalText,
	source: z.string().trim().min(1, 'Source is required.'),
	owner: optionalText,
	ownerId: z.coerce.number().int().positive(),
	divisionId: optionalPositiveInt,
	currentJobTitle: z.string().trim().min(1, 'Current job title is required.'),
	currentEmployer: z.string().trim().min(1, 'Current employer is required.'),
	experienceYears: optionalNumber,
	address: optionalText,
	addressPlaceId: optionalText,
	addressLatitude: optionalNumber,
	addressLongitude: optionalNumber,
	city: optionalText,
	state: optionalText,
	zipCode: optionalText,
	website: optionalUrl,
	linkedinUrl: optionalUrl,
	skillSet: optionalText,
	customFields: optionalCustomFields,
	skillIds: z.array(z.coerce.number().int().positive()).optional(),
	parsedSkillNames: z.array(z.string().trim().min(1)).optional(),
	educationRecords: z.array(candidateEducationSchema).optional(),
	workExperienceRecords: z.array(candidateWorkExperienceSchema).optional(),
	summary: optionalText
});

export const skillSchema = z.object({
	name: z.string().trim().min(1),
	category: z.enum(SKILL_CATEGORY_OPTIONS, {
		errorMap: () => ({ message: 'Category is required.' })
	}),
	isActive: z.coerce.boolean().default(true)
});

export const candidateNoteSchema = z.object({
	content: z.string().min(1),
	noteType: z.enum(['manual', 'email']).optional()
});

export const clientNoteSchema = z.object({
	content: z.string().min(1)
});

export const contactNoteSchema = z.object({
	content: z.string().min(1),
	noteType: z.enum(['manual', 'email']).optional()
});

export const candidateActivitySchema = z.object({
	type: z.string().min(1),
	subject: z.string().min(1),
	description: optionalText,
	dueAt: optionalDateInput,
	status: z.string().min(1).default('open')
});

export const clientSchema = z.object({
	name: z.string().trim().min(1),
	industry: optionalText,
	status: z.enum(CLIENT_STATUS_OPTIONS.map((option) => option.value)).default('Prospect'),
	owner: optionalText,
	phone: optionalText,
	address: optionalText,
	city: optionalText,
	state: optionalText,
	zipCode: z.string().trim().min(1, 'Zip code is required.'),
	ownerId: optionalPositiveInt,
	divisionId: optionalPositiveInt,
	website: optionalUrl,
	description: optionalText,
	customFields: optionalCustomFields
});

export const contactSchema = z.object({
	firstName: z.string().trim().min(1),
	lastName: z.string().trim().min(1),
	email: z.string().trim().email(),
	phone: z.string().trim().min(1),
	address: optionalText,
	addressPlaceId: optionalText,
	addressLatitude: optionalNumber,
	addressLongitude: optionalNumber,
	title: optionalText,
	department: optionalText,
	linkedinUrl: optionalUrl,
	source: z.string().trim().min(1),
	owner: optionalText,
	ownerId: z.coerce.number().int().positive(),
	divisionId: optionalPositiveInt,
	clientId: z.coerce.number().int().positive(),
	customFields: optionalCustomFields
});

export const jobOrderSchema = z
	.object({
		title: z.string().min(1),
		description: optionalText,
		publicDescription: optionalText,
		location: optionalText,
		locationPlaceId: optionalText,
		locationLatitude: optionalNumber,
		locationLongitude: optionalNumber,
		city: optionalText,
		state: optionalText,
		zipCode: z.string().trim().min(1, 'Zip code is required.'),
		status: jobOrderStatus,
		employmentType: optionalJobOrderEmploymentType,
		openings: optionalInt,
		currency: z.enum(['USD', 'CAD']).default('USD'),
		salaryMin: optionalNumber,
		salaryMax: optionalNumber,
		publishToCareerSite: z.coerce.boolean().default(false),
		publishedAt: optionalDateInput,
		ownerId: z.coerce.number().int().positive(),
		divisionId: optionalPositiveInt,
		clientId: z.coerce.number().int().positive(),
		contactId: z.coerce.number().int().positive(),
		customFields: optionalCustomFields
	})
	.superRefine((value, ctx) => {
		if (value.publishToCareerSite && !hasMeaningfulRichTextContent(value.publicDescription)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'Public description is required when posting to the career site.',
				path: ['publicDescription']
			});
		}

		const salaryMin = value.salaryMin == null || value.salaryMin === '' ? null : Number(value.salaryMin);
		const salaryMax = value.salaryMax == null || value.salaryMax === '' ? null : Number(value.salaryMax);
		if (Number.isFinite(salaryMin) && Number.isFinite(salaryMax) && salaryMin > salaryMax) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'Salary Min cannot be greater than Salary Max.',
				path: ['salaryMin']
			});
		}
	});

export const submissionSchema = z.object({
	candidateId: z.coerce.number().int().positive(),
	jobOrderId: z.coerce.number().int().positive(),
	status: z.string().min(1).default('submitted'),
	notes: optionalText,
	customFields: optionalCustomFields
});

export const interviewSchema = z.object({
	interviewMode: z.enum(['phone', 'video', 'in_person']).default('phone'),
	status: z.enum(['scheduled', 'completed', 'cancelled']).default('scheduled'),
	subject: z.string().trim().min(1),
	interviewer: z.string().trim().min(1, 'Interviewer is required.'),
	interviewerEmail: z
		.string()
		.trim()
		.min(1, 'Interviewer email is required.')
		.email('Enter a valid interviewer email address.')
		.refine((value) => isValidEmailAddress(value), {
			message: 'Enter a valid interviewer email address.'
		}),
	startsAt: optionalDateInput,
	endsAt: optionalDateInput,
	location: optionalText,
	locationPlaceId: optionalText,
	locationLatitude: optionalNumber,
	locationLongitude: optionalNumber,
	videoLink: optionalUrl,
	optionalParticipantEmails: z
		.array(
			z
				.string()
				.trim()
				.min(1)
				.email('Enter a valid optional participant email address.')
				.refine((value) => isValidEmailAddress(value), {
					message: 'Enter a valid optional participant email address.'
				})
		)
		.optional(),
	candidateId: z.coerce.number().int().positive(),
	jobOrderId: z.coerce.number().int().positive(),
	customFields: optionalCustomFields
});

export const offerSchema = z.object({
	status: z.string().min(1).default('planned'),
	version: optionalInt,
	placementType: z.enum(['temp', 'perm']).default('temp'),
	compensationType: z.enum(['hourly', 'daily', 'salary']).default('hourly'),
	currency: z.string().min(1).default('USD'),
	amount: optionalNumber,
	payPeriod: optionalText,
	regularRate: optionalNumber,
	overtimeRate: optionalNumber,
	dailyRate: optionalNumber,
	annualSalary: optionalNumber,
	hourlyRtBillRate: optionalNumber,
	hourlyRtPayRate: optionalNumber,
	hourlyOtBillRate: optionalNumber,
	hourlyOtPayRate: optionalNumber,
	dailyBillRate: optionalNumber,
	dailyPayRate: optionalNumber,
	yearlyCompensation: optionalNumber,
	offeredOn: optionalDateInput,
	expectedJoinDate: optionalDateInput,
	endDate: optionalDateInput,
	withdrawnReason: optionalText,
	notes: optionalText,
	candidateId: z.coerce.number().int().positive(),
	jobOrderId: z.coerce.number().int().positive(),
	customFields: optionalCustomFields
}).superRefine((value, ctx) => {
	const parseNumber = (input) => {
		if (input == null || input === '') return null;
		const parsed = Number(input);
		return Number.isFinite(parsed) ? parsed : null;
	};

	if (value.placementType === 'perm' && value.compensationType !== 'salary') {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: 'Permanent placements must use salary compensation.',
			path: ['compensationType']
		});
		return;
	}

	if (!value.offeredOn) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: 'Offer date is required.',
			path: ['offeredOn']
		});
	}

	if (!value.expectedJoinDate) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: 'Start date is required.',
			path: ['expectedJoinDate']
		});
	}

	if (value.compensationType === 'hourly') {
		const hourlyRtBillRate = parseNumber(value.hourlyRtBillRate);
		const hourlyRtPayRate = parseNumber(value.hourlyRtPayRate);
		const hourlyOtBillRate = parseNumber(value.hourlyOtBillRate);
		const hourlyOtPayRate = parseNumber(value.hourlyOtPayRate);

		if (hourlyRtBillRate == null || hourlyRtBillRate <= 0) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'RT bill rate is required for hourly compensation.',
				path: ['hourlyRtBillRate']
			});
		}

		if (hourlyRtPayRate == null || hourlyRtPayRate <= 0) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'RT pay rate is required for hourly compensation.',
				path: ['hourlyRtPayRate']
			});
		}

		if (hourlyOtBillRate == null || hourlyOtBillRate <= 0) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'OT bill rate is required for hourly compensation.',
				path: ['hourlyOtBillRate']
			});
		}

		if (hourlyOtPayRate == null || hourlyOtPayRate <= 0) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'OT pay rate is required for hourly compensation.',
				path: ['hourlyOtPayRate']
			});
		}
	}

	if (value.compensationType === 'daily') {
		const dailyBillRate = parseNumber(value.dailyBillRate);
		const dailyPayRate = parseNumber(value.dailyPayRate);

		if (dailyBillRate == null || dailyBillRate <= 0) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'Daily bill rate is required for daily compensation.',
				path: ['dailyBillRate']
			});
		}

		if (dailyPayRate == null || dailyPayRate <= 0) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'Daily pay rate is required for daily compensation.',
				path: ['dailyPayRate']
			});
		}
	}

	if (value.compensationType === 'salary') {
		const yearlyCompensation = parseNumber(value.yearlyCompensation);
		if (yearlyCompensation == null || yearlyCompensation <= 0) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: 'Yearly compensation is required for salaried compensation.',
				path: ['yearlyCompensation']
			});
		}
	}
});
