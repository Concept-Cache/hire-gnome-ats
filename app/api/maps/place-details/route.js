import { NextResponse } from 'next/server';
import { getIntegrationSettings } from '@/lib/system-settings';
import { LOOKUP_RATE_LIMIT_MAX_REQUESTS, LOOKUP_RATE_LIMIT_WINDOW_SECONDS } from '@/lib/security-constants';
import { consumeRequestThrottle } from '@/lib/request-throttle';

import { withApiLogging } from '@/lib/api-logging';
const GOOGLE_PLACE_DETAILS_URL = 'https://maps.googleapis.com/maps/api/place/details/json';

function findAddressComponent(components, type, valueKey = 'long_name') {
	if (!Array.isArray(components)) return null;
	const match = components.find((component) => Array.isArray(component?.types) && component.types.includes(type));
	if (!match) return null;
	const value = match[valueKey];
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function getMaps_place_detailsHandler(req) {
	const throttle = await consumeRequestThrottle({
		req,
		routeKey: 'maps.place_details',
		maxRequests: LOOKUP_RATE_LIMIT_MAX_REQUESTS,
		windowSeconds: LOOKUP_RATE_LIMIT_WINDOW_SECONDS
	});
	if (!throttle.allowed) {
		return NextResponse.json(
			{ enabled: true, error: 'Too many address lookups from this network. Please try again shortly.' },
			{
				status: 429,
				headers: {
					'Retry-After': String(throttle.retryAfterSeconds || 60)
				}
			}
		);
	}

	const integrationSettings = await getIntegrationSettings();
	const apiKey = integrationSettings.googleMapsApiKey;
	if (!apiKey) {
		return NextResponse.json({ enabled: false });
	}

	const { searchParams } = new URL(req.url);
	const placeId = searchParams.get('placeId')?.trim() || '';
	const sessionToken = searchParams.get('sessionToken')?.trim() || '';
	if (!placeId) {
		return NextResponse.json({ error: 'Missing placeId.' }, { status: 400 });
	}

	const params = new URLSearchParams({
		place_id: placeId,
		fields: 'place_id,formatted_address,address_components,geometry/location',
		key: apiKey
	});
	if (sessionToken) {
		params.set('sessiontoken', sessionToken);
	}

	try {
		const response = await fetch(`${GOOGLE_PLACE_DETAILS_URL}?${params.toString()}`, {
			cache: 'no-store'
		});
		const payload = await response.json().catch(() => ({}));
		if (!response.ok) {
			return NextResponse.json(
				{ enabled: true, error: 'Address detail lookup unavailable.' },
				{ status: response.status }
			);
		}
		if (payload?.status === 'REQUEST_DENIED') {
			return NextResponse.json({ enabled: false });
		}
		if (payload?.status && payload.status !== 'OK') {
			return NextResponse.json({ enabled: true, error: payload.status }, { status: 400 });
		}

		const result = payload?.result || {};
		const lat = result?.geometry?.location?.lat;
		const lng = result?.geometry?.location?.lng;
		const components = Array.isArray(result?.address_components) ? result.address_components : [];
		const postalCode = findAddressComponent(components, 'postal_code');

		return NextResponse.json({
			enabled: true,
			placeId: result.place_id || placeId,
			formattedAddress: result.formatted_address || '',
			latitude: typeof lat === 'number' ? lat : null,
			longitude: typeof lng === 'number' ? lng : null,
			city: findAddressComponent(components, 'locality'),
			state: findAddressComponent(components, 'administrative_area_level_1', 'short_name'),
			postalCode: postalCode ?? null
		});
	} catch {
		return NextResponse.json({ enabled: true, error: 'Address detail lookup unavailable.' }, { status: 502 });
	}
}

export const GET = withApiLogging('maps.place_details.get', getMaps_place_detailsHandler);
