import { prisma } from '@/lib/prisma';
import { AccessControlError, addScopeToWhere, getActingUser } from '@/lib/access-control';
import { getCandidateJobOrderScope } from '@/lib/related-record-scope';
import { buildInterviewInviteFilename, buildInterviewInviteIcs } from '@/lib/interview-invite-ics';
import { ValidationError, parseRouteId } from '@/lib/request-validation';

import { withApiLogging } from '@/lib/api-logging';
async function getInterviews_id_inviteHandler(req, { params }) {
	try {
		const resolvedParams = await params;
		const id = parseRouteId(resolvedParams);

		const actingUser = await getActingUser(req);
		const interview = await prisma.interview.findFirst({
			where: addScopeToWhere({ id }, getCandidateJobOrderScope(actingUser)),
			include: {
				candidate: true,
				jobOrder: {
					include: {
						client: true
					}
				}
			}
		});

		if (!interview) {
			return Response.json({ error: 'Interview not found.' }, { status: 404 });
		}

		const ics = buildInterviewInviteIcs(interview);
		const fileName = buildInterviewInviteFilename(interview);

		return new Response(ics, {
			status: 200,
			headers: {
				'Content-Type': 'text/calendar; charset=utf-8',
				'Content-Disposition': `attachment; filename="${fileName}"`,
				'Cache-Control': 'no-store'
			}
		});
	} catch (error) {
		if (error instanceof AccessControlError) {
			return Response.json({ error: error.message }, { status: error.status });
		}
		if (error instanceof ValidationError) {
			return Response.json({ error: error.message }, { status: 400 });
		}

		if (error instanceof Error && error.message.includes('start date/time')) {
			return Response.json({ error: error.message }, { status: 400 });
		}

		return Response.json({ error: 'Failed to generate interview invite.' }, { status: 500 });
	}
}

export const GET = withApiLogging('interviews.id.invite.get', getInterviews_id_inviteHandler);
