import { NextResponse } from 'next/server';
import { downloadObjectBuffer } from '@/lib/object-storage';
import { getSystemSettingRecord, DEFAULT_SITE_LOGO_URL } from '@/lib/system-settings';

import { withApiLogging } from '@/lib/api-logging';
function defaultLogoUrl(req) {
	return new URL(DEFAULT_SITE_LOGO_URL, req.url);
}

async function getSystem_settings_logoHandler(req) {
	const setting = await getSystemSettingRecord();
	if (!setting?.logoStorageKey) {
		return NextResponse.redirect(defaultLogoUrl(req));
	}

	try {
		const buffer = await downloadObjectBuffer({
			key: setting.logoStorageKey,
			storageProvider: setting.logoStorageProvider,
			storageBucket: setting.logoStorageBucket
		});
		return new NextResponse(buffer, {
			status: 200,
			headers: {
				'Content-Type': setting.logoContentType || 'application/octet-stream',
				'Content-Length': String(buffer.length),
				'Cache-Control': 'public, max-age=300'
			}
		});
	} catch {
		return NextResponse.redirect(defaultLogoUrl(req));
	}
}

export const GET = withApiLogging('system_settings.logo.get', getSystem_settings_logoHandler);
