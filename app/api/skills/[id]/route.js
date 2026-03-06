import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { skillSchema } from '@/lib/validators';
import { normalizeSkillData } from '@/lib/normalizers';
import { AccessControlError, getActingUser, hasAdministrator } from '@/lib/access-control';
import { logDelete, logUpdate } from '@/lib/audit-log';
import { parseRouteId, parseJsonBody, ValidationError } from '@/lib/request-validation';
import { enforceMutationThrottle } from '@/lib/mutation-throttle';

import { withApiLogging } from '@/lib/api-logging';
function handleError(error, fallbackMessage) {
	if (error instanceof AccessControlError) {
		return NextResponse.json({ error: error.message }, { status: error.status });
	}
	if (error instanceof ValidationError) {
		return NextResponse.json({ error: error.message }, { status: 400 });
	}

	if (error?.code === 'P2002') {
		return NextResponse.json({ error: 'Skill name already exists.' }, { status: 409 });
	}

	if (error?.code === 'P2003') {
		return NextResponse.json(
			{ error: 'Skill is assigned to one or more candidates and cannot be deleted.' },
			{ status: 409 }
		);
	}

	if (error?.code === 'P2025') {
		return NextResponse.json({ error: 'Skill not found.' }, { status: 404 });
	}

	return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

async function assertSkillWriteAccess(req) {
	const hasAdmin = await hasAdministrator();
	const actingUser = await getActingUser(req, { allowFallback: false });
	if (hasAdmin && actingUser?.role !== 'ADMINISTRATOR') {
		throw new AccessControlError('Only administrators can manage skills.', 403);
	}
	return actingUser;
}

async function getSkills_idHandler(_req, { params }) {
	const awaitedParams = await params;
	const id = parseRouteId(awaitedParams);

	const skill = await prisma.skill.findUnique({
		where: { id },
		include: {
			_count: {
				select: {
					candidateSkills: true
				}
			}
		}
	});

	if (!skill) {
		return NextResponse.json({ error: 'Skill not found.' }, { status: 404 });
	}

	return NextResponse.json(skill);
}

async function patchSkills_idHandler(req, { params }) {
	try {
		const mutationThrottleResponse = await enforceMutationThrottle(req, 'skills.id.patch');
		if (mutationThrottleResponse) {
			return mutationThrottleResponse;
		}

		const awaitedParams = await params;
		const id = parseRouteId(awaitedParams);

		const actingUser = await assertSkillWriteAccess(req);
		const body = await parseJsonBody(req);
		const parsed = skillSchema.safeParse(body);
		if (!parsed.success) {
			return NextResponse.json({ errors: parsed.error.flatten() }, { status: 400 });
		}

		const existingSkill = await prisma.skill.findUnique({
			where: { id },
			select: {
				id: true,
				name: true,
				category: true,
				isActive: true,
				createdAt: true
			}
		});
		if (!existingSkill) {
			return NextResponse.json({ error: 'Skill not found.' }, { status: 404 });
		}

		const skill = await prisma.skill.update({
			where: { id },
			data: normalizeSkillData(parsed.data),
			include: {
				_count: {
					select: {
						candidateSkills: true
					}
				}
			}
		});
		await logUpdate({
			actorUserId: actingUser?.id,
			entityType: 'SKILL',
			before: existingSkill,
			after: skill
		});

		return NextResponse.json(skill);
	} catch (error) {
		return handleError(error, 'Failed to update skill.');
	}
}

async function deleteSkills_idHandler(req, { params }) {
	try {
		const mutationThrottleResponse = await enforceMutationThrottle(req, 'skills.id.delete');
		if (mutationThrottleResponse) {
			return mutationThrottleResponse;
		}

		const awaitedParams = await params;
		const id = parseRouteId(awaitedParams);

		const actingUser = await assertSkillWriteAccess(req);
		const existingSkill = await prisma.skill.findUnique({
			where: { id },
			select: {
				id: true,
				name: true,
				category: true,
				isActive: true,
				createdAt: true
			}
		});
		if (!existingSkill) {
			return NextResponse.json({ error: 'Skill not found.' }, { status: 404 });
		}
		await prisma.skill.delete({ where: { id } });
		await logDelete({
			actorUserId: actingUser?.id,
			entityType: 'SKILL',
			entity: existingSkill
		});
		return NextResponse.json({ success: true });
	} catch (error) {
		return handleError(error, 'Failed to delete skill.');
	}
}

export const GET = withApiLogging('skills.id.get', getSkills_idHandler);
export const PATCH = withApiLogging('skills.id.patch', patchSkills_idHandler);
export const DELETE = withApiLogging('skills.id.delete', deleteSkills_idHandler);
