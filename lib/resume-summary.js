function asTrimmedString(value) {
	if (typeof value !== 'string') return '';
	return value.trim();
}

function uniqueStrings(values) {
	const seen = new Set();
	const rows = [];

	for (const rawValue of values || []) {
		const value = asTrimmedString(rawValue);
		if (!value) continue;
		const key = value.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		rows.push(value);
	}

	return rows;
}

function normalizeDateToken(value) {
	const raw = asTrimmedString(value);
	if (!raw) return '';

	const date = new Date(raw);
	if (!Number.isNaN(date.getTime())) {
		return date.toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short'
		});
	}

	const yearMatch = raw.match(/\b(19|20)\d{2}\b/);
	if (yearMatch) return yearMatch[0];
	return raw;
}

function formatDateRange(startDate, endDate, isCurrent) {
	const start = normalizeDateToken(startDate);
	const end = isCurrent ? 'Present' : normalizeDateToken(endDate);
	if (start && end) return `${start} - ${end}`;
	if (start) return start;
	if (end) return end;
	return '';
}

function getFallbackSummaryFromRawText(rawText) {
	const text = String(rawText || '').replace(/\r/g, '\n');
	const lines = text
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean)
		.filter((line) => line.length >= 30)
		.filter((line) => !/@/.test(line))
		.filter((line) => !/(linkedin|github|www\.|http)/i.test(line));

	if (lines.length === 0) return '';
	return lines.slice(0, 2).join(' ');
}

export function buildResumeSummaryText({ rawResumeText, draft, parsedSkills, educationRecords, workExperienceRecords }) {
	const candidate = draft || {};
	const lines = [];

	const summary =
		asTrimmedString(candidate.summary) ||
		getFallbackSummaryFromRawText(rawResumeText);
	if (summary) {
		lines.push('PROFILE SUMMARY');
		lines.push(summary);
		lines.push('');
	}

	const currentJobTitle = asTrimmedString(candidate.currentJobTitle);
	const currentEmployer = asTrimmedString(candidate.currentEmployer);
	if (currentJobTitle || currentEmployer) {
		lines.push('CURRENT ROLE');
		if (currentJobTitle && currentEmployer) {
			lines.push(`${currentJobTitle} at ${currentEmployer}`);
		} else {
			lines.push(currentJobTitle || currentEmployer);
		}
		lines.push('');
	}

	const locationParts = [
		asTrimmedString(candidate.city),
		asTrimmedString(candidate.state),
		asTrimmedString(candidate.zipCode)
	].filter(Boolean);
	const mobile = asTrimmedString(candidate.mobile);
	const email = asTrimmedString(candidate.email);
	const contactLines = [];
	if (email) contactLines.push(`Email: ${email}`);
	if (mobile) contactLines.push(`Mobile: ${mobile}`);
	if (locationParts.length > 0) contactLines.push(`Location: ${locationParts.join(', ')}`);
	if (contactLines.length > 0) {
		lines.push('CONTACT');
		lines.push(...contactLines);
		lines.push('');
	}

	const explicitSkills = uniqueStrings(parsedSkills);
	if (explicitSkills.length > 0) {
		lines.push('KEY SKILLS');
		for (const skill of explicitSkills.slice(0, 24)) {
			lines.push(`- ${skill}`);
		}
		lines.push('');
	}

	const education = Array.isArray(educationRecords) ? educationRecords : [];
	if (education.length > 0) {
		lines.push('EDUCATION');
		for (const entry of education.slice(0, 10)) {
			const schoolName = asTrimmedString(entry?.schoolName);
			if (!schoolName) continue;
			const degree = asTrimmedString(entry?.degree);
			const fieldOfStudy = asTrimmedString(entry?.fieldOfStudy);
			const descriptor = [degree, fieldOfStudy].filter(Boolean).join(', ');
			const dateRange = formatDateRange(entry?.startDate, entry?.endDate, Boolean(entry?.isCurrent));
			const detail = [descriptor, dateRange].filter(Boolean).join(' | ');
			lines.push(`- ${schoolName}${detail ? ` (${detail})` : ''}`);
		}
		lines.push('');
	}

	const workExperience = Array.isArray(workExperienceRecords) ? workExperienceRecords : [];
	if (workExperience.length > 0) {
		lines.push('WORK EXPERIENCE');
		for (const entry of workExperience.slice(0, 15)) {
			const companyName = asTrimmedString(entry?.companyName);
			if (!companyName) continue;
			const title = asTrimmedString(entry?.title);
			const location = asTrimmedString(entry?.location);
			const dateRange = formatDateRange(entry?.startDate, entry?.endDate, Boolean(entry?.isCurrent));
			const headlineParts = [];
			if (title) {
				headlineParts.push(`${title} at ${companyName}`);
			} else {
				headlineParts.push(companyName);
			}
			if (location) headlineParts.push(location);
			if (dateRange) headlineParts.push(dateRange);
			lines.push(`- ${headlineParts.join(' | ')}`);

			const description = asTrimmedString(entry?.description);
			if (description) {
				lines.push(`  ${description}`);
			}
		}
	}

	const output = lines.join('\n').trim();
	if (!output) return summary;
	return output.slice(0, 12000);
}
