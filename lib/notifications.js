import { prisma } from './prisma.js';
import { createRecordId } from './record-id.js';

function isMissingNotificationTableError(error) {
	if (!error) return false;
	return error.code === 'P2021' || error.code === 'P2022';
}

function normalizeUserIds(userIds = []) {
	return [...new Set((Array.isArray(userIds) ? userIds : [userIds]).map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0))];
}

export async function createNotification({
	userId,
	type = 'info',
	title,
	message = '',
	entityType = null,
	entityId = null,
	linkHref = null
}) {
	const normalizedUserId = Number(userId);
	if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) {
		return null;
	}

	const normalizedTitle = String(title || '').trim();
	if (!normalizedTitle) {
		return null;
	}

	try {
		return await prisma.appNotification.create({
			data: {
				recordId: createRecordId('AppNotification'),
				userId: normalizedUserId,
				type: String(type || 'info').trim().toLowerCase() || 'info',
				title: normalizedTitle,
				message: String(message || '').trim() || null,
				entityType: entityType ? String(entityType).trim().toUpperCase() : null,
				entityId: Number.isInteger(Number(entityId)) ? Number(entityId) : null,
				linkHref: String(linkHref || '').trim() || null
			}
		});
	} catch (error) {
		if (isMissingNotificationTableError(error)) {
			return null;
		}
		throw error;
	}
}

export async function createNotificationsForUsers({
	userIds,
	type = 'info',
	title,
	message = '',
	entityType = null,
	entityId = null,
	linkHref = null
}) {
	const normalizedUserIds = normalizeUserIds(userIds);
	if (normalizedUserIds.length === 0) return [];

	const created = await Promise.allSettled(
		normalizedUserIds.map((userId) =>
			createNotification({
				userId,
				type,
				title,
				message,
				entityType,
				entityId,
				linkHref
			})
		)
	);

	return created
		.filter((result) => result.status === 'fulfilled' && result.value)
		.map((result) => result.value);
}

export async function createOwnerAssignmentNotifications({
	previousOwnerId,
	nextOwnerId,
	actorUserId,
	entityType,
	entityId,
	entityLabel,
	detailPath
}) {
	const previousId = Number(previousOwnerId);
	const nextId = Number(nextOwnerId);
	const actorId = Number(actorUserId);
	const normalizedEntityType = String(entityType || '').trim().toUpperCase() || null;
	const normalizedLabel = String(entityLabel || '').trim() || 'Record';
	const normalizedPath = String(detailPath || '').trim() || null;

	const tasks = [];
	if (Number.isInteger(nextId) && nextId > 0 && nextId !== actorId) {
		tasks.push(
			createNotification({
				userId: nextId,
				type: 'assignment',
				title: `Assigned: ${normalizedLabel}`,
				message: 'A record was assigned to you.',
				entityType: normalizedEntityType,
				entityId,
				linkHref: normalizedPath
			})
		);
	}

	if (
		Number.isInteger(previousId)
		&& previousId > 0
		&& previousId !== nextId
		&& previousId !== actorId
	) {
		tasks.push(
			createNotification({
				userId: previousId,
				type: 'assignment',
				title: `Unassigned: ${normalizedLabel}`,
				message: 'This record is no longer assigned to you.',
				entityType: normalizedEntityType,
				entityId,
				linkHref: normalizedPath
			})
		);
	}

	if (tasks.length === 0) return [];
	const settled = await Promise.allSettled(tasks);
	return settled
		.filter((result) => result.status === 'fulfilled' && result.value)
		.map((result) => result.value);
}

export function isNotificationTableMissing(error) {
	return isMissingNotificationTableError(error);
}
