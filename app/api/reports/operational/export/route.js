import ExcelJS from 'exceljs';
import { NextResponse } from 'next/server';
import { AccessControlError, getActingUser } from '@/lib/access-control';
import { withApiLogging } from '@/lib/api-logging';
import { formatDateTimeAt } from '@/lib/date-format';
import { getOperationalReportData, getOperationalReportDetailData } from '@/lib/operational-reporting';

const EXCEL_DATE_TIME_FORMAT = 'm/d/yyyy "@" h:mm AM/PM';

function handleError(error) {
	if (error instanceof AccessControlError) {
		return NextResponse.json({ error: error.message }, { status: error.status });
	}

	return NextResponse.json({ error: 'Failed to export operational report.' }, { status: 500 });
}

function formatFileTimestamp(date = new Date()) {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	const hour = String(date.getHours()).padStart(2, '0');
	const minute = String(date.getMinutes()).padStart(2, '0');
	return `${year}${month}${day}-${hour}${minute}`;
}

function parseDateTimeLabel(value) {
	if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
	const normalized = String(value || '').trim();
	const match = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}) @ (\d{1,2}):(\d{2}) ([AP]M)$/i);
	if (!match) return null;
	const month = Number(match[1]);
	const day = Number(match[2]);
	const year = Number(match[3]);
	let hour = Number(match[4]);
	const minute = Number(match[5]);
	const meridiem = match[6].toUpperCase();
	if (meridiem === 'PM' && hour < 12) hour += 12;
	if (meridiem === 'AM' && hour === 12) hour = 0;
	const date = new Date(year, month - 1, day, hour, minute, 0, 0);
	return Number.isNaN(date.getTime()) ? null : date;
}

function splitMetaLines(meta) {
	return String(meta || '')
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean);
}

function metaValue(meta, label) {
	const normalizedLabel = `${String(label || '').trim()}:`;
	const line = splitMetaLines(meta).find((entry) => entry.startsWith(normalizedLabel));
	if (!line) return '-';
	return line.slice(normalizedLabel.length).trim() || '-';
}

function subtitleParts(subtitle) {
	return String(subtitle || '')
		.split('|')
		.map((part) => part.trim())
		.filter(Boolean);
}

function chipAt(row, index) {
	if (!Array.isArray(row?.chips)) return '-';
	return row.chips[index] || '-';
}

function chipIncludes(row, value) {
	if (!Array.isArray(row?.chips)) return false;
	return row.chips.some((chip) => String(chip || '').trim().toLowerCase() === String(value || '').trim().toLowerCase());
}

function sortByStatusAndPrimary(rows, getStatus, getPrimary) {
	return [...rows].sort((a, b) => {
		const statusCompare = String(getStatus(a) || '').localeCompare(String(getStatus(b) || ''), undefined, {
			sensitivity: 'base'
		});
		if (statusCompare !== 0) return statusCompare;
		return String(getPrimary(a) || '').localeCompare(String(getPrimary(b) || ''), undefined, {
			sensitivity: 'base'
		});
	});
}

function interviewTypeValue(row) {
	if (chipIncludes(row, 'Phone')) return 'Phone';
	if (chipIncludes(row, 'Video')) return 'Video';
	if (chipIncludes(row, 'In Person')) return 'In Person';
	return '-';
}

function interviewStatusValue(row) {
	const chips = Array.isArray(row?.chips) ? row.chips : [];
	const type = interviewTypeValue(row);
	return chips.find((chip) => chip !== type) || '-';
}

function placementEvent(meta) {
	const lines = splitMetaLines(meta);
	if (lines.some((line) => line.startsWith('Accepted:'))) return 'Accepted';
	if (lines.some((line) => line.startsWith('Created:'))) return 'Created';
	if (lines.some((line) => line.startsWith('Updated:'))) return 'Updated';
	return '-';
}

function placementEventDate(meta) {
	return metaValue(meta, placementEvent(meta));
}

function toCandidateSheetRows(detail) {
	const rows = Array.isArray(detail?.rows) ? detail.rows : [];
	if (rows.length === 0) return [{ Notice: 'No records' }];
	return sortByStatusAndPrimary(rows, row => chipAt(row, 0), row => row.title).map((row) => {
		const [jobTitle, company] = subtitleParts(row.subtitle);
		return {
			Name: row.title || '-',
			Title: jobTitle || '-',
			Company: company || '-',
			Owner: metaValue(row.meta, 'Owner'),
			Updated: parseDateTimeLabel(metaValue(row.meta, 'Updated')) || metaValue(row.meta, 'Updated'),
			Status: chipAt(row, 0)
		};
	});
}

