import { prisma } from '@/lib/prisma';
import { AccessControlError, addScopeToWhere, getEntityScope } from '@/lib/access-control';

function isObjectEmpty(value) {
	return value && typeof value === 'object' && Object.keys(value).length === 0;
}

export function getCandidateJobOrderScope(actingUser) {
	const entityScope = getEntityScope(actingUser);
	if (!entityScope || isObjectEmpty(entityScope)) {
		return undefined;
	}

	return {
		AND: [{ candidate: entityScope }, { jobOrder: entityScope }]
	};
}

export async function validateScopedCandidateAndJobOrder({ actingUser, candidateId, jobOrderId }) {
	const scope = getEntityScope(actingUser);

	const [candidate, jobOrder] = await Promise.all([
		prisma.candidate.findFirst({
			where: addScopeToWhere({ id: candidateId }, scope),
			select: {
				id: true,
				divisionId: true,
				status: true,
				firstName: true,
				lastName: true
			}
		}),
		prisma.jobOrder.findFirst({
			where: addScopeToWhere({ id: jobOrderId }, scope),
			select: {
				id: true,
				divisionId: true,
				status: true,
				title: true
			}
		})
	]);

	if (!candidate) {
		throw new AccessControlError('Candidate not found or unavailable for your role.', 404);
	}

	if (!jobOrder) {
		throw new AccessControlError('Job order not found or unavailable for your role.', 404);
	}

	if (!candidate.divisionId || !jobOrder.divisionId || candidate.divisionId !== jobOrder.divisionId) {
		throw new AccessControlError('Candidate and job order must be in the same division.', 400);
	}

	return {
		candidateDivisionId: candidate.divisionId,
		jobOrderDivisionId: jobOrder.divisionId,
		candidate,
		jobOrder
	};
}
