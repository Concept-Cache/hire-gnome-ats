import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { candidateNoteSchema } from '@/lib/validators';
import { AccessControlError, ensureScopedEntityAccess, getActingUser } from '@/lib/access-control';
import { logCreate } from '@/lib/audit-log';
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

	if (error.code === 'P2003') {
		return NextResponse.json({ error: 'Candidate not found.' }, { status: 404 });
	}

	return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

function isMissingNoteAuthorColumnError(error) {
	if (!error) return false;
	if (error.code === 'P2022') return true;
	const message = `${error.message || ''}`;
	return message.includes('createdByUserId') || message.includes('createdByUser');
}

async function getCandidates_id_notesHandler(req, { params }) {
	try {
		const awaitedParams = await params;
		const candidateId = parseRouteId(awaitedParams);

		const actingUser = await getActingUser(req);
		await ensureScopedEntityAccess('candidate', candidateId, actingUser);

		let notes;
		try {
			notes = await prisma.candidateNote.findMany({
				where: { candidateId },
				orderBy: { createdAt: 'desc' },
				include: {
					createdByUser: {
						select: { id: true, firstName: true, lastName: true, email: true, isActive: true }
					}
				}
			});
		} catch (error) {
			if (!isMissingNoteAuthorColumnError(error)) {
				throw error;
			}

			notes = await prisma.candidateNote.findMany({
				where: { candidateId },
				orderBy: { createdAt: 'desc' },
				select: {
					id: true,
					noteType: true,
					content: true,
					createdAt: true,
					updatedAt: true,
					candidateId: true
				}
			});
		}

		return NextResponse.json(notes);
	} catch (error) {
		return handleError(error, 'Failed to load notes.');
	}
}

async function postCandidates_id_notesHandler(req, { params }) {
	try {
		const mutationThrottleResponse = await enforceMutationThrottle(req, 'candidates.id.notes.post');
		if (mutationThrottleResponse) {
			return mutationThrottleResponse;
		}

		const awaitedParams = await params;
		const candidateId = parseRouteId(awaitedParams);

		const actingUser = await getActingUser(req, { allowFallback: false });
		await ensureScopedEntityAccess('candidate', candidateId, actingUser);

		const body = await parseJsonBody(req);
		const parsed = candidateNoteSchema.safeParse(body);
		if (!parsed.success) {
			return NextResponse.json({ errors: parsed.error.flatten() }, { status: 400 });
		}

		let note;
		try {
			note = await prisma.candidateNote.create({
				data: {
					candidateId,
					content: parsed.data.content,
					noteType: parsed.data.noteType || 'manual',
					createdByUserId: actingUser.id
				},
				include: {
					createdByUser: {
						select: { id: true, firstName: true, lastName: true, email: true, isActive: true }
					}
				}
			});
		} catch (error) {
			if (!isMissingNoteAuthorColumnError(error)) {
				throw error;
			}

			note = await prisma.candidateNote.create({
				data: {
					candidateId,
					content: parsed.data.content,
					noteType: parsed.data.noteType || 'manual'
				},
				select: {
					id: true,
					noteType: true,
					content: true,
					createdAt: true,
					updatedAt: true,
					candidateId: true
				}
			});
			}

			await logCreate({
				actorUserId: actingUser?.id,
				entityType: 'CANDIDATE_NOTE',
				entity: note,
				metadata: { candidateId }
			});

			return NextResponse.json(note, { status: 201 });
	} catch (error) {
		return handleError(error, 'Failed to create note.');
	}
}

export const GET = withApiLogging('candidates.id.notes.get', getCandidates_id_notesHandler);
export const POST = withApiLogging('candidates.id.notes.post', postCandidates_id_notesHandler);
