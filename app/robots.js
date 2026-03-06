import { getPublicAppBaseUrl } from '@/lib/site-url';
import { getSystemBranding } from '@/lib/system-settings';

export default async function robots() {
	const baseUrl = getPublicAppBaseUrl();
	const branding = await getSystemBranding();
	const careerSiteEnabled = Boolean(branding?.careerSiteEnabled);

	return {
		rules: [
			{
				userAgent: '*',
				allow: careerSiteEnabled ? ['/careers', '/careers/jobs/'] : ['/'],
				disallow: [
					'/api/',
					'/admin/',
					'/login',
					'/forgot-password',
					'/reset-password',
					'/account/',
					...(careerSiteEnabled ? [] : ['/careers', '/careers/'])
				]
			}
		],
		sitemap: `${baseUrl}/sitemap.xml`
	};
}
