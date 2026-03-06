import { normalizePhoneNumber } from '@/lib/phone';
import { isValidHttpUrl, normalizeHttpUrl } from '@/lib/url-validation';

const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const phoneRegex = /(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/;
const urlRegex = /(https?:\/\/[^\s)]+)/gi;
const yearsRegex = /(\d+(?:\.\d+)?)\+?\s+years?/i;

const knownSkills = [
	'javascript',
	'typescript',
	'node',
	'react',
	'next.js',
	'nextjs',
	'java',
	'python',
	'c#',
	'.net',
	'go',
	'sql',
	'mysql',
	'postgres',
	'aws',
	'azure',
	'gcp',
	'docker',
	'kubernetes',
	'graphql',
	'rest',
	'html',
	'css',
	'leadership',
	'recruiting'
];

function cleanLine(line) {
	return line
		.replace(/[|•]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function guessName(lines) {
	for (const line of lines.slice(0, 8)) {
		if (line.length < 3 || line.length > 60) continue;
		if (emailRegex.test(line) || phoneRegex.test(line)) continue;
		if (/linkedin|github|portfolio|resume/i.test(line)) continue;
		if (/\d/.test(line)) continue;

		const words = line.replace(/[^a-zA-Z\s'-]/g, '').trim().split(/\s+/).filter(Boolean);
		if (words.length < 2 || words.length > 4) continue;

		return {
			firstName: words[0],
			lastName: words.slice(1).join(' ')
		};
	}

	return { firstName: '', lastName: '' };
}

function extractUrls(text) {
	const urls = text.match(urlRegex) || [];
	let linkedinUrl = '';
	let website = '';

	for (const raw of urls) {
		const url = raw.replace(/[),.;]+$/, '');
		if (!linkedinUrl && /linkedin\.com\//i.test(url)) {
			linkedinUrl = url;
			continue;
		}
		if (!website && !/linkedin\.com\//i.test(url)) {
			website = url;
		}
	}
	const normalizedLinkedinUrl = normalizeHttpUrl(linkedinUrl);
	const normalizedWebsite = normalizeHttpUrl(website);

	return {
		linkedinUrl: isValidHttpUrl(normalizedLinkedinUrl) ? normalizedLinkedinUrl : '',
		website: isValidHttpUrl(normalizedWebsite) ? normalizedWebsite : ''
	};
}

function extractSkills(lines, fullText) {
	const skillsLine = lines.find((line) => /^skills?\s*[:\-]/i.test(line));
	if (skillsLine) {
		const cleaned = skillsLine.replace(/^skills?\s*[:\-]\s*/i, '').trim();
		if (cleaned) return cleaned;
	}

	const lowerText = fullText.toLowerCase();
	const found = knownSkills.filter((skill) => lowerText.includes(skill.toLowerCase()));
	if (found.length === 0) return '';

	return found
		.slice(0, 10)
		.map((skill) => {
			if (skill === 'nextjs') return 'Next.js';
			if (skill === 'node') return 'Node.js';
			return skill
				.split(' ')
				.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
				.join(' ');
		})
		.join(', ');
}

function uniqueStrings(values) {
	const seen = new Set();
	const items = [];

	for (const rawValue of values) {
		const value = String(rawValue || '').trim();
		if (!value) continue;
		const key = value.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		items.push(value);
	}

	return items;
}

function splitSkillSet(skillSet) {
	return uniqueStrings(String(skillSet || '').split(/[,;\n|/]+/));
}

function parseDateToken(token) {
	const cleaned = String(token || '')
		.replace(/[–—]/g, '-')
		.replace(/\./g, '')
		.trim();
	if (!cleaned) return '';

	if (/present|current|now/i.test(cleaned)) return '';

	const yearMatch = cleaned.match(/\b(19|20)\d{2}\b/);
	if (!yearMatch) return '';

	const monthMap = {
		jan: '01',
		feb: '02',
		mar: '03',
		apr: '04',
		may: '05',
		jun: '06',
		jul: '07',
		aug: '08',
		sep: '09',
		oct: '10',
		nov: '11',
		dec: '12'
	};
	const monthMatch = cleaned.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i);
	const month = monthMatch ? monthMap[monthMatch[1].toLowerCase()] : '01';

	return `${yearMatch[0]}-${month}-01`;
}

function extractDateRange(line) {
	const text = String(line || '').replace(/[–—]/g, '-');
	const rangeRegex =
		/((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4}|\d{4})\s*(?:-|to)\s*((?:present|current|now)|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4}|\d{4})/i;
	const match = text.match(rangeRegex);
	if (!match) {
		return { startDate: '', endDate: '', isCurrent: false };
	}

	const startDate = parseDateToken(match[1]);
	const isCurrent = /present|current|now/i.test(match[2]);
	const endDate = isCurrent ? '' : parseDateToken(match[2]);
	return { startDate, endDate, isCurrent };
}

function isSectionHeading(line) {
	return /^(experience|professional experience|work experience|employment history|education|skills|summary|profile|projects|certifications)\b/i.test(
		line
	);
}

function getSectionLines(lines, sectionRegex) {
	const startIndex = lines.findIndex((line) => sectionRegex.test(line));
	if (startIndex < 0) return [];

	const collected = [];
	for (let i = startIndex + 1; i < lines.length; i += 1) {
		const line = lines[i];
		if (isSectionHeading(line)) break;
		collected.push(line);
	}
	return collected;
}

function extractEducationRecords(lines) {
	const educationLines = getSectionLines(
		lines,
		/^(education|education history|academic background|academics)\b/i
	);
	if (educationLines.length === 0) return [];

	const institutionRegex = /\b(university|college|school|institute|academy)\b/i;
	const degreeRegex = /\b(bachelor|master|mba|associate|phd|doctor|b\.?s\.?|m\.?s\.?|b\.?a\.?|m\.?a\.?)\b/i;
	const records = [];

	for (let index = 0; index < educationLines.length; index += 1) {
		const line = educationLines[index];
		if (!institutionRegex.test(line)) continue;

		const dateRange = extractDateRange(line);
		const schoolName = line
			.replace(/\((.*?)\)/g, '$1')
			.replace(/\b(19|20)\d{2}\b/g, '')
			.replace(/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/gi, '')
			.replace(/\s{2,}/g, ' ')
			.trim();
		const nextLine = educationLines[index + 1] || '';
		const degree = degreeRegex.test(line)
			? line
			: degreeRegex.test(nextLine)
				? nextLine
				: '';

		if (!schoolName) continue;
		records.push({
			schoolName,
			degree,
			fieldOfStudy: '',
			startDate: dateRange.startDate,
			endDate: dateRange.endDate,
			isCurrent: dateRange.isCurrent,
			description: ''
		});
	}

	return records.slice(0, 8);
}

function extractWorkExperienceRecords(lines) {
	const experienceLines = getSectionLines(
		lines,
		/^(experience|professional experience|work experience|employment history)\b/i
	);
	if (experienceLines.length === 0) return [];

	const records = [];
	for (let index = 0; index < experienceLines.length; index += 1) {
		const line = experienceLines[index];
		if (!line || line.length > 160) continue;

		const dateRange = extractDateRange(line);
		const hasDateRange = Boolean(dateRange.startDate || dateRange.endDate || dateRange.isCurrent);
		const nextLine = experienceLines[index + 1] || '';
		const previousLine = experienceLines[index - 1] || '';

		let title = '';
		let companyName = '';

		if (/\b(at|@)\b/i.test(line)) {
			const split = line.split(/\b(?:at|@)\b/i).map((part) => part.trim());
			if (split.length >= 2) {
				title = split[0];
				companyName = split[1];
			}
		} else if (/\s[-|]\s/.test(line)) {
			const split = line.split(/\s[-|]\s/).map((part) => part.trim());
			if (split.length >= 2) {
				title = split[0];
				companyName = split[1];
			}
		}

		if (!companyName && hasDateRange) {
			companyName = previousLine || nextLine;
			title = line;
		}

		if (!companyName && !title) continue;

		records.push({
			companyName: companyName || title,
			title: title || '',
			location: '',
			startDate: dateRange.startDate,
			endDate: dateRange.endDate,
			isCurrent: dateRange.isCurrent,
			description: ''
		});
	}

	return records.slice(0, 12);
}

function extractTitleAndEmployer(lines) {
	for (const line of lines.slice(0, 28)) {
		if (line.length > 80) continue;
		if (/experience|education|skills|summary|profile/i.test(line)) continue;
		if (/\b(at|@)\b/i.test(line)) {
			const split = line.split(/\b(?:at|@)\b/i).map((part) => part.trim());
			if (split.length >= 2 && split[0] && split[1]) {
				return {
					currentJobTitle: split[0],
					currentEmployer: split[1]
				};
			}
		}
	}

	return {
		currentJobTitle: '',
		currentEmployer: ''
	};
}

function extractSummary(lines) {
	const candidates = lines.filter((line) => {
		if (line.length < 25 || line.length > 240) return false;
		if (emailRegex.test(line) || phoneRegex.test(line)) return false;
		if (/linkedin|github|portfolio|www\./i.test(line)) return false;
		if (/^skills?\s*[:\-]/i.test(line)) return false;
		return true;
	});

	if (candidates.length === 0) return '';
	return candidates.slice(0, 3).join(' ');
}

export function parseResumeToDraft(resumeText) {
	const text = String(resumeText || '').replace(/\r/g, '\n');
	const lines = text
		.split('\n')
		.map(cleanLine)
		.filter(Boolean);

	const email = (text.match(emailRegex) || [''])[0] || '';
	const rawPhone = (text.match(phoneRegex) || [''])[0] || '';
	const normalizedPhone = normalizePhoneNumber(rawPhone);
	const { linkedinUrl, website } = extractUrls(text);
	const { firstName, lastName } = guessName(lines);
	const { currentJobTitle, currentEmployer } = extractTitleAndEmployer(lines);
	const skillSet = extractSkills(lines, text);
	const parsedSkills = splitSkillSet(skillSet);
	const summary = extractSummary(lines);
	const experienceMatch = text.match(yearsRegex);
	const experienceYears = experienceMatch ? experienceMatch[1] : '';
	const educationRecords = extractEducationRecords(lines);
	const workExperienceRecords = extractWorkExperienceRecords(lines);

	const warnings = [];
	if (!firstName || !lastName) warnings.push('Could not confidently detect full name.');
	if (!email) warnings.push('No email detected in resume text.');
	if (!normalizedPhone) warnings.push('No phone number detected in resume text.');

	return {
		draft: {
			firstName,
			lastName,
			email,
			mobile: normalizePhoneNumber(rawPhone) || rawPhone,
			status: 'new',
			source: 'Resume Parse Draft',
			owner: 'Recruiter',
			currentJobTitle,
			currentEmployer,
			experienceYears,
			city: '',
			state: '',
			zipCode: '',
			website,
			linkedinUrl,
			skillSet,
			summary
		},
		warnings,
		parsedSkills,
		educationRecords,
		workExperienceRecords
	};
}
