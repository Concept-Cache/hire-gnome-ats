import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthenticatedUser } from '@/lib/access-control';
import { enforceMutationThrottle } from '@/lib/mutation-throttle';
import {
	normalizeSavedListKey,
	SYSTEM_SAVED_VIEW_ID,
	normalizeSavedListViews,
	normalizeSavedListViewState
} from '@/lib/saved-list-views';
import { normalizeColumnVisibilityState } from '@/lib/table-columns';
import { withApiLogging } from '@/lib/api-logging';

const jsonSafeValueSchema = z.lazy(() =>
	z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(jsonSafeValueSchema), z.record(z.string().trim().min(1), jsonSafeValueSchema)])
);
const listViewStateSchema = z.record(z.string().trim().min(1), jsonSafeValueSchema).default({});
const visibilityStateSchema = z.object({
	hiddenColumnKeys: z.array(z.string().trim().min(1)).default([]),
	shownColumnKeys: z.array(z.string().trim().min(1)).default([]),
	orderedColumnKeys: z.array(z.string().trim().min(1)).default([])
});

const saveViewSchema = z.object({
	action: z.literal('save'),
	listKey: z.string().trim().min(1),
	viewId: z.string().trim().min(1).optional(),
	name: z.string().trim().min(1).max(80),
	state: listViewStateSchema,
	columnVisibilityState: visibilityStateSchema.optional(),
	setAsDefault: z.boolean().default(false)
});

const deleteViewSchema = z.object({
	action: z.literal('delete'),
	listKey: z.string().trim().min(1),
	viewId: z.string().trim().min(1)
});

const setDefaultSchema = z.object({
	action: z.literal('setDefault'),
	listKey: z.string().trim().min(1),
	viewId: z.string().trim().min(1).nullable()
});

const setActiveSchema = z.object({
	action: z.literal('setActive'),
	listKey: z.string().trim().min(1),
	viewId: z.string().trim().min(1).nullable()
});

const patchSchema = z.discriminatedUnion('action', [saveViewSchema, deleteViewSchema, setDefaultSchema, setActiveSchema]);

function serializeSavedViews(raw) {
	return normalizeSavedListViews(raw);
}

async function getSessionSavedViewsHandler(req) {
	const authenticatedUser = await getAuthenticatedUser(req, { allowFallback: false });
	if (!authenticatedUser?.id) {
		return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
	}

	const user = await prisma.user.findUnique({
		where: { id: authenticatedUser.id },
		select: { id: true, isActive: true, savedListViews: true }
	});
	if (!user || !user.isActive) {
		return NextResponse.json({ error: 'Your account is not active.' }, { status: 403 });
	}

	return NextResponse.json({
		savedListViews: serializeSavedViews(user.savedListViews)
	});
}

async function patchSessionSavedViewsHandler(req) {
	const mutationThrottleResponse = await enforceMutationThrottle(req, 'session.saved_views.patch');
	if (mutationThrottleResponse) {
		return mutationThrottleResponse;
	}

	const authenticatedUser = await getAuthenticatedUser(req, { allowFallback: false });
	if (!authenticatedUser?.id) {
		return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
	}

	const body = await req.json().catch(() => ({}));
	const parsed = patchSchema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json({ errors: parsed.error.flatten() }, { status: 400 });
	}

	const normalizedListKey = normalizeSavedListKey(parsed.data.listKey);
	if (!normalizedListKey) {
		return NextResponse.json({ error: 'A valid list key is required.' }, { status: 400 });
	}

	const user = await prisma.user.findUnique({
		where: { id: authenticatedUser.id },
		select: { id: true, isActive: true, savedListViews: true }
	});
	if (!user || !user.isActive) {
		return NextResponse.json({ error: 'Your account is not active.' }, { status: 403 });
	}

	const existingViews = serializeSavedViews(user.savedListViews);
	const existingGroup = existingViews[normalizedListKey] || { activeViewId: null, defaultViewId: null, views: [] };
	const nextGroup = {
		activeViewId: existingGroup.activeViewId || null,
		defaultViewId: existingGroup.defaultViewId || null,
		views: [...existingGroup.views]
	};
	const timestamp = new Date().toISOString();
	let affectedViewId = null;

	if (parsed.data.action === 'save') {
		const nextState = normalizeSavedListViewState(parsed.data.state);
		const nextName = String(parsed.data.name || '').trim();
		const existingIndex = nextGroup.views.findIndex((view) => view.id === parsed.data.viewId);
		if (existingIndex >= 0) {
			const existingView = nextGroup.views[existingIndex];
			nextGroup.views[existingIndex] = {
				...existingView,
				name: nextName,
				state: nextState,
				columnVisibilityState: normalizeColumnVisibilityState(parsed.data.columnVisibilityState),
				updatedAt: timestamp
			};
			affectedViewId = nextGroup.views[existingIndex].id;
		} else {
			const nextViewId = randomUUID();
			nextGroup.views.push({
				id: nextViewId,
				name: nextName,
				state: nextState,
				columnVisibilityState: normalizeColumnVisibilityState(parsed.data.columnVisibilityState),
				createdAt: timestamp,
				updatedAt: timestamp
			});
			affectedViewId = nextViewId;
		}
		if (parsed.data.setAsDefault) {
			nextGroup.defaultViewId = affectedViewId || nextGroup.defaultViewId;
		}
		nextGroup.activeViewId = affectedViewId || nextGroup.activeViewId;
	} else if (parsed.data.action === 'delete') {
		nextGroup.views = nextGroup.views.filter((view) => view.id !== parsed.data.viewId);
		if (nextGroup.activeViewId === parsed.data.viewId) {
			nextGroup.activeViewId = null;
		}
		if (nextGroup.defaultViewId === parsed.data.viewId) {
			nextGroup.defaultViewId = null;
		}
	} else if (parsed.data.action === 'setDefault') {
		const nextDefaultId = String(parsed.data.viewId || '').trim() || null;
		if (nextDefaultId && !nextGroup.views.some((view) => view.id === nextDefaultId)) {
			return NextResponse.json({ error: 'Saved view not found.' }, { status: 404 });
		}
		nextGroup.defaultViewId = nextDefaultId;
	} else if (parsed.data.action === 'setActive') {
		const nextActiveId = String(parsed.data.viewId || '').trim() || null;
		if (
			nextActiveId &&
			nextActiveId !== SYSTEM_SAVED_VIEW_ID &&
			!nextGroup.views.some((view) => view.id === nextActiveId)
		) {
			return NextResponse.json({ error: 'Saved view not found.' }, { status: 404 });
		}
		nextGroup.activeViewId = nextActiveId;
	}

	const nextSavedViews = {
		...existingViews,
		[normalizedListKey]: nextGroup
	};

	if (nextGroup.views.length === 0 && !nextGroup.defaultViewId) {
		delete nextSavedViews[normalizedListKey];
	}

	const updated = await prisma.user.update({
		where: { id: user.id },
		data: { savedListViews: nextSavedViews },
		select: { savedListViews: true }
	});

	return NextResponse.json({
		ok: true,
		affectedViewId,
		savedListViews: serializeSavedViews(updated.savedListViews)
	});
}

export const GET = withApiLogging('session.saved_views.get', getSessionSavedViewsHandler);
export const PATCH = withApiLogging('session.saved_views.patch', patchSessionSavedViewsHandler);
