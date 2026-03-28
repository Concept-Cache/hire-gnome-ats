import JSZip from 'jszip';
import { NextResponse } from 'next/server';
import { AccessControlError, getActingUser } from '@/lib/access-control';
import { withApiLogging } from '@/lib/api-logging';
import { runAdminDataImportWithFormData } from '@/app/api/admin/data-import/route';
import { readBullhornExportJobFile, BULLHORN_EXPORT_JOB_STATUSES } from '@/lib/bullhorn-export-jobs';
import { getBullhornOperationsEnabled } from '@/lib/integration-operations';
import { prisma } from '@/lib/prisma';
import { BULLHORN_CANDIDATE_FILES_MANIFEST_NAME } from '@/lib/bullhorn-export';
import { normalizeHeaderKey, parseCsvText } from '@/lib/data-import-csv';

export const dynamic = 'force-dynamic';

const FILE_ENTITY_MAP = Object.freeze({
	'00-custom-field-definitions.csv': 'customFieldDefinitions',
	'01-clients.csv': 'clients',
	'02-contacts.csv': 'contacts',
	'03-candidates.csv': 'candidates',
	'04-job-orders.csv': 'jobOrders',
	'05-submissions.csv': 'submissions',
	'06-interviews.csv': 'interviews',
	'07-placements.csv': 'placements'
});

async function buildImportFormDataFromZip(buffer) {
	const zip = await JSZip.loadAsync(buffer);
	const formData = new FormData();
	formData.set('mode', 'apply');
	formData.set('sourceType', 'bullhorn_csv_zip');
	const manifest = [];

	for (const [fileName, entity] of Object.entries(FILE_ENTITY_MAP)) {
		const entry = zip.file(fileName);
		if (!entry) continue;
		const text = await entry.async('string');
		if (!String(text || '').trim()) continue;
		const manifestId = entity;
		const fileField = `bullhornFile:${manifestId}`;
		manifest.push({
			id: manifestId,
			entity,
			fileField
		});
		formData.set(fileField, new File([text], fileName, { type: 'text/csv' }));
	}

	if (manifest.length <= 0) {
		throw new Error('The Bullhorn export ZIP did not contain any importable CSV files.');
	}

	formData.set('bullhornBatch', JSON.stringify(manifest));
	formData.set('bullhornZipFile', new File([buffer], 'bullhorn-export.zip', { type: 'application/zip' }));

	const candidateFilesManifestEntry = zip.file(BULLHORN_CANDIDATE_FILES_MANIFEST_NAME);
	if (candidateFilesManifestEntry) {
		const manifestText = await candidateFilesManifestEntry.async('string');
		if (String(manifestText || '').trim()) {
			const { rows } = parseCsvText(manifestText);
			const candidateAttachmentManifest = [];
			for (const [index, row] of rows.entries()) {
				const zipPath = String(row?.[normalizeHeaderKey('ZIP Path')] || '').trim();
				const fileName = String(row?.[normalizeHeaderKey('File Name')] || '').trim();
				if (!zipPath || !fileName) continue;
				const zipEntry = zip.file(zipPath);
				if (!zipEntry) continue;
				const fileBuffer = await zipEntry.async('arraybuffer');
				const id = `bullhorn-export-attachment-${index + 1}`;
				candidateAttachmentManifest.push({
					id,
					candidateId: String(row?.[normalizeHeaderKey('Candidate ID')] || '').trim(),
					candidateEmail: String(row?.[normalizeHeaderKey('Candidate Email')] || '').trim(),
					fileName,
					contentType: String(row?.[normalizeHeaderKey('Content Type')] || 'application/octet-stream').trim(),
					description: String(row?.[normalizeHeaderKey('Description')] || '').trim(),
					isResume: String(row?.[normalizeHeaderKey('Is Resume')] || '').trim().toLowerCase() === 'true',
					fileField: `bullhornAttachmentFile:${id}`
				});
				formData.set(
					`bullhornAttachmentFile:${id}`,
					new File([fileBuffer], fileName, {
						type: String(row?.[normalizeHeaderKey('Content Type')] || 'application/octet-stream').trim() || 'application/octet-stream'
					})
				);
			}

			if (candidateAttachmentManifest.length > 0) {
				formData.set('bullhornCandidateAttachments', JSON.stringify(candidateAttachmentManifest));
			}
		}
	}
	return formData;
}

async function postAdminBullhornExportJobImportHandler(req, context) {
	if (!getBullhornOperationsEnabled()) {
		return NextResponse.json({ error: 'Bullhorn operations are disabled.' }, { status: 403 });
	}
	const actingUser = await getActingUser(req, { allowFallback: false });
	if (actingUser?.role !== 'ADMINISTRATOR') {
		throw new AccessControlError('Only administrators can import Bullhorn export jobs.', 403);
	}

	const { recordId } = await context.params;
	const job = await prisma.bullhornExportJob.findUnique({
		where: { recordId }
	});
	if (!job) {
		return NextResponse.json({ error: 'Export job was not found.' }, { status: 404 });
	}
	if (!job.filePath || (job.status !== 'completed' && job.status !== 'imported')) {
		return NextResponse.json({ error: 'Export job is not ready to import.' }, { status: 409 });
	}

	await prisma.bullhornExportJob.update({
		where: { recordId },
		data: {
			status: BULLHORN_EXPORT_JOB_STATUSES.IMPORTING
		}
	});

	try {
		const buffer = await readBullhornExportJobFile(job);
		const formData = await buildImportFormDataFromZip(buffer);
		const response = await runAdminDataImportWithFormData({
			req,
			actingUser,
			formData,
			throttleKey: 'admin.bullhorn_export_jobs.import.post'
		});
		const payload = await response.json();
		if (!response.ok) {
			await prisma.bullhornExportJob.update({
				where: { recordId },
				data: {
					status: BULLHORN_EXPORT_JOB_STATUSES.COMPLETED
				}
			});
			return NextResponse.json(payload, { status: response.status });
		}

		await prisma.bullhornExportJob.update({
			where: { recordId },
			data: {
				status: BULLHORN_EXPORT_JOB_STATUSES.IMPORTED,
				importedAt: new Date(),
				importResult: payload?.result || null
			}
		});

		return NextResponse.json(payload);
	} catch (error) {
		await prisma.bullhornExportJob.update({
			where: { recordId },
			data: {
				status: BULLHORN_EXPORT_JOB_STATUSES.COMPLETED
			}
		});
		throw error;
	}
}

async function routeHandler(req, context) {
	try {
		return await postAdminBullhornExportJobImportHandler(req, context);
	} catch (error) {
		if (error instanceof AccessControlError) {
			return NextResponse.json({ error: error.message }, { status: error.status });
		}
		return NextResponse.json({ error: error?.message || 'Failed to import Bullhorn export job.' }, { status: 500 });
	}
}

export const POST = withApiLogging('admin.bullhorn_export_jobs.record_id.import.post', routeHandler);
