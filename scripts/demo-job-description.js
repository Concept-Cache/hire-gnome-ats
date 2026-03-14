'use strict';

function formatCurrency(value) {
	if (!Number.isFinite(Number(value))) return '';
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		maximumFractionDigits: 0
	}).format(Number(value));
}

function inferRoleFamily(jobTitle) {
	const title = String(jobTitle || '').toLowerCase();
	if (title.includes('nurse') || title.includes('clinical') || title.includes('medical') || title.includes('ehr')) {
		return 'clinical';
	}
	if (title.includes('account') || title.includes('finance') || title.includes('billing') || title.includes('compliance')) {
		return 'finance';
	}
	if (title.includes('project') || title.includes('product') || title.includes('implementation')) {
		return 'delivery';
	}
	if (title.includes('security')) {
		return 'security';
	}
	if (title.includes('support') || title.includes('network')) {
		return 'infrastructure';
	}
	if (title.includes('qa')) {
		return 'quality';
	}
	return 'engineering';
}

const COPY_BY_FAMILY = Object.freeze({
	engineering: {
		intro: 'This role is focused on building reliable systems, partnering with business stakeholders, and improving delivery across a modern technology environment.',
		responsibilities: [
			'Design, build, and support scalable solutions that improve day-to-day business operations.',
			'Partner with product, operations, and leadership stakeholders to translate priorities into deliverable work.',
			'Improve reliability, documentation, and handoff quality across releases and production support.'
		],
		requirements: [
			'Experience delivering production systems in a fast-moving team environment.',
			'Strong communication skills with the ability to explain tradeoffs to technical and non-technical audiences.',
			'Comfort owning work from discovery through delivery and post-launch support.'
		]
	},
	delivery: {
		intro: 'This position will coordinate business priorities, delivery timelines, and stakeholder communication to keep critical initiatives moving.',
		responsibilities: [
			'Lead planning, execution, and follow-through for cross-functional initiatives with measurable business outcomes.',
			'Manage timelines, risks, dependencies, and stakeholder expectations across multiple workstreams.',
			'Create clear status reporting and maintain momentum across internal teams and external partners.'
		],
		requirements: [
			'Proven experience leading implementations, projects, or product initiatives in a structured environment.',
			'Strong organization, documentation, and executive communication skills.',
			'Ability to balance urgency, detail, and relationship management.'
		]
	},
	finance: {
		intro: 'This role supports high-visibility financial or operational processes and requires accuracy, business judgment, and strong collaboration across teams.',
		responsibilities: [
			'Own recurring reporting, analysis, and process execution tied to financial or operational performance.',
			'Identify process improvements that reduce manual effort and improve accuracy.',
			'Collaborate with leaders and business partners to support planning, compliance, and decision-making.'
		],
		requirements: [
			'Hands-on experience in finance, accounting, revenue cycle, or compliance-focused operations.',
			'Strong attention to detail and confidence working with deadlines and business-critical data.',
			'Clear communication skills and a practical, solutions-oriented approach.'
		]
	},
	clinical: {
		intro: 'This opportunity supports healthcare-focused teams where patient impact, compliance, and operational consistency all matter.',
		responsibilities: [
			'Coordinate workflows, systems, or case activity that directly support clinical or healthcare operations.',
			'Work closely with business users, leadership, and partner teams to maintain quality and throughput.',
			'Document issues, recommend improvements, and help implement more consistent processes.'
		],
		requirements: [
			'Experience in a healthcare, clinical operations, or regulated environment.',
			'Strong judgment, follow-through, and ability to manage sensitive information responsibly.',
			'Comfort working across operations, technology, and stakeholder-facing teams.'
		]
	},
	security: {
		intro: 'This role helps strengthen operational resilience by improving visibility, response readiness, and control execution across the environment.',
		responsibilities: [
			'Monitor, investigate, and improve operational or security-related processes with a strong bias for follow-through.',
			'Partner with infrastructure, engineering, and business stakeholders to reduce operational risk.',
			'Document findings, recommend improvements, and help mature team procedures.'
		],
		requirements: [
			'Experience in security operations, infrastructure operations, or a comparable technical discipline.',
			'Ability to stay organized and communicate clearly during time-sensitive work.',
			'Strong analytical mindset and practical judgment.'
		]
	},
	infrastructure: {
		intro: 'This position supports core systems and user-facing operations, with an emphasis on reliability, responsiveness, and practical problem-solving.',
		responsibilities: [
			'Support daily operations for business-critical systems, infrastructure, or internal users.',
			'Troubleshoot issues, coordinate follow-up, and improve service consistency over time.',
			'Partner with technical and business teams to prioritize work and communicate clearly.'
		],
		requirements: [
			'Hands-on experience in IT operations, support, networking, or related environments.',
			'Strong troubleshooting ability and calm communication under pressure.',
			'Bias toward ownership, documentation, and continuous improvement.'
		]
	},
	quality: {
		intro: 'This role helps drive delivery quality, repeatable execution, and confidence in releases across the organization.',
		responsibilities: [
			'Develop and execute quality processes that improve confidence in system changes and production readiness.',
			'Partner with engineering, product, and business teams to identify coverage gaps and operational risks.',
			'Document findings clearly and help teams improve repeatability and release discipline.'
		],
		requirements: [
			'Experience in QA, testing, validation, or release-focused delivery work.',
			'Strong attention to detail and the ability to balance speed with accuracy.',
			'Clear communication and comfort working across technical and business teams.'
		]
	}
});

