import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { AccessControlError, addScopeToWhere, getActingUser, getEntityScope } from '@/lib/access-control';
import {
	getArchivedEntityRows,
	hasScopedEntityAccess,
	isArchiveTableMissing,
	normalizeArchivableEntityType
} from '@/lib/archive-entities';
import { normalizeArchiveCascadeSelection } from '@/lib/archive-cascade-options';
import { getCandidateJobOrderScope } from '@/lib/related-record-scope';
import { createRecordId } from '@/lib/record-id';
import { parseJsonBody, parsePositiveInt, ValidationError } from '@/lib/request-validation';
import { enforceMutationThrottle } from '@/lib/mutation-throttle';
import { withApiLogging } from '@/lib/api-logging';

function parseBooleanFlag(value, fallback = false) {
	const raw = String(value || '').trim().toLowerCase();
	if (!raw) return fallback;
	if (raw === 'true' || raw === '1' || raw === 'yes') return true;
	if (raw === 'false' || raw === '0' || raw === 'no') return false;
	return fallback;
}

function handleError(error, fallbackMessage, { allowMissingTableFallback = false } = {}) {
	if (error instanceof AccessControlError) {
		return NextResponse.json({ error: error.message }, { status: error.status });
	}
	if (error instanceof ValidationError) {
		return NextResponse.json({ error: error.message }, { status: error.status || 400 });
	}
	if (isArchiveTableMissing(error)) {
		if (allowMissingTableFallback) {
			return NextResponse.json({
				rows: [],
				ids: []
			});
		}
		return NextResponse.json(
			{ error: 'Archive tables are not available yet. Run database migrations.' },
			{ status: 503 }
		);
	}
	if (error?.code === 'P2002') {
		return NextResponse.json({ ok: true, alreadyArchived: true });
	}
	return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

function dedupeArchiveTargets(targets) {
	const seen = new Set();
	const next = [];

	for (const target of targets) {
		const normalizedEntityType = normalizeArchivableEntityType(target?.entityType);
		const normalizedEntityId = Number(target?.entityId);
		if (!normalizedEntityType || !Number.isInteger(normalizedEntityId) || normalizedEntityId <= 0) {
			continue;
		}
		const key = `${normalizedEntityType}:${normalizedEntityId}`;
		if (seen.has(key)) continue;
		seen.add(key);
		next.push({
			entityType: normalizedEntityType,
			entityId: normalizedEntityId
		});
	}

	return next;
}

function summarizeArchiveTargetsByType(targets) {
	const summary = {};
	for (const target of targets) {
		summary[target.entityType] = (summary[target.entityType] || 0) + 1;
	}
	return summary;
}

async function loadScopedIds(model, baseWhere, scopeWhere) {
	const rows = await prisma[model].findMany({
		where: addScopeToWhere(baseWhere, scopeWhere),
		select: { id: true }
	});
	return rows.map((row) => row.id);
}

async function buildCascadeArchiveTargets({ actingUser, entityType, entityId, cascadeInput }) {
	const cascade = normalizeArchiveCascadeSelection(entityType, cascadeInput);
	const targets = [{ entityType, entityId }];
	const entityScope = getEntityScope(actingUser);
	const candidateJobOrderScope = getCandidateJobOrderScope(actingUser);

	if (entityType === 'CLIENT') {
		if (cascade.includeContacts) {
			const contactIds = await loadScopedIds('contact', { clientId: entityId }, entityScope);
			for (const id of contactIds) targets.push({ entityType: 'CONTACT', entityId: id });
		}

		if (cascade.includeJobOrders) {
			const jobOrderIds = await loadScopedIds('jobOrder', { clientId: entityId }, entityScope);
			for (const id of jobOrderIds) targets.push({ entityType: 'JOB_ORDER', entityId: id });
		}

		if (cascade.includeSubmissions) {
			const submissionIds = await loadScopedIds(
				'submission',
				{ jobOrder: { clientId: entityId } },
				candidateJobOrderScope
			);
			for (const id of submissionIds) targets.push({ entityType: 'SUBMISSION', entityId: id });
		}

		if (cascade.includeInterviews) {
			const interviewIds = await loadScopedIds(
				'interview',
				{ jobOrder: { clientId: entityId } },
				candidateJobOrderScope
			);
			for (const id of interviewIds) targets.push({ entityType: 'INTERVIEW', entityId: id });
		}

		if (cascade.includePlacements) {
			const placementIds = await loadScopedIds(
				'offer',
				{ jobOrder: { clientId: entityId } },
				candidateJobOrderScope
			);
			for (const id of placementIds) targets.push({ entityType: 'PLACEMENT', entityId: id });
		}
	}

	if (entityType === 'JOB_ORDER') {
		if (cascade.includeSubmissions) {
			const submissionIds = await loadScopedIds(
				'submission',
				{ jobOrderId: entityId },
				candidateJobOrderScope
			);
			for (const id of submissionIds) targets.push({ entityType: 'SUBMISSION', entityId: id });
		}

		if (cascade.includeInterviews) {
			const interviewIds = await loadScopedIds(
				'interview',
				{ jobOrderId: entityId },
				candidateJobOrderScope
			);
			for (const id of interviewIds) targets.push({ entityType: 'INTERVIEW', entityId: id });
		}

		if (cascade.includePlacements) {
			const placementIds = await loadScopedIds(
				'offer',
				{ jobOrderId: entityId },
				candidateJobOrderScope
			);
			for (const id of placementIds) targets.push({ entityType: 'PLACEMENT', entityId: id });
		}
	}

	if (entityType === 'CANDIDATE') {
		if (cascade.includeSubmissions) {
			const submissionIds = await loadScopedIds(
				'submission',
				{ candidateId: entityId },
				candidateJobOrderScope
			);
			for (const id of submissionIds) targets.push({ entityType: 'SUBMISSION', entityId: id });
		}

		if (cascade.includeInterviews) {
			const interviewIds = await loadScopedIds(
				'interview',
				{ candidateId: entityId },
				candidateJobOrderScope
			);
			for (const id of interviewIds) targets.push({ entityType: 'INTERVIEW', entityId: id });
		}

		if (cascade.includePlacements) {
			const placementIds = await loadScopedIds(
				'offer',
				{ candidateId: entityId },
				candidateJobOrderScope
			);
			for (const id of placementIds) targets.push({ entityType: 'PLACEMENT', entityId: id });
		}
	}

	return dedupeArchiveTargets(targets);
}

async function getArchiveHandler(req) {
	try {
		const actingUser = await getActingUser(req, { allowFallback: false });
		if (!actingUser?.id) {
			throw new AccessControlError('Authentication required.', 401);
		}

		const entityType = normalizeArchivableEntityType(req.nextUrl.searchParams.get('entityType'));
		if (!entityType) {
			throw new ValidationError('entityType is required.');
		}

		const idsOnly = parseBooleanFlag(req.nextUrl.searchParams.get('idsOnly'), false);
		if (idsOnly) {
			const rows = await getArchivedEntityRows({
				actingUser,
				entityType,
				search: ''
			});
			const idSet = new Set(rows.map((row) => row.entityId).filter((value) => Number.isInteger(value)));
			return NextResponse.json({ ids: [...idSet] });
		}

		const search = String(req.nextUrl.searchParams.get('q') || '').trim();
		const rows = await getArchivedEntityRows({
			actingUser,
			entityType,
			search
		});
		return NextResponse.json({ rows });
	} catch (error) {
		return handleError(error, 'Failed to load archived records.', {
			allowMissingTableFallback: true
		});
	}
}

async function postArchiveHandler(req) {
	try {
		const mutationThrottleResponse = await enforceMutationThrottle(req, 'archive.post');
		if (mutationThrottleResponse) {
			return mutationThrottleResponse;
		}

		const actingUser = await getActingUser(req, { allowFallback: false });
		if (!actingUser?.id) {
			throw new AccessControlError('Authentication required.', 401);
		}

		const body = await parseJsonBody(req);
		const entityType = normalizeArchivableEntityType(body.entityType);
		if (!entityType) {
			throw new ValidationError('Invalid entity type.');
		}
		const entityId = parsePositiveInt(body.entityId, 'entityId');
		const reason = String(body.reason || '').trim();
		const cascadeInput = body.cascade;

		const hasAccess = await hasScopedEntityAccess({
			actingUser,
			entityType,
			entityId
		});
		if (!hasAccess) {
			throw new AccessControlError('Record not found or unavailable for your role.', 404);
		}

		const archiveTargets = await buildCascadeArchiveTargets({
			actingUser,
			entityType,
			entityId,
			cascadeInput
		});

		const archivedRows = await prisma.$transaction(async (tx) => {
			const rows = [];
			for (const target of archiveTargets) {
				const archivedRow = await tx.archivedEntity.upsert({
					where: {
						entityType_entityId: {
							entityType: target.entityType,
							entityId: target.entityId
						}
					},
					update: {
						reason: reason || null,
						archivedByUserId: actingUser.id
					},
					create: {
						recordId: createRecordId('ArchivedEntity'),
						entityType: target.entityType,
						entityId: target.entityId,
						reason: reason || null,
						archivedByUserId: actingUser.id
					}
				});
				rows.push(archivedRow);
			}
			return rows;
		});

		const archived = archivedRows.find(
			(row) => row.entityType === entityType && row.entityId === entityId
		) || archivedRows[0] || null;
		const archivedByType = summarizeArchiveTargetsByType(archiveTargets);

		return NextResponse.json({
			ok: true,
			archived,
			archivedCount: archiveTargets.length,
			archivedByType
		});
	} catch (error) {
		return handleError(error, 'Failed to archive record.');
	}
}

export const GET = withApiLogging('archive.get', getArchiveHandler);
export const POST = withApiLogging('archive.post', postArchiveHandler);
