import { prisma } from '@/lib/prisma';
import { AccessControlError } from '@/lib/access-control';

function uniquePositiveInts(values) {
	const seen = new Set();
	const ids = [];

	for (const rawValue of values) {
		const value = Number(rawValue);
		if (!Number.isInteger(value) || value <= 0) continue;
		if (seen.has(value)) continue;
		seen.add(value);
		ids.push(value);
	}

	return ids;
}

function asSkillName(value) {
	if (typeof value !== 'string') return '';
	return value.trim();
}

function normalizeSkillKey(value) {
	return asSkillName(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function uniqueSkillNames(values) {
	const seen = new Set();
	const result = [];

	for (const rawValue of values) {
		const value = asSkillName(rawValue);
		if (!value) continue;
		const key = normalizeSkillKey(value);
		if (!key || seen.has(key)) continue;
		seen.add(key);
		result.push(value);
	}

	return result;
}

function splitSkillSetValues(value) {
	return uniqueSkillNames(String(value || '').split(/[,;\n|/]+/));
}

function joinSkillsWithinLimit(skills) {
	const items = Array.isArray(skills) ? skills : [];
	const normalized = items.map((skill) => asSkillName(skill)).filter(Boolean);

	if (normalized.length === 0) {
		return null;
	}

	return normalized.join(', ');
}

async function getActiveSkillNames() {
	const activeSkills = await prisma.skill.findMany({
		where: { isActive: true },
		select: { name: true }
	});
	return uniqueSkillNames(activeSkills.map((skill) => skill.name));
}

export async function resolveCandidateSkills(skillIdsInput, parsedSkillNamesInput = []) {
	const hasExplicitSkillIds = skillIdsInput !== undefined;
	const parsedSkillNames = uniqueSkillNames(
		Array.isArray(parsedSkillNamesInput) ? parsedSkillNamesInput : []
	);

	if (!hasExplicitSkillIds && parsedSkillNames.length === 0) {
		return {
			hasSkillIds: false,
			skillIds: [],
			skillNames: [],
			unmatchedParsedSkillNames: []
		};
	}

	const explicitSkillIds = uniquePositiveInts(Array.isArray(skillIdsInput) ? skillIdsInput : []);
	let matchedParsedSkillIds = [];
	let unmatchedParsedSkillNames = [];

	if (parsedSkillNames.length > 0) {
		const activeSkills = await prisma.skill.findMany({
			where: { isActive: true },
			select: { id: true, name: true }
		});
		const skillIdByKey = new Map(
			activeSkills.map((skill) => [normalizeSkillKey(skill.name), skill.id])
		);

		for (const skillName of parsedSkillNames) {
			const matchedId = skillIdByKey.get(normalizeSkillKey(skillName));
			if (matchedId) {
				matchedParsedSkillIds.push(matchedId);
			} else {
				unmatchedParsedSkillNames.push(skillName);
			}
		}
	}

	const skillIds = uniquePositiveInts([...explicitSkillIds, ...matchedParsedSkillIds]);
	if (skillIds.length === 0) {
		return {
			hasSkillIds: true,
			skillIds: [],
			skillNames: [],
			unmatchedParsedSkillNames
		};
	}

	const skills = await prisma.skill.findMany({
		where: { id: { in: skillIds } },
		select: { id: true, name: true }
	});

	if (skills.length !== skillIds.length && explicitSkillIds.length > 0) {
		throw new AccessControlError('One or more selected skills are invalid.', 400);
	}

	const skillNameById = new Map(skills.map((skill) => [skill.id, skill.name]));
	return {
		hasSkillIds: true,
		skillIds,
		skillNames: skillIds.map((skillId) => skillNameById.get(skillId)).filter(Boolean),
		unmatchedParsedSkillNames
	};
}

export async function resolveSkillSetForWrite({
	normalizedSkillSet,
	unmatchedParsedSkillNames = [],
	extraKnownSkillNames = []
}) {
	const manualSkills = splitSkillSetValues(normalizedSkillSet);
	const unmatchedSkills = uniqueSkillNames(unmatchedParsedSkillNames);
	const mergedSkills = uniqueSkillNames([...manualSkills, ...unmatchedSkills]);
	if (mergedSkills.length === 0) {
		return null;
	}

	const knownSkills = uniqueSkillNames([...(await getActiveSkillNames()), ...extraKnownSkillNames]);
	if (knownSkills.length === 0) {
		return joinSkillsWithinLimit(mergedSkills);
	}

	const knownKeys = new Set(knownSkills.map((skillName) => normalizeSkillKey(skillName)));
	const otherSkills = mergedSkills.filter((skillName) => !knownKeys.has(normalizeSkillKey(skillName)));
	if (otherSkills.length === 0) {
		return null;
	}

	return joinSkillsWithinLimit(otherSkills);
}
