import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
	CANDIDATE_ATTACHMENT_MAX_BYTES,
	isAllowedCandidateAttachmentContentType,
	isAllowedCandidateAttachmentFileName
} from '@/lib/candidate-attachment-options';
import { logCreate } from '@/lib/audit-log';
import {
	buildInboundNoteContent,
	decodeInboundAttachment,
	extractInboundEmails,
	getInboundAttachmentContentFieldName,
	getInboundAttachmentSkipReason,
	sanitizeInboundPayload,
	shouldSkipInboundAttachment
} from '@/lib/postmark-inbound';
import {
	buildCandidateInboundAttachmentStorageKey,
	uploadObjectBuffer
} from '@/lib/object-storage';
import { createRecordId } from '@/lib/record-id';

import { withApiLogging } from '@/lib/api-logging';

const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

function getWebhookSecret(req) {
	return (
		req.headers.get('x-webhook-secret') ||
		req.headers.get('x-postmark-webhook-secret') ||
		req.nextUrl.searchParams.get('secret') ||
		''
	)
		.trim();
}

function isAuthorized(req) {
	const configuredSecret = String(process.env.POSTMARK_INBOUND_WEBHOOK_SECRET || '').trim();
	if (!configuredSecret) return true;
	return getWebhookSecret(req) === configuredSecret;
}

function getExternalMessageId(payload) {
	return String(payload?.MessageID || payload?.MessageId || payload?.MessageIDString || '')
		.trim()
		.slice(0, 191);
}

function getSenderEmail(payload) {
	const direct = String(payload?.FromFull?.Email || '').trim().toLowerCase();
	if (direct) return direct;

	const fromValue = String(payload?.From || '').trim();
	if (!fromValue) return '';
	const match = fromValue.match(EMAIL_REGEX);
	return match ? String(match[0] || '').trim().toLowerCase() : '';
}

function summarizeEvent(payload, candidates, contacts, notesCreated, attachmentsSaved, attachmentDiagnostics = []) {
	return {
		ok: true,
		messageId: getExternalMessageId(payload),
		matchedCandidates: candidates.length,
		matchedContacts: contacts.length,
		notesCreated,
		attachmentsSaved,
		attachmentDiagnostics
	};
}

async function maybeCreateCandidateEmailNote(candidateId, content, createdByUserId) {
	const note = await prisma.candidateNote.create({
		data: {
			candidateId,
			noteType: 'email',
			content,
			createdByUserId: createdByUserId || null
		}
	});
	await logCreate({
		actorUserId: createdByUserId || null,
		entityType: 'CANDIDATE_NOTE',
		entity: note,
		metadata: { candidateId, source: 'postmark_inbound_email' }
	});
	return { created: true, note };
}

async function maybeCreateContactEmailNote(contactId, content, createdByUserId) {
	const note = await prisma.contactNote.create({
		data: {
			contactId,
			noteType: 'email',
			content,
			createdByUserId: createdByUserId || null
		}
	});
	await logCreate({
		actorUserId: createdByUserId || null,
		entityType: 'CONTACT_NOTE',
		entity: note,
		metadata: { contactId, source: 'postmark_inbound_email' }
	});
	return { created: true, note };
}

async function maybeSaveCandidateAttachment(candidateId, messageId, attachment, uploadedByUserId) {
	const fileName = String(attachment?.Name || '').trim();
	const contentType = String(attachment?.ContentType || '').trim().toLowerCase();
	const contentField = getInboundAttachmentContentFieldName(attachment);
	const skipReason = getInboundAttachmentSkipReason(attachment);
	const contentLength = Number(attachment?.ContentLength || 0);
	const availableKeys = Object.keys(attachment || {}).sort();
	if (!fileName) {
		return {
			saved: false,
			reason: 'missing_file_name',
			fileName: '',
			candidateId,
			contentType,
			contentLength,
			contentField,
			availableKeys
		};
	}
	if (skipReason || shouldSkipInboundAttachment(attachment)) {
		return {
			saved: false,
			reason: skipReason || 'skipped_attachment',
			fileName,
			candidateId,
			contentType,
			contentLength,
			contentField,
			availableKeys
		};
	}
	if (!isAllowedCandidateAttachmentFileName(fileName)) {
		return {
			saved: false,
			reason: 'unsupported_file_extension',
			fileName,
			candidateId,
			contentType,
			contentLength,
			contentField,
			availableKeys
		};
	}
	if (!isAllowedCandidateAttachmentContentType(fileName, contentType)) {
		return {
			saved: false,
			reason: 'unsupported_content_type',
			fileName,
			candidateId,
			contentType,
			contentLength,
			contentField,
			availableKeys
		};
	}

	const sizeBytes = contentLength;
	if (sizeBytes > CANDIDATE_ATTACHMENT_MAX_BYTES) {
		return {
			saved: false,
			reason: 'declared_size_exceeds_limit',
			fileName,
			candidateId,
			contentType,
			contentLength,
			contentField,
			availableKeys
		};
	}

	const buffer = decodeInboundAttachment(attachment);
	if (!buffer || buffer.length === 0) {
		return {
			saved: false,
			reason: 'no_content_bytes_in_payload',
			fileName,
			candidateId,
			contentType,
			contentLength,
			contentField,
			availableKeys
		};
	}
	if (buffer.length > CANDIDATE_ATTACHMENT_MAX_BYTES) {
		return {
			saved: false,
			reason: 'decoded_size_exceeds_limit',
			fileName,
			candidateId,
			contentType,
			contentLength,
			contentField,
			availableKeys
		};
	}

	const storageKey = buildCandidateInboundAttachmentStorageKey(candidateId, messageId, fileName);
	const existing = await prisma.candidateAttachment.findFirst({
		where: { storageKey },
		select: { id: true }
	});
	if (existing) {
		return {
			saved: false,
			reason: 'duplicate_attachment',
			fileName,
			candidateId,
			contentType,
			contentLength,
			contentField,
			availableKeys
		};
	}

	const uploaded = await uploadObjectBuffer({
		key: storageKey,
		body: buffer,
		contentType: contentType || 'application/octet-stream'
	});
	const saved = await prisma.candidateAttachment.create({
		data: {
			recordId: createRecordId('CandidateAttachment'),
			candidateId,
			fileName,
			isResume: false,
			contentType: contentType || null,
			sizeBytes: buffer.length,
			storageProvider: uploaded.storageProvider,
			storageBucket: uploaded.storageBucket,
			storageKey: uploaded.storageKey,
			uploadedByUserId: uploadedByUserId || null
		}
	});
	await logCreate({
		actorUserId: uploadedByUserId || null,
		entityType: 'CANDIDATE_ATTACHMENT',
		entity: saved,
		metadata: { candidateId, source: 'postmark_inbound_email', messageId }
	});
	return {
		saved: true,
		reason: 'saved',
		fileName,
		candidateId,
		contentType,
		contentLength,
		contentField,
		availableKeys
	};
}

