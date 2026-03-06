import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { skillSchema } from '@/lib/validators';
import { normalizeSkillData } from '@/lib/normalizers';
import { AccessControlError, getActingUser, hasAdministrator } from '@/lib/access-control';
import { logCreate } from '@/lib/audit-log';
import { parseJsonBody, ValidationError } from '@/lib/request-validation';
import { enforceMutationThrottle } from '@/lib/mutation-throttle';

import { withApiLogging } from '@/lib/api-logging';
function toBooleanParam(value) {
	if (value == null) return undefined;
	return value === 'true' || value === '1';
}

function handleError(error, fallbackMessage) {
	if (error instanceof AccessControlError) {
		return NextResponse.json({ error: error.message }, { status: error.status });
	}

	if (error?.code === 'P2002') {
		return NextResponse.json({ error: 'Skill name already exists.' }, { status: 409 });
	}
	if (error instanceof ValidationError) {
		return NextResponse.json({ error: error.message }, { status: 400 });
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

async function getSkillsHandler(req) {
	try {
		const active = toBooleanParam(req.nextUrl.searchParams.get('active'));
		const where = active == null ? undefined : { isActive: active };

		const skills = await prisma.skill.findMany({
			where,
			orderBy: [{ name: 'asc' }],
			include: {
				_count: {
					select: {
						candidateSkills: true
					}
				}
			}
		});

		return NextResponse.json(skills);
	} catch (error) {
		return handleError(error, 'Failed to load skills.');
	}
}

async function postSkillsHandler(req) {
	try {
		const mutationThrottleResponse = await enforceMutationThrottle(req, 'skills.post');
		if (mutationThrottleResponse) {
			return mutationThrottleResponse;
		}

		const actingUser = await assertSkillWriteAccess(req);
		const body = await parseJsonBody(req);
		const parsed = skillSchema.safeParse(body);
		if (!parsed.success) {
			return NextResponse.json({ errors: parsed.error.flatten() }, { status: 400 });
		}

		const skill = await prisma.skill.create({
			data: normalizeSkillData(parsed.data),
			include: {
				_count: {
					select: {
						candidateSkills: true
					}
				}
			}
		});
		await logCreate({
			actorUserId: actingUser?.id,
			entityType: 'SKILL',
			entity: skill
		});

		return NextResponse.json(skill, { status: 201 });
	} catch (error) {
		return handleError(error, 'Failed to create skill.');
	}
}

export const GET = withApiLogging('skills.get', getSkillsHandler);
export const POST = withApiLogging('skills.post', postSkillsHandler);
