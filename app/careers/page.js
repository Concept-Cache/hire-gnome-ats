import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import LoadingIndicator from '@/app/components/loading-indicator';
import CareersPageClient from '@/app/careers/careers-page-client';
import { listPublicCareerJobs } from '@/lib/careers-public';
import { getPublicAppBaseUrl } from '@/lib/site-url';
import { getSystemBranding } from '@/lib/system-settings';

export const dynamic = 'force-dynamic';

function buildCareersItemListStructuredData({ baseUrl, siteName, jobs }) {
	return {
		'@context': 'https://schema.org',
		'@type': 'ItemList',
		name: `${siteName} Open Jobs`,
		numberOfItems: jobs.length,
		itemListElement: jobs.map((job, index) => ({
			'@type': 'ListItem',
			position: index + 1,
			url: `${baseUrl}/careers/jobs/${job.id}`,
			name: job.title
		}))
	};
}

export async function generateMetadata() {
	const branding = await getSystemBranding();
	const siteName = String(branding?.siteName || 'Hire Gnome ATS').trim() || 'Hire Gnome ATS';
	if (!branding?.careerSiteEnabled) {
		return {
			title: `${siteName} Careers`,
			robots: { index: false, follow: false }
		};
	}

	const jobs = await listPublicCareerJobs();
	const baseUrl = getPublicAppBaseUrl();
	const title = `${siteName} Careers | Open Jobs`;
	const description =
		jobs.length > 0
			? `Browse ${jobs.length} open roles and apply online with ${siteName}.`
			: `Browse open roles and apply online with ${siteName}.`;

	return {
		title,
		description,
		alternates: {
			canonical: '/careers'
		},
		openGraph: {
			title,
			description,
			type: 'website',
			url: `${baseUrl}/careers`
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

export default async function CareersPage() {
	const [branding, jobs] = await Promise.all([getSystemBranding(), listPublicCareerJobs()]);
	if (!branding?.careerSiteEnabled) {
		redirect('/login');
	}

	const siteName = String(branding?.siteName || 'Hire Gnome ATS').trim() || 'Hire Gnome ATS';
	const baseUrl = getPublicAppBaseUrl();
	const structuredData = buildCareersItemListStructuredData({
		baseUrl,
		siteName,
		jobs
	});

	return (
		<>
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
			/>
			<Suspense
				fallback={
					<section className="careers-page">
						<article className="careers-panel">
							<LoadingIndicator className="careers-loading" label="Loading open roles" />
						</article>
					</section>
				}
			>
				<CareersPageClient siteName={siteName} initialJobs={jobs} />
			</Suspense>
		</>
	);
}
