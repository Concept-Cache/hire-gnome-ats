import crypto from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { getSystemBranding } from '@/lib/system-settings';

const CLIENT_PORTAL_TOKEN_VERSION = 'cp1';
const ACTION_LABELS = Object.freeze({
	comment: 'Comment',
	request_interview: 'Requested Interview',
	pass: 'Passed'
});

function getClientPortalSecret() {
	return (
		String(process.env.CLIENT_PORTAL_SECRET || '').trim() ||
		String(process.env.AUTH_SESSION_SECRET || '').trim() ||
		'dev-client-portal-secret-change-me'
	);
}

function signPortalPayload(payloadBase64Url) {
	return crypto.createHmac('sha256', getClientPortalSecret()).update(payloadBase64Url).digest('base64url');
}

function toSafeTrimmedString(value) {
	return String(value || '').trim();
}

function truncateText(value, maxLength = 520) {
	const text = toSafeTrimmedString(value).replace(/\s+/g, ' ');
	if (!text) return '';
	if (text.length <= maxLength) return text;
	return `${text.slice(0, maxLength - 1).trimEnd()}...`;
}

function getRequestOrigin(req) {
	try {
		return new URL(req.url).origin;
	} catch {
		return '';
	}
}

export function createClientPortalToken({ portalAccessRecordId }) {
	const recordId = toSafeTrimmedString(portalAccessRecordId);
	if (!recordId) {
		throw new Error('Portal access record id is required.');
	}

	const payload = {
		v: CLIENT_PORTAL_TOKEN_VERSION,
		rid: recordId
	};
	const payloadBase64Url = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
	return `${payloadBase64Url}.${signPortalPayload(payloadBase64Url)}`;
}

export function verifyClientPortalToken(token) {
	const rawToken = toSafeTrimmedString(token);
	if (!rawToken) return null;

	const parts = rawToken.split('.');
	if (parts.length !== 2 || !parts[0] || !parts[1]) return null;

	const payloadBase64Url = parts[0];
	const providedSignature = parts[1];
	const expectedSignature = signPortalPayload(payloadBase64Url);
	const providedBuffer = Buffer.from(providedSignature, 'utf8');
	const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
	if (providedBuffer.length !== expectedBuffer.length) return null;
	if (!crypto.timingSafeEqual(providedBuffer, expectedBuffer)) return null;

	try {
		const payload = JSON.parse(Buffer.from(payloadBase64Url, 'base64url').toString('utf8'));
		if (!payload || payload.v !== CLIENT_PORTAL_TOKEN_VERSION) return null;
		const recordId = toSafeTrimmedString(payload.rid);
		return recordId ? { recordId } : null;
	} catch {
		return null;
	}
}

export function buildClientPortalUrl({ req, token }) {
	const safeToken = toSafeTrimmedString(token);
	const origin = getRequestOrigin(req);
	if (!safeToken || !origin) return '';
	return `${origin}/client-review/${encodeURIComponent(safeToken)}`;
}

function getClientIp(req) {
	const forwarded = String(req?.headers?.get('x-forwarded-for') || '')
		.split(',')
		.map((value) => value.trim())
		.find(Boolean);
	const realIp = String(req?.headers?.get('x-real-ip') || '').trim();
	const cfIp = String(req?.headers?.get('cf-connecting-ip') || '').trim();
	return forwarded || realIp || cfIp || 'unknown';
}

function getUserAgent(req) {
	return toSafeTrimmedString(req?.headers?.get('user-agent')) || 'unknown';
}

function getActionLabel(actionType) {
	return ACTION_LABELS[actionType] || actionType;
}

function serializePortalFeedback(row) {
	return {
		id: row.id,
		recordId: row.recordId,
		actionType: row.actionType,
		actionLabel: getActionLabel(row.actionType),
		comment: row.comment || '',
		statusApplied: row.statusApplied || '',
		clientName: row.clientNameSnapshot || '',
		clientEmail: row.clientEmailSnapshot || '',
		createdAt: row.createdAt
	};
}