async function postInboundPostmarkHandler(req) {
	try {
		if (!isAuthorized(req)) {
			return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
		}

		const payload = await req.json();
		const externalMessageId = getExternalMessageId(payload);
		const senderEmail = getSenderEmail(payload);
		if (!externalMessageId) {
			return NextResponse.json({ error: 'MessageID is required.' }, { status: 400 });
		}

		const existingEvent = await prisma.inboundEmailEvent.findUnique({
			where: {
				provider_externalMessageId: {
					provider: 'postmark',
					externalMessageId
				}
			},
			select: {
				id: true,
				status: true,
				matchedCandidates: true,
				matchedContacts: true,
				notesCreated: true,
				attachmentsSaved: true
			}
		});
		if (existingEvent?.status === 'processed') {
			return NextResponse.json({
				ok: true,
				duplicate: true,
				messageId: externalMessageId,
				matchedCandidates: existingEvent.matchedCandidates,
				matchedContacts: existingEvent.matchedContacts,
				notesCreated: existingEvent.notesCreated,
				attachmentsSaved: existingEvent.attachmentsSaved
			});
		}

		const extractedEmails = extractInboundEmails(payload);
		const [candidates, contacts, matchedUser] = await Promise.all([
			prisma.candidate.findMany({
				where: {
					email: {
						in: extractedEmails
					}
				},
				select: { id: true, email: true }
			}),
			prisma.contact.findMany({
				where: {
					email: {
						in: extractedEmails
					}
				},
				select: { id: true, email: true }
			}),
			senderEmail
				? prisma.user.findFirst({
						where: {
							email: senderEmail
						},
						select: { id: true }
					})
				: Promise.resolve(null)
		]);
		const matchedUserId = matchedUser?.id || null;

		const noteContent = buildInboundNoteContent(payload);
		let notesCreated = 0;
		for (const candidate of candidates) {
			const result = await maybeCreateCandidateEmailNote(candidate.id, noteContent, matchedUserId);
			if (result.created) notesCreated += 1;
		}
		for (const contact of contacts) {
			const result = await maybeCreateContactEmailNote(contact.id, noteContent, matchedUserId);
			if (result.created) notesCreated += 1;
		}

		let attachmentsSaved = 0;
		const attachmentDiagnostics = [];
		const attachments = Array.isArray(payload?.Attachments) ? payload.Attachments : [];
		if (candidates.length === 0 && attachments.length > 0) {
			for (const attachment of attachments) {
				attachmentDiagnostics.push({
					candidateId: null,
					fileName: String(attachment?.Name || '').trim(),
					contentType: String(attachment?.ContentType || '').trim().toLowerCase(),
					contentLength: Number(attachment?.ContentLength || 0),
					reason: 'no_matched_candidate',
					contentField: getInboundAttachmentContentFieldName(attachment),
					availableKeys: Object.keys(attachment || {}).sort()
				});
			}
		} else {
			for (const candidate of candidates) {
				for (const attachment of attachments) {
					const result = await maybeSaveCandidateAttachment(
						candidate.id,
						externalMessageId,
						attachment,
						matchedUserId
					);
					attachmentDiagnostics.push(result);
					if (result.saved) attachmentsSaved += 1;
				}
			}
		}

		const sanitizedPayload = {
			...sanitizeInboundPayload(payload),
			AttachmentDiagnostics: attachmentDiagnostics
		};
		const eventData = {
			provider: 'postmark',
			externalMessageId,
			status: candidates.length === 0 && contacts.length === 0 ? 'no_match' : 'processed',
			subject: String(payload?.Subject || '').trim().slice(0, 191) || null,
			fromEmail: String(payload?.FromFull?.Email || payload?.From || '').trim().slice(0, 191) || null,
			matchedCandidates: candidates.length,
			matchedContacts: contacts.length,
			notesCreated,
			attachmentsSaved,
			payload: sanitizedPayload
		};

		if (existingEvent?.id) {
			await prisma.inboundEmailEvent.update({
				where: { id: existingEvent.id },
				data: eventData
			});
		} else {
			await prisma.inboundEmailEvent.create({
				data: eventData
			});
		}

		return NextResponse.json(
			summarizeEvent(payload, candidates, contacts, notesCreated, attachmentsSaved, attachmentDiagnostics)
		);
	} catch (error) {
		return NextResponse.json(
			{ error: error?.message || 'Failed to process inbound email.' },
			{ status: 500 }
		);
	}
}

export const POST = withApiLogging('inbound.postmark.post', postInboundPostmarkHandler);
