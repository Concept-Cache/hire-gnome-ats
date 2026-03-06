import nodemailer from 'nodemailer';
import { buildInterviewInviteFilename, buildInterviewInviteIcs } from '@/lib/interview-invite-ics';
import { formatDateTimeAt } from '@/lib/date-format';
import { isValidEmailAddress } from '@/lib/email-validation';
import { getIntegrationSettings } from '@/lib/system-settings';
import { getVideoCallProviderLabel, inferVideoCallProviderFromLink } from '@/lib/video-call-links';

let cachedTransporter = null;
let cachedTransporterKey = '';

function toBoolean(value, fallback = false) {
	if (typeof value !== 'string') return fallback;
	const normalized = value.trim().toLowerCase();
	if (!normalized) return fallback;
	if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
	if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
	return fallback;
}

function formatFromAddress(fromName, fromEmail) {
	if (!fromEmail) return '';
	const safeName = String(fromName || '').trim().replace(/"/g, '');
	if (!safeName) return fromEmail;
	return `"${safeName}" <${fromEmail}>`;
}

async function getMailConfig() {
	const integrationSettings = await getIntegrationSettings();
	return {
		host: String(integrationSettings.smtpHost || '').trim(),
		port: integrationSettings.smtpPort,
		secure: Boolean(integrationSettings.smtpSecure),
		user: String(integrationSettings.smtpUser || '').trim(),
		pass: String(integrationSettings.smtpPass || '').trim(),
		fromName: String(integrationSettings.smtpFromName || '').trim(),
		fromEmail: String(integrationSettings.smtpFromEmail || '').trim(),
		testMode: toBoolean(String(integrationSettings.emailTestMode ?? ''), false),
		testRecipient: String(integrationSettings.emailTestRecipient || '').trim().toLowerCase()
	};
}

function toOptionalParticipantEmails(rawValue) {
	if (!Array.isArray(rawValue)) return [];

	const emails = [];
	for (const value of rawValue) {
		const email =
			typeof value === 'string'
				? value
				: typeof value?.email === 'string'
					? value.email
					: '';
		const normalized = String(email || '').trim().toLowerCase();
		if (!isValidEmailAddress(normalized)) continue;
		emails.push(normalized);
	}
	return emails;
}

function getParticipantRecipients(interview) {
	const recipients = [];
	const seen = new Set();

	function addRecipient(email, role, name = '') {
		const normalized = String(email || '').trim().toLowerCase();
		if (!isValidEmailAddress(normalized)) return;
		if (seen.has(normalized)) return;
		seen.add(normalized);
		recipients.push({
			email: normalized,
			role,
			name: String(name || '').trim()
		});
	}

	const candidateName = `${interview.candidate?.firstName || ''} ${interview.candidate?.lastName || ''}`.trim();
	addRecipient(interview.interviewerEmail, 'required', interview.interviewer);
	addRecipient(interview.candidate?.email, 'required', candidateName);

	const optionalParticipantEmails = toOptionalParticipantEmails(interview.optionalParticipants);
	for (const email of optionalParticipantEmails) {
		addRecipient(email, 'optional');
	}

	return recipients;
}

function resolveEnvelopeRecipients(recipients, config) {
	if (config.testMode) {
		if (!isValidEmailAddress(config.testRecipient)) {
			return {
				recipients: [],
				error: 'EMAIL_TEST_RECIPIENT is missing or invalid while EMAIL_TEST_MODE=true.'
			};
		}

		return {
			recipients: [config.testRecipient],
			error: ''
		};
	}

	return {
		recipients: recipients.map((recipient) => recipient.email),
		error: ''
	};
}

function getTransporter(config) {
	const key = JSON.stringify({
		host: config.host,
		port: config.port,
		secure: config.secure,
		user: config.user,
		pass: config.pass
	});

	if (cachedTransporter && cachedTransporterKey === key) {
		return cachedTransporter;
	}

	const transporter = nodemailer.createTransport({
		host: config.host,
		port: config.port,
		secure: config.secure,
		auth: config.user && config.pass ? { user: config.user, pass: config.pass } : undefined
	});

	cachedTransporter = transporter;
	cachedTransporterKey = key;
	return transporter;
}

function formatInterviewDateTime(value) {
	return formatDateTimeAt(value);
}

function getMailSubject(interview, reason) {
	const subject = String(interview.subject || '').trim() || `Interview #${interview.id}`;
	if (reason === 'cancelled') {
		return `Interview Cancelled: ${subject}`;
	}
	if (reason === 'created') {
		return `Interview Scheduled: ${subject}`;
	}
	if (reason === 'updated') {
		return `Interview Updated: ${subject}`;
	}
	return `Interview Invite: ${subject}`;
}

function getMailBody(interview, recipients, reason, testMode) {
	const candidateName = `${interview.candidate?.firstName || ''} ${interview.candidate?.lastName || ''}`.trim() || '-';
	const videoProviderLabel = getVideoCallProviderLabel(inferVideoCallProviderFromLink(interview.videoLink));
	const reasonLine =
		reason === 'created'
			? 'Interview scheduled.'
			: reason === 'cancelled'
				? 'Interview cancelled.'
				: 'Interview updated.';
	const details = [
		reasonLine,
		``,
		`Candidate: ${candidateName}`,
		`Job Order: ${interview.jobOrder?.title || '-'}`,
		`Client: ${interview.jobOrder?.client?.name || '-'}`,
		`Interviewer: ${interview.interviewer || '-'}`,
		`Starts: ${formatInterviewDateTime(interview.startsAt)}`,
		`Ends: ${formatInterviewDateTime(interview.endsAt)}`,
		`Location: ${interview.location || (interview.videoLink ? 'Video Interview' : '-')}`,
		``
	];

	if (interview.videoLink) {
		details.push(`Video Platform: ${videoProviderLabel}`);
		details.push(`Video Link: ${interview.videoLink}`);
		details.push(``);
	}

	if (testMode) {
		details.push(`[TEST MODE] Original participants:`);
		for (const recipient of recipients) {
			details.push(`- ${recipient.email} (${recipient.role})`);
		}
		details.push(``);
	}

	details.push('Calendar invite attached (.ics).');
	return details.join('\n');
}

function normalizeReason(reason, interviewStatus) {
	const normalizedReason = String(reason || '').trim().toLowerCase();
	const normalizedStatus = String(interviewStatus || '').trim().toLowerCase();
	if (normalizedStatus === 'cancelled') return 'cancelled';
	if (normalizedReason === 'created') return 'created';
	return 'updated';
}

function validateMailConfig(config) {
	if (!config.host) {
		return 'SMTP host is required in Admin Area > System Settings to send interview invite emails.';
	}
	if (!config.port) {
		return 'SMTP port is required in Admin Area > System Settings to send interview invite emails.';
	}
	if (!config.fromEmail || !isValidEmailAddress(config.fromEmail)) {
		return 'SMTP from email is required in Admin Area > System Settings and must be valid.';
	}
	if ((config.user && !config.pass) || (!config.user && config.pass)) {
		return 'SMTP username and password must both be set when using SMTP auth.';
	}
	return '';
}

export async function sendInterviewInviteEmail({ interview, reason = 'updated' }) {
	try {
		const status = String(interview?.status || '').trim().toLowerCase();
		if (status === 'completed') {
			return {
				sent: false,
				skipped: true,
				reason: 'Invite email skipped because interview status is completed.'
			};
		}

		const recipients = getParticipantRecipients(interview);
		if (recipients.length === 0) {
			return {
				sent: false,
				skipped: true,
				reason: 'No valid participant email addresses were found.'
			};
		}

		const config = await getMailConfig();
		const configError = validateMailConfig(config);
		if (configError) {
			return {
				sent: false,
				skipped: true,
				reason: configError
			};
		}

		const { recipients: envelopeRecipients, error: recipientError } = resolveEnvelopeRecipients(recipients, config);
		if (recipientError) {
			return {
				sent: false,
				skipped: true,
				reason: recipientError
			};
		}
		if (envelopeRecipients.length === 0) {
			return {
				sent: false,
				skipped: true,
				reason: 'No valid email recipients were resolved.'
			};
		}

		const normalizedReason = normalizeReason(reason, status);
		const inviteAction = normalizedReason === 'cancelled' ? 'cancel' : 'publish';
		const transporter = getTransporter(config);
		const icsContent = buildInterviewInviteIcs(interview, { action: inviteAction });
		const fileName = buildInterviewInviteFilename(interview);
		const from = formatFromAddress(config.fromName, config.fromEmail);
		const subject = getMailSubject(interview, normalizedReason);
		const text = getMailBody(interview, recipients, normalizedReason, config.testMode);

		await transporter.sendMail({
			from,
			to: envelopeRecipients.join(', '),
			subject,
			text,
			attachments: [
				{
					filename: fileName,
					content: icsContent,
					contentType: `text/calendar; charset=utf-8; method=${inviteAction === 'cancel' ? 'CANCEL' : 'PUBLISH'}`
				}
			]
		});

		return {
			sent: true,
			skipped: false,
			testMode: config.testMode,
			deliveredTo: envelopeRecipients,
			participantCount: recipients.length
		};
	} catch (error) {
		return {
			sent: false,
			skipped: true,
			reason: error instanceof Error ? error.message : 'Failed to send interview invite email.'
		};
		}
	}
