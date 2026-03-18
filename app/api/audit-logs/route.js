import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { AccessControlError, getActingUser } from '@/lib/access-control';

import { withApiLogging } from '@/lib/api-logging';
const SUPPORTED_ENTITY_TYPES = new Set([
	'CANDIDATE',
	'CLIENT',
	'CONTACT',
	'JOB_ORDER',
	'SUBMISSION',
	'INTERVIEW',
	'PLACEMENT',
	'USER',
	'DIVISION',
	'SKILL'
]);

const ENTITY_SCOPE_MODEL_MAP = {
	CANDIDATE: 'candidate',
	CLIENT: 'client',
	CONTACT: 'contact',
	JOB_ORDER: 'jobOrder',
	SUBMISSION: 'submission',
	INTERVIEW: 'interview',
	PLACEMENT: 'offer'
};

function parsePositiveInt(value) {
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed <= 0) return null;
	return parsed;
}

function parseLimit(value) {
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed <= 0) return 50;
	return Math.min(parsed, 200);
}

function handleError(error, fallbackMessage) {
	if (error instanceof AccessControlError) {
		return NextResponse.json({ error: error.message }, { status: error.status });
	}

	return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

async function getAudit_logsHandler(req) {
	try {
		const actingUser = await getActingUser(req, { allowFallback: false });
		if (!actingUser) {
			throw new AccessControlError('Select an active user before viewing audit logs.', 403);
		}

		const entityType = String(req.nextUrl.searchParams.get('entityType') || '')
			.trim()
			.toUpperCase();
		const entityId = parsePositiveInt(req.nextUrl.searchParams.get('entityId'));
		const limit = parseLimit(req.nextUrl.searchParams.get('limit'));

		if (!entityType || !entityId) {
			return NextResponse.json(
				{ error: 'entityType and entityId query params are required.' },
				{ status: 400 }
			);
		}

		if (actingUser.role !== 'ADMINISTRATOR') {
			throw new AccessControlError('Only administrators can view audit trails.', 403);
		}

		if (!SUPPORTED_ENTITY_TYPES.has(entityType)) {
			throw new AccessControlError('Unsupported entity type for audit logs.', 400);
		}

		const logs = await prisma.auditLog.findMany({
			where: { entityType, entityId },
			orderBy: { createdAt: 'desc' },
			take: limit,
			include: {
				actorUser: {
					select: { id: true, firstName: true, lastName: true, email: true, isActive: true }
				}
			}
		});

		return NextResponse.json(logs);
	} catch (error) {
		return handleError(error, 'Failed to load audit logs.');
	}
}

export const GET = withApiLogging('audit_logs.get', getAudit_logsHandler);