function serializePortalSubmission(row, token) {
	const candidate = row?.candidate || {};
	const attachments = Array.isArray(candidate.attachments) ? [...candidate.attachments] : [];
	const feedbackEntries = Array.isArray(row.clientFeedback)
		? row.clientFeedback.map((entry) => serializePortalFeedback(entry))
		: [];
	const aiOverview = toSafeTrimmedString(candidate?.aiSummary?.overview);
	const fallbackSummary = truncateText(candidate?.summary, 520);
	const hasClientPassed = feedbackEntries.some((entry) => entry.actionType === 'pass');

	const primaryResume = attachments
		.filter((attachment) => Boolean(attachment?.isResume))
		.sort((left, right) => String(left?.fileName || '').localeCompare(String(right?.fileName || '')))[0] || null;

	return {
		id: row.id,
		recordId: row.recordId,
		status: row.status || 'submitted',
		submissionPriority: Number(row.submissionPriority || 0),
		candidate: {
			id: candidate.id,
			recordId: candidate.recordId || '',
			firstName: candidate.firstName || '',
			lastName: candidate.lastName || '',
			name: `${candidate.firstName || ''} ${candidate.lastName || ''}`.trim(),
			currentJobTitle: candidate.currentJobTitle || '',
			currentEmployer: candidate.currentEmployer || '',
			location: [candidate.city, candidate.state].filter(Boolean).join(', '),
			summary: aiOverview || fallbackSummary
		},
		clientWriteUp: row.aiWriteUp || '',
		hasClientPassed,
		files: primaryResume
			? [{
					id: primaryResume.id,
					recordId: primaryResume.recordId || '',
					fileName: primaryResume.fileName || 'Resume',
					isResume: true,
					label: 'Resume',
					sizeBytes: Number(primaryResume.sizeBytes || 0),
					contentType: primaryResume.contentType || '',
					downloadHref: `/api/client-review/${encodeURIComponent(token)}/submissions/${row.id}/files/${primaryResume.id}/download`
				}]
			: [],
		feedback: feedbackEntries
	};
}

