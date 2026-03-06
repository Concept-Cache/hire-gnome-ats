import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { AccessControlError, addScopeToWhere, getActingUser, getEntityScope } from '@/lib/access-control';
import { parseRouteId, ValidationError } from '@/lib/request-validation';
import { CANDIDATE_MATCH_RATE_LIMIT_MAX_REQUESTS, CANDIDATE_MATCH_RATE_LIMIT_WINDOW_SECONDS } from '@/lib/security-constants';
import { consumeRequestThrottle } from '@/lib/request-throttle';

import { withApiLogging } from '@/lib/api-logging';
function toBoolean(value, fallback = false) {
	if (value == null) return fallback;
	const normalized = String(value).trim().toLowerCase();
	return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function toLimit(value, fallback = 10) {
	const parsed = Number.parseInt(String(value ?? ''), 10);
	if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
	return Math.min(parsed, 100);
}

function normalizeText(value) {
	return String(value || '')
		.toLowerCase()
		.replace(/<[^>]*>/g, ' ')
		.replace(/[^a-z0-9+\-#.\s]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function tokenize(value) {
	return normalizeText(value)
		.split(' ')
		.filter((token) => token.length >= 2);
}

function unique(values) {
	return [...new Set(values.filter(Boolean))];
}

function overlapRatio(a, b) {
	if (a.length === 0 || b.length === 0) return 0;
	const aSet = new Set(a);
	const bSet = new Set(b);
	let overlap = 0;
	for (const value of aSet) {
		if (bSet.has(value)) overlap += 1;
	}
	return overlap / Math.max(aSet.size, 1);
}

function inferYearsFromWorkExperience(records) {
	if (!Array.isArray(records) || records.length === 0) return 0;
	const now = new Date();
	const ranges = records
		.map((record) => {
			const start = record?.startDate ? new Date(record.startDate) : null;
			const end = record?.isCurrent ? now : record?.endDate ? new Date(record.endDate) : now;
			if (!start || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
			if (end <= start) return null;
			return (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
		})
		.filter((years) => Number.isFinite(years) && years > 0);

	if (ranges.length === 0) return 0;
	return Math.min(30, ranges.reduce((sum, value) => sum + value, 0));
}

function inferRequiredYears(jobOrder) {
	const text = `${jobOrder?.title || ''} ${jobOrder?.description || ''}`;
	const match = normalizeText(text).match(/(\d{1,2})\s*\+?\s*(years|yrs|year)/);
	if (!match) return 0;
	const years = Number.parseInt(match[1], 10);
	if (!Number.isFinite(years) || years <= 0) return 0;
	return Math.min(years, 20);
}

function buildCandidateText(candidate) {
	const candidateSkillNames = Array.isArray(candidate?.candidateSkills)
		? candidate.candidateSkills.map((item) => item?.skill?.name)
		: [];
	const workTitles = Array.isArray(candidate?.candidateWorkExperiences)
		? candidate.candidateWorkExperiences.map((item) => item?.title)
		: [];

	return [
		candidate?.currentJobTitle,
		candidate?.currentEmployer,
		candidate?.summary,
		candidate?.skillSet,
		...candidateSkillNames,
		...workTitles
	]
		.filter(Boolean)
		.join(' ');
}

function buildJobText(jobOrder) {
	return [
		jobOrder?.title,
		jobOrder?.description,
		jobOrder?.publicDescription,
		jobOrder?.employmentType,
		jobOrder?.location
	]
		.filter(Boolean)
		.join(' ');
}

function findJobSkillIds(jobText, skills) {
	const normalizedJobText = normalizeText(jobText);
	const matched = [];
	for (const skill of skills) {
		const normalizedSkillName = normalizeText(skill.name);
		if (!normalizedSkillName) continue;
		if (normalizedJobText.includes(normalizedSkillName)) {
			matched.push(skill.id);
		}
	}
	return unique(matched);
}

function locationScore(jobOrder, candidate) {
	const jobLocation = normalizeText(jobOrder?.location || '');
	if (!jobLocation) return 0.6;
	if (jobLocation.includes('remote')) return 1;
	if (jobLocation.includes('hybrid')) return 0.8;

	const candidateCity = normalizeText(candidate?.city || '');
	const candidateState = normalizeText(candidate?.state || '');
	if (!candidateCity && !candidateState) return 0.25;

	if (candidateCity && jobLocation.includes(candidateCity)) return 1;
	if (candidateState && jobLocation.includes(candidateState)) return 0.85;
	return 0.35;
}

function toPercent(value) {
	return Math.round(Math.max(0, Math.min(1, value)) * 100);
}

function buildReasons({
	requiredSkillsMatched,
	requiredSkillsMissing,
	experienceYears,
	requiredYears,
	locationFit,
	titleOverlap
}) {
	const reasons = [];
	const risks = [];

	if (requiredSkillsMatched.length > 0) {
		reasons.push(`Matched skills: ${requiredSkillsMatched.join(', ')}`);
	}

	if (requiredSkillsMissing.length > 0) {
		risks.push(`Missing skills: ${requiredSkillsMissing.join(', ')}`);
	}

	if (requiredYears > 0) {
		if (experienceYears >= requiredYears) {
			reasons.push(`Experience fit: ${experienceYears.toFixed(1)} years vs ${requiredYears}+ target`);
		} else {
			risks.push(`Experience gap: ${experienceYears.toFixed(1)} years vs ${requiredYears}+ target`);
		}
	}

	if (titleOverlap >= 0.5) {
		reasons.push('Strong title alignment with job order');
	} else if (titleOverlap <= 0.1) {
		risks.push('Low title alignment');
	}

	if (locationFit < 0.4) {
		risks.push('Potential location mismatch');
	}

	return { reasons, risks };
}

function scoreJobOrder(candidate, jobOrder, allSkills, requiredSkillIds) {
	const candidateSkillIds = new Set(
		(candidate.candidateSkills || []).map((item) => item?.skill?.id).filter(Boolean)
	);
	const requiredSkillsMatched = requiredSkillIds
		.filter((skillId) => candidateSkillIds.has(skillId))
		.map((skillId) => allSkills.find((skill) => skill.id === skillId)?.name)
		.filter(Boolean);
	const requiredSkillsMissing = requiredSkillIds
		.filter((skillId) => !candidateSkillIds.has(skillId))
		.map((skillId) => allSkills.find((skill) => skill.id === skillId)?.name)
		.filter(Boolean);

	const requiredSkillCoverage =
		requiredSkillIds.length > 0 ? requiredSkillsMatched.length / requiredSkillIds.length : 0.6;

	const jobTokens = tokenize(buildJobText(jobOrder));
	const candidateTokens = tokenize(buildCandidateText(candidate));
	const keywordOverlap = overlapRatio(jobTokens, candidateTokens);
	const titleOverlap = overlapRatio(tokenize(jobOrder?.title), tokenize(candidate?.currentJobTitle));

	const inferredYears = inferYearsFromWorkExperience(candidate.candidateWorkExperiences);
	const requiredYears = inferRequiredYears(jobOrder);
	const experienceFit =
		requiredYears > 0 ? Math.max(0, Math.min(1, inferredYears / requiredYears)) : Math.min(1, inferredYears / 8 || 0.4);

	const locationFit = locationScore(jobOrder, candidate);

	const hasExplicitRequiredSkills = requiredSkillIds.length > 0;
	const weightedScore = hasExplicitRequiredSkills
		? requiredSkillCoverage * 0.45 + titleOverlap * 0.2 + keywordOverlap * 0.15 + experienceFit * 0.15 + locationFit * 0.05
		: requiredSkillCoverage * 0.25 + titleOverlap * 0.2 + keywordOverlap * 0.3 + experienceFit * 0.2 + locationFit * 0.05;

	const { reasons, risks } = buildReasons({
		requiredSkillsMatched,
		requiredSkillsMissing,
		experienceYears: inferredYears,
		requiredYears,
		locationFit,
		titleOverlap
	});

	const submissionCount = Number(jobOrder?._count?.submissions || 0);
	const openings = Number(jobOrder?.openings || 0);
	const activeHiring = openings <= 0 || submissionCount < openings;

	if (!activeHiring) {
		risks.push('No open capacity remaining');
	}

	return {
		jobOrderId: jobOrder.id,
		jobOrderTitle: jobOrder.title || '',
		clientName: jobOrder.client?.name || '',
		contactName: jobOrder.contact
			? `${jobOrder.contact.firstName} ${jobOrder.contact.lastName}`.trim()
			: '',
		ownerName: jobOrder.ownerUser
			? `${jobOrder.ownerUser.firstName} ${jobOrder.ownerUser.lastName}`.trim()
			: '-',
		location: jobOrder.location || '',
		score: Math.max(0, Math.min(1, weightedScore)),
		scorePercent: toPercent(weightedScore),
		openings: openings > 0 ? openings : null,
		submissionCount,
		activeHiring,
		submittedToJobOrder: Array.isArray(jobOrder.submissions) && jobOrder.submissions.length > 0,
		reasons,
		risks
	};
}

function handleError(error, fallbackMessage) {
	if (error instanceof AccessControlError) {
		return NextResponse.json({ error: error.message }, { status: error.status });
	}
	if (error instanceof ValidationError) {
		return NextResponse.json({ error: error.message }, { status: 400 });
	}
	return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

async function getCandidates_id_matchesHandler(req, { params }) {
	try {
		const awaitedParams = await params;
		const id = parseRouteId(awaitedParams);
		const throttle = await consumeRequestThrottle({
			req,
			routeKey: `candidates.${id}.matches`,
			maxRequests: CANDIDATE_MATCH_RATE_LIMIT_MAX_REQUESTS,
			windowSeconds: CANDIDATE_MATCH_RATE_LIMIT_WINDOW_SECONDS
		});
		if (!throttle.allowed) {
			return NextResponse.json(
				{ error: 'Too many job match checks from this network. Please try again shortly.' },
				{
					status: 429,
					headers: {
						'Retry-After': String(throttle.retryAfterSeconds || 60)
					}
				}
			);
		}

		const actingUser = await getActingUser(req);
		const scope = getEntityScope(actingUser);
		const { searchParams } = new URL(req.url);
		const includeSubmitted = toBoolean(searchParams.get('includeSubmitted'), false);
		const limit = toLimit(searchParams.get('limit'), 10);

		const candidate = await prisma.candidate.findFirst({
			where: addScopeToWhere({ id }, scope),
			select: {
				id: true,
				currentJobTitle: true,
				currentEmployer: true,
				summary: true,
				skillSet: true,
				city: true,
				state: true,
				divisionId: true,
				candidateSkills: { include: { skill: { select: { id: true, name: true } } } },
				candidateWorkExperiences: {
					select: { title: true, startDate: true, endDate: true, isCurrent: true }
				}
			}
		});

		if (!candidate) {
			return NextResponse.json({ error: 'Candidate not found.' }, { status: 404 });
		}

		const [skills, jobOrders] = await Promise.all([
			prisma.skill.findMany({
				where: { isActive: true },
				select: { id: true, name: true }
			}),
			prisma.jobOrder.findMany({
				where: addScopeToWhere(
					{
						status: 'open',
						divisionId: candidate.divisionId || undefined,
						...(includeSubmitted
							? {}
							: {
									submissions: {
										none: {
											candidateId: id
										}
									}
								})
					},
					scope
				),
				include: {
					client: { select: { id: true, name: true } },
					contact: { select: { id: true, firstName: true, lastName: true } },
					ownerUser: { select: { id: true, firstName: true, lastName: true } },
					_count: { select: { submissions: true } },
					submissions: {
						where: { candidateId: id },
						select: { id: true }
					}
				},
				orderBy: { updatedAt: 'desc' }
			})
		]);

		const scored = jobOrders.map((jobOrder) => {
			const requiredSkillIds = findJobSkillIds(buildJobText(jobOrder), skills);
			return scoreJobOrder(candidate, jobOrder, skills, requiredSkillIds);
		});

		const filtered = scored.filter((jobOrderMatch) => jobOrderMatch.activeHiring);
		const sorted = filtered
			.sort((a, b) => b.score - a.score)
			.slice(0, limit);

		return NextResponse.json({
			candidateId: id,
			computedAt: new Date().toISOString(),
			totalJobOrdersEvaluated: scored.length,
			activeHiringJobOrders: filtered.length,
			matches: sorted
		});
	} catch (error) {
		return handleError(error, 'Failed to calculate job order matches.');
	}
}

export const GET = withApiLogging('candidates.id.matches.get', getCandidates_id_matchesHandler);
