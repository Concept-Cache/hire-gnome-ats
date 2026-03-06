import { logError, logInfo, logWarn, requestLogContext } from '@/lib/logger';

function asStatus(response) {
	const status = Number(response?.status);
	if (!Number.isInteger(status) || status < 100) return 200;
	return status;
}

function addRequestIdHeader(response, requestId) {
	if (!requestId || !response?.headers || typeof response.headers.set !== 'function') {
		return response;
	}
	if (!response.headers.get('x-request-id')) {
		response.headers.set('x-request-id', requestId);
	}
	return response;
}

function addTimingHeaders(response, durationMs) {
	if (!response?.headers || typeof response.headers.set !== 'function') {
		return response;
	}
	const safeDurationMs = Number.isFinite(durationMs) && durationMs >= 0 ? Math.round(durationMs) : 0;
	response.headers.set('x-response-time-ms', String(safeDurationMs));
	const existingServerTiming = String(response.headers.get('server-timing') || '').trim();
	const requestServerTiming = `app;dur=${safeDurationMs}`;
	response.headers.set(
		'server-timing',
		existingServerTiming ? `${existingServerTiming}, ${requestServerTiming}` : requestServerTiming
	);
	return response;
}

export function withApiLogging(route, handler) {
	if (typeof handler !== 'function') {
		throw new TypeError('withApiLogging requires a handler function.');
	}

	return async function wrappedApiHandler(...args) {
		const req = args[0];
		const startedAt = Date.now();
		const baseContext = requestLogContext(req, { route });

		try {
			const response = await handler(...args);
			const status = asStatus(response);
			const durationMs = Date.now() - startedAt;
			const logMeta = {
				...baseContext,
				status,
				durationMs
			};

			if (status >= 500) {
				logError('api.request.completed', logMeta);
			} else if (status >= 400) {
				logWarn('api.request.completed', logMeta);
			} else {
				logInfo('api.request.completed', logMeta);
			}

			return addTimingHeaders(addRequestIdHeader(response, baseContext.requestId), durationMs);
		} catch (error) {
			logError('api.request.exception', {
				...baseContext,
				durationMs: Date.now() - startedAt,
				error
			});
			throw error;
		}
	};
}
