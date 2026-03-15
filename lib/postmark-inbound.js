const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const ATTACHMENT_CONTENT_FIELDS = ['Content', 'ContentBase64', 'ContentData', 'RawContent', 'Base64Content', 'Data'];

function asTrimmedString(value) {
	return typeof value === 'string' ? value.trim() : '';
}

function stripHtmlToText(value) {
	return String(value || '')
		.replace(/<[^>]*>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function normalizeLine(line) {
	return String(line || '')
		.replace(/\uFEFF/g, '')
		.replace(/\u200B/g, '')
		.replace(/\u202F/g, ' ')
		.replace(/\s+$/g, '');
}

function isSeparatorLine(line) {
	return /^[_=\-]{3,}\s*$/.test(line);
}

function isHeaderLine(line) {
	return /^(from|sent|to|subject|cc|bcc):\s+/i.test(line);
}

function isQuotedReplyStart(line) {
	return /^on .+ wrote:\s*$/i.test(line) || /^-{2,}\s*original message\s*-{2,}\s*$/i.test(line);
}

function isSecurityWarningLine(line) {
	return /^caution:\s*this email originated from outside the organization/i.test(line);
}

function isLinkSpamLine(line) {
	return /linkprotect\.cudasvc\.com/i.test(line) || /^(website|linkedin|facebook|twitter|instagram)\b/i.test(line);
}

function stripLeadingThreadHeaders(lines) {
	let index = 0;
	while (index < lines.length && (!lines[index] || isSeparatorLine(lines[index]))) {
		index += 1;
	}

	let headerCount = 0;
	let cursor = index;
	while (cursor < lines.length && isHeaderLine(lines[cursor])) {
		headerCount += 1;
		cursor += 1;
	}

	if (headerCount >= 2) {
		while (cursor < lines.length && !lines[cursor]) {
			cursor += 1;
		}
		return lines.slice(cursor);
	}

	return lines.slice(index);
}

function cleanInboundBodyText(value) {
	const normalized = String(value || '')
		.replace(/\r\n/g, '\n')
		.replace(/\r/g, '\n');
	let lines = normalized.split('\n').map(normalizeLine);
	lines = stripLeadingThreadHeaders(lines);

	const cleaned = [];
	for (const line of lines) {
		if (!line) {
			if (cleaned.length > 0 && cleaned[cleaned.length - 1] !== '') {
				cleaned.push('');
			}
			continue;
		}
		if (isSeparatorLine(line)) continue;
		if (isSecurityWarningLine(line)) continue;
		if (isQuotedReplyStart(line)) break;
		if (isLinkSpamLine(line)) continue;
		if (/^<[^>]+>$/.test(line)) continue;
		if (/^p\s+\(\d{3}\)/i.test(line)) continue;
		if (/^in\s+/i.test(line) && line.includes('<http')) continue;
		cleaned.push(line);
	}

	return cleaned
		.join('\n')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

function collectEmails(value, output) {
	if (!value) return;
	if (typeof value === 'string') {
		const matches = value.match(EMAIL_REGEX) || [];
		for (const match of matches) {
			output.add(match.trim().toLowerCase());
		}
		return;
	}
	if (Array.isArray(value)) {
		for (const item of value) {
			collectEmails(item, output);
		}
		return;
	}
	if (typeof value === 'object') {
		for (const [key, nested] of Object.entries(value)) {
			if (key === 'Content') continue;
			collectEmails(nested, output);
		}
	}
}

export function extractInboundEmails(payload) {
	const emails = new Set();
	collectEmails(payload, emails);
	return Array.from(emails);
}

function formatAddress(entry) {
	if (!entry || typeof entry !== 'object') return '';
	const name = asTrimmedString(entry.Name);
	const email = asTrimmedString(entry.Email);
	if (name && email) return `${name} <${email}>`;
	return email || name;
}

function joinAddresses(entries) {
	if (!Array.isArray(entries) || entries.length === 0) return '';
	return entries.map((entry) => formatAddress(entry)).filter(Boolean).join(', ');
}

export function getInboundBodyText(payload) {
	const strippedReply = asTrimmedString(payload?.StrippedTextReply);
	if (strippedReply) {
		return cleanInboundBodyText(strippedReply);
	}
	const textBody = asTrimmedString(payload?.TextBody);
	if (textBody) return cleanInboundBodyText(textBody);
	return cleanInboundBodyText(stripHtmlToText(payload?.HtmlBody));
}

export function buildInboundNoteContent(payload) {
	const subject = asTrimmedString(payload?.Subject) || '(No subject)';
	const fromLine = formatAddress(payload?.FromFull) || asTrimmedString(payload?.From);
	const receivedAt = asTrimmedString(payload?.Date);
	const body = getInboundBodyText(payload) || 'No email body provided.';

	return [
		`Subject: ${subject}`,
		fromLine ? `From: ${fromLine}` : '',
		receivedAt ? `Received: ${receivedAt}` : '',
		'',
		body
	]
		.filter(Boolean)
		.join('\n');
}

export function sanitizeInboundPayload(payload) {
	const attachments = Array.isArray(payload?.Attachments)
		? payload.Attachments.map((attachment) => ({
				Name: asTrimmedString(attachment?.Name),
				ContentType: asTrimmedString(attachment?.ContentType),
				ContentLength: Number(attachment?.ContentLength || 0),
				ContentID: asTrimmedString(attachment?.ContentID),
				Keys: Object.keys(attachment || {}).sort(),
				ContentField: getInboundAttachmentContentFieldName(attachment)
			}))
		: [];

	return {
		MessageID: asTrimmedString(payload?.MessageID),
		Subject: asTrimmedString(payload?.Subject),
		From: asTrimmedString(payload?.From),
		To: asTrimmedString(payload?.To),
		Cc: asTrimmedString(payload?.Cc),
		Date: asTrimmedString(payload?.Date),
		OriginalRecipient: asTrimmedString(payload?.OriginalRecipient),
		MailboxHash: asTrimmedString(payload?.MailboxHash),
		Headers: Array.isArray(payload?.Headers)
			? payload.Headers.map((header) => ({
					Name: asTrimmedString(header?.Name),
					Value: asTrimmedString(header?.Value)
				}))
			: [],
		Attachments: attachments
	};
}

export function getInboundAttachmentContentFieldName(attachment) {
	for (const field of ATTACHMENT_CONTENT_FIELDS) {
		if (asTrimmedString(attachment?.[field])) {
			return field;
		}
	}
	return '';
}

export function decodeInboundAttachment(attachment) {
	const fieldName = getInboundAttachmentContentFieldName(attachment);
	const encoded = fieldName ? asTrimmedString(attachment?.[fieldName]) : '';
	if (!encoded) return null;
	try {
		return Buffer.from(encoded, 'base64');
	} catch {
		return null;
	}
}

export function shouldSkipInboundAttachment(attachment) {
	const fileName = asTrimmedString(attachment?.Name).toLowerCase();
	const contentType = asTrimmedString(attachment?.ContentType).toLowerCase();
	const contentId = asTrimmedString(attachment?.ContentID);
	if (!fileName) return true;
	if (contentId && contentType.startsWith('image/')) return true;
	if (/^(rsimage-|image\d|logo|signature)/.test(fileName) && contentType.startsWith('image/')) return true;
	return false;
}

export function getInboundAttachmentSkipReason(attachment) {
	const fileName = asTrimmedString(attachment?.Name).toLowerCase();
	const contentType = asTrimmedString(attachment?.ContentType).toLowerCase();
	const contentId = asTrimmedString(attachment?.ContentID);
	if (!fileName) return 'missing_file_name';
	if (contentId && contentType.startsWith('image/')) return 'inline_content_image';
	if (/^(rsimage-|image\d|logo|signature)/.test(fileName) && contentType.startsWith('image/')) {
		return 'signature_or_branding_image';
	}
	return '';
}
