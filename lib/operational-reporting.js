import { prisma } from '@/lib/prisma';
import { AccessControlError } from '@/lib/access-control';
import { getArchivedEntityIdSet } from '@/lib/archive-entities';
import { CANDIDATE_STATUS_OPTIONS } from '@/lib/candidate-status';
import { JOB_ORDER_STATUS_OPTIONS } from '@/lib/job-order-options';
import { formatSelectValueLabel } from '@/lib/select-value-label';
import { submissionCreatedByLabel } from '@/lib/submission-origin';
import { formatDateTimeAt } from '@/lib/date-format';

const DEFAULT_RANGE_DAYS = 30;
const MAX_RANGE_DAYS = 366;
const OPEN_JOB_ORDER_STATUSES = ['open', 'on_hold'];
const SUBMISSION_STATUS_ORDER = [
	'submitted',
	'under_review',
	'qualified',
	'offered',
	'hired',
	'placed',
	'rejected'
];
const PLACEMENT_STATUS_ORDER = ['planned', 'made', 'revised', 'accepted', 'declined', 'withdrawn'];
const INTERVIEW_TYPE_ORDER = ['phone', 'video', 'in_person'];

function andWhere(...clauses) {
	const filtered = clauses.filter(Boolean);
	if (filtered.length === 0) return undefined;
	if (filtered.length === 1) return filtered[0];
	return { AND: filtered };
}

function toPositiveInt(value) {
	if (value == null || value === '') return null;
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed <= 0) return null;
	return parsed;
}

