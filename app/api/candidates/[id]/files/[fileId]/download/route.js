import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { downloadObjectBuffer } from '@/lib/object-storage';
import { AccessControlError, ensureScopedEntityAccess, getActingUser } from '@/lib/access-control';
import { parseRouteId, ValidationError } from '@/lib/request-validation';

import { withApiLogging } from '@/lib/api-logging';
function quotedFileName(fileName) {
	return String(fileName || 'attachment')
		.replace(/[\r\n"]/g, '')
		.trim();
}

function handleError(error, fallbackMessage) {
	if (error instanceof AccessControlError) {
		return NextResponse.json({ error: error.message }, { status: error.status });
	}
	if (error instanceof ValidationError) {
		return NextResponse.json({ error: error.message }, { status: 400 });
	}

	if (error?.name === 'NoSuchKey' || error?.$metadata?.httpStatusCode === 404) {
		return NextResponse.json({ error: 'File not found in storage.' }, { status: 404 });
	}

	if (error?.code === 'ENOENT') {
		return NextResponse.json({ error: 'File not found in storage.' }, { status: 404 });
	}

	return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

async function getCandidates_id_files_fileid_downloadHandler(req, { params }) {
	try {
		const awaitedParams = await params;
		const candidateId = parseRouteId(awaitedParams);
		const fileId = parseRouteId(awaitedParams, 'fileId');

		const actingUser = await getActingUser(req);
		await ensureScopedEntityAccess('candidate', candidateId, actingUser);

		const attachment = await prisma.candidateAttachment.findFirst({
			where: {
				id: fileId,
				candidateId
			}
		});
		if (!attachment) {
			return NextResponse.json({ error: 'File not found.' }, { status: 404 });
		}

		const buffer = await downloadObjectBuffer({
			key: attachment.storageKey,
			storageProvider: attachment.storageProvider,
			storageBucket: attachment.storageBucket
		});
		const fileName = quotedFileName(attachment.fileName);
		return new NextResponse(buffer, {
			status: 200,
			headers: {
				'Content-Type': attachment.contentType || 'application/octet-stream',
				'Content-Length': String(buffer.length),
				'Content-Disposition': `attachment; filename="${fileName}"`
			}
		});
	} catch (error) {
		return handleError(error, 'Failed to download file.');
	}
}

export const GET = withApiLogging('candidates.id.files.fileid.download.get', getCandidates_id_files_fileid_downloadHandler);
