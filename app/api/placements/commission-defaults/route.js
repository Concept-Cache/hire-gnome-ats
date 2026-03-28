import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { addScopeToWhere, getActingUser } from '@/lib/access-control';
import { getCandidateJobOrderScope, validateScopedCandidateAndJobOrder } from '@/lib/related-record-scope';
import {
	buildDefaultPlacementCommissionSplits,
	getPlacementCommissionOwners
} from '@/lib/placement-commission';
import { withApiLogging } from '@/lib/api-logging';

const placementUserSelect = { id: true, firstName: true, lastName: true };

async function getPlacementCommissionDefaultsHandler(req) {
	const actingUser = await getActingUser(req);
	const url = new URL(req.url);
	const candidateId = Number(url.searchParams.get('candidateId'));
	const jobOrderId = Number(url.searchParams.get('jobOrderId'));

	if (!Number.isInteger(candidateId) || candidateId <= 0 || !Number.isInteger(jobOrderId) || jobOrderId <= 0) {
		return NextResponse.json({ error: 'Candidate and job order are required.' }, { status: 400 });
	}

	await validateScopedCandidateAndJobOrder({
		actingUser,
		candidateId,
		jobOrderId
	});

	const [candidate, jobOrder] = await Promise.all([
		prisma.candidate.findFirst({
			where: addScopeToWhere({ id: candidateId }, getCandidateJobOrderScope(actingUser)),
			select: { id: true, ownerId: true, ownerUser: { select: placementUserSelect } }
		}),
		prisma.jobOrder.findFirst({
			where: addScopeToWhere({ id: jobOrderId }, getCandidateJobOrderScope(actingUser)),
			select: {
				id: true,
				client: {
					select: { id: true, ownerId: true, ownerUser: { select: placementUserSelect } }
				},
				contact: {
					select: { id: true, ownerId: true, ownerUser: { select: placementUserSelect } }
				}
			}
		})
	]);

	return NextResponse.json(
		buildDefaultPlacementCommissionSplits(getPlacementCommissionOwners({ candidate, jobOrder }))
	);
}

export const GET = withApiLogging('placements.commission_defaults.get', getPlacementCommissionDefaultsHandler);
