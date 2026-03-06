import './globals.css';
import AppShell from '@/app/components/app-shell';
import { ConfirmDialogProvider } from '@/app/components/confirm-dialog';
import { getPublicAppBaseUrl } from '@/lib/site-url';
import { DEFAULT_SITE_NAME, getSystemBranding } from '@/lib/system-settings';

export async function generateMetadata() {
	const branding = await getSystemBranding();
	const baseUrl = getPublicAppBaseUrl();
	return {
		title: String(branding?.siteName || '').trim() || DEFAULT_SITE_NAME,
		metadataBase: new URL(baseUrl),
		description: 'Recruiting ATS built with Next.js + MySQL'
	};
}

export default async function RootLayout({ children }) {
	const branding = await getSystemBranding();
	return (
		<html lang="en" data-theme={branding.themeKey}>
			<body>
				<ConfirmDialogProvider>
					<AppShell>{children}</AppShell>
				</ConfirmDialogProvider>
			</body>
		</html>
	);
}
