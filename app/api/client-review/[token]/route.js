import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { buildClientPortalPayload, createClientSubmissionFeedback, loadClientPortalAccessByToken, markClientPortalViewed } from '@/lib/client-portal';
import { createNotificationsForUsers } from '@/lib/notifications';
import { logCreate } from '@/lib/audit-log';
import { sendEmailMessage } from '@/lib/email-delivery';
import { isValidEmailAddress } from '@/lib/email-validation';
import { formatDateTimeAt } from '@/lib/date-format';
import { getSystemBranding } from '@/lib/system-settings';
import { logError, logInfo, logWarn, requestLogContext } from '@/lib/logger';

import { withApiLogging } from '@/lib/api-logging';

function escapeHtml(value) {
	return String(value || '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function buildClientFeedbackEmail({
	siteName,
	recipientFirstName,
	clientName,
	actionLabel,
	candidateName,
	jobOrderTitle,
	comment,
	submissionId,
	linkHref,
	createdAt
}) {
	const safeSiteName = String(siteName || 'Hire Gnome ATS').trim() || 'Hire Gnome ATS';
	const safeRecipientFirstName = String(recipientFirstName || '').trim() || 'there';
	const safeClientName = String(clientName || 'A client').trim() || 'A client';
	const safeActionLabel = String(actionLabel || 'Updated').trim() || 'Updated';
	const safeCandidateName = String(candidateName || 'candidate').trim() || 'candidate';
	const safeJobOrderTitle = String(jobOrderTitle || 'job order').trim() || 'job order';
	const safeComment = String(comment || '').trim();
	const safeLinkHref = String(linkHref || '').trim();
	const submittedAt = formatDateTimeAt(createdAt);
	const subject = `${safeSiteName}: Client Feedback - ${safeActionLabel} for ${safeCandidateName}`;
	const lines = [
		`Hi ${safeRecipientFirstName},`,
		'',
		`${safeClientName} submitted client feedback on ${safeCandidateName}.`,
		'',
		`Action: ${safeActionLabel}`,
		`Job Order: ${safeJobOrderTitle}`,
		`Submission ID: ${submissionId}`,
		`Received: ${submittedAt}`
	];
	if (safeComment) {
		lines.push(`Comment: ${safeComment}`);
	}
	if (safeLinkHref) {
		lines.push('', `Open Submission: ${safeLinkHref}`);
	}
	const text = lines.join('\n');
	const html = `
		<p>Hi ${escapeHtml(safeRecipientFirstName)},</p>
		<p>${escapeHtml(safeClientName)} submitted client feedback on <strong>${escapeHtml(safeCandidateName)}</strong>.</p>
		<ul>
			<li><strong>Action:</strong> ${escapeHtml(safeActionLabel)}</li>
			<li><strong>Job Order:</strong> ${escapeHtml(safeJobOrderTitle)}</li>
			<li><strong>Submission ID:</strong> ${escapeHtml(String(submissionId || '-'))}</li>
			<li><strong>Received:</strong> ${escapeHtml(submittedAt)}</li>
			${safeComment ? `<li><strong>Comment:</strong> ${escapeHtml(safeComment)}</li>` : ''}
		</ul>
		${safeLinkHref ? `<p><a href="${escapeHtml(safeLinkHref)}">Open Submission</a></p>` : ''}
	`.trim();

	return { subject, text, html };
}

async function getClient_review_tokenHandler(req, { params }) {
	try {
		const branding = await getSystemBranding();
		if (!branding.clientPortalEnabled) {
			return NextResponse.json({ error: 'Client review portal not found.' }, { status: 404 });
		}
		const awaitedParams = await params;
		const token = String(awaitedParams?.token || '').trim();
		const portalAccess = await loadClientPortalAccessByToken(token);
		if (!portalAccess) {
			return NextResponse.json({ error: 'Client review portal not found.' }, { status: 404 });
		}

		const viewedAt = new Date();
		void markClientPortalViewed(portalAccess.id);
		portalAccess.lastViewedAt = viewedAt;

		return NextResponse.json(await buildClientPortalPayload({ req, token, portalAccess }));
	} catch {
		return NextResponse.json({ error: 'Failed to load client review portal.' }, { status: 500 });
	}
}

