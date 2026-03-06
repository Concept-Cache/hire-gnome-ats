import { NextResponse } from 'next/server';
import { AccessControlError, getActingUser } from '@/lib/access-control';
import { getApiErrorLogsSnapshot, purgeApiErrorLogs } from '@/lib/error-log-store';
import { withApiLogging } from '@/lib/api-logging';
import { enforceMutationThrottle } from '@/lib/mutation-throttle';

function parseLimit(value) {
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed <= 0) return 50;
	return Math.min(parsed, 500);
}

function asQueryValue(value) {
	return typeof value === 'string' ? value.trim() : '';
}

function handleError(error, fallbackMessage) {
	if (error instanceof AccessControlError) {
		return NextResponse.json({ error: error.message }, { status: error.status });
	}

	return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

async function getAdmin_error_logsHandler(req) {
	try {
		const actingUser = await getActingUser(req, { allowFallback: false });
		if (!actingUser || actingUser.role !== 'ADMINISTRATOR') {
			throw new AccessControlError('Administrator access is required.', 403);
		}

		const limit = parseLimit(req.nextUrl.searchParams.get('limit'));
		const query = asQueryValue(req.nextUrl.searchParams.get('q'));
		const requestId = asQueryValue(req.nextUrl.searchParams.get('requestId'));
		const snapshot = await getApiErrorLogsSnapshot({ limit, query, requestId });

		return NextResponse.json({
			logs: snapshot.logs,
			total: snapshot.total,
			lastLoggedAt: snapshot.lastLoggedAt,
			source: snapshot.source
		});
	} catch (error) {
		return handleError(error, 'Failed to load API error logs.');
	}
}

export const GET = withApiLogging('admin.error_logs.get', getAdmin_error_logsHandler);

async function deleteAdmin_error_logsHandler(req) {
	try {
		const mutationThrottleResponse = await enforceMutationThrottle(req, 'admin.error_logs.purge');
		if (mutationThrottleResponse) {
			return mutationThrottleResponse;
		}

		const actingUser = await getActingUser(req, { allowFallback: false });
		if (!actingUser || actingUser.role !== 'ADMINISTRATOR') {
			throw new AccessControlError('Administrator access is required.', 403);
		}

		const result = await purgeApiErrorLogs();
		if (result.databaseError) {
			return NextResponse.json({
				message: 'API logs purged from server memory. Persisted logs may remain due to a storage error.',
				...result
			}, { status: 200 });
		}

		return NextResponse.json({
			message: 'API error logs purged.',
			...result
		});
	} catch (error) {
		return handleError(error, 'Failed to purge API error logs.');
	}
}

export const DELETE = withApiLogging('admin.error_logs.purge', deleteAdmin_error_logsHandler);