function buildCompensationLine({ employmentType, salaryMin, salaryMax }) {
	const min = formatCurrency(salaryMin);
	const max = formatCurrency(salaryMax);
	if (employmentType === 'Permanent') {
		return min && max
			? `Compensation for this role is targeted at ${min} to ${max} annually, depending on experience and fit.`
			: 'Compensation will be discussed based on experience and fit.';
	}
	if (employmentType === 'Temporary - W2') {
		return min && max
			? `This W-2 contract role is budgeted at an estimated pay range of ${min} to ${max}, depending on experience and assignment scope.`
			: 'This W-2 contract role offers competitive pay based on experience and assignment scope.';
	}
	if (employmentType === 'Temporary - 1099') {
		return min && max
			? `This 1099 contract role is budgeted at an estimated range of ${min} to ${max}, depending on experience and project scope.`
			: 'This 1099 contract role offers competitive contract compensation based on experience and project scope.';
	}
	return 'Compensation will be aligned to experience and market conditions.';
}

function buildWorkModelLine(location) {
	const normalized = String(location || '').trim();
	if (!normalized) return 'Work arrangement details will be discussed during the interview process.';
	if (/^remote$/i.test(normalized)) {
		return 'This role is structured as a remote opportunity.';
	}
	return `Primary work arrangement: ${normalized}.`;
}

function toHtmlList(items) {
	return `<ul>${items.map((item) => `<li>${item}</li>`).join('')}</ul>`;
}

function buildPublicJobDescription({
	jobTitle,
	clientName,
	location,
	employmentType,
	openings,
	salaryMin,
	salaryMax
}) {
	const family = inferRoleFamily(jobTitle);
	const content = COPY_BY_FAMILY[family] || COPY_BY_FAMILY.engineering;
	const openingsLine =
		Number(openings) > 1
			? `${clientName} is hiring for ${openings} openings on this team.`
			: `${clientName} is hiring for a key addition to the team.`;

	return [
		`<p><strong>${jobTitle}</strong></p>`,
		`<p>${clientName} is seeking a ${jobTitle} to support a growing team and deliver strong business outcomes. ${content.intro}</p>`,
		`<p>${buildWorkModelLine(location)} ${buildCompensationLine({ employmentType, salaryMin, salaryMax })} ${openingsLine}</p>`,
		'<p><strong>What you will do</strong></p>',
		toHtmlList(content.responsibilities),
		'<p><strong>What we are looking for</strong></p>',
		toHtmlList(content.requirements),
		'<p><strong>Why apply</strong></p>',
		`<p>This is a strong opportunity for someone who wants visible work, clear ownership, and a team environment where follow-through matters. Candidates who can communicate well, stay organized, and deliver consistently will stand out.</p>`
	].join('');
}

module.exports = {
	buildPublicJobDescription
};