async function postClient_review_tokenHandler(req, { params }) {
	try {
		const branding = await getSystemBranding();
		if (!branding.clientPortalEnabled) {
			return NextResponse.json({ error: 'Client review portal not found.' }, { status: 404 });
		}
		const awaitedParams = await params;
		const token = String(awaitedParams?.token || '').trim();
		const portalAccess = await loadClientPortalAccessByToken(token);
		if (!portalAccess) {
			return NextResponse.json({ error: 'Client review portal not found.' }, { status: 404 });
		}

		const body = await req.json().catch(() => ({}));
		const submissionId = Number(body.submissionId);
		const actionType = String(body.actionType || '').trim().toLowerCase();
		const comment = String(body.comment || '');
		if (!['comment', 'request_interview', 'pass'].includes(actionType)) {
			return NextResponse.json({ error: 'Unsupported client feedback action.' }, { status: 400 });
		}
		if (!Number.isInteger(submissionId) || submissionId <= 0) {
			return NextResponse.json({ error: 'Submission is required.' }, { status: 400 });
		}

		const result = await createClientSubmissionFeedback({
			req,
			portalAccess,
			submissionId,
			actionType,
			comment
		});

		await logCreate({
			actorUserId: null,
			entityType: 'CLIENT_SUBMISSION_FEEDBACK',
			entity: result.feedback,
			summary: `${result.actionLabel} via client portal for submission #${result.submission.id}`
		});

		const notificationRecipients = await prisma.user.findMany({
			where: {
				id: {
					in: [
						result.submission.jobOrder?.ownerId,
						result.submission.createdByUserId,
						result.submission.candidate?.ownerId
					].filter((value) => Number.isInteger(Number(value)) && Number(value) > 0)
				},
				isActive: true,
				notifyClientPortalFeedback: true
			},
			select: { id: true, firstName: true, email: true }
		});

		const inAppRecipientIds = notificationRecipients.map((user) => user.id);

		await createNotificationsForUsers({
			userIds: inAppRecipientIds,
			type: 'info',
			title: `Client Feedback: ${result.actionLabel}`,
			message: `${portalAccess.contact?.firstName || 'Client'} ${portalAccess.contact?.lastName || ''}`.trim()
				? `${`${portalAccess.contact?.firstName || 'Client'} ${portalAccess.contact?.lastName || ''}`.trim()} responded on ${result.submission.candidate?.firstName || 'candidate'} ${result.submission.candidate?.lastName || ''}.`
				: 'A client responded through the review portal.',
			entityType: 'SUBMISSION',
			entityId: result.submission.id,
			linkHref: `/submissions/${result.submission.id}`
		});

		const candidateName = `${result.submission.candidate?.firstName || ''} ${result.submission.candidate?.lastName || ''}`.trim() || 'candidate';
		const clientName = `${portalAccess.contact?.firstName || ''} ${portalAccess.contact?.lastName || ''}`.trim() || 'Client Contact';
		const submissionLinkHref = `/submissions/${result.submission.id}`;
		const baseUrl = (() => {
			try {
				return new URL(req.url).origin;
			} catch {
				return '';
			}
		})();
		const submissionUrl = baseUrl ? `${baseUrl}${submissionLinkHref}` : submissionLinkHref;

		await Promise.allSettled(
			notificationRecipients.map(async (user) => {
				const recipientEmail = String(user.email || '').trim().toLowerCase();
				if (!isValidEmailAddress(recipientEmail)) {
					logWarn(
						'client_portal.feedback.email_notification.skipped_invalid_email',
						requestLogContext(req, {
							submissionId: result.submission.id,
							recipientUserId: user.id
						})
					);
					return;
				}

				const email = buildClientFeedbackEmail({
					siteName: branding.siteName,
					recipientFirstName: user.firstName,
					clientName,
					actionLabel: result.actionLabel,
					candidateName,
					jobOrderTitle: result.submission.jobOrder?.title || '',
					comment,
					submissionId: result.submission.recordId || result.submission.id,
					linkHref: submissionUrl,
					createdAt: result.feedback.createdAt
				});
				const delivery = await sendEmailMessage({
					to: recipientEmail,
					subject: email.subject,
					text: email.text,
					html: email.html
				});

				if (!delivery.sent) {
					logError(
						'client_portal.feedback.email_notification.failed',
						requestLogContext(req, {
							submissionId: result.submission.id,
							recipientUserId: user.id,
							recipientEmail,
							reason: delivery.reason || 'Unknown error'
						})
					);
					return;
				}

				logInfo(
					'client_portal.feedback.email_notification.sent',
					requestLogContext(req, {
						submissionId: result.submission.id,
						recipientUserId: user.id,
						recipientEmail,
						testMode: Boolean(delivery.testMode)
					})
				);
			})
		);

		const refreshedAccess = await loadClientPortalAccessByToken(token);
		return NextResponse.json({
			message: `${result.actionLabel} saved.`,
			portal: await buildClientPortalPayload({ req, token, portalAccess: refreshedAccess })
		});
	} catch (error) {
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : 'Failed to save client feedback.' },
			{ status: 400 }
		);
	}
}

export const GET = withApiLogging('client_review.token.get', getClient_review_tokenHandler);
export const POST = withApiLogging('client_review.token.post', postClient_review_tokenHandler);
