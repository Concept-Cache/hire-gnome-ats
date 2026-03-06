import { isValidEmailAddress } from '@/lib/email-validation';
import { getVideoCallProviderLabel, inferVideoCallProviderFromLink } from '@/lib/video-call-links';

function padDatePart(value) {
	return String(value).padStart(2, '0');
}

function toUtcDateTimeStamp(value) {
	const date = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(date.getTime())) {
		return null;
	}

	return [
		date.getUTCFullYear(),
		padDatePart(date.getUTCMonth() + 1),
		padDatePart(date.getUTCDate()),
		'T',
		padDatePart(date.getUTCHours()),
		padDatePart(date.getUTCMinutes()),
		padDatePart(date.getUTCSeconds()),
		'Z'
	].join('');
}

function escapeIcsText(value) {
	return String(value ?? '')
		.replace(/\\/g, '\\\\')
		.replace(/\r\n/g, '\n')
		.replace(/\n/g, '\\n')
		.replace(/;/g, '\\;')
		.replace(/,/g, '\\,');
}

function foldIcsLine(line) {
	const segments = [];
	let remaining = line;

	while (remaining.length > 75) {
		segments.push(remaining.slice(0, 75));
		remaining = ` ${remaining.slice(75)}`;
	}

	segments.push(remaining);
	return segments.join('\r\n');
}

function toTextLine(key, value) {
	const text = escapeIcsText(value);
	return foldIcsLine(`${key}:${text}`);
}

function escapeIcsParam(value) {
	return String(value ?? '')
		.replace(/\\/g, '\\\\')
		.replace(/"/g, '\\"')
		.trim();
}

function buildAttendeeLine({ email, name, role }) {
	const normalizedEmail = String(email || '').trim().toLowerCase();
	if (!isValidEmailAddress(normalizedEmail)) return '';

	const parameters = ['CUTYPE=INDIVIDUAL', `ROLE=${role}`, 'PARTSTAT=NEEDS-ACTION', 'RSVP=TRUE'];
	const attendeeName = String(name || '').trim();
	if (attendeeName) {
		parameters.push(`CN="${escapeIcsParam(attendeeName)}"`);
	}

	return foldIcsLine(`ATTENDEE;${parameters.join(';')}:mailto:${normalizedEmail}`);
}

function toOptionalParticipantEmails(rawValue) {
	if (!Array.isArray(rawValue)) return [];

	const emails = [];
	for (const value of rawValue) {
		const rawEmail =
			typeof value === 'string'
				? value
				: typeof value?.email === 'string'
					? value.email
					: '';
		const email = String(rawEmail || '').trim().toLowerCase();
		if (!email || !isValidEmailAddress(email)) continue;
		emails.push(email);
	}
	return emails;
}

function toInterviewModeLabel(value) {
	const normalized = String(value || '').trim().toLowerCase();
	if (normalized === 'phone') return 'Phone';
	if (normalized === 'video') return 'Video';
	if (normalized === 'in_person') return 'In Person';
	return normalized ? normalized.replaceAll('_', ' ').replace(/\b\w/g, (match) => match.toUpperCase()) : '-';
}

function toInterviewStatusLabel(value) {
	const normalized = String(value || '').trim().toLowerCase();
	if (normalized === 'scheduled') return 'Scheduled';
	if (normalized === 'in_progress') return 'In Progress';
	if (normalized === 'completed') return 'Completed';
	if (normalized === 'cancelled') return 'Cancelled';
	return normalized ? normalized.replaceAll('_', ' ').replace(/\b\w/g, (match) => match.toUpperCase()) : '-';
}

function toCoordinate(value) {
	const number = Number(value);
	return Number.isFinite(number) ? number : null;
}

function hasValidCoordinates(latitude, longitude) {
	const lat = toCoordinate(latitude);
	const lng = toCoordinate(longitude);
	if (lat == null || lng == null) return false;
	if (lat < -90 || lat > 90) return false;
	if (lng < -180 || lng > 180) return false;
	if (lat === 0 && lng === 0) return false;
	return true;
}

function toMapUrl(latitude, longitude) {
	if (!hasValidCoordinates(latitude, longitude)) return '';
	const lat = toCoordinate(latitude);
	const lng = toCoordinate(longitude);
	return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lat},${lng}`)}`;
}

