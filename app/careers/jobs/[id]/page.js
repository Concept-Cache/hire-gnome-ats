import { notFound, redirect } from 'next/navigation';
import CareerJobDetailClient from '@/app/careers/jobs/[id]/career-job-detail-client';
import { getPublicCareerJobById, stripHtmlToText, toTeaser } from '@/lib/careers-public';
import { getPublicAppBaseUrl } from '@/lib/site-url';
import { getSystemBranding } from '@/lib/system-settings';

export const dynamic = 'force-dynamic';

function parseJobId(params) {
	const value = Number(params?.id);
	if (!Number.isInteger(value) || value <= 0) return null;
	return value;
}

function inferSchemaEmploymentType(value) {
	const normalized = String(value || '').toLowerCase();
	if (!normalized) return 'FULL_TIME';
	if (normalized.includes('temp')) return 'TEMPORARY';
	if (normalized.includes('1099') || normalized.includes('contract')) return 'CONTRACTOR';
	if (normalized.includes('part')) return 'PART_TIME';
	if (normalized.includes('full') || normalized.includes('perm')) return 'FULL_TIME';
	return 'FULL_TIME';
}

function buildJobPostingStructuredData({ baseUrl, siteName, job }) {
	const description = stripHtmlToText(job.publicDescription) || `${job.title} at ${job.client?.name || siteName}`;
	const postedAt = job.publishedAt || job.openedAt || null;
	const hasMin = Number.isFinite(Number(job.salaryMin));
	const hasMax = Number.isFinite(Number(job.salaryMax));
	const locationText = String(job.location || '').trim();
	const isRemote = /\bremote\b/i.test(locationText);

	const payload = {
		'@context': 'https://schema.org',
		'@type': 'JobPosting',
		title: job.title,
		description,
		datePosted: postedAt || undefined,
		directApply: true,
		employmentType: inferSchemaEmploymentType(job.employmentType),
		hiringOrganization: {
			'@type': 'Organization',
			name: job.client?.name || siteName,
			sameAs: job.client?.website || undefined
		},
		url: `${baseUrl}/careers/jobs/${job.id}`,
		identifier: {
			'@type': 'PropertyValue',
			name: siteName,
			value: job.recordId || `JOB-${job.id}`
		}
	};

	if (isRemote) {
		payload.jobLocationType = 'TELECOMMUTE';
	} else if (locationText) {
		payload.jobLocation = {
			'@type': 'Place',
			address: {
				'@type': 'PostalAddress',
				addressLocality: locationText
			}
		};
	}

	if (hasMin || hasMax) {
		payload.baseSalary = {
			'@type': 'MonetaryAmount',
			currency: job.currency === 'CAD' ? 'CAD' : 'USD',
			value: {
				'@type': 'QuantitativeValue',
				minValue: hasMin ? Number(job.salaryMin) : undefined,
				maxValue: hasMax ? Number(job.salaryMax) : undefined,
				unitText: 'YEAR'
			}
		};
	}

	return payload;
}

export async function generateMetadata({ params }) {
	const resolvedParams = await params;
	const jobId = parseJobId(resolvedParams);
	const branding = await getSystemBranding();
	const siteName = String(branding?.siteName || 'Hire Gnome ATS').trim() || 'Hire Gnome ATS';
	if (!branding?.careerSiteEnabled) {
		return {
			title: `${siteName} Careers`,
			robots: { index: false, follow: false }
		};
	}

	const baseUrl = getPublicAppBaseUrl();

	if (!jobId) {
		return {
			title: `Role Not Found | ${siteName}`,
			robots: { index: false, follow: false }
		};
	}

	const job = await getPublicCareerJobById(jobId);
	if (!job) {
		return {
			title: `Role Not Found | ${siteName}`,
			robots: { index: false, follow: false }
		};
	}

	const title = `${job.title} | ${siteName} Careers`;
	const description = toTeaser(job.publicDescription || `${job.title} at ${job.client?.name || siteName}`, 155);
	const canonicalPath = `/careers/jobs/${job.id}`;

	return {
		title,
		description,
		alternates: {
			canonical: canonicalPath
		},
		openGraph: {
			title,
			description,
			type: 'article',
			url: `${baseUrl}${canonicalPath}`
		},
		twitter: {
			card: 'summary_large_image',
			title,
			description
		},
		robots: {
			index: true,
			follow: true
		}
	};
}

export default async function CareerJobDetailPage({ params }) {
	const resolvedParams = await params;
	const jobId = parseJobId(resolvedParams);
	if (!jobId) {
		notFound();
	}

	const [job, branding] = await Promise.all([getPublicCareerJobById(jobId), getSystemBranding()]);
	if (!branding?.careerSiteEnabled) {
		redirect('/login');
	}
	if (!job) {
		notFound();
	}

	const siteName = String(branding?.siteName || 'Hire Gnome ATS').trim() || 'Hire Gnome ATS';
	const baseUrl = getPublicAppBaseUrl();
	const structuredData = buildJobPostingStructuredData({
		baseUrl,
		siteName,
		job
	});

	return (
		<>
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
			/>
			<CareerJobDetailClient job={job} />
		</>
	);
}
