import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { buildClientPortalInternalSummary } from '@/lib/client-portal';
import { AccessControlError, addScopeToWhere, getActingUser, getEntityScope } from '@/lib/access-control';
import { logCreate, logUpdate } from '@/lib/audit-log';
import { sendEmailMessage } from '@/lib/email-delivery';
import { isValidEmailAddress } from '@/lib/email-validation';
import { getSystemBranding } from '@/lib/system-settings';
import { parseJsonBody, parseRouteId, ValidationError } from '@/lib/request-validation';

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

function escapeHtml(value) {
	return String(value || '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function buildClientPortalInviteEmail({ siteName, jobOrderTitle, clientName, contactName, portalUrl }) {
	const safeSiteName = String(siteName || 'Hire Gnome ATS').trim() || 'Hire Gnome ATS';
	const safeJobOrderTitle = String(jobOrderTitle || 'Job Order').trim() || 'Job Order';
	const safeClientName = String(clientName || '').trim();
	const safeContactName = String(contactName || 'there').trim() || 'there';
	const safePortalUrl = String(portalUrl || '').trim();
	const subject = `${safeSiteName}: Review submitted candidates for ${safeJobOrderTitle}`;
	const text = [
		`Hi ${safeContactName},`,
		'',
		`You can review submitted candidates for ${safeJobOrderTitle}${safeClientName ? ` at ${safeClientName}` : ''} using the link below:`,
		'',
		safePortalUrl,
		'',
		'This link stays valid for the life of the job unless it is explicitly disabled.',
		'',
		`Sent from ${safeSiteName}.`
	].join('\n');
	const html = `
		<p>Hi ${escapeHtml(safeContactName)},</p>
		<p>
			You can review submitted candidates for <strong>${escapeHtml(safeJobOrderTitle)}</strong>${safeClientName ? ` at <strong>${escapeHtml(safeClientName)}</strong>` : ''} using the link below:
		</p>
		<p><a href="${escapeHtml(safePortalUrl)}">${escapeHtml(safePortalUrl)}</a></p>
		<p>This link stays valid for the life of the job unless it is explicitly disabled.</p>
		<p>Sent from ${escapeHtml(safeSiteName)}.</p>
	`.trim();

	return { subject, text, html };
}

async function loadScopedJobOrder(req, id) {
	const actingUser = await getActingUser(req, { allowFallback: false });
	const jobOrder = await prisma.jobOrder.findFirst({
		where: addScopeToWhere({ id }, getEntityScope(actingUser)),
		select: {
			id: true,
			recordId: true,
			title: true,
			contactId: true,
			client: {
				select: {
					name: true
				}
			},
			contact: {
				select: {
					id: true,
					recordId: true,
					firstName: true,
					lastName: true,
					email: true,
					title: true
				}
			}
		}
	});
	if (!jobOrder) {
		throw new ValidationError('Job order not found.');
	}
	return { actingUser, jobOrder };
}

async function loadPortalAccess(jobOrder) {
	if (!jobOrder?.contactId) return null;
	return prisma.clientPortalAccess.findFirst({
		where: {
			jobOrderId: jobOrder.id,
			contactId: jobOrder.contactId
		},
		include: {
			contact: {
				select: {
					id: true,
					recordId: true,
					firstName: true,
					lastName: true,
					email: true,
					title: true
				}
			}
		}
	});
}

async function getJob_orders_id_client_portalHandler(req, { params }) {
	try {
		const awaitedParams = await params;
		const id = parseRouteId(awaitedParams);
		const { jobOrder } = await loadScopedJobOrder(req, id);
		const access = await loadPortalAccess(jobOrder);

		return NextResponse.json({
			jobOrder: {
				id: jobOrder.id,
				recordId: jobOrder.recordId,
				title: jobOrder.title
			},
			contactRequired: !jobOrder.contactId,
			contact: jobOrder.contact || null,
			access: buildClientPortalInternalSummary({ req, portalAccess: access })
		});
	} catch (error) {
		return handleError(error, 'Failed to load client portal settings.');
	}
}

async function postJob_orders_id_client_portalHandler(req, { params }) {
	try {
		const awaitedParams = await params;
		const id = parseRouteId(awaitedParams);
		const { actingUser, jobOrder } = await loadScopedJobOrder(req, id);
		if (!jobOrder.contactId) {
			return NextResponse.json(
				{ error: 'Assign a client contact to this job order before creating a portal link.' },
				{ status: 400 }
			);
		}

		const existing = await loadPortalAccess(jobOrder);
		const access = existing
			? await prisma.clientPortalAccess.update({
					where: { id: existing.id },
					data: { isRevoked: false },
					include: {
						contact: {
							select: {
								id: true,
								recordId: true,
								firstName: true,
								lastName: true,
								email: true,
								title: true
							}
						}
					}
				})
			: await prisma.clientPortalAccess.create({
					data: {
						contactId: jobOrder.contactId,
						jobOrderId: jobOrder.id,
						createdByUserId: actingUser.id
					},
					include: {
						contact: {
							select: {
								id: true,
								recordId: true,
								firstName: true,
								lastName: true,
								email: true,
								title: true
							}
						}
					}
				});

		if (existing) {
			await logUpdate({
				actorUserId: actingUser.id,
				entityType: 'CLIENT_PORTAL_ACCESS',
				before: existing,
				after: access,
				summary: `Reactivated client portal for ${jobOrder.title}`
			});
		} else {
			await logCreate({
				actorUserId: actingUser.id,
				entityType: 'CLIENT_PORTAL_ACCESS',
				entity: access,
				summary: `Created client portal for ${jobOrder.title}`
			});
		}

		return NextResponse.json({
			access: buildClientPortalInternalSummary({ req, portalAccess: access })
		});
	} catch (error) {
		return handleError(error, 'Failed to create client portal link.');
	}
}

async function patchJob_orders_id_client_portalHandler(req, { params }) {
	try {
		const awaitedParams = await params;
		const id = parseRouteId(awaitedParams);
		const { actingUser, jobOrder } = await loadScopedJobOrder(req, id);
		const existing = await loadPortalAccess(jobOrder);
		if (!existing) {
			return NextResponse.json({ error: 'Client portal link not found.' }, { status: 404 });
		}

		const body = await parseJsonBody(req);
		const action = String(body.action || '').trim().toLowerCase();
		if (!['revoke', 'restore', 'send'].includes(action)) {
			return NextResponse.json({ error: 'Unsupported client portal action.' }, { status: 400 });
		}

		if (action === 'send') {
			const contactEmail = String(existing.contact?.email || '').trim().toLowerCase();
			if (!isValidEmailAddress(contactEmail)) {
				return NextResponse.json(
					{ error: 'The assigned client contact must have a valid email address before you can send the portal link.' },
					{ status: 400 }
				);
			}

			if (existing.isRevoked) {
				return NextResponse.json({ error: 'Restore the client portal before sending the link.' }, { status: 400 });
			}

			const accessSummary = buildClientPortalInternalSummary({ req, portalAccess: existing });
			const branding = await getSystemBranding();
			const contactName = `${existing.contact?.firstName || ''} ${existing.contact?.lastName || ''}`.trim() || 'there';
			const email = buildClientPortalInviteEmail({
				siteName: branding.siteName,
				jobOrderTitle: jobOrder.title,
				clientName: jobOrder.client?.name || '',
				contactName,
				portalUrl: accessSummary.portalUrl
			});
			const delivery = await sendEmailMessage({
				to: contactEmail,
				subject: email.subject,
				text: email.text,
				html: email.html
			});
			if (!delivery.sent) {
				return NextResponse.json(
					{ error: delivery.reason || 'Failed to send client portal email.' },
					{ status: 400 }
				);
			}

			const updatedAccess = await prisma.clientPortalAccess.update({
				where: { id: existing.id },
				data: {
					lastEmailedAt: new Date()
				},
				include: {
					contact: {
						select: {
							id: true,
							recordId: true,
							firstName: true,
							lastName: true,
							email: true,
							title: true
						}
					}
				}
			});

			await logUpdate({
				actorUserId: actingUser.id,
				entityType: 'CLIENT_PORTAL_ACCESS',
				before: existing,
				after: updatedAccess,
				summary: `Emailed client portal link for ${jobOrder.title}`
			});

			return NextResponse.json({
				access: buildClientPortalInternalSummary({ req, portalAccess: updatedAccess }),
				sent: true,
				deliveredTo: delivery.deliveredTo || [],
				testMode: Boolean(delivery.testMode)
			});
		}

		const access = await prisma.clientPortalAccess.update({
			where: { id: existing.id },
			data: {
				isRevoked: action === 'revoke'
			},
			include: {
				contact: {
					select: {
						id: true,
						recordId: true,
						firstName: true,
						lastName: true,
						email: true,
						title: true
					}
				}
			}
		});

		await logUpdate({
			actorUserId: actingUser.id,
			entityType: 'CLIENT_PORTAL_ACCESS',
			before: existing,
			after: access,
			summary: `${action === 'revoke' ? 'Revoked' : 'Restored'} client portal for ${jobOrder.title}`
		});

		return NextResponse.json({
			access: buildClientPortalInternalSummary({ req, portalAccess: access })
		});
	} catch (error) {
		return handleError(error, 'Failed to update client portal link.');
	}
}

export const GET = withApiLogging('job_orders.id.client_portal.get', getJob_orders_id_client_portalHandler);
export const POST = withApiLogging('job_orders.id.client_portal.post', postJob_orders_id_client_portalHandler);
export const PATCH = withApiLogging('job_orders.id.client_portal.patch', patchJob_orders_id_client_portalHandler);