function buildDescription(interview) {
	const candidateName = `${interview.candidate?.firstName || ''} ${interview.candidate?.lastName || ''}`.trim();
	const jobOrderTitle = interview.jobOrder?.title || '-';
	const clientName = interview.jobOrder?.client?.name || '-';
	const typeLabel = toInterviewModeLabel(interview.interviewMode);
	const statusLabel = toInterviewStatusLabel(interview.status);
	const mapUrl = toMapUrl(interview.locationLatitude, interview.locationLongitude);
	const videoProviderLabel = getVideoCallProviderLabel(inferVideoCallProviderFromLink(interview.videoLink));
	const interviewerDetails = [interview.interviewer || '-'];
	if (interview.interviewerEmail) {
		interviewerDetails.push(`(${interview.interviewerEmail})`);
	}

	const lines = [
		'Interview details',
		`Candidate: ${candidateName || '-'}`,
		`Position: ${jobOrderTitle}`,
		`Client: ${clientName}`,
		`Type: ${typeLabel}`,
		`Status: ${statusLabel}`,
		`Interviewer: ${interviewerDetails.join(' ')}`
	];

	if (interview.location) {
		lines.push(`Location: ${interview.location}`);
	}
	if (interview.videoLink) {
		lines.push(`Video Platform: ${videoProviderLabel}`);
		lines.push(`Video meeting: ${interview.videoLink}`);
	}
	if (mapUrl) {
		lines.push(`Map: ${mapUrl}`);
	}

	return lines.join('\n');
}

function toSafeFileNameSegment(value) {
	return String(value || '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/(^-|-$)/g, '')
		.slice(0, 80);
}

export function buildInterviewInviteIcs(interview, options = {}) {
	const start = toUtcDateTimeStamp(interview.startsAt);
	if (!start) {
		throw new Error('Interview start date/time is required to generate an invite.');
	}

	const action = String(options.action || 'publish').trim().toLowerCase();
	const isCancellation = action === 'cancel';
	const startDate = new Date(interview.startsAt);
	const endDate = interview.endsAt ? new Date(interview.endsAt) : new Date(startDate.getTime() + 60 * 60 * 1000);
	const end = toUtcDateTimeStamp(endDate);
	const dtStamp = toUtcDateTimeStamp(new Date());
	const uid = `interview-${interview.id}@hiregnome-ats.local`;
	const summary = interview.subject || `Interview #${interview.id}`;
	const locationValue = interview.location || (interview.videoLink ? 'Video Interview' : '');
	const mapUrl = toMapUrl(interview.locationLatitude, interview.locationLongitude);
	const description = buildDescription(interview);
	const candidateName = `${interview.candidate?.firstName || ''} ${interview.candidate?.lastName || ''}`.trim();
	const optionalParticipantEmails = toOptionalParticipantEmails(interview.optionalParticipants);
	const attendeeLines = [];
	const seenAttendeeEmails = new Set();

	function addAttendee({ email, name, role }) {
		const normalizedEmail = String(email || '').trim().toLowerCase();
		if (!isValidEmailAddress(normalizedEmail)) return;
		if (seenAttendeeEmails.has(normalizedEmail)) return;

		const line = buildAttendeeLine({ email: normalizedEmail, name, role });
		if (!line) return;

		seenAttendeeEmails.add(normalizedEmail);
		attendeeLines.push(line);
	}

	addAttendee({
		email: interview.interviewerEmail,
		name: interview.interviewer || '',
		role: 'REQ-PARTICIPANT'
	});
	addAttendee({
		email: interview.candidate?.email,
		name: candidateName,
		role: 'REQ-PARTICIPANT'
	});
	for (const email of optionalParticipantEmails) {
		addAttendee({ email, name: '', role: 'OPT-PARTICIPANT' });
	}

	const lines = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//Hire Gnome ATS//Interview Invite//EN',
		'CALSCALE:GREGORIAN',
		`METHOD:${isCancellation ? 'CANCEL' : 'PUBLISH'}`,
		'BEGIN:VEVENT',
		foldIcsLine(`UID:${uid}`),
		foldIcsLine(`DTSTAMP:${dtStamp}`),
		foldIcsLine(`DTSTART:${start}`),
		foldIcsLine(`DTEND:${end}`),
		toTextLine('SUMMARY', summary),
		toTextLine('DESCRIPTION', description),
		`STATUS:${isCancellation ? 'CANCELLED' : 'CONFIRMED'}`,
		'TRANSP:OPAQUE'
	];

	if (locationValue) {
		lines.push(toTextLine('LOCATION', locationValue));
	}

	if (hasValidCoordinates(interview.locationLatitude, interview.locationLongitude)) {
		lines.push(`GEO:${interview.locationLatitude};${interview.locationLongitude}`);
	}

	if (interview.videoLink) {
		lines.push(toTextLine('URL', interview.videoLink));
	} else if (mapUrl) {
		lines.push(toTextLine('URL', mapUrl));
	}

	if (attendeeLines.length > 0) {
		lines.push(...attendeeLines);
	}

	lines.push('END:VEVENT', 'END:VCALENDAR');
	return `${lines.join('\r\n')}\r\n`;
}

export function buildInterviewInviteFilename(interview) {
	const subjectSegment = toSafeFileNameSegment(interview.subject) || `interview-${interview.id}`;
	return `${subjectSegment}.ics`;
}
