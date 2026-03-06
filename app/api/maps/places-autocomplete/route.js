import { NextResponse } from 'next/server';
import { getIntegrationSettings } from '@/lib/system-settings';
import { LOOKUP_RATE_LIMIT_MAX_REQUESTS, LOOKUP_RATE_LIMIT_WINDOW_SECONDS } from '@/lib/security-constants';
import { consumeRequestThrottle } from '@/lib/request-throttle';

import { withApiLogging } from '@/lib/api-logging';
const GOOGLE_PLACES_AUTOCOMPLETE_URL = 'https://maps.googleapis.com/maps/api/place/autocomplete/json';
const MIN_QUERY_LENGTH = 3;

function toPredictionList(payload) {
	if (!Array.isArray(payload?.predictions)) {
		return [];
	}

	return payload.predictions.slice(0, 8).map((prediction) => ({
		placeId: prediction.place_id,
		description: prediction.description
	}));
}

async function getMaps_places_autocompleteHandler(req) {
	const throttle = await consumeRequestThrottle({
		req,
		routeKey: 'maps.places_autocomplete',
		maxRequests: LOOKUP_RATE_LIMIT_MAX_REQUESTS,
		windowSeconds: LOOKUP_RATE_LIMIT_WINDOW_SECONDS
	});
	if (!throttle.allowed) {
		return NextResponse.json(
			{ enabled: true, predictions: [], error: 'Too many address lookups from this network. Please try again shortly.' },
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
		return NextResponse.json({ enabled: false, predictions: [] });
	}

	const { searchParams } = new URL(req.url);
	const input = searchParams.get('input')?.trim() || '';
	const sessionToken = searchParams.get('sessionToken')?.trim() || '';
	if (input.length < MIN_QUERY_LENGTH) {
		return NextResponse.json({ enabled: true, predictions: [] });
	}

	const params = new URLSearchParams({
		input,
		types: 'address',
		key: apiKey
	});
	if (sessionToken) {
		params.set('sessiontoken', sessionToken);
	}

	try {
		const response = await fetch(`${GOOGLE_PLACES_AUTOCOMPLETE_URL}?${params.toString()}`, {
			cache: 'no-store'
		});
		const payload = await response.json().catch(() => ({}));

		if (!response.ok) {
			return NextResponse.json(
				{ enabled: true, predictions: [], error: 'Address lookup unavailable.' },
				{ status: response.status }
			);
		}

		if (payload?.status === 'REQUEST_DENIED') {
			return NextResponse.json({ enabled: false, predictions: [] });
		}

		if (payload?.status && !['OK', 'ZERO_RESULTS'].includes(payload.status)) {
			return NextResponse.json({ enabled: true, predictions: [], error: payload.status }, { status: 400 });
		}

		return NextResponse.json({
			enabled: true,
			predictions: toPredictionList(payload)
		});
	} catch {
		return NextResponse.json({ enabled: true, predictions: [], error: 'Address lookup unavailable.' }, { status: 502 });
	}
}

export const GET = withApiLogging('maps.places_autocomplete.get', getMaps_places_autocompleteHandler);
