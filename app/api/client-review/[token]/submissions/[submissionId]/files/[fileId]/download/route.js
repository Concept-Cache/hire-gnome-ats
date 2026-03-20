import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { downloadObjectBuffer } from '@/lib/object-storage';
import { loadClientPortalAccessByToken } from '@/lib/client-portal';
import { getSystemBranding } from '@/lib/system-settings';

import { withApiLogging } from '@/lib/api-logging';

function quotedFileName(fileName) {
	return String(fileName || 'attachment')
		.replace(/[\r\n"]/g, '')
		.trim();
}

async function getClient_review_token_submissions_submissionid_files_fileid_downloadHandler(req, { params }) {
	try {
		const branding = await getSystemBranding();
		if (!branding.clientPortalEnabled) {
			return NextResponse.json({ error: 'File not found.' }, { status: 404 });
		}
		const awaitedParams = await params;
		const token = String(awaitedParams?.token || '').trim();
		const submissionId = Number(awaitedParams?.submissionId);
		const fileId = Number(awaitedParams?.fileId);
		if (!token || !Number.isInteger(submissionId) || submissionId <= 0 || !Number.isInteger(fileId) || fileId <= 0) {
			return NextResponse.json({ error: 'File not found.' }, { status: 404 });
		}

		const portalAccess = await loadClientPortalAccessByToken(token);
		if (!portalAccess) {
			return NextResponse.json({ error: 'Client review portal not found.' }, { status: 404 });
		}

		const attachment = await prisma.candidateAttachment.findFirst({
			where: {
				id: fileId,
				isResume: true,
				candidate: {
					submissions: {
						some: {
							id: submissionId,
							jobOrderId: portalAccess.jobOrderId
						}
					}
				}
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
		if (error?.name === 'NoSuchKey' || error?.$metadata?.httpStatusCode === 404 || error?.code === 'ENOENT') {
			return NextResponse.json({ error: 'File not found in storage.' }, { status: 404 });
		}
		return NextResponse.json({ error: 'Failed to download file.' }, { status: 500 });
	}
}

export const GET = withApiLogging(
	'client_review.token.submissions.submissionid.files.fileid.download.get',
	getClient_review_token_submissions_submissionid_files_fileid_downloadHandler
);
