import path from 'node:path';
import { createRequire } from 'node:module';
import mammoth from 'mammoth';
import WordExtractor from 'word-extractor';
import {
	RESUME_UPLOAD_MAX_BYTES,
	isAllowedResumeUploadContentType,
	isAllowedResumeUploadFileName
} from '@/lib/candidate-attachment-options';

const require = createRequire(import.meta.url);
const { PDFParse } = require('pdf-parse');

const pdfMimeTypes = new Set(['application/pdf']);
const wordMimeTypes = new Set([
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'application/msword'
]);
const wordExtractor = new WordExtractor();

function getExtension(filename) {
	if (!filename) return '';
	return path.extname(filename).toLowerCase();
}

function normalizeText(value) {
	return String(value || '')
		.replace(/\r/g, '\n')
		.replace(/\u0000/g, '')
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

function isPdf(type, extension) {
	return pdfMimeTypes.has(type) || extension === '.pdf';
}

function isDocx(type, extension) {
	return extension === '.docx' || (wordMimeTypes.has(type) && extension !== '.doc');
}

function isDoc(type, extension) {
	return extension === '.doc' || (wordMimeTypes.has(type) && extension === '.doc');
}

export async function extractResumeTextFromFile(file) {
	const name = file?.name || '';
	const type = file?.type || '';
	const extension = getExtension(name);

	if (!name) {
		throw new Error('Please upload a file.');
	}
	if (!isAllowedResumeUploadFileName(name)) {
		throw new Error('Unsupported file type. Upload PDF, DOC, or DOCX.');
	}
	if (!isAllowedResumeUploadContentType(name, type)) {
		throw new Error('Unsupported file content type. Upload PDF, DOC, or DOCX.');
	}

	if (file.size <= 0) {
		throw new Error('Uploaded file is empty.');
	}

	if (file.size > RESUME_UPLOAD_MAX_BYTES) {
		throw new Error(`File is too large. Use a file smaller than ${Math.floor(RESUME_UPLOAD_MAX_BYTES / (1024 * 1024))} MB.`);
	}

	const buffer = Buffer.from(await file.arrayBuffer());

	if (isPdf(type, extension)) {
		const parser = new PDFParse({ data: buffer });
		let textResult;
		try {
			textResult = await parser.getText();
		} finally {
			await parser.destroy();
		}
		const text = normalizeText(textResult?.text || '');
		if (!text) throw new Error('Could not extract text from this PDF.');
		return { text, fileType: 'pdf' };
	}

	if (isDocx(type, extension)) {
		const result = await mammoth.extractRawText({ buffer });
		const text = normalizeText(result.value);
		if (!text) throw new Error('Could not extract text from this Word document.');
		return { text, fileType: 'docx' };
	}

	if (isDoc(type, extension)) {
		const extracted = await wordExtractor.extract(buffer);
		const text = normalizeText(extracted.getBody());
		if (!text) throw new Error('Could not extract text from this Word document.');
		return { text, fileType: 'doc' };
	}

	throw new Error('Unsupported file type. Upload PDF, DOC, or DOCX.');
}
