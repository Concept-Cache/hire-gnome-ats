import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import ClientReviewPortal from '@/app/components/client-review-portal';
import { buildClientPortalPayload, loadClientPortalAccessByToken, markClientPortalViewed } from '@/lib/client-portal';
import { getSystemBranding } from '@/lib/system-settings';

export const dynamic = 'force-dynamic';

export default async function ClientReviewPage({ params }) {
	const branding = await getSystemBranding();
	if (!branding.clientPortalEnabled) {
		notFound();
	}
	const awaitedParams = await params;
	const token = String(awaitedParams?.token || '').trim();
	const portalAccess = await loadClientPortalAccessByToken(token);
	if (!portalAccess) {
		notFound();
	}

	const viewedAt = new Date();
	void markClientPortalViewed(portalAccess.id);
	portalAccess.lastViewedAt = viewedAt;
	const requestHeaders = await headers();
	const host = requestHeaders.get('x-forwarded-host') || requestHeaders.get('host') || 'localhost:3000';
	const protocol = requestHeaders.get('x-forwarded-proto') || 'https';

	const payload = await buildClientPortalPayload({
		req: { url: `${protocol}://${host}/client-review/${encodeURIComponent(token)}` },
		token,
		portalAccess
	});

	return <ClientReviewPortal initialData={payload} token={token} />;
}
