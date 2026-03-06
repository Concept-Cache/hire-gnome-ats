import { z } from 'zod';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logCreate, logUpdate } from '@/lib/audit-log';
import { isValidEmailAddress } from '@/lib/email-validation';
import { isValidOptionalHttpUrl } from '@/lib/url-validation';
import { normalizeCandidateSourceValue } from '@/app/constants/candidate-source-options';
import { buildWebResponseSubmissionNotes } from '@/lib/submission-origin';
import { sendEmailMessage } from '@/lib/email-delivery';
import {
	RESUME_UPLOAD_MAX_BYTES,
	isAllowedResumeUploadContentType,
	isAllowedResumeUploadFileName
} from '@/lib/candidate-attachment-options';
import {
	buildCandidateAttachmentStorageKey,
	uploadObjectBuffer
} from '@/lib/object-storage';
import { withInferredCityStateFromZip } from '@/lib/zip-code-lookup';
import { formatDateTimeAt } from '@/lib/date-format';
import { createNotification } from '@/lib/notifications';
import {
	CAREERS_APPLY_RATE_LIMIT_MAX_REQUESTS,
	CAREERS_APPLY_RATE_LIMIT_WINDOW_SECONDS,
	CAREERS_APPLY_MIN_FORM_FILL_SECONDS
} from '@/lib/security-constants';
import { getSystemBranding } from '@/lib/system-settings';
import { parseJsonBody, parseRouteId, ValidationError } from '@/lib/request-validation';
import { enforceMutationThrottle } from '@/lib/mutation-throttle';
import { logError, logInfo, logWarn, requestLogContext } from '@/lib/logger';

import { withApiLogging } from '@/lib/api-logging';
const optionalText = z.string().optional().or(z.literal(''));
const optionalUrl = optionalText.refine((value) => isValidOptionalHttpUrl(value), {
	message: 'Enter a valid URL, including http:// or https://.'
});
const RESUME_FILE_FIELD = 'resumeFile';
const HONEYPOT_FIELD = 'faxNumber';
const FORM_STARTED_AT_FIELD = 'startedAtMs';

const careerApplicationSchema = z.object({
	firstName: z.string().trim().min(1, 'First name is required.'),
	lastName: z.string().trim().min(1, 'Last name is required.'),
	email: z
		.string()
		.trim()
		.min(1, 'Email is required.')
		.email('Enter a valid email address.')
		.refine((value) => isValidEmailAddress(value), {
			message: 'Enter a valid email address.'
		}),
	mobile: z.string().trim().min(1, 'Mobile phone is required.'),
	zipCode: z.string().trim().min(1, 'Zip code is required.'),
	currentJobTitle: z.string().trim().min(1, 'Current job title is required.'),
	currentEmployer: z.string().trim().min(1, 'Current employer is required.'),
	linkedinUrl: optionalUrl
});

