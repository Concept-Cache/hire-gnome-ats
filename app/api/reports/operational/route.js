import { NextResponse } from 'next/server';
import { AccessControlError, getActingUser } from '@/lib/access-control';
import { withApiLogging } from '@/lib/api-logging';
import { getOperationalReportData } from '@/lib/operational-reporting';

function handleError(error) {
	if (error instanceof AccessControlError) {
		return NextResponse.json({ error: error.message }, { status: error.status });
	}

	return NextResponse.json({ error: 'Failed to load operational report.' }, { status: 500 });
}

async function getOperationalReportHandler(req) {
	try {
		const actingUser = await getActingUser(req, { allowFallback: false });
		if (!actingUser) {
			throw new AccessControlError('Authentication required.', 401);
		}

		const data = await getOperationalReportData({
			actingUser,
			startDateInput: req.nextUrl.searchParams.get('startDate'),
			endDateInput: req.nextUrl.searchParams.get('endDate'),
			divisionIdInput: req.nextUrl.searchParams.get('divisionId'),
			ownerIdInput: req.nextUrl.searchParams.get('ownerId')
		});

		return NextResponse.json(data);
	} catch (error) {
		return handleError(error);
	}
}

export const GET = withApiLogging('reports.operational.get', getOperationalReportHandler);
