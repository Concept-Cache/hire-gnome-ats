import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { normalizePhoneNumber } from '@/lib/phone';
import { addScopeToWhere, getActingUser, getEntityScope } from '@/lib/access-control';
import { parseJsonBody, ValidationError } from '@/lib/request-validation';
import { CANDIDATE_MATCH_RATE_LIMIT_MAX_REQUESTS, CANDIDATE_MATCH_RATE_LIMIT_WINDOW_SECONDS } from '@/lib/security-constants';
import { enforceMutationThrottle } from '@/lib/mutation-throttle';

import { withApiLogging } from '@/lib/api-logging';
const matchSchema = z.object({
	email: z.string().optional().or(z.literal('')),
	phone: z.string().optional().or(z.literal('')),
	mobile: z.string().optional().or(z.literal(''))
});

function normalizeEmail(value) {
	if (!value) return '';
	return String(value).trim().toLowerCase();
}

function addReason(set, reason) {
	if (reason) set.add(reason);
}

async function postCandidates_matchHandler(req) {
	try {
		const actingUser = await getActingUser(req);
		const mutationThrottleResponse = await enforceMutationThrottle(
			req,
			'candidates.match.post',
			{
				maxRequests: CANDIDATE_MATCH_RATE_LIMIT_MAX_REQUESTS,
				windowSeconds: CANDIDATE_MATCH_RATE_LIMIT_WINDOW_SECONDS,
				message: 'Too many candidate match checks from this network. Please try again shortly.'
			}
		);
		if (mutationThrottleResponse) {
			return mutationThrottleResponse;
		}

		const body = await parseJsonBody(req);
		const parsed = matchSchema.safeParse(body);

		if (!parsed.success) {
			return NextResponse.json({ error: 'Invalid match payload.' }, { status: 400 });
		}

		const email = normalizeEmail(parsed.data.email);
		const phone = normalizePhoneNumber(parsed.data.phone);
		const mobile = normalizePhoneNumber(parsed.data.mobile);

		if (!email && !phone && !mobile) {
			return NextResponse.json({ matches: [] });
		}

		const phoneNeedles = [phone, mobile].filter(Boolean).map((value) => value.slice(-4));
		const whereOr = [];

		if (email) {
			whereOr.push({ email });
		}

		for (const needle of phoneNeedles) {
			whereOr.push({ phone: { contains: needle } });
			whereOr.push({ mobile: { contains: needle } });
		}

		const candidates = await prisma.candidate.findMany({
			where: addScopeToWhere({ OR: whereOr }, getEntityScope(actingUser)),
			select: {
				id: true,
				firstName: true,
				lastName: true,
				email: true,
				phone: true,
				mobile: true,
				status: true,
				source: true,
				updatedAt: true
			},
			orderBy: { updatedAt: 'desc' },
			take: 80
		});

		const matches = candidates
			.map((candidate) => {
				const reasons = new Set();
				let score = 0;

				const candidateEmail = normalizeEmail(candidate.email);
				const candidatePhone = normalizePhoneNumber(candidate.phone);
				const candidateMobile = normalizePhoneNumber(candidate.mobile);

				if (email && candidateEmail && email === candidateEmail) {
					addReason(reasons, 'email');
					score += 4;
				}

				if (phone && (phone === candidatePhone || phone === candidateMobile)) {
					addReason(reasons, 'phone');
					score += 2;
				}

				if (mobile && (mobile === candidatePhone || mobile === candidateMobile)) {
					addReason(reasons, 'mobile');
					score += 2;
				}

				if (reasons.size === 0) return null;

				return {
					...candidate,
					score,
					matchReasons: Array.from(reasons)
				};
			})
			.filter(Boolean)
			.sort((a, b) => b.score - a.score || new Date(b.updatedAt) - new Date(a.updatedAt))
			.slice(0, 8);

		return NextResponse.json({ matches });
	} catch (error) {
		if (error instanceof ValidationError) {
			return NextResponse.json({ error: error.message }, { status: 400 });
		}
		return NextResponse.json({ error: 'Failed to match candidates.' }, { status: 500 });
	}
}

export const POST = withApiLogging('candidates.match.post', postCandidates_matchHandler);