function toJobOrderSheetRows(detail) {
	const rows = Array.isArray(detail?.rows) ? detail.rows : [];
	if (rows.length === 0) return [{ Notice: 'No records' }];
	return sortByStatusAndPrimary(rows, row => chipAt(row, 0), row => row.title).map((row) => ({
		Title: row.title || '-',
		Client: row.subtitle || '-',
		Owner: metaValue(row.meta, 'Owner'),
		Updated: parseDateTimeLabel(metaValue(row.meta, 'Updated')) || metaValue(row.meta, 'Updated'),
		Opened: parseDateTimeLabel(metaValue(row.meta, 'Opened')) || metaValue(row.meta, 'Opened'),
		Status: chipAt(row, 0)
	}));
}

function toSubmissionSheetRows(detail) {
	const rows = Array.isArray(detail?.rows) ? detail.rows : [];
	if (rows.length === 0) return [{ Notice: 'No records' }];
	return sortByStatusAndPrimary(rows, row => chipAt(row, 0), row => row.title).map((row) => {
		const [jobOrderTitle, clientName] = subtitleParts(row.subtitle);
		return {
			Candidate: row.title || '-',
			JobOrder: jobOrderTitle || '-',
			Client: clientName || '-',
			SubmittedBy: metaValue(row.meta, 'Submitted By'),
			Updated: parseDateTimeLabel(metaValue(row.meta, 'Updated')) || metaValue(row.meta, 'Updated'),
			Status: chipAt(row, 0)
		};
	});
}

function toInterviewSheetRows(detail) {
	const rows = Array.isArray(detail?.rows) ? detail.rows : [];
	if (rows.length === 0) return [{ Notice: 'No records' }];
	return sortByStatusAndPrimary(rows, row => interviewStatusValue(row), row => row.title).map((row) => {
		const [candidateName, jobOrderTitle, clientName] = subtitleParts(row.subtitle);
		return {
			Subject: row.title || '-',
			Candidate: candidateName || '-',
			JobOrder: jobOrderTitle || '-',
			Client: clientName || '-',
			Scheduled: parseDateTimeLabel(metaValue(row.meta, 'Scheduled')) || metaValue(row.meta, 'Scheduled'),
			Type: interviewTypeValue(row),
			Status: interviewStatusValue(row)
		};
	});
}

function toPlacementSheetRows(detail) {
	const rows = Array.isArray(detail?.rows) ? detail.rows : [];
	if (rows.length === 0) return [{ Notice: 'No records' }];
	return sortByStatusAndPrimary(rows, row => chipAt(row, 0), row => row.title).map((row) => {
		const [jobOrderTitle, clientName] = subtitleParts(row.subtitle);
		return {
			Candidate: row.title || '-',
			JobOrder: jobOrderTitle || '-',
			Client: clientName || '-',
			Event: placementEvent(row.meta),
			EventDate: parseDateTimeLabel(placementEventDate(row.meta)) || placementEventDate(row.meta),
			Status: chipAt(row, 0)
		};
	});
}

function styleHeaderRow(row) {
	row.font = { bold: true };
}

function applyAutoColumnWidths(worksheet) {
	const widths = [];
	worksheet.eachRow({ includeEmpty: true }, (row) => {
		row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
			const rawValue = cell.value;
			let rendered = '';
			if (rawValue instanceof Date) {
				rendered = formatDateTimeAt(rawValue);
			} else if (rawValue && typeof rawValue === 'object' && 'richText' in rawValue) {
				rendered = rawValue.richText.map((item) => item.text).join('');
			} else {
				rendered = String(rawValue ?? '');
			}
			widths[colNumber - 1] = Math.max(widths[colNumber - 1] || 0, rendered.length);
		});
	});
	worksheet.columns.forEach((column, index) => {
		column.width = Math.min(Math.max((widths[index] || 10) + 2, 12), 42);
	});
}

function applyDateNumberFormats(worksheet, headers, dateColumns = []) {
	const dateColumnSet = new Set(dateColumns);
	headers.forEach((header, index) => {
		if (!dateColumnSet.has(header)) return;
		const column = worksheet.getColumn(index + 1);
		column.numFmt = EXCEL_DATE_TIME_FORMAT;
	});
}

function appendObjectSheet(workbook, name, rows, { dateColumns = [] } = {}) {
	const worksheet = workbook.addWorksheet(name);
	if (!Array.isArray(rows) || rows.length === 0) {
		worksheet.addRow(['Notice']);
		worksheet.addRow(['No records']);
		styleHeaderRow(worksheet.getRow(1));
		applyAutoColumnWidths(worksheet);
		return;
	}

	const headers = Object.keys(rows[0]);
	worksheet.columns = headers.map((header) => ({
		header,
		key: header
	}));
	rows.forEach((row) => {
		worksheet.addRow(row);
	});
	styleHeaderRow(worksheet.getRow(1));
	applyDateNumberFormats(worksheet, headers, dateColumns);
	applyAutoColumnWidths(worksheet);
}

