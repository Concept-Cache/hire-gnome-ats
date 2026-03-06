import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/access-control';
import { writeAuditLog } from '@/lib/audit-log';
import { enforceMutationThrottle } from '@/lib/mutation-throttle';

import { withApiLogging } from '@/lib/api-logging';
const settingsSchema = z.object({
	notifyCareerSiteApplications: z.coerce.boolean()
});

const settingsSelect = {
	id: true,
	firstName: true,
	lastName: true,
	email: true,
	isActive: true,
	notifyCareerSiteApplications: true
};

function serializeSettings(user) {
	return {
		firstName: user.firstName,
		lastName: user.lastName,
		email: user.email,
		notifyCareerSiteApplications: Boolean(user.notifyCareerSiteApplications)
	};
}

async function getSession_settingsHandler(req) {
	const authenticatedUser = await getAuthenticatedUser(req, { allowFallback: false });
	if (!authenticatedUser?.id) {
		return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
	}

	const user = await prisma.user.findUnique({
		where: { id: authenticatedUser.id },
		select: settingsSelect
	});
	if (!user || !user.isActive) {
		return NextResponse.json({ error: 'Your account is not active.' }, { status: 403 });
	}

	return NextResponse.json(serializeSettings(user));
}

async function patchSession_settingsHandler(req) {
	const mutationThrottleResponse = await enforceMutationThrottle(req, 'session.settings.patch');
	if (mutationThrottleResponse) {
		return mutationThrottleResponse;
	}

	const authenticatedUser = await getAuthenticatedUser(req, { allowFallback: false });
	if (!authenticatedUser?.id) {
		return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
	}

	const body = await req.json().catch(() => ({}));
	const parsed = settingsSchema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json({ errors: parsed.error.flatten() }, { status: 400 });
	}

	const existingUser = await prisma.user.findUnique({
		where: { id: authenticatedUser.id },
		select: settingsSelect
	});
	if (!existingUser || !existingUser.isActive) {
		return NextResponse.json({ error: 'Your account is not active.' }, { status: 403 });
	}

	const updatedUser = await prisma.user.update({
		where: { id: existingUser.id },
		data: {
			notifyCareerSiteApplications: parsed.data.notifyCareerSiteApplications
		},
		select: settingsSelect
	});

	await writeAuditLog({
		actorUserId: existingUser.id,
		action: 'UPDATE',
		entityType: 'USER',
		entityId: existingUser.id,
		before: {
			id: existingUser.id,
			notifyCareerSiteApplications: existingUser.notifyCareerSiteApplications
		},
		after: {
			id: updatedUser.id,
			notifyCareerSiteApplications: updatedUser.notifyCareerSiteApplications
		},
		summary: 'Updated own notification settings.',
		metadata: { source: 'account_settings' }
	});

	return NextResponse.json({
		ok: true,
		message: 'Settings updated.',
		settings: serializeSettings(updatedUser)
	});
}

export const GET = withApiLogging('session.settings.get', getSession_settingsHandler);
export const PATCH = withApiLogging('session.settings.patch', patchSession_settingsHandler);
