import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { AccessControlError, getActingUser } from '@/lib/access-control';
import { parseJsonBody, ValidationError } from '@/lib/request-validation';
import { enforceMutationThrottle } from '@/lib/mutation-throttle';
import { isNotificationTableMissing } from '@/lib/notifications';
import { withApiLogging } from '@/lib/api-logging';

function parseLimit(value) {
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed <= 0) return 20;
	return Math.min(parsed, 100);
}

function parseBooleanFlag(value, fallback = false) {
	const raw = String(value || '').trim().toLowerCase();
	if (!raw) return fallback;
	if (raw === 'true' || raw === '1' || raw === 'yes') return true;
	if (raw === 'false' || raw === '0' || raw === 'no') return false;
	return fallback;
}

function handleError(error, fallbackMessage) {
	if (error instanceof AccessControlError) {
		return NextResponse.json({ error: error.message }, { status: error.status });
	}
	if (error instanceof ValidationError) {
		return NextResponse.json({ error: error.message }, { status: error.status || 400 });
	}
	if (isNotificationTableMissing(error)) {
		return NextResponse.json({
			rows: [],
			unreadCount: 0
		});
	}
	return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

async function getNotificationsHandler(req) {
	try {
		const actingUser = await getActingUser(req, { allowFallback: false });
		if (!actingUser?.id) {
			throw new AccessControlError('Authentication required.', 401);
		}

		const limit = parseLimit(req.nextUrl.searchParams.get('limit'));
		const unreadOnly = parseBooleanFlag(req.nextUrl.searchParams.get('unreadOnly'), false);

		const where = {
			userId: actingUser.id,
			...(unreadOnly ? { readAt: null } : {})
		};

		const [rows, unreadCount] = await Promise.all([
			prisma.appNotification.findMany({
				where,
				orderBy: { createdAt: 'desc' },
				take: limit
			}),
			prisma.appNotification.count({
				where: {
					userId: actingUser.id,
					readAt: null
				}
			})
		]);

		return NextResponse.json({
			rows,
			unreadCount
		});
	} catch (error) {
		return handleError(error, 'Failed to load notifications.');
	}
}

async function postNotificationsHandler(req) {
	try {
		const mutationThrottleResponse = await enforceMutationThrottle(req, 'notifications.post');
		if (mutationThrottleResponse) {
			return mutationThrottleResponse;
		}

		const actingUser = await getActingUser(req, { allowFallback: false });
		if (!actingUser?.id) {
			throw new AccessControlError('Authentication required.', 401);
		}

		const body = await parseJsonBody(req);
		const action = String(body.action || '').trim().toLowerCase();
		if (action !== 'mark_all_read') {
			throw new ValidationError('Unsupported notification action.');
		}

		const result = await prisma.appNotification.updateMany({
			where: {
				userId: actingUser.id,
				readAt: null
			},
			data: {
				readAt: new Date()
			}
		});

		return NextResponse.json({
			ok: true,
			updated: Number(result.count) || 0
		});
	} catch (error) {
		return handleError(error, 'Failed to update notifications.');
	}
}

export const GET = withApiLogging('notifications.get', getNotificationsHandler);
export const POST = withApiLogging('notifications.post', postNotificationsHandler);