export async function loadClientPortalAccessByToken(token) {
	const verified = verifyClientPortalToken(token);
	if (!verified) return null;

	return prisma.clientPortalAccess.findFirst({
		where: {
			recordId: verified.recordId,
			isRevoked: false
		},
		include: {
			contact: {
				select: {
					id: true,
					recordId: true,
					firstName: true,
					lastName: true,
					email: true,
					title: true
				}
			},
			jobOrder: {
				select: {
					id: true,
					recordId: true,
					title: true,
					status: true,
					client: {
						select: {
							id: true,
							recordId: true,
							name: true
						}
					},
					submissions: {
						where: {
							isClientVisible: true
						},
						orderBy: [{ submissionPriority: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
						include: {
							candidate: {
								select: {
									id: true,
									recordId: true,
									firstName: true,
									lastName: true,
									currentJobTitle: true,
									currentEmployer: true,
									city: true,
									state: true,
									summary: true,
									aiSummary: {
										select: {
											overview: true
										}
									},
									attachments: {
										orderBy: { createdAt: 'asc' },
										select: {
											id: true,
											recordId: true,
											fileName: true,
											isResume: true,
											sizeBytes: true,
											contentType: true
										}
									}
								}
							},
							clientFeedback: {
								orderBy: { createdAt: 'desc' },
								select: {
									id: true,
									recordId: true,
									actionType: true,
									comment: true,
									statusApplied: true,
									clientNameSnapshot: true,
									clientEmailSnapshot: true,
									createdAt: true
								}
							}
						}
					}
				}
			}
		}
	});
}

export async function markClientPortalViewed(portalAccessId) {
	if (!portalAccessId) return;
	try {
		await prisma.clientPortalAccess.update({
			where: { id: Number(portalAccessId) },
			data: {
				lastViewedAt: new Date()
			}
		});
	} catch {
		// Best-effort view tracking.
	}
}

export async function buildClientPortalPayload({ req, token, portalAccess }) {
	const branding = await getSystemBranding();
	const contact = portalAccess?.contact || {};
	const jobOrder = portalAccess?.jobOrder || {};

	return {
		branding,
		portal: {
			recordId: portalAccess.recordId,
			token,
			lastViewedAt: portalAccess.lastViewedAt,
			lastActionAt: portalAccess.lastActionAt,
			contact: {
				id: contact.id,
				recordId: contact.recordId || '',
				firstName: contact.firstName || '',
				lastName: contact.lastName || '',
				name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'Client Contact',
				email: contact.email || '',
				title: contact.title || ''
			},
			jobOrder: {
				id: jobOrder.id,
				recordId: jobOrder.recordId || '',
				title: jobOrder.title || '',
				status: jobOrder.status || '',
				clientName: jobOrder.client?.name || ''
			},
			portalUrl: buildClientPortalUrl({ req, token })
		},
		submissions: Array.isArray(jobOrder.submissions)
			? jobOrder.submissions.map((submission) => serializePortalSubmission(submission, token))
			: []
	};
}

export function buildClientPortalInternalSummary({ req, portalAccess }) {
	if (!portalAccess) return null;
	const token = createClientPortalToken({ portalAccessRecordId: portalAccess.recordId });
	const contact = portalAccess.contact || {};
	return {
		id: portalAccess.id,
		recordId: portalAccess.recordId,
		isRevoked: Boolean(portalAccess.isRevoked),
		lastViewedAt: portalAccess.lastViewedAt,
		lastActionAt: portalAccess.lastActionAt,
		lastEmailedAt: portalAccess.lastEmailedAt,
		createdAt: portalAccess.createdAt,
		contact: {
			id: contact.id,
			recordId: contact.recordId || '',
			firstName: contact.firstName || '',
			lastName: contact.lastName || '',
			name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'Client Contact',
			email: contact.email || '',
			title: contact.title || ''
		},
		token,
		portalUrl: buildClientPortalUrl({ req, token })
	};
}

export async function createClientSubmissionFeedback({
	req,
	portalAccess,
	submissionId,
	actionType,
	comment = ''
}) {
	const normalizedActionType = toSafeTrimmedString(actionType).toLowerCase();
	const allowedActions = new Set(['comment', 'request_interview', 'pass']);
	if (!allowedActions.has(normalizedActionType)) {
		throw new Error('Unsupported client feedback action.');
	}

	const submission = await prisma.submission.findFirst({
		where: {
			id: Number(submissionId),
			jobOrderId: portalAccess.jobOrderId
		},
		select: {
			id: true,
			recordId: true,
			status: true,
			submissionPriority: true,
			candidate: {
				select: {
					id: true,
					firstName: true,
					lastName: true,
					recordId: true,
					ownerId: true
				}
			},
			jobOrder: {
				select: {
					id: true,
					title: true,
					recordId: true,
					ownerId: true
				}
			},
			createdByUserId: true
		}
	});

	if (!submission) {
		throw new Error('Submission not found for this portal.');
	}

	const existingPass = await prisma.clientSubmissionFeedback.findFirst({
		where: {
			submissionId: submission.id,
			actionType: 'pass'
		},
		select: { id: true }
	});
	if (existingPass) {
		throw new Error('This submission has already been passed. No further client actions are allowed.');
	}

	const now = new Date();
	const normalizedComment = toSafeTrimmedString(comment);
	const contactName = `${portalAccess.contact?.firstName || ''} ${portalAccess.contact?.lastName || ''}`.trim() || 'Client Contact';
	const contactEmail = portalAccess.contact?.email || '';
	const statusApplied = normalizedActionType === 'pass' ? 'rejected' : null;

	const feedback = await prisma.$transaction(async (tx) => {
		if (statusApplied) {
			const lastRankedSubmission = await tx.submission.findFirst({
				where: {
					jobOrderId: submission.jobOrder.id,
					NOT: { id: submission.id }
				},
				orderBy: [{ submissionPriority: 'desc' }, { id: 'desc' }],
				select: {
					submissionPriority: true
				}
			});
			const nextSubmissionPriority = Number(lastRankedSubmission?.submissionPriority || 0) + 1;
			await tx.submission.update({
				where: { id: submission.id },
				data: {
					status: statusApplied,
					submissionPriority: nextSubmissionPriority
				}
			});
		}

		const created = await tx.clientSubmissionFeedback.create({
			data: {
				submissionId: submission.id,
				portalAccessId: portalAccess.id,
				actionType: normalizedActionType,
				comment: normalizedComment || null,
				statusApplied,
				clientNameSnapshot: contactName,
				clientEmailSnapshot: contactEmail,
				ipAddress: getClientIp(req),
				userAgent: truncateText(getUserAgent(req), 180)
			}
		});

		await tx.clientPortalAccess.update({
			where: { id: portalAccess.id },
			data: {
				lastActionAt: now,
				lastViewedAt: now
			}
		});

		return created;
	});

	return {
		feedback,
		submission,
		actionLabel: getActionLabel(normalizedActionType),
		statusApplied
	};
}
