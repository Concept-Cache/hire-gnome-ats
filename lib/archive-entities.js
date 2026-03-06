import { prisma } from '@/lib/prisma';
import { addScopeToWhere, getEntityScope } from '@/lib/access-control';
import { getCandidateJobOrderScope } from '@/lib/related-record-scope';

export const ARCHIVABLE_ENTITY_TYPES = Object.freeze([
	'CANDIDATE',
	'CLIENT',
	'CONTACT',
	'JOB_ORDER',
	'SUBMISSION',
	'INTERVIEW',
	'PLACEMENT'
]);

const ARCHIVABLE_ENTITY_CONFIG = Object.freeze({
	CANDIDATE: {
		model: 'candidate',
		buildScope: (actingUser) => getEntityScope(actingUser),
		select: {
			id: true,
			recordId: true,
			firstName: true,
			lastName: true
		},
		label: (row) => `${row.firstName || ''} ${row.lastName || ''}`.trim() || row.recordId || `Candidate #${row.id}`,
		subtitle: () => 'Candidate',
		linkHref: (row) => `/candidates/${row.id}`
	},
	CLIENT: {
		model: 'client',
		buildScope: (actingUser) => getEntityScope(actingUser),
		select: {
			id: true,
			recordId: true,
			name: true
		},
		label: (row) => row.name || row.recordId || `Client #${row.id}`,
		subtitle: () => 'Client',
		linkHref: (row) => `/clients/${row.id}`
	},
	CONTACT: {
		model: 'contact',
		buildScope: (actingUser) => getEntityScope(actingUser),
		select: {
			id: true,
			recordId: true,
			firstName: true,
			lastName: true
		},
		label: (row) => `${row.firstName || ''} ${row.lastName || ''}`.trim() || row.recordId || `Contact #${row.id}`,
		subtitle: () => 'Contact',
		linkHref: (row) => `/contacts/${row.id}`
	},
	JOB_ORDER: {
		model: 'jobOrder',
		buildScope: (actingUser) => getEntityScope(actingUser),
		select: {
			id: true,
			recordId: true,
			title: true
		},
		label: (row) => row.title || row.recordId || `Job Order #${row.id}`,
		subtitle: () => 'Job Order',
		linkHref: (row) => `/job-orders/${row.id}`
	},
	SUBMISSION: {
		model: 'submission',
		buildScope: (actingUser) => getCandidateJobOrderScope(actingUser),
		select: {
			id: true,
			recordId: true
		},
		label: (row) => row.recordId || `Submission #${row.id}`,
		subtitle: () => 'Submission',
		linkHref: (row) => `/submissions/${row.id}`
	},
	INTERVIEW: {
		model: 'interview',
		buildScope: (actingUser) => getCandidateJobOrderScope(actingUser),
		select: {
			id: true,
			recordId: true,
			subject: true
		},
		label: (row) => row.subject || row.recordId || `Interview #${row.id}`,
		subtitle: () => 'Interview',
		linkHref: (row) => `/interviews/${row.id}`
	},
	PLACEMENT: {
		model: 'offer',
		buildScope: (actingUser) => getCandidateJobOrderScope(actingUser),
		select: {
			id: true,
			recordId: true
		},
		label: (row) => row.recordId || `Placement #${row.id}`,
		subtitle: () => 'Placement',
		linkHref: (row) => `/placements/${row.id}`
	}
});

export function normalizeArchivableEntityType(value) {
	const normalized = String(value || '').trim().toUpperCase();
	if (!ARCHIVABLE_ENTITY_TYPES.includes(normalized)) return '';
	return normalized;
}

function configForEntityType(entityType) {
	const normalized = normalizeArchivableEntityType(entityType);
	return normalized ? ARCHIVABLE_ENTITY_CONFIG[normalized] : null;
}

function isMissingArchiveTableError(error) {
	if (!error) return false;
	return error.code === 'P2021' || error.code === 'P2022';
}

export function isArchiveTableMissing(error) {
	return isMissingArchiveTableError(error);
}

export async function getArchivedEntityIdSet(entityType) {
	const normalized = normalizeArchivableEntityType(entityType);
	if (!normalized) return new Set();

	try {
		const rows = await prisma.archivedEntity.findMany({
			where: { entityType: normalized },
			select: { entityId: true }
		});
		return new Set(rows.map((row) => row.entityId).filter((value) => Number.isInteger(value)));
	} catch (error) {
		if (isMissingArchiveTableError(error)) {
			return new Set();
		}
		throw error;
	}
}

export async function hasScopedEntityAccess({ actingUser, entityType, entityId }) {
	const config = configForEntityType(entityType);
	if (!config) return false;

	const scopeWhere = config.buildScope(actingUser);
	const row = await prisma[config.model].findFirst({
		where: addScopeToWhere({ id: entityId }, scopeWhere),
		select: { id: true }
	});

	return Boolean(row);
}

export async function getArchivedEntityRows({ actingUser, entityType, search = '' }) {
	const normalizedType = normalizeArchivableEntityType(entityType);
	const config = configForEntityType(normalizedType);
	if (!config) return [];

	try {
		const archivedRows = await prisma.archivedEntity.findMany({
			where: { entityType: normalizedType },
			orderBy: { createdAt: 'desc' },
			include: {
				archivedByUser: {
					select: { id: true, firstName: true, lastName: true }
				}
			}
		});
		if (archivedRows.length === 0) return [];

		const scopeWhere = config.buildScope(actingUser);
		const entityIds = archivedRows.map((row) => row.entityId);
		const entities = await prisma[config.model].findMany({
			where: addScopeToWhere({ id: { in: entityIds } }, scopeWhere),
			select: config.select
		});
		const entitiesById = new Map(entities.map((row) => [row.id, row]));
		const normalizedSearch = String(search || '').trim().toLowerCase();

		return archivedRows
			.map((row) => {
				const entity = entitiesById.get(row.entityId);
				if (!entity) return null;
				const label = config.label(entity);
				const subtitle = config.subtitle(entity);
				const by = row.archivedByUser
					? `${row.archivedByUser.firstName || ''} ${row.archivedByUser.lastName || ''}`.trim()
					: '';
				const candidate = `${label} ${subtitle} ${row.reason || ''} ${by}`.toLowerCase();
				if (normalizedSearch && !candidate.includes(normalizedSearch)) {
					return null;
				}

				return {
					id: row.id,
					entityType: normalizedType,
					entityId: row.entityId,
					label,
					subtitle,
					reason: row.reason || '',
					archivedAt: row.createdAt,
					archivedBy: by || 'System',
					recordId: entity.recordId || null,
					linkHref: config.linkHref(entity)
				};
			})
			.filter(Boolean);
	} catch (error) {
		if (isMissingArchiveTableError(error)) {
			return [];
		}
		throw error;
	}
}
