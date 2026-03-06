import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { AccessControlError, getActingUser } from '@/lib/access-control';
import { parseJsonBody, parseRouteId, ValidationError } from '@/lib/request-validation';
import { enforceMutationThrottle } from '@/lib/mutation-throttle';
import { isNotificationTableMissing } from '@/lib/notifications';
import { withApiLogging } from '@/lib/api-logging';

function handleError(error, fallbackMessage) {
	if (error instanceof AccessControlError) {
		return NextResponse.json({ error: error.message }, { status: error.status });
	}
	if (error instanceof ValidationError) {
		return NextResponse.json({ error: error.message }, { status: error.status || 400 });
	}
	if (isNotificationTableMissing(error)) {
		return NextResponse.json({ error: 'Notifications are not available yet.' }, { status: 503 });
	}
	if (error?.code === 'P2025') {
		return NextResponse.json({ error: 'Notification not found.' }, { status: 404 });
	}
	return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

async function patchNotifications_idHandler(req, { params }) {
	try {
		const mutationThrottleResponse = await enforceMutationThrottle(req, 'notifications.id.patch');
		if (mutationThrottleResponse) {
			return mutationThrottleResponse;
		}

		const actingUser = await getActingUser(req, { allowFallback: false });
		if (!actingUser?.id) {
			throw new AccessControlError('Authentication required.', 401);
		}

		const resolvedParams = await params;
		const id = parseRouteId(resolvedParams);
		const body = await parseJsonBody(req);
		const read = Boolean(body.read);

		const existing = await prisma.appNotification.findFirst({
			where: {
				id,
				userId: actingUser.id
			},
			select: { id: true }
		});
		if (!existing) {
			throw new AccessControlError('Notification not found.', 404);
		}

		const updated = await prisma.appNotification.update({
			where: { id },
			data: {
				readAt: read ? new Date() : null
			}
		});

		return NextResponse.json(updated);
	} catch (error) {
		return handleError(error, 'Failed to update notification.');
	}
}

export const PATCH = withApiLogging('notifications.id.patch', patchNotifications_idHandler);
