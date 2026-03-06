import { prisma } from '@/lib/prisma';
import { getSystemBranding } from '@/lib/system-settings';

function isPositiveInteger(value) {
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0;
}

function toIsoDateTime(value) {
	if (!value) return null;
	const parsed = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(parsed.getTime())) return null;
	return parsed.toISOString();
}

function buildCareerLocation(job) {
	const city = String(job?.city || '').trim();
	const state = String(job?.state || '').trim();
	const zipCode = String(job?.zipCode || '').trim();
	if (city && state && zipCode) {
		return `${city}, ${state} ${zipCode}`;
	}
	if (city && state) {
		return `${city}, ${state}`;
	}
	if (city && zipCode) {
		return `${city} ${zipCode}`;
	}
	if (state && zipCode) {
		return `${state} ${zipCode}`;
	}
	if (city) return city;
	if (state) return state;
	if (zipCode) return zipCode;
	return job?.location || '';
}

export function stripHtmlToText(value) {
	return String(value || '')
		.replace(/<[^>]*>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

export function toTeaser(value, max = 220) {
	const plain = stripHtmlToText(value);
	if (!plain) return '';
	if (plain.length <= max) return plain;
	return `${plain.slice(0, max - 1)}…`;
}

function normalizeListJob(job) {
	return {
		id: job.id,
		recordId: job.recordId,
		title: job.title,
		location: buildCareerLocation(job),
		city: job.city || null,
		state: job.state || null,
		zipCode: job.zipCode || null,
		employmentType: job.employmentType,
		currency: job.currency || 'USD',
		salaryMin: job.salaryMin,
		salaryMax: job.salaryMax,
		publicDescription: job.publicDescription,
		teaser: toTeaser(job.publicDescription),
		publishedAt: toIsoDateTime(job.publishedAt),
		openedAt: toIsoDateTime(job.openedAt),
		updatedAt: toIsoDateTime(job.updatedAt),
		client: job.client
			? {
					name: job.client.name,
					industry: job.client.industry
				}
			: null,
		responseCount: job._count?.submissions ?? 0
	};
}

function normalizeDetailJob(job) {
	return {
		id: job.id,
		recordId: job.recordId,
		title: job.title,
		location: buildCareerLocation(job),
		city: job.city || null,
		state: job.state || null,
		zipCode: job.zipCode || null,
		employmentType: job.employmentType,
		currency: job.currency || 'USD',
		salaryMin: job.salaryMin,
		salaryMax: job.salaryMax,
		publicDescription: job.publicDescription,
		teaser: toTeaser(job.publicDescription),
		publishedAt: toIsoDateTime(job.publishedAt),
		openedAt: toIsoDateTime(job.openedAt),
		updatedAt: toIsoDateTime(job.updatedAt),
		client: job.client
			? {
					name: job.client.name,
					industry: job.client.industry,
					website: job.client.website
				}
			: null,
		contact: job.contact
			? {
					firstName: job.contact.firstName,
					lastName: job.contact.lastName,
					title: job.contact.title
				}
			: null,
		responseCount: job._count?.submissions ?? 0
	};
}

async function isCareerSitePublicEnabled() {
	const branding = await getSystemBranding();
	return Boolean(branding?.careerSiteEnabled);
}

export async function listPublicCareerJobs() {
	if (!(await isCareerSitePublicEnabled())) {
		return [];
	}

	try {
		const jobs = await prisma.jobOrder.findMany({
			where: {
				publishToCareerSite: true,
				status: { in: ['open', 'active'] }
			},
			orderBy: [{ publishedAt: 'desc' }, { updatedAt: 'desc' }],
			select: {
				id: true,
				recordId: true,
				title: true,
				location: true,
				city: true,
				state: true,
				zipCode: true,
				employmentType: true,
				currency: true,
				salaryMin: true,
				salaryMax: true,
				publicDescription: true,
				publishedAt: true,
				openedAt: true,
				updatedAt: true,
				client: {
					select: {
						name: true,
						industry: true
					}
				},
				_count: {
					select: {
						submissions: true
					}
				}
			}
		});

		return jobs.map(normalizeListJob);
	} catch {
		return [];
	}
}

export async function getPublicCareerJobById(id) {
	if (!isPositiveInteger(id)) return null;
	if (!(await isCareerSitePublicEnabled())) return null;

	try {
		const job = await prisma.jobOrder.findFirst({
			where: {
				id: Number(id),
				publishToCareerSite: true,
				status: { in: ['open', 'active'] }
			},
			select: {
				id: true,
				recordId: true,
				title: true,
				location: true,
				city: true,
				state: true,
				zipCode: true,
				employmentType: true,
				currency: true,
				salaryMin: true,
				salaryMax: true,
				publicDescription: true,
				publishedAt: true,
				openedAt: true,
				updatedAt: true,
				client: {
					select: {
						name: true,
						industry: true,
						website: true
					}
				},
				contact: {
					select: {
						firstName: true,
						lastName: true,
						title: true
					}
				},
				_count: {
					select: {
						submissions: true
					}
				}
			}
		});

		if (!job) return null;
		return normalizeDetailJob(job);
	} catch {
		return null;
	}
}

export async function listPublicCareerSitemapJobs() {
	if (!(await isCareerSitePublicEnabled())) {
		return [];
	}

	try {
		const jobs = await prisma.jobOrder.findMany({
			where: {
				publishToCareerSite: true,
				status: { in: ['open', 'active'] }
			},
			orderBy: [{ publishedAt: 'desc' }, { updatedAt: 'desc' }],
			select: {
				id: true,
				updatedAt: true,
				publishedAt: true,
				openedAt: true
			}
		});

		return jobs.map((job) => ({
			id: job.id,
			lastModified: toIsoDateTime(job.updatedAt || job.publishedAt || job.openedAt)
		}));
	} catch {
		return [];
	}
}