function startOfDay(date) {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function addDays(date, days) {
	return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function formatDateInputValue(date) {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

function parseDateInput(value) {
	const normalized = String(value || '').trim();
	if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return null;
	const [year, month, day] = normalized.split('-').map((part) => Number(part));
	if (!year || !month || !day) return null;
	const next = new Date(year, month - 1, day, 0, 0, 0, 0);
	if (Number.isNaN(next.getTime())) return null;
	return next;
}

function formatDayLabel(date) {
	return date.toLocaleDateString(undefined, {
		month: 'numeric',
		day: 'numeric'
	});
}

function formatMeta(parts) {
	return parts
		.map((part) => String(part || '').trim())
		.filter(Boolean)
		.join('\n');
}

function formatOwnerName(user) {
	if (!user) return 'Unassigned';
	const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
	return fullName || user.email || 'Unassigned';
}

function fallbackOwnerLabel(ownerId) {
	return ownerId > 0 ? `User #${ownerId}` : 'Unassigned';
}

function labelInterviewType(value) {
	if (value === 'in_person') return 'In Person';
	return formatSelectValueLabel(value);
}

function ensureStatusSeries(groupedRows, orderedOptions, fallbackLabel = formatSelectValueLabel) {
	const countsByValue = new Map(
		groupedRows.map((row) => [String(row.status || row.interviewMode || '').trim(), row._count?._all || 0])
	);
	const usedValues = new Set();
	const ordered = orderedOptions.map((option) => {
		const value = typeof option === 'string' ? option : option.value;
		const label = typeof option === 'string' ? fallbackLabel(option) : option.label;
		usedValues.add(value);
		return {
			value,
			label,
			count: countsByValue.get(value) || 0
		};
	});

	const extras = [...countsByValue.entries()]
		.filter(([value, count]) => !usedValues.has(value) && count > 0)
		.map(([value, count]) => ({
			value,
			label: fallbackLabel(value),
			count
		}))
		.sort((a, b) => a.label.localeCompare(b.label));

	return [...ordered, ...extras];
}

function normalizeOwnerBucketId(value) {
	return Number.isInteger(value) && value > 0 ? value : 0;
}

function parseOwnerBucketValue(value) {
	const normalized = String(value || '').trim().toLowerCase();
	if (!normalized || normalized === 'unassigned' || normalized === '0' || normalized === 'null') {
		return 0;
	}
	const parsed = Number(normalized);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function getOwnerBucketLabel(filterOptions, ownerBucketId) {
	if (!ownerBucketId) return 'Unassigned';
	const owner = (Array.isArray(filterOptions?.owners) ? filterOptions.owners : []).find((row) => row.id === ownerBucketId);
	return owner?.name || fallbackOwnerLabel(ownerBucketId);
}

function buildOwnerBucketEntityWhere(ownerBucketId) {
	return ownerBucketId > 0 ? { ownerId: ownerBucketId } : { ownerId: null };
}

function buildOwnerBucketSubmissionWhere(ownerBucketId) {
	if (ownerBucketId > 0) {
		return {
			OR: [
				{ createdByUserId: ownerBucketId },
				{ candidate: { ownerId: ownerBucketId } },
				{ jobOrder: { ownerId: ownerBucketId } }
			]
		};
	}
	return {
		OR: [{ createdByUserId: null }, { candidate: { ownerId: null } }, { jobOrder: { ownerId: null } }]
	};
}

function buildOwnerBucketInterviewWhere(ownerBucketId) {
	if (ownerBucketId > 0) {
		return {
			OR: [{ candidate: { ownerId: ownerBucketId } }, { jobOrder: { ownerId: ownerBucketId } }]
		};
	}
	return {
		OR: [{ candidate: { ownerId: null } }, { jobOrder: { ownerId: null } }]
	};
}

function buildOwnerBucketPlacementWhere(ownerBucketId) {
	if (ownerBucketId > 0) {
		return {
			OR: [
				{ submission: { createdByUserId: ownerBucketId } },
				{ candidate: { ownerId: ownerBucketId } },
				{ jobOrder: { ownerId: ownerBucketId } }
			]
		};
	}
	return {
		OR: [
			{ submission: { createdByUserId: null } },
			{ candidate: { ownerId: null } },
			{ jobOrder: { ownerId: null } }
		]
	};
}

function resolveSubmissionOwnerId(row) {
	return normalizeOwnerBucketId(row.createdByUserId || row.candidate?.ownerId || row.jobOrder?.ownerId || 0);
}

function resolveInterviewOwnerId(row) {
	return normalizeOwnerBucketId(row.candidate?.ownerId || row.jobOrder?.ownerId || 0);
}

function resolvePlacementOwnerId(row) {
	return normalizeOwnerBucketId(
		row.submission?.createdByUserId || row.candidate?.ownerId || row.jobOrder?.ownerId || 0
	);
}

function resolveReportingOwnerId({ actingUser, fallbackOwnerId }) {
	if (actingUser?.role === 'RECRUITER') {
		return normalizeOwnerBucketId(actingUser.id);
	}
	return normalizeOwnerBucketId(fallbackOwnerId);
}

function initializeTrendBuckets(startDate, dayCount) {
	return Array.from({ length: dayCount }, (_, index) => {
		const date = addDays(startDate, index);
		return {
			dateKey: formatDateInputValue(date),
			label: formatDayLabel(date),
			candidates: 0,
			jobOrders: 0,
			submissions: 0,
			interviews: 0,
			placements: 0,
			total: 0
		};
	});
}

function incrementTrendBucket(trendByKey, value, key) {
	if (!value) return;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return;
	const bucket = trendByKey.get(formatDateInputValue(startOfDay(date)));
	if (!bucket) return;
	bucket[key] += 1;
	bucket.total += 1;
}

async function resolveDateRange({ startDateInput, endDateInput }) {
	const now = new Date();
	const today = startOfDay(now);
	const defaultStart = addDays(today, -(DEFAULT_RANGE_DAYS - 1));
	const startDate = parseDateInput(startDateInput) || defaultStart;
	const endDate = parseDateInput(endDateInput) || today;
	if (endDate.getTime() < startDate.getTime()) {
		throw new AccessControlError('Report start date must be on or before the end date.', 400);
	}

	const dayCount = Math.floor((startOfDay(endDate).getTime() - startOfDay(startDate).getTime()) / 86400000) + 1;
	if (dayCount > MAX_RANGE_DAYS) {
		throw new AccessControlError(`Reporting range cannot exceed ${MAX_RANGE_DAYS} days.`, 400);
	}

	return {
		startDate: startOfDay(startDate),
		endDate: startOfDay(endDate),
		endExclusive: addDays(startOfDay(endDate), 1),
		dayCount
	};
}

async function resolveDivisionFilter({ actingUser, divisionIdInput }) {
	if (actingUser.role === 'ADMINISTRATOR') {
		const divisionId = toPositiveInt(divisionIdInput);
		if (!divisionId) return null;
		const division = await prisma.division.findUnique({
			where: { id: divisionId },
			select: { id: true, name: true }
		});
		if (!division) {
			throw new AccessControlError('Selected division was not found.', 400);
		}
		return division.id;
	}

	if (actingUser.divisionId) {
		return actingUser.divisionId;
	}

	return null;
}

async function resolveOwnerFilter({ actingUser, ownerIdInput, divisionId }) {
	if (actingUser.role === 'RECRUITER') {
		return actingUser.id;
	}

	const ownerId = toPositiveInt(ownerIdInput);
	if (!ownerId) return null;

	const owner = await prisma.user.findUnique({
		where: { id: ownerId },
		select: {
			id: true,
			isActive: true,
			divisionId: true
		}
	});
	if (!owner?.isActive) {
		throw new AccessControlError('Selected owner must be an active user.', 400);
	}

	if (actingUser.role === 'DIRECTOR' && owner.divisionId !== actingUser.divisionId) {
		throw new AccessControlError('Directors can only report on users in their own division.', 403);
	}

	if (divisionId && owner.divisionId !== divisionId) {
		throw new AccessControlError('Owner must belong to the selected division.', 400);
	}

	return owner.id;
}

function buildOwnedEntityWhere({ actingUser, divisionId, ownerId }) {
	const clauses = [];

	if (actingUser.role === 'ADMINISTRATOR') {
		if (divisionId) clauses.push({ divisionId });
		if (ownerId) clauses.push({ ownerId });
		return andWhere(...clauses);
	}

	if (actingUser.role === 'DIRECTOR') {
		if (divisionId) clauses.push({ divisionId });
		if (ownerId) clauses.push({ ownerId });
		return andWhere(...clauses);
	}

	if (divisionId) clauses.push({ divisionId });
	clauses.push({ ownerId: actingUser.id });
	return andWhere(...clauses);
}

function buildSubmissionWhere({ actingUser, divisionId, ownerId }) {
	const clauses = [];
	if (divisionId) {
		clauses.push({ candidate: { divisionId } });
		clauses.push({ jobOrder: { divisionId } });
	}

	if (actingUser.role === 'RECRUITER') {
		clauses.push({
			OR: [
				{ createdByUserId: actingUser.id },
				{ candidate: { ownerId: actingUser.id } },
				{ jobOrder: { ownerId: actingUser.id } }
			]
		});
		return andWhere(...clauses);
	}

	if (ownerId) {
		clauses.push({
			OR: [{ createdByUserId: ownerId }, { candidate: { ownerId } }, { jobOrder: { ownerId } }]
		});
	}

	return andWhere(...clauses);
}

function buildInterviewWhere({ actingUser, divisionId, ownerId }) {
	const clauses = [];
	if (divisionId) {
		clauses.push({ candidate: { divisionId } });
		clauses.push({ jobOrder: { divisionId } });
	}

	if (actingUser.role === 'RECRUITER') {
		clauses.push({
			OR: [{ candidate: { ownerId: actingUser.id } }, { jobOrder: { ownerId: actingUser.id } }]
		});
		return andWhere(...clauses);
	}

	if (ownerId) {
		clauses.push({
			OR: [{ candidate: { ownerId } }, { jobOrder: { ownerId } }]
		});
	}

	return andWhere(...clauses);
}

function buildPlacementWhere({ actingUser, divisionId, ownerId }) {
	const clauses = [];
	if (divisionId) {
		clauses.push({ candidate: { divisionId } });
		clauses.push({ jobOrder: { divisionId } });
	}

	if (actingUser.role === 'RECRUITER') {
		clauses.push({
			OR: [
				{ submission: { createdByUserId: actingUser.id } },
				{ candidate: { ownerId: actingUser.id } },
				{ jobOrder: { ownerId: actingUser.id } }
			]
		});
		return andWhere(...clauses);
	}

	if (ownerId) {
		clauses.push({
			OR: [{ submission: { createdByUserId: ownerId } }, { candidate: { ownerId } }, { jobOrder: { ownerId } }]
		});
	}

	return andWhere(...clauses);
}

async function getFilterOptions({ actingUser, divisionId }) {
	const [divisions, owners] = await Promise.all([
		prisma.division.findMany({
			where:
				actingUser.role === 'ADMINISTRATOR'
					? undefined
					: actingUser.divisionId
						? { id: actingUser.divisionId }
						: { id: -1 },
			orderBy: [{ name: 'asc' }],
			select: { id: true, name: true }
		}),
		prisma.user.findMany({
			where:
				actingUser.role === 'RECRUITER'
					? { id: actingUser.id, isActive: true }
					: {
							isActive: true,
							...(actingUser.role === 'DIRECTOR'
								? { divisionId: actingUser.divisionId || -1 }
								: divisionId
									? { divisionId }
									: {})
						},
			orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
			select: {
				id: true,
				firstName: true,
				lastName: true,
				email: true,
				divisionId: true
			}
		})
	]);

	return {
		divisions: divisions.map((division) => ({
			id: division.id,
			name: division.name
		})),
		owners: owners.map((owner) => ({
			id: owner.id,
			name: formatOwnerName(owner),
			email: owner.email,
			divisionId: owner.divisionId || null
		}))
	};
}

async function buildOperationalReportContext({
	actingUser,
	startDateInput,
	endDateInput,
	divisionIdInput,
	ownerIdInput
}) {
	const [{ startDate, endDate, endExclusive, dayCount }, divisionId] = await Promise.all([
		resolveDateRange({ startDateInput, endDateInput }),
		resolveDivisionFilter({ actingUser, divisionIdInput })
	]);
	const ownerId = await resolveOwnerFilter({ actingUser, ownerIdInput, divisionId });
	const filterOptions = await getFilterOptions({ actingUser, divisionId });

	const [
		archivedCandidateIds,
		archivedJobOrderIds,
		archivedSubmissionIds,
		archivedInterviewIds,
		archivedPlacementIds
	] = await Promise.all([
		getArchivedEntityIdSet('CANDIDATE'),
		getArchivedEntityIdSet('JOB_ORDER'),
		getArchivedEntityIdSet('SUBMISSION'),
		getArchivedEntityIdSet('INTERVIEW'),
		getArchivedEntityIdSet('PLACEMENT')
	]);

	const candidateCurrentWhere = andWhere(
		buildOwnedEntityWhere({ actingUser, divisionId, ownerId }),
		archivedCandidateIds.size > 0 ? { id: { notIn: [...archivedCandidateIds] } } : undefined
	);
	const jobOrderCurrentWhere = andWhere(
		buildOwnedEntityWhere({ actingUser, divisionId, ownerId }),
		archivedJobOrderIds.size > 0 ? { id: { notIn: [...archivedJobOrderIds] } } : undefined
	);
	const submissionCurrentWhere = andWhere(
		buildSubmissionWhere({ actingUser, divisionId, ownerId }),
		archivedSubmissionIds.size > 0 ? { id: { notIn: [...archivedSubmissionIds] } } : undefined
	);
	const interviewCurrentWhere = andWhere(
		buildInterviewWhere({ actingUser, divisionId, ownerId }),
		archivedInterviewIds.size > 0 ? { id: { notIn: [...archivedInterviewIds] } } : undefined
	);
	const placementCurrentWhere = andWhere(
		buildPlacementWhere({ actingUser, divisionId, ownerId }),
		archivedPlacementIds.size > 0 ? { id: { notIn: [...archivedPlacementIds] } } : undefined
	);

	return {
		startDate,
		endDate,
		endExclusive,
		dayCount,
		divisionId,
		ownerId,
		filterOptions,
		candidateCurrentWhere,
		jobOrderCurrentWhere,
		submissionCurrentWhere,
		interviewCurrentWhere,
		placementCurrentWhere,
		candidateRangeWhere: andWhere(candidateCurrentWhere, {
			createdAt: { gte: startDate, lt: endExclusive }
		}),
		jobOrderRangeWhere: andWhere(jobOrderCurrentWhere, {
			openedAt: { gte: startDate, lt: endExclusive }
		}),
		submissionRangeWhere: andWhere(submissionCurrentWhere, {
			createdAt: { gte: startDate, lt: endExclusive }
		}),
		interviewRangeWhere: andWhere(interviewCurrentWhere, {
			createdAt: { gte: startDate, lt: endExclusive }
		}),
		placementRangeWhere: andWhere(placementCurrentWhere, {
			createdAt: { gte: startDate, lt: endExclusive }
		})
	};
}

function toCandidateFullName(candidate) {
	return `${candidate?.firstName || '-'} ${candidate?.lastName || ''}`.trim();
}

function toOwnerFullName(user) {
	if (!user) return 'Unassigned';
	return `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Unassigned';
}

function normalizeDetailRows(rows) {
	return rows.map((row) => ({
		...row,
		chips: Array.isArray(row.chips) ? row.chips.filter(Boolean) : []
	}));
}

export async function getOperationalReportData({
	actingUser,
	startDateInput,
	endDateInput,
	divisionIdInput,
	ownerIdInput
}) {
	if (!actingUser) {
		throw new AccessControlError('Authentication required.', 401);
	}

	const {
		startDate,
		endDate,
		endExclusive,
		dayCount,
		divisionId,
		ownerId,
		filterOptions,
		candidateCurrentWhere,
		jobOrderCurrentWhere,
		submissionCurrentWhere,
		interviewCurrentWhere,
		placementCurrentWhere,
		candidateRangeWhere,
		jobOrderRangeWhere,
		submissionRangeWhere,
		interviewRangeWhere,
		placementRangeWhere
	} = await buildOperationalReportContext({
		actingUser,
		startDateInput,
		endDateInput,
		divisionIdInput,
		ownerIdInput
	});

	const [
		candidateStatuses,
		jobOrderStatuses,
		submissionStatuses,
		placementStatuses,
		interviewTypes,
		openJobOrdersCount,
		candidateRows,
		jobOrderRows,
		submissionRows,
		interviewRows,
		placementRows
	] = await Promise.all([
		prisma.candidate.groupBy({
			by: ['status'],
			where: candidateCurrentWhere,
			_count: { _all: true }
		}),
		prisma.jobOrder.groupBy({
			by: ['status'],
			where: jobOrderCurrentWhere,
			_count: { _all: true }
		}),
		prisma.submission.groupBy({
			by: ['status'],
			where: submissionCurrentWhere,
			_count: { _all: true }
		}),
		prisma.offer.groupBy({
			by: ['status'],
			where: placementCurrentWhere,
			_count: { _all: true }
		}),
		prisma.interview.groupBy({
			by: ['interviewMode'],
			where: interviewCurrentWhere,
			_count: { _all: true }
		}),
		prisma.jobOrder.count({
			where: andWhere(jobOrderCurrentWhere, { status: { in: OPEN_JOB_ORDER_STATUSES } })
		}),
		prisma.candidate.findMany({
			where: candidateRangeWhere,
			select: {
				id: true,
				createdAt: true,
				ownerId: true
			}
		}),
		prisma.jobOrder.findMany({
			where: jobOrderRangeWhere,
			select: {
				id: true,
				openedAt: true,
				ownerId: true
			}
		}),
		prisma.submission.findMany({
			where: submissionRangeWhere,
			select: {
				id: true,
				status: true,
				createdAt: true,
				createdByUserId: true,
				candidate: { select: { ownerId: true } },
				jobOrder: { select: { ownerId: true } }
			}
		}),
		prisma.interview.findMany({
			where: interviewRangeWhere,
			select: {
				id: true,
				createdAt: true,
				candidate: { select: { ownerId: true } },
				jobOrder: { select: { ownerId: true } }
			}
		}),
		prisma.offer.findMany({
			where: placementRangeWhere,
			select: {
				id: true,
				status: true,
				createdAt: true,
				updatedAt: true,
				submission: { select: { createdByUserId: true } },
				candidate: { select: { ownerId: true } },
				jobOrder: { select: { ownerId: true } }
			}
		})
	]);

	const trendBuckets = initializeTrendBuckets(startDate, dayCount);
	const trendByKey = new Map(trendBuckets.map((bucket) => [bucket.dateKey, bucket]));
	const ownerRowsById = new Map();
	const ownerOptionsById = new Map(filterOptions.owners.map((owner) => [owner.id, owner]));

	function ensureOwnerRow(ownerBucketId) {
		const normalizedOwnerId = normalizeOwnerBucketId(ownerBucketId);
		if (!ownerRowsById.has(normalizedOwnerId)) {
			const ownerMeta = ownerOptionsById.get(normalizedOwnerId);
			ownerRowsById.set(normalizedOwnerId, {
				id: normalizedOwnerId || `unassigned`,
				ownerId: normalizedOwnerId || null,
				ownerName: ownerMeta?.name || fallbackOwnerLabel(normalizedOwnerId),
				candidatesAdded: 0,
				jobOrdersOpened: 0,
				submissionsCreated: 0,
				interviewsScheduled: 0,
				placementsCreated: 0,
				placementsAccepted: 0
			});
		}
		return ownerRowsById.get(normalizedOwnerId);
	}

	for (const row of candidateRows) {
		incrementTrendBucket(trendByKey, row.createdAt, 'candidates');
		ensureOwnerRow(resolveReportingOwnerId({ actingUser, fallbackOwnerId: row.ownerId })).candidatesAdded += 1;
	}

	for (const row of jobOrderRows) {
		incrementTrendBucket(trendByKey, row.openedAt || row.createdAt, 'jobOrders');
		ensureOwnerRow(resolveReportingOwnerId({ actingUser, fallbackOwnerId: row.ownerId })).jobOrdersOpened += 1;
	}

	for (const row of submissionRows) {
		incrementTrendBucket(trendByKey, row.createdAt, 'submissions');
		ensureOwnerRow(
			resolveReportingOwnerId({ actingUser, fallbackOwnerId: resolveSubmissionOwnerId(row) })
		).submissionsCreated += 1;
	}

	for (const row of interviewRows) {
		incrementTrendBucket(trendByKey, row.createdAt, 'interviews');
		ensureOwnerRow(
			resolveReportingOwnerId({ actingUser, fallbackOwnerId: resolveInterviewOwnerId(row) })
		).interviewsScheduled += 1;
	}

	for (const row of placementRows) {
		incrementTrendBucket(trendByKey, row.createdAt, 'placements');
		const ownerRow = ensureOwnerRow(
			resolveReportingOwnerId({ actingUser, fallbackOwnerId: resolvePlacementOwnerId(row) })
		);
		ownerRow.placementsCreated += 1;
		if (String(row.status || '').trim().toLowerCase() === 'accepted') {
			const acceptedDate = row.updatedAt ? new Date(row.updatedAt) : null;
			if (acceptedDate && acceptedDate >= startDate && acceptedDate < endExclusive) {
				ownerRow.placementsAccepted += 1;
			}
		}
	}

	const placementsAccepted = placementRows.filter((row) => {
		if (String(row.status || '').trim().toLowerCase() !== 'accepted') return false;
		const acceptedDate = row.updatedAt ? new Date(row.updatedAt) : null;
		return Boolean(acceptedDate && acceptedDate >= startDate && acceptedDate < endExclusive);
	}).length;

	const ownerPerformance = [...ownerRowsById.values()].sort((a, b) =>
		String(a.ownerName).localeCompare(String(b.ownerName), undefined, { sensitivity: 'base' })
	);

	return {
		appliedFilters: {
			startDate: formatDateInputValue(startDate),
			endDate: formatDateInputValue(endDate),
			divisionId: divisionId || null,
			ownerId: ownerId || null
		},
		scope: {
			role: actingUser.role,
			canFilterDivision: actingUser.role === 'ADMINISTRATOR',
			canFilterOwner: actingUser.role !== 'RECRUITER',
			lockedToOwnData: actingUser.role === 'RECRUITER'
		},
		filterOptions,
		summary: {
			candidatesAdded: candidateRows.length,
			jobOrdersOpened: jobOrderRows.length,
			submissionsCreated: submissionRows.length,
			interviewsScheduled: interviewRows.length,
			placementsCreated: placementRows.length,
			placementsAccepted,
			openJobOrders: openJobOrdersCount
		},
		pipeline: {
			candidates: ensureStatusSeries(candidateStatuses, CANDIDATE_STATUS_OPTIONS),
			jobOrders: ensureStatusSeries(jobOrderStatuses, JOB_ORDER_STATUS_OPTIONS),
			submissions: ensureStatusSeries(submissionStatuses, SUBMISSION_STATUS_ORDER),
			placements: ensureStatusSeries(placementStatuses, PLACEMENT_STATUS_ORDER),
			interviewTypes: ensureStatusSeries(
				interviewTypes,
				INTERVIEW_TYPE_ORDER.map((value) => ({ value, label: labelInterviewType(value) })),
				labelInterviewType
			)
		},
		trend: trendBuckets,
		ownerPerformance
	};
}

export async function getOperationalReportDetailData({
	actingUser,
	startDateInput,
	endDateInput,
	divisionIdInput,
	ownerIdInput,
	group,
	key,
	value
}) {
	if (!actingUser) {
		throw new AccessControlError('Authentication required.', 401);
	}

	const context = await buildOperationalReportContext({
		actingUser,
		startDateInput,
		endDateInput,
		divisionIdInput,
		ownerIdInput
	});
	const normalizedGroup = String(group || '').trim().toLowerCase();
	const normalizedKey = String(key || '').trim();
	const normalizedValue = String(value || '').trim();

	if (normalizedGroup === 'summary') {
		if (normalizedKey === 'candidatesAdded') {
			const rows = await prisma.candidate.findMany({
				where: context.candidateRangeWhere,
				orderBy: { createdAt: 'desc' },
				take: 100,
				select: {
					id: true,
					firstName: true,
					lastName: true,
					currentJobTitle: true,
					currentEmployer: true,
					status: true,
					createdAt: true,
					ownerUser: { select: { firstName: true, lastName: true, email: true } }
				}
			});
			return {
				title: 'New Candidates',
				rows: normalizeDetailRows(
					rows.map((row) => ({
						id: row.id,
						href: `/candidates/${row.id}`,
						title: toCandidateFullName(row),
						subtitle: [row.currentJobTitle, row.currentEmployer].filter(Boolean).join(' | ') || '-',
						meta: formatMeta([
							`Owner: ${toOwnerFullName(row.ownerUser)}`,
							`Created: ${formatDateTimeAt(row.createdAt)}`
						]),
						chips: [formatSelectValueLabel(row.status)]
					}))
				)
			};
		}

		if (normalizedKey === 'jobOrdersOpened' || normalizedKey === 'openJobOrders') {
			const rows = await prisma.jobOrder.findMany({
				where:
					normalizedKey === 'openJobOrders'
						? andWhere(context.jobOrderCurrentWhere, { status: { in: OPEN_JOB_ORDER_STATUSES } })
						: context.jobOrderRangeWhere,
				orderBy: { openedAt: 'desc' },
				take: 100,
				select: {
					id: true,
					title: true,
					status: true,
					openedAt: true,
					client: { select: { name: true } },
					ownerUser: { select: { firstName: true, lastName: true, email: true } }
				}
			});
			return {
				title: normalizedKey === 'openJobOrders' ? 'Open Job Orders' : 'New Job Orders',
				rows: normalizeDetailRows(
					rows.map((row) => ({
						id: row.id,
						href: `/job-orders/${row.id}`,
						title: row.title || '-',
						subtitle: row.client?.name || '-',
						meta: formatMeta([
							`Owner: ${toOwnerFullName(row.ownerUser)}`,
							`Opened: ${formatDateTimeAt(row.openedAt)}`
						]),
						chips: [formatSelectValueLabel(row.status)]
					}))
				)
			};
		}

		if (normalizedKey === 'submissionsCreated') {
			const rows = await prisma.submission.findMany({
				where: context.submissionRangeWhere,
				orderBy: { createdAt: 'desc' },
				take: 100,
				select: {
					id: true,
					status: true,
					notes: true,
					createdAt: true,
					createdByUserId: true,
					createdByUser: { select: { firstName: true, lastName: true } },
					candidate: { select: { firstName: true, lastName: true, ownerId: true } },
					jobOrder: { select: { title: true, client: { select: { name: true } }, ownerId: true } }
				}
			});
			return {
				title: 'New Submissions',
				rows: normalizeDetailRows(
					rows.map((row) => ({
						id: row.id,
						href: `/submissions/${row.id}`,
						title: toCandidateFullName(row.candidate),
						subtitle: [row.jobOrder?.title, row.jobOrder?.client?.name].filter(Boolean).join(' | ') || '-',
						meta: formatMeta([
							`Submitted By: ${submissionCreatedByLabel(row)}`,
							`Submitted: ${formatDateTimeAt(row.createdAt)}`
						]),
						chips: [formatSelectValueLabel(row.status)]
					}))
				)
			};
		}

		if (normalizedKey === 'interviewsScheduled') {
			const rows = await prisma.interview.findMany({
				where: context.interviewRangeWhere,
				orderBy: { createdAt: 'desc' },
				take: 100,
				select: {
					id: true,
					subject: true,
					status: true,
					interviewMode: true,
					startsAt: true,
					createdAt: true,
					candidate: { select: { firstName: true, lastName: true, ownerId: true } },
					jobOrder: { select: { title: true, client: { select: { name: true } }, ownerId: true } }
				}
			});
			return {
				title: 'New Interviews',
				rows: normalizeDetailRows(
					rows.map((row) => ({
						id: row.id,
						href: `/interviews/${row.id}`,
						title: row.subject || toCandidateFullName(row.candidate),
						subtitle:
							[
								toCandidateFullName(row.candidate),
								row.jobOrder?.title,
								row.jobOrder?.client?.name
							]
								.filter(Boolean)
								.join(' | ') || '-',
						meta: formatMeta([`Scheduled: ${formatDateTimeAt(row.startsAt || row.createdAt)}`]),
						chips: [formatSelectValueLabel(row.status), labelInterviewType(row.interviewMode)]
					}))
				)
			};
		}

		if (normalizedKey === 'placementsCreated' || normalizedKey === 'placementsAccepted') {
			const rows = await prisma.offer.findMany({
				where:
					normalizedKey === 'placementsAccepted'
						? andWhere(context.placementCurrentWhere, {
								status: 'accepted',
								updatedAt: { gte: context.startDate, lt: context.endExclusive }
							})
						: context.placementRangeWhere,
				orderBy: normalizedKey === 'placementsAccepted' ? { updatedAt: 'desc' } : { createdAt: 'desc' },
				take: 100,
				select: {
					id: true,
					status: true,
					createdAt: true,
					updatedAt: true,
					candidate: { select: { firstName: true, lastName: true } },
					jobOrder: { select: { title: true, client: { select: { name: true } } } }
				}
			});
			return {
				title: normalizedKey === 'placementsAccepted' ? 'Accepted Placements' : 'New Placements',
				rows: normalizeDetailRows(
					rows.map((row) => ({
						id: row.id,
						href: `/placements/${row.id}`,
						title: toCandidateFullName(row.candidate),
						subtitle: [row.jobOrder?.title, row.jobOrder?.client?.name].filter(Boolean).join(' | ') || '-',
						meta: formatMeta([
							`${normalizedKey === 'placementsAccepted' ? 'Accepted' : 'Created'}: ${formatDateTimeAt((normalizedKey === 'placementsAccepted' ? row.updatedAt : row.createdAt) || row.createdAt)}`
						]),
						chips: [formatSelectValueLabel(row.status)]
					}))
				)
			};
		}
	}

	if (normalizedGroup === 'pipeline') {
		if (normalizedKey === 'candidates') {
			const rows = await prisma.candidate.findMany({
				where:
					normalizedValue === 'all'
						? context.candidateCurrentWhere
						: andWhere(context.candidateCurrentWhere, { status: normalizedValue }),
				orderBy: { updatedAt: 'desc' },
				take: 100,
				select: {
					id: true,
					firstName: true,
					lastName: true,
					currentJobTitle: true,
					currentEmployer: true,
					status: true,
					updatedAt: true,
					ownerUser: { select: { firstName: true, lastName: true, email: true } }
				}
			});
			return {
				title: normalizedValue === 'all' ? 'All Candidates' : `${formatSelectValueLabel(normalizedValue)} Candidates`,
				rows: normalizeDetailRows(
					rows.map((row) => ({
						id: row.id,
						href: `/candidates/${row.id}`,
						title: toCandidateFullName(row),
						subtitle: [row.currentJobTitle, row.currentEmployer].filter(Boolean).join(' | ') || '-',
						meta: formatMeta([
							`Owner: ${toOwnerFullName(row.ownerUser)}`,
							`Updated: ${formatDateTimeAt(row.updatedAt)}`
						]),
						chips: [formatSelectValueLabel(row.status)]
					}))
				)
			};
		}

		if (normalizedKey === 'jobOrders') {
			const rows = await prisma.jobOrder.findMany({
				where:
					normalizedValue === 'all'
						? context.jobOrderCurrentWhere
						: andWhere(context.jobOrderCurrentWhere, { status: normalizedValue }),
				orderBy: { updatedAt: 'desc' },
				take: 100,
				select: {
					id: true,
					title: true,
					status: true,
					updatedAt: true,
					client: { select: { name: true } },
					ownerUser: { select: { firstName: true, lastName: true, email: true } }
				}
			});
			return {
				title: normalizedValue === 'all' ? 'All Job Orders' : `${formatSelectValueLabel(normalizedValue)} Job Orders`,
				rows: normalizeDetailRows(
					rows.map((row) => ({
						id: row.id,
						href: `/job-orders/${row.id}`,
						title: row.title || '-',
						subtitle: row.client?.name || '-',
						meta: formatMeta([
							`Owner: ${toOwnerFullName(row.ownerUser)}`,
							`Updated: ${formatDateTimeAt(row.updatedAt)}`
						]),
						chips: [formatSelectValueLabel(row.status)]
					}))
				)
			};
		}

		if (normalizedKey === 'submissions') {
			const rows = await prisma.submission.findMany({
				where:
					normalizedValue === 'all'
						? context.submissionCurrentWhere
						: andWhere(context.submissionCurrentWhere, { status: normalizedValue }),
				orderBy: { updatedAt: 'desc' },
				take: 100,
				select: {
					id: true,
					status: true,
					notes: true,
					updatedAt: true,
					createdByUser: { select: { firstName: true, lastName: true } },
					candidate: { select: { firstName: true, lastName: true } },
					jobOrder: { select: { title: true, client: { select: { name: true } } } }
				}
			});
			return {
				title: normalizedValue === 'all' ? 'All Submissions' : `${formatSelectValueLabel(normalizedValue)} Submissions`,
				rows: normalizeDetailRows(
					rows.map((row) => ({
						id: row.id,
						href: `/submissions/${row.id}`,
						title: toCandidateFullName(row.candidate),
						subtitle: [row.jobOrder?.title, row.jobOrder?.client?.name].filter(Boolean).join(' | ') || '-',
						meta: formatMeta([
							`Submitted By: ${submissionCreatedByLabel(row)}`,
							`Updated: ${formatDateTimeAt(row.updatedAt)}`
						]),
						chips: [formatSelectValueLabel(row.status)]
					}))
				)
			};
		}

		if (normalizedKey === 'placements') {
			const rows = await prisma.offer.findMany({
				where:
					normalizedValue === 'all'
						? context.placementCurrentWhere
						: andWhere(context.placementCurrentWhere, { status: normalizedValue }),
				orderBy: { updatedAt: 'desc' },
				take: 100,
				select: {
					id: true,
					status: true,
					updatedAt: true,
					candidate: { select: { firstName: true, lastName: true } },
					jobOrder: { select: { title: true, client: { select: { name: true } } } }
				}
			});
			return {
				title: normalizedValue === 'all' ? 'All Placements' : `${formatSelectValueLabel(normalizedValue)} Placements`,
				rows: normalizeDetailRows(
					rows.map((row) => ({
						id: row.id,
						href: `/placements/${row.id}`,
						title: toCandidateFullName(row.candidate),
						subtitle: [row.jobOrder?.title, row.jobOrder?.client?.name].filter(Boolean).join(' | ') || '-',
						meta: formatMeta([`Updated: ${formatDateTimeAt(row.updatedAt)}`]),
						chips: [formatSelectValueLabel(row.status)]
					}))
				)
			};
		}

		if (normalizedKey === 'interviewTypes') {
			const rows = await prisma.interview.findMany({
				where:
					normalizedValue === 'all'
						? context.interviewCurrentWhere
						: andWhere(context.interviewCurrentWhere, { interviewMode: normalizedValue }),
				orderBy: { updatedAt: 'desc' },
				take: 100,
				select: {
					id: true,
					subject: true,
					status: true,
					interviewMode: true,
					startsAt: true,
					updatedAt: true,
					candidate: { select: { firstName: true, lastName: true } },
					jobOrder: { select: { title: true, client: { select: { name: true } } } }
				}
			});
			return {
				title: normalizedValue === 'all' ? 'All Interviews' : `${labelInterviewType(normalizedValue)} Interviews`,
				rows: normalizeDetailRows(
					rows.map((row) => ({
						id: row.id,
						href: `/interviews/${row.id}`,
						title: row.subject || toCandidateFullName(row.candidate),
						subtitle:
							[
								toCandidateFullName(row.candidate),
								row.jobOrder?.title,
								row.jobOrder?.client?.name
							]
								.filter(Boolean)
								.join(' | ') || '-',
						meta: formatMeta([`Scheduled: ${formatDateTimeAt(row.startsAt || row.updatedAt)}`]),
						chips: [labelInterviewType(row.interviewMode), formatSelectValueLabel(row.status)]
					}))
				)
			};
		}
	}

	if (normalizedGroup === 'ownerperformance') {
		const ownerBucketId = parseOwnerBucketValue(normalizedValue);
		if (ownerBucketId == null) {
			throw new AccessControlError('Owner detail selection was invalid.', 400);
		}
		const ownerLabel = getOwnerBucketLabel(context.filterOptions, ownerBucketId);

		if (normalizedKey === 'candidatesAdded') {
			const rows = await prisma.candidate.findMany({
				where: context.candidateRangeWhere,
				orderBy: { createdAt: 'desc' },
				take: 100,
				select: {
					id: true,
					firstName: true,
					lastName: true,
					currentJobTitle: true,
					currentEmployer: true,
					status: true,
					createdAt: true,
					ownerId: true
				}
			});
			return {
				title: `${ownerLabel} - Candidates`,
				rows: normalizeDetailRows(
					rows
						.filter((row) => resolveReportingOwnerId({ actingUser, fallbackOwnerId: row.ownerId }) === ownerBucketId)
						.map((row) => ({
						id: row.id,
						href: `/candidates/${row.id}`,
						title: toCandidateFullName(row),
						subtitle: [row.currentJobTitle, row.currentEmployer].filter(Boolean).join(' | ') || '-',
						meta: formatMeta([`Created: ${formatDateTimeAt(row.createdAt)}`]),
						chips: [formatSelectValueLabel(row.status)]
						}))
				)
			};
		}

		if (normalizedKey === 'jobOrdersOpened') {
			const rows = await prisma.jobOrder.findMany({
				where: context.jobOrderRangeWhere,
				orderBy: { openedAt: 'desc' },
				take: 100,
				select: {
					id: true,
					title: true,
					status: true,
					openedAt: true,
					client: { select: { name: true } },
					ownerId: true
				}
			});
			return {
				title: `${ownerLabel} - Job Orders`,
				rows: normalizeDetailRows(
					rows
						.filter((row) => resolveReportingOwnerId({ actingUser, fallbackOwnerId: row.ownerId }) === ownerBucketId)
						.map((row) => ({
						id: row.id,
						href: `/job-orders/${row.id}`,
						title: row.title || '-',
						subtitle: row.client?.name || '-',
						meta: formatMeta([`Opened: ${formatDateTimeAt(row.openedAt)}`]),
						chips: [formatSelectValueLabel(row.status)]
						}))
				)
			};
		}

		if (normalizedKey === 'submissionsCreated') {
			const rows = await prisma.submission.findMany({
				where: context.submissionRangeWhere,
				orderBy: { createdAt: 'desc' },
				take: 100,
				select: {
					id: true,
					status: true,
					notes: true,
					createdAt: true,
					createdByUserId: true,
					createdByUser: { select: { firstName: true, lastName: true } },
					candidate: { select: { firstName: true, lastName: true, ownerId: true } },
					jobOrder: { select: { title: true, client: { select: { name: true } }, ownerId: true } }
				}
			});
			return {
				title: `${ownerLabel} - Submissions`,
				rows: normalizeDetailRows(
					rows
						.filter(
							(row) =>
								resolveReportingOwnerId({ actingUser, fallbackOwnerId: resolveSubmissionOwnerId(row) }) === ownerBucketId
						)
						.map((row) => ({
						id: row.id,
						href: `/submissions/${row.id}`,
						title: toCandidateFullName(row.candidate),
						subtitle: [row.jobOrder?.title, row.jobOrder?.client?.name].filter(Boolean).join(' | ') || '-',
						meta: formatMeta([
							`Submitted By: ${submissionCreatedByLabel(row)}`,
							`Submitted: ${formatDateTimeAt(row.createdAt)}`
						]),
						chips: [formatSelectValueLabel(row.status)]
						}))
				)
			};
		}

		if (normalizedKey === 'interviewsScheduled') {
			const rows = await prisma.interview.findMany({
				where: context.interviewRangeWhere,
				orderBy: { createdAt: 'desc' },
				take: 100,
				select: {
					id: true,
					subject: true,
					status: true,
					interviewMode: true,
					startsAt: true,
					createdAt: true,
					candidate: { select: { firstName: true, lastName: true, ownerId: true } },
					jobOrder: { select: { title: true, client: { select: { name: true } }, ownerId: true } }
				}
			});
			return {
				title: `${ownerLabel} - Interviews`,
				rows: normalizeDetailRows(
					rows
						.filter(
							(row) =>
								resolveReportingOwnerId({ actingUser, fallbackOwnerId: resolveInterviewOwnerId(row) }) === ownerBucketId
						)
						.map((row) => ({
						id: row.id,
						href: `/interviews/${row.id}`,
						title: row.subject || toCandidateFullName(row.candidate),
						subtitle:
							[
								toCandidateFullName(row.candidate),
								row.jobOrder?.title,
								row.jobOrder?.client?.name
							]
								.filter(Boolean)
								.join(' | ') || '-',
						meta: formatMeta([`Scheduled: ${formatDateTimeAt(row.startsAt || row.createdAt)}`]),
						chips: [formatSelectValueLabel(row.status), labelInterviewType(row.interviewMode)]
						}))
				)
			};
		}

		if (normalizedKey === 'placementsCreated' || normalizedKey === 'placementsAccepted') {
			const rows = await prisma.offer.findMany({
				where:
					normalizedKey === 'placementsAccepted'
						? andWhere(context.placementCurrentWhere, {
								status: 'accepted',
								updatedAt: { gte: context.startDate, lt: context.endExclusive }
							})
						: context.placementRangeWhere,
				orderBy: normalizedKey === 'placementsAccepted' ? { updatedAt: 'desc' } : { createdAt: 'desc' },
				take: 100,
				select: {
					id: true,
					status: true,
					createdAt: true,
					updatedAt: true,
					submission: { select: { createdByUserId: true } },
					candidate: { select: { firstName: true, lastName: true, ownerId: true } },
					jobOrder: { select: { title: true, client: { select: { name: true } }, ownerId: true } }
				}
			});
			return {
				title: `${ownerLabel} - ${normalizedKey === 'placementsAccepted' ? 'Accepted Placements' : 'Placements'}`,
				rows: normalizeDetailRows(
					rows
						.filter(
							(row) =>
								resolveReportingOwnerId({ actingUser, fallbackOwnerId: resolvePlacementOwnerId(row) }) === ownerBucketId
						)
						.map((row) => ({
						id: row.id,
						href: `/placements/${row.id}`,
						title: toCandidateFullName(row.candidate),
						subtitle: [row.jobOrder?.title, row.jobOrder?.client?.name].filter(Boolean).join(' | ') || '-',
						meta: formatMeta([
							`${normalizedKey === 'placementsAccepted' ? 'Accepted' : 'Created'}: ${formatDateTimeAt((normalizedKey === 'placementsAccepted' ? row.updatedAt : row.createdAt) || row.createdAt)}`
						]),
						chips: [formatSelectValueLabel(row.status)]
						}))
				)
			};
		}
	}

	throw new AccessControlError('Unsupported report detail request.', 400);
}