function escapeHtml(value) {
	return String(value || '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function buildWebApplicationCandidateNoteContent({ jobOrderTitle, application, normalizedEmail, resumeFileName }) {
	const lines = [
		`Applied to ${asTrimmedString(jobOrderTitle) || '-'} via public career site.`,
		`Applied At: ${new Date().toISOString()}`,
		`Email: ${asTrimmedString(normalizedEmail) || '-'}`,
		`Mobile: ${asTrimmedString(application.mobile) || '-'}`,
		`Zip Code: ${asTrimmedString(application.zipCode) || '-'}`,
		`Current Title: ${asTrimmedString(application.currentJobTitle) || '-'}`,
		`Current Employer: ${asTrimmedString(application.currentEmployer) || '-'}`,
		`LinkedIn: ${asTrimmedString(application.linkedinUrl) || '-'}`,
		`Resume File: ${asTrimmedString(resumeFileName) || '-'}`
	];
	return lines.join('\n');
}

function asTrimmedString(value) {
	return typeof value === 'string' ? value.trim() : '';
}

function buildCareerSiteApplicationOwnerEmail({
	jobOrder,
	application,
	normalizedEmail,
	applicantName,
	candidate,
	submission,
	resumeFileName
}) {
	const clientName = asTrimmedString(jobOrder?.client?.name) || '-';
	const ownerName = `${asTrimmedString(jobOrder?.ownerUser?.firstName)} ${asTrimmedString(jobOrder?.ownerUser?.lastName)}`.trim();
	const offeredLinkedin = asTrimmedString(application.linkedinUrl) || '-';
	const safeApplicantName = applicantName || '-';
	const safeJobOrderTitle = asTrimmedString(jobOrder?.title) || '-';
	const appliedAtDisplay = formatDateTimeAt(new Date());
	const subject = `New Career Site Application: ${safeApplicantName} for ${safeJobOrderTitle}`;

	const text = [
		`Hi ${ownerName || 'there'},`,
		'',
		'A new application was submitted through the career site.',
		'',
		`Job Order: ${safeJobOrderTitle}`,
		`Client: ${clientName}`,
		`Candidate: ${safeApplicantName}`,
		`Email: ${asTrimmedString(normalizedEmail) || '-'}`,
		`Mobile: ${asTrimmedString(application.mobile) || '-'}`,
		`Zip Code: ${asTrimmedString(application.zipCode) || '-'}`,
		`Current Title: ${asTrimmedString(application.currentJobTitle) || '-'}`,
		`Current Employer: ${asTrimmedString(application.currentEmployer) || '-'}`,
		`LinkedIn: ${offeredLinkedin}`,
		`Candidate Record ID: ${asTrimmedString(candidate?.recordId) || '-'}`,
		`Submission Record ID: ${asTrimmedString(submission?.recordId) || '-'}`,
		`Resume File: ${asTrimmedString(resumeFileName) || '-'}`,
		`Applied At: ${appliedAtDisplay}`
	].join('\n');

	const html = `
		<p>Hi ${escapeHtml(ownerName || 'there')},</p>
		<p>A new application was submitted through the career site.</p>
		<ul>
			<li><strong>Job Order:</strong> ${escapeHtml(safeJobOrderTitle)}</li>
			<li><strong>Client:</strong> ${escapeHtml(clientName)}</li>
			<li><strong>Candidate:</strong> ${escapeHtml(safeApplicantName)}</li>
			<li><strong>Email:</strong> ${escapeHtml(asTrimmedString(normalizedEmail) || '-')}</li>
			<li><strong>Mobile:</strong> ${escapeHtml(asTrimmedString(application.mobile) || '-')}</li>
			<li><strong>Zip Code:</strong> ${escapeHtml(asTrimmedString(application.zipCode) || '-')}</li>
			<li><strong>Current Title:</strong> ${escapeHtml(asTrimmedString(application.currentJobTitle) || '-')}</li>
			<li><strong>Current Employer:</strong> ${escapeHtml(asTrimmedString(application.currentEmployer) || '-')}</li>
			<li><strong>LinkedIn:</strong> ${escapeHtml(offeredLinkedin)}</li>
			<li><strong>Candidate Record ID:</strong> ${escapeHtml(asTrimmedString(candidate?.recordId) || '-')}</li>
			<li><strong>Submission Record ID:</strong> ${escapeHtml(asTrimmedString(submission?.recordId) || '-')}</li>
			<li><strong>Resume File:</strong> ${escapeHtml(asTrimmedString(resumeFileName) || '-')}</li>
			<li><strong>Applied At:</strong> ${escapeHtml(appliedAtDisplay)}</li>
		</ul>
	`.trim();

	return { subject, text, html };
}

function pickIncomingOrExisting(incoming, existingValue) {
	const incomingValue = asTrimmedString(incoming);
	if (incomingValue) return incomingValue;
	return existingValue ?? null;
}

function normalizeResumeFile(input) {
	if (!input || typeof input === 'string') return null;
	if (typeof input.arrayBuffer !== 'function') return null;
	return input;
}

function hasHoneypotContent(value) {
	return Boolean(asTrimmedString(value));
}

function parseEpochMs(value) {
	const raw = asTrimmedString(value);
	if (!raw) return 0;
	const parsed = Number.parseInt(raw, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) return 0;
	return parsed;
}

function getAutomatedSubmissionReason(payload = {}, options = {}) {
	if (hasHoneypotContent(payload?.[HONEYPOT_FIELD])) {
		return 'honeypot_field_populated';
	}

	const enforceTiming = options.enforceTiming !== false;
	if (!enforceTiming) {
		return '';
	}

	const minimumFillSeconds = Number(CAREERS_APPLY_MIN_FORM_FILL_SECONDS || 0);
	if (minimumFillSeconds <= 0) {
		return '';
	}

	const startedAtMs = parseEpochMs(payload?.[FORM_STARTED_AT_FIELD]);
	if (!startedAtMs) {
		return 'missing_started_at';
	}

	const nowMs = Date.now();
	if (startedAtMs > nowMs + 10_000) {
		return 'future_started_at';
	}

	const elapsedMs = Math.max(0, nowMs - startedAtMs);
	if (elapsedMs < minimumFillSeconds * 1000) {
		return 'submitted_too_fast';
	}

	return '';
}

function resumeValidationError(file) {
	if (!file) {
		return 'Resume file is required.';
	}

	if (!file.name || !isAllowedResumeUploadFileName(file.name)) {
		return 'Unsupported resume file type. Use PDF, DOC, or DOCX.';
	}
	if (!isAllowedResumeUploadContentType(file.name, file.type)) {
		return 'Unsupported resume file content type. Use PDF, DOC, or DOCX.';
	}

	if (file.size <= 0) {
		return 'Resume file is empty.';
	}

	if (file.size > RESUME_UPLOAD_MAX_BYTES) {
		return `Resume exceeds ${Math.floor(RESUME_UPLOAD_MAX_BYTES / (1024 * 1024))} MB limit.`;
	}

	return '';
}

async function parseApplicationInput(req) {
	const contentType = req.headers.get('content-type') || '';
	if (contentType.includes('multipart/form-data')) {
		const formData = await req.formData();
		return {
			enforceTiming: true,
			payload: {
				firstName: asTrimmedString(formData.get('firstName')),
				lastName: asTrimmedString(formData.get('lastName')),
				email: asTrimmedString(formData.get('email')),
				mobile: asTrimmedString(formData.get('mobile')),
				zipCode: asTrimmedString(formData.get('zipCode')),
				currentJobTitle: asTrimmedString(formData.get('currentJobTitle')),
				currentEmployer: asTrimmedString(formData.get('currentEmployer')),
				linkedinUrl: asTrimmedString(formData.get('linkedinUrl')),
				[HONEYPOT_FIELD]: asTrimmedString(formData.get(HONEYPOT_FIELD)),
				[FORM_STARTED_AT_FIELD]: asTrimmedString(formData.get(FORM_STARTED_AT_FIELD))
			},
			resumeFile: normalizeResumeFile(formData.get(RESUME_FILE_FIELD))
		};
	}

	const body = await parseJsonBody(req);
	return {
		enforceTiming: false,
		payload: {
			firstName: asTrimmedString(body?.firstName),
			lastName: asTrimmedString(body?.lastName),
			email: asTrimmedString(body?.email),
			mobile: asTrimmedString(body?.mobile),
			zipCode: asTrimmedString(body?.zipCode),
			currentJobTitle: asTrimmedString(body?.currentJobTitle),
			currentEmployer: asTrimmedString(body?.currentEmployer),
			linkedinUrl: asTrimmedString(body?.linkedinUrl),
			[HONEYPOT_FIELD]: asTrimmedString(body?.[HONEYPOT_FIELD]),
			[FORM_STARTED_AT_FIELD]: asTrimmedString(body?.[FORM_STARTED_AT_FIELD])
		},
		resumeFile: null
	};
}

async function postCareerSiteApplication(req, { params }) {
	const branding = await getSystemBranding();
	if (!branding?.careerSiteEnabled) {
		return NextResponse.json({ error: 'Career site is not enabled.' }, { status: 404 });
	}

	const resolvedParams = await params;
	let id;
	try {
		id = parseRouteId(resolvedParams);
	} catch (error) {
		if (error instanceof ValidationError) {
			return NextResponse.json({ error: error.message }, { status: 400 });
		}
		throw error;
	}

	try {
		const mutationThrottleResponse = await enforceMutationThrottle(
			req,
			'careers.jobs.id.apply.post',
			{
				maxRequests: CAREERS_APPLY_RATE_LIMIT_MAX_REQUESTS,
				windowSeconds: CAREERS_APPLY_RATE_LIMIT_WINDOW_SECONDS,
				message: 'Too many applications from this network. Please try again shortly.'
			}
		);
		if (mutationThrottleResponse) {
			return mutationThrottleResponse;
		}

		const { payload, resumeFile, enforceTiming } = await parseApplicationInput(req);
		const automatedReason = getAutomatedSubmissionReason(payload, { enforceTiming });
		if (automatedReason) {
			logWarn(
				'careers.jobs.id.apply.automated_submission_blocked',
				requestLogContext(req, {
					jobOrderId: id,
					reason: automatedReason
				})
			);
			return NextResponse.json({
				ok: true,
				message: 'Application submitted successfully.'
			});
		}
		const parsed = careerApplicationSchema.safeParse(payload);
		if (!parsed.success) {
			return NextResponse.json({ errors: parsed.error.flatten() }, { status: 400 });
		}

		const resumeError = resumeValidationError(resumeFile);
		if (resumeError) {
			return NextResponse.json({ error: resumeError }, { status: 400 });
		}

		let resumeBuffer = null;
		if (resumeFile) {
			resumeBuffer = Buffer.from(await resumeFile.arrayBuffer());
		}

		const jobOrder = await prisma.jobOrder.findFirst({
			where: {
				id,
				publishToCareerSite: true,
				status: { in: ['open', 'active'] }
			},
			select: {
				id: true,
				title: true,
				ownerId: true,
				divisionId: true,
				client: {
					select: {
						name: true
					}
				},
				ownerUser: {
					select: {
						id: true,
						firstName: true,
						lastName: true,
						email: true,
						isActive: true,
						notifyCareerSiteApplications: true
					}
				}
			}
		});

		if (!jobOrder) {
			return NextResponse.json(
				{ error: 'This job is no longer accepting applications.' },
				{ status: 404 }
			);
		}

		const application = parsed.data;
		const normalizedEmail = application.email.trim().toLowerCase();
		const applicantName = `${application.firstName} ${application.lastName}`.trim();

		const result = await prisma.$transaction(async (tx) => {
			const existingCandidate = await tx.candidate.findUnique({
				where: { email: normalizedEmail }
			});

			let candidate = existingCandidate;
			let candidateAuditEvent = null;

			if (!candidate) {
				const candidateCreateData = await withInferredCityStateFromZip(tx, {
					firstName: application.firstName,
					lastName: application.lastName,
					email: normalizedEmail,
					mobile: application.mobile.trim(),
					status: 'new',
					source: normalizeCandidateSourceValue('Career Site'),
					ownerId: jobOrder.ownerId ?? null,
					divisionId: jobOrder.divisionId ?? null,
					currentJobTitle: application.currentJobTitle?.trim() || null,
					currentEmployer: application.currentEmployer?.trim() || null,
					zipCode: application.zipCode?.trim() || null,
					linkedinUrl: application.linkedinUrl?.trim() || null
				});

				candidate = await tx.candidate.create({
					data: candidateCreateData
				});
				candidateAuditEvent = {
					action: 'CREATE',
					before: null,
					after: candidate
				};
			} else {
				const candidateUpdateData = await withInferredCityStateFromZip(tx, {
					firstName: pickIncomingOrExisting(application.firstName, candidate.firstName),
					lastName: pickIncomingOrExisting(application.lastName, candidate.lastName),
					mobile: pickIncomingOrExisting(application.mobile, candidate.mobile),
					zipCode: pickIncomingOrExisting(application.zipCode, candidate.zipCode),
					city: candidate.city,
					state: candidate.state,
					currentJobTitle: pickIncomingOrExisting(application.currentJobTitle, candidate.currentJobTitle),
					currentEmployer: pickIncomingOrExisting(application.currentEmployer, candidate.currentEmployer),
					linkedinUrl: pickIncomingOrExisting(application.linkedinUrl, candidate.linkedinUrl),
					ownerId: candidate.ownerId ?? jobOrder.ownerId ?? null,
					divisionId: candidate.divisionId ?? jobOrder.divisionId ?? null
				});

				const updatedCandidate = await tx.candidate.update({
					where: { id: candidate.id },
					data: candidateUpdateData
				});
				candidateAuditEvent = {
					action: 'UPDATE',
					before: candidate,
					after: updatedCandidate
				};
				candidate = updatedCandidate;
			}

			const notes = buildWebResponseSubmissionNotes({
				jobOrderTitle: jobOrder.title,
				applicantName,
				email: normalizedEmail,
				mobile: application.mobile,
				zipCode: application.zipCode,
				currentJobTitle: application.currentJobTitle,
				currentEmployer: application.currentEmployer,
				linkedinUrl: application.linkedinUrl,
				resumeFileName: resumeFile?.name || ''
			});

			const createdSubmission = await tx.submission.create({
				data: {
					candidateId: candidate.id,
					jobOrderId: jobOrder.id,
					status: 'submitted',
					notes,
					createdByUserId: null
				},
				include: {
					candidate: true,
					jobOrder: { include: { client: true } },
					createdByUser: {
						select: { id: true, firstName: true, lastName: true, email: true, isActive: true }
					}
				}
			});

			await tx.candidateNote.create({
				data: {
					candidateId: candidate.id,
					createdByUserId: null,
					content: buildWebApplicationCandidateNoteContent({
						jobOrderTitle: jobOrder.title,
						application,
						normalizedEmail,
						resumeFileName: resumeFile?.name || ''
					})
				}
			});

			return {
				candidate,
				submission: createdSubmission,
				candidateAuditEvent
			};
		});

		const { candidate, submission, candidateAuditEvent } = result;
		await Promise.allSettled([
			candidateAuditEvent?.action === 'CREATE'
				? logCreate({
						actorUserId: null,
						entityType: 'CANDIDATE',
						entity: candidateAuditEvent.after,
						metadata: { source: 'career_site' }
					})
				: Promise.resolve(),
			candidateAuditEvent?.action === 'UPDATE'
				? logUpdate({
						actorUserId: null,
						entityType: 'CANDIDATE',
						before: candidateAuditEvent.before,
						after: candidateAuditEvent.after,
						metadata: { source: 'career_site' }
					})
				: Promise.resolve(),
			logCreate({
				actorUserId: null,
				entityType: 'SUBMISSION',
				entity: submission,
				metadata: { source: 'career_site' }
			})
		]);

		let resumeAttachment = null;
		if (resumeFile) {
			const buffer = resumeBuffer || Buffer.from(await resumeFile.arrayBuffer());
			const storageKey = buildCandidateAttachmentStorageKey(candidate.id, resumeFile.name);
			const uploaded = await uploadObjectBuffer({
				key: storageKey,
				body: buffer,
				contentType: resumeFile.type || 'application/octet-stream'
			});

			resumeAttachment = await prisma.candidateAttachment.create({
				data: {
					candidateId: candidate.id,
					fileName: resumeFile.name,
					contentType: resumeFile.type || null,
					sizeBytes: resumeFile.size,
					storageProvider: uploaded.storageProvider,
					storageBucket: uploaded.storageBucket,
					storageKey: uploaded.storageKey,
					uploadedByUserId: null
				}
			});

			await Promise.allSettled([
				logCreate({
					actorUserId: null,
					entityType: 'CANDIDATE_ATTACHMENT',
					entity: resumeAttachment,
					metadata: { source: 'career_site', candidateId: candidate.id }
				}),
				prisma.candidateNote.create({
					data: {
						candidateId: candidate.id,
						createdByUserId: null,
						content: `Resume uploaded from career-site application: ${resumeFile.name}`
					}
				})
			]);
		}

		if (jobOrder?.ownerUser?.id) {
			await createNotification({
				userId: jobOrder.ownerUser.id,
				type: 'career_site',
				title: 'New Career Site Application',
				message: `${applicantName || normalizedEmail} applied to ${jobOrder.title || 'your job order'}.`,
				entityType: 'SUBMISSION',
				entityId: submission.id,
				linkHref: `/submissions/${submission.id}`
			});
		}

		const ownerEmail = asTrimmedString(jobOrder?.ownerUser?.email).toLowerCase();
		if (jobOrder?.ownerUser && jobOrder.ownerUser.notifyCareerSiteApplications === false) {
			logInfo(
				'career_site.application.owner_notification.skipped_opt_out',
				requestLogContext(req, {
					jobOrderId: jobOrder.id,
					ownerId: jobOrder.ownerUser.id
				})
			);
		} else if (ownerEmail && isValidEmailAddress(ownerEmail)) {
			const ownerNotification = buildCareerSiteApplicationOwnerEmail({
				jobOrder,
				application,
				normalizedEmail,
				applicantName,
				candidate,
				submission,
				resumeFileName: resumeFile?.name || ''
			});
			const emailResult = await sendEmailMessage({
				to: ownerEmail,
				subject: ownerNotification.subject,
				text: ownerNotification.text,
				html: ownerNotification.html,
				attachments:
					resumeFile && resumeBuffer
						? [
								{
									filename: resumeFile.name,
									content: resumeBuffer,
									contentType: resumeFile.type || 'application/octet-stream'
								}
							]
						: []
			});
			if (!emailResult.sent) {
				logError(
					'career_site.application.owner_notification.failed',
					requestLogContext(req, {
						jobOrderId: jobOrder.id,
						candidateId: candidate.id,
						submissionId: submission.id,
						ownerEmail,
						reason: emailResult.reason || 'Unknown error'
					})
				);
			}
		} else {
			logWarn(
				'career_site.application.owner_notification.skipped_invalid_owner_email',
				requestLogContext(req, {
					jobOrderId: jobOrder.id,
					ownerId: jobOrder.ownerId ?? null
				})
			);
		}

		return NextResponse.json(
			{
				ok: true,
				message: 'Application submitted successfully.',
				submissionId: submission.id,
				candidateId: submission.candidateId,
				jobOrderId: submission.jobOrderId,
				resumeAttached: Boolean(resumeAttachment)
			},
			{ status: 201 }
		);
	} catch (error) {
		if (error instanceof ValidationError) {
			return NextResponse.json({ error: error.message }, { status: 400 });
		}
		if (error?.code === 'P2002') {
			return NextResponse.json(
				{ error: 'You already applied to this role with this email address.' },
				{ status: 409 }
			);
		}

		return NextResponse.json(
			{ error: 'Failed to submit application. Please try again shortly.' },
			{ status: 500 }
		);
	}
}

export const POST = withApiLogging('careers.jobs.id.apply.post', postCareerSiteApplication);
