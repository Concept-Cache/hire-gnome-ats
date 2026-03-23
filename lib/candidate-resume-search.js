import { prisma } from '@/lib/prisma';
import { downloadObjectBuffer } from '@/lib/object-storage';
import { extractResumeTextFromBuffer } from '@/lib/resume-file-parser';

const MAX_RESUME_SEARCH_TEXT_LENGTH = 12000;

export function normalizeResumeSearchText(value) {
	const normalized = String(value || '')
		.replace(/\r/g, '\n')
		.replace(/\u0000/g, '')
		.replace(/\s+/g, ' ')
		.trim();
	return normalized.slice(0, MAX_RESUME_SEARCH_TEXT_LENGTH);
}

export async function deriveResumeSearchTextFromBuffer({ buffer, fileName, contentType }) {
	try {
		const { text } = await extractResumeTextFromBuffer({ buffer, fileName, contentType });
		return normalizeResumeSearchText(text);
	} catch {
		return '';
	}
}

export async function syncCandidateResumeSearchText(candidateId, prismaClient = prisma) {
	const attachment = await prismaClient.candidateAttachment.findFirst({
		where: {
			candidateId,
			isResume: true
		},
		orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
		select: {
			id: true,
			fileName: true,
			contentType: true,
			storageProvider: true,
			storageBucket: true,
			storageKey: true
		}
	});

	if (!attachment) {
		await prismaClient.candidate.update({
			where: { id: candidateId },
			data: { resumeSearchText: null }
		});
		return '';
	}

	const buffer = await downloadObjectBuffer({
		key: attachment.storageKey,
		storageProvider: attachment.storageProvider,
		storageBucket: attachment.storageBucket
	});
	const resumeSearchText = await deriveResumeSearchTextFromBuffer({
		buffer,
		fileName: attachment.fileName,
		contentType: attachment.contentType
	});

	await prismaClient.candidate.update({
		where: { id: candidateId },
		data: { resumeSearchText: resumeSearchText || null }
	});

	return resumeSearchText;
}
