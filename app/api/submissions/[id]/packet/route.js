import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { addScopeToWhere, getActingUser, AccessControlError } from '@/lib/access-control';
import { getCandidateJobOrderScope } from '@/lib/related-record-scope';
import { parseRouteId, ValidationError } from '@/lib/request-validation';
import { withApiLogging } from '@/lib/api-logging';

function handleError(error, fallbackMessage) {
	if (error instanceof AccessControlError) {
		return NextResponse.json({ error: error.message }, { status: error.status });
	}
	if (error instanceof ValidationError) {
		return NextResponse.json({ error: error.message }, { status: error.status || 400 });
	}
	return NextResponse.json({ error: fallbackMessage }, { status: 500 });
}

async function getSubmissions_id_packetHandler(req, { params }) {
	try {
		const awaitedParams = await params;
		const id = parseRouteId(awaitedParams);
		const actingUser = await getActingUser(req);

		const submission = await prisma.submission.findFirst({
			where: addScopeToWhere({ id }, getCandidateJobOrderScope(actingUser)),
			include: {
				candidate: {
					include: {
						candidateSkills: {
							include: {
								skill: {
									select: { id: true, name: true, category: true, isActive: true }
								}
							},
							orderBy: { createdAt: 'asc' }
						},
						candidateWorkExperiences: {
							orderBy: [{ endDate: 'desc' }, { startDate: 'desc' }, { createdAt: 'desc' }]
						},
						attachments: {
							where: { isResume: true },
							orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
							select: {
								id: true,
								recordId: true,
								fileName: true,
								contentType: true,
								createdAt: true,
								updatedAt: true,
								isResume: true
							}
						}
					}
				},
				jobOrder: {
					include: {
						client: true,
						contact: true
					}
				},
				createdByUser: {
					select: { id: true, firstName: true, lastName: true, email: true, isActive: true }
				},
				aiWriteUpGeneratedByUser: {
					select: { id: true, firstName: true, lastName: true, email: true, isActive: true }
				},
				offer: {
					select: { id: true, status: true, updatedAt: true }
				}
			}
		});

		if (!submission) {
			return NextResponse.json({ error: 'Submission not found.' }, { status: 404 });
		}

		const [matchExplanation, interviews] = await Promise.all([
			prisma.matchExplanation.findUnique({
				where: {
					candidateId_jobOrderId: {
						candidateId: submission.candidateId,
						jobOrderId: submission.jobOrderId
					}
				},
				include: {
					generatedByUser: {
						select: { id: true, firstName: true, lastName: true, email: true, isActive: true }
					}
				}
			}),
			prisma.interview.findMany({
				where: addScopeToWhere(
					{
						candidateId: submission.candidateId,
						jobOrderId: submission.jobOrderId
					},
					getCandidateJobOrderScope(actingUser)
				),
				orderBy: [{ startsAt: 'desc' }, { createdAt: 'desc' }],
				take: 5,
				include: {
					aiQuestionSetGeneratedByUser: {
						select: { id: true, firstName: true, lastName: true, email: true, isActive: true }
					}
				}
			})
		]);

		return NextResponse.json({
			submission,
			matchExplanation: matchExplanation || null,
			interviews: Array.isArray(interviews) ? interviews : []
		});
	} catch (error) {
		return handleError(error, 'Failed to load submission packet.');
	}
}

export const GET = withApiLogging('submissions.id.packet.get', getSubmissions_id_packetHandler);
