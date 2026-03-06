import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
	AccessControlError,
	addScopeToWhere,
	ensureScopedEntityAccess,
	getActingUser
} from '@/lib/access-control';
import { getCandidateJobOrderScope } from '@/lib/related-record-scope';

import { withApiLogging } from '@/lib/api-logging';
const ENTITY_SCOPE_MODEL_MAP = {
	CANDIDATE: 'candidate',
	CLIENT: 'client',
	CONTACT: 'contact',
	JOB_ORDER: 'jobOrder',
	SUBMISSION: 'submission',
	INTERVIEW: 'interview',
	PLACEMENT: 'offer'
};

const ADMIN_ONLY_ENTITY_TYPES = new Set(['USER', 'DIVISION', 'SKILL']);

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

		if (ADMIN_ONLY_ENTITY_TYPES.has(entityType) && actingUser.role !== 'ADMINISTRATOR') {
			throw new AccessControlError('Only administrators can view this audit trail.', 403);
		}

		const scopedModel = ENTITY_SCOPE_MODEL_MAP[entityType];
		if (scopedModel) {
			if (scopedModel === 'submission' || scopedModel === 'interview' || scopedModel === 'offer') {
				const record = await prisma[scopedModel].findFirst({
					where: addScopeToWhere({ id: entityId }, getCandidateJobOrderScope(actingUser)),
					select: { id: true }
				});
				if (!record) {
					throw new AccessControlError('Record not found or unavailable for your role.', 404);
				}
			} else {
				await ensureScopedEntityAccess(scopedModel, entityId, actingUser);
			}
		} else if (!ADMIN_ONLY_ENTITY_TYPES.has(entityType)) {
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
