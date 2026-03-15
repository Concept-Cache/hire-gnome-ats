import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { AccessControlError, addScopeToWhere, getActingUser, getEntityScope } from '@/lib/access-control';
import { enforceMutationThrottle } from '@/lib/mutation-throttle';
import { generateEmailDraftWithOpenAi } from '@/lib/openai-email-draft';
import { withApiLogging } from '@/lib/api-logging';

const requestSchema = z.object({
	entityType: z.enum(['candidate', 'contact']),
	entityId: z.coerce.number().int().positive(),
	purpose: z.string().trim().min(1).max(120),
	tone: z.enum(['professional', 'warm', 'direct']),
	instructions: z.string().trim().max(1200).optional().default('')
});

function handleError(error, fallbackMessage) {
	if (error instanceof AccessControlError) {
		return NextResponse.json({ error: error.message }, { status: error.status });
	}
	return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

async function loadEntity({ entityType, entityId, scope }) {
	if (entityType === 'candidate') {
		return prisma.candidate.findFirst({
			where: addScopeToWhere({ id: entityId }, scope),
			include: {
				candidateSkills: { include: { skill: { select: { name: true } } } },
				notes: {
					orderBy: { createdAt: 'desc' },
					take: 5,
					select: { content: true }
				}
			}
		});
	}

	return prisma.contact.findFirst({
		where: addScopeToWhere({ id: entityId }, scope),
		include: {
			client: { select: { name: true } },
			notes: {
				orderBy: { createdAt: 'desc' },
				take: 5,
				select: { content: true }
			}
		}
	});
}

async function postEmail_draftsHandler(req) {
	try {
		const mutationThrottleResponse = await enforceMutationThrottle(req, 'email-drafts.post');
		if (mutationThrottleResponse) {
			return mutationThrottleResponse;
		}

		const actingUser = await getActingUser(req, { allowFallback: false });
		if (!actingUser) {
			return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
		}

		const parsed = requestSchema.safeParse(await req.json().catch(() => ({})));
		if (!parsed.success) {
			return NextResponse.json({ error: 'Invalid email draft request.' }, { status: 400 });
		}

		const scope = getEntityScope(actingUser);
		const entity = await loadEntity({
			entityType: parsed.data.entityType,
			entityId: parsed.data.entityId,
			scope
		});

		if (!entity) {
			return NextResponse.json(
				{ error: `${parsed.data.entityType === 'candidate' ? 'Candidate' : 'Contact'} not found.` },
				{ status: 404 }
			);
		}

		const generated = await generateEmailDraftWithOpenAi({
			entityType: parsed.data.entityType,
			entity,
			purpose: parsed.data.purpose,
			tone: parsed.data.tone,
			instructions: parsed.data.instructions
		});

		if (!generated.ok) {
			return NextResponse.json({ error: generated.error || 'Failed to generate email draft.' }, { status: 400 });
		}

		return NextResponse.json({
			draft: generated.draft,
			modelName: generated.modelName || ''
		});
	} catch (error) {
		return handleError(error, 'Failed to generate email draft.');
	}
}

export const POST = withApiLogging('email_drafts.post', postEmail_draftsHandler);