function appendSummarySheet(workbook, { report, selectedDivision, selectedOwner }) {
	const worksheet = workbook.addWorksheet('Summary');
	worksheet.addRow(['Operational Reporting Summary']);
	worksheet.addRow([]);
	worksheet.addRow(['Generated At', new Date()]);
	worksheet.addRow(['Start Date', report.appliedFilters.startDate]);
	worksheet.addRow(['End Date', report.appliedFilters.endDate]);
	worksheet.addRow(['Division', selectedDivision?.name || 'All']);
	worksheet.addRow(['Owner', selectedOwner?.name || (report.scope.lockedToOwnData ? 'Current Recruiter' : 'All')]);
	worksheet.addRow([]);
	worksheet.addRow(['Metric', 'Count']);
	worksheet.addRow(['New Candidates', report.summary.candidatesAdded]);
	worksheet.addRow(['New Job Orders', report.summary.jobOrdersOpened]);
	worksheet.addRow(['New Submissions', report.summary.submissionsCreated]);
	worksheet.addRow(['New Interviews', report.summary.interviewsScheduled]);
	worksheet.addRow(['New Placements', report.summary.placementsCreated]);
	worksheet.addRow(['Accepted Placements', report.summary.placementsAccepted]);
	worksheet.addRow(['Open Job Orders', report.summary.openJobOrders]);

	styleHeaderRow(worksheet.getRow(1));
	styleHeaderRow(worksheet.getRow(9));
	worksheet.getCell('B3').numFmt = EXCEL_DATE_TIME_FORMAT;
	applyAutoColumnWidths(worksheet);
}

async function getOperationalReportExportHandler(req) {
	try {
		const actingUser = await getActingUser(req, { allowFallback: false });
		if (!actingUser) {
			throw new AccessControlError('Authentication required.', 401);
		}

		const report = await getOperationalReportData({
			actingUser,
			startDateInput: req.nextUrl.searchParams.get('startDate'),
			endDateInput: req.nextUrl.searchParams.get('endDate'),
			divisionIdInput: req.nextUrl.searchParams.get('divisionId'),
			ownerIdInput: req.nextUrl.searchParams.get('ownerId')
		});
		const detailRequest = {
			actingUser,
			startDateInput: req.nextUrl.searchParams.get('startDate'),
			endDateInput: req.nextUrl.searchParams.get('endDate'),
			divisionIdInput: req.nextUrl.searchParams.get('divisionId'),
			ownerIdInput: req.nextUrl.searchParams.get('ownerId')
		};

		const workbook = new ExcelJS.Workbook();
		workbook.creator = 'Hire Gnome ATS';
		workbook.created = new Date();
		const selectedDivision = report.filterOptions.divisions.find(
			(division) => String(division.id) === String(report.appliedFilters.divisionId || '')
		);
		const selectedOwner = report.filterOptions.owners.find(
			(owner) => String(owner.id) === String(report.appliedFilters.ownerId || '')
		);
		appendSummarySheet(workbook, { report, selectedDivision, selectedOwner });

		const [allCandidatesDetail, allJobOrdersDetail, allSubmissionsDetail, allPlacementsDetail, allInterviewsDetail] =
			await Promise.all([
				getOperationalReportDetailData({ ...detailRequest, group: 'pipeline', key: 'candidates', value: 'all' }),
				getOperationalReportDetailData({ ...detailRequest, group: 'pipeline', key: 'jobOrders', value: 'all' }),
				getOperationalReportDetailData({ ...detailRequest, group: 'pipeline', key: 'submissions', value: 'all' }),
				getOperationalReportDetailData({ ...detailRequest, group: 'pipeline', key: 'placements', value: 'all' }),
				getOperationalReportDetailData({ ...detailRequest, group: 'pipeline', key: 'interviewTypes', value: 'all' })
			]);

		appendObjectSheet(workbook, 'Candidates', toCandidateSheetRows(allCandidatesDetail), {
			dateColumns: ['Updated']
		});
		appendObjectSheet(workbook, 'Job Orders', toJobOrderSheetRows(allJobOrdersDetail), {
			dateColumns: ['Updated', 'Opened']
		});
		appendObjectSheet(workbook, 'Submissions', toSubmissionSheetRows(allSubmissionsDetail), {
			dateColumns: ['Updated']
		});
		appendObjectSheet(workbook, 'Interviews', toInterviewSheetRows(allInterviewsDetail), {
			dateColumns: ['Scheduled']
		});
		appendObjectSheet(workbook, 'Placements', toPlacementSheetRows(allPlacementsDetail), {
			dateColumns: ['EventDate']
		});

		const fileName = `operational-report-${formatFileTimestamp()}.xlsx`;
		const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

		return new NextResponse(buffer, {
			status: 200,
			headers: {
				'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
				'Content-Disposition': `attachment; filename=\"${fileName}\"`,
				'Cache-Control': 'no-store'
			}
		});
	} catch (error) {
		return handleError(error);
	}
}

export const GET = withApiLogging('reports.operational.export.get', getOperationalReportExportHandler);
