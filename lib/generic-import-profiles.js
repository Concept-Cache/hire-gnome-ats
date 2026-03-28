import { normalizeHeaderKey } from '@/lib/data-import-csv';

const GENERIC_IMPORT_PROFILES = Object.freeze({
	clients: {
		label: 'Clients',
		description: 'Import company/account records from spreadsheets or exported CSV files.',
		fields: [
			{ key: 'id', label: 'Source ID', aliases: ['id', 'clientid', 'companyid', 'accountid'], sample: '1001' },
			{ key: 'externalId', label: 'External ID', aliases: ['externalid', 'legacyid', 'sourceid'], sample: 'client-acme-1' },
			{ key: 'recordId', label: 'Record ID', aliases: ['recordid'], sample: 'CLI-ABC12345' },
			{ key: 'name', label: 'Client Name', required: true, aliases: ['name', 'clientname', 'company', 'companyname', 'accountname'], sample: 'Acme Health Partners' },
			{ key: 'industry', label: 'Industry', aliases: ['industry', 'specialty'], sample: 'Healthcare' },
			{ key: 'status', label: 'Status', aliases: ['status', 'clientstatus', 'accountstatus'], sample: 'Active' },
			{ key: 'phone', label: 'Phone', aliases: ['phone', 'mainphone', 'workphone'], sample: '(555) 410-2200' },
			{ key: 'address', label: 'Address', aliases: ['address', 'street', 'streetaddress', 'billingstreet'], sample: '400 Main Street' },
			{ key: 'city', label: 'City', aliases: ['city', 'billingcity'], sample: 'Dallas' },
			{ key: 'state', label: 'State', aliases: ['state', 'stateprovince', 'billingstate'], sample: 'TX' },
			{ key: 'zipCode', label: 'Zip Code', aliases: ['zip', 'zipcode', 'postalcode', 'billingcode'], sample: '75201' },
			{ key: 'website', label: 'Website', aliases: ['website', 'url'], sample: 'https://acmehealth.example' },
			{ key: 'description', label: 'Description', aliases: ['description', 'notes'], sample: 'Regional healthcare network' }
		]
	},
	contacts: {
		label: 'Contacts',
		description: 'Import client-side hiring contacts and map them to client records.',
		fields: [
			{ key: 'id', label: 'Source ID', aliases: ['id', 'contactid'], sample: '2001' },
			{ key: 'externalId', label: 'External ID', aliases: ['externalid', 'legacyid', 'sourceid'], sample: 'contact-2001' },
			{ key: 'recordId', label: 'Record ID', aliases: ['recordid'], sample: 'CON-ABC12345' },
			{ key: 'firstName', label: 'First Name', aliases: ['firstname', 'first'], sample: 'Jordan' },
			{ key: 'lastName', label: 'Last Name', aliases: ['lastname', 'last'], sample: 'Parker' },
			{ key: 'fullName', label: 'Full Name', aliases: ['fullname', 'name', 'contactname'], sample: 'Jordan Parker' },
			{ key: 'email', label: 'Email', aliases: ['email', 'emailaddress'], sample: 'jordan.parker@acmehealth.example' },
			{ key: 'phone', label: 'Phone / Mobile', aliases: ['phone', 'mobile', 'mobilephone', 'workphone'], sample: '(555) 410-2211' },
			{ key: 'zipCode', label: 'Zip Code', aliases: ['zip', 'zipcode', 'postalcode'], sample: '75201' },
			{ key: 'title', label: 'Title', aliases: ['title', 'jobtitle'], sample: 'Hiring Manager' },
			{ key: 'department', label: 'Department', aliases: ['department'], sample: 'Nursing' },
			{ key: 'linkedinUrl', label: 'LinkedIn URL', aliases: ['linkedin', 'linkedinurl'], sample: 'https://linkedin.com/in/jordanparker' },
			{ key: 'source', label: 'Source', aliases: ['source', 'leadsource'], sample: 'LinkedIn Outreach' },
			{ key: 'address', label: 'Address', aliases: ['address', 'street', 'streetaddress'], sample: '400 Main Street' },
			{ key: 'clientId', label: 'Client Source ID', aliases: ['clientid', 'accountid', 'companyid'], sample: '1001' },
			{ key: 'clientExternalId', label: 'Client External ID', aliases: ['clientexternalid', 'accountexternalid', 'companyexternalid'], sample: 'client-acme-1' },
			{ key: 'clientRecordId', label: 'Client Record ID', aliases: ['clientrecordid', 'accountrecordid', 'companyrecordid'], sample: 'CLI-ABC12345' },
			{ key: 'clientName', label: 'Client Name', aliases: ['clientname', 'accountname', 'company', 'companyname'], sample: 'Acme Health Partners' }
		]
	},
	candidates: {
		label: 'Candidates',
		description: 'Import candidate profiles from exports or recruiter-maintained spreadsheets.',
		fields: [
			{ key: 'id', label: 'Source ID', aliases: ['id', 'candidateid'], sample: '3001' },
			{ key: 'externalId', label: 'External ID', aliases: ['externalid', 'legacyid', 'sourceid'], sample: 'cand-3001' },
			{ key: 'recordId', label: 'Record ID', aliases: ['recordid'], sample: 'CAN-ABC12345' },
			{ key: 'firstName', label: 'First Name', aliases: ['firstname', 'first'], sample: 'Sophia' },
			{ key: 'lastName', label: 'Last Name', aliases: ['lastname', 'last'], sample: 'Gray' },
			{ key: 'fullName', label: 'Full Name', aliases: ['fullname', 'name', 'candidatename'], sample: 'Sophia Gray' },
			{ key: 'email', label: 'Email', required: true, aliases: ['email', 'emailaddress'], sample: 'sophia.gray@example.com' },
			{ key: 'mobile', label: 'Mobile', aliases: ['mobile', 'mobilephone'], sample: '(555) 220-8899' },
			{ key: 'phone', label: 'Phone', aliases: ['phone', 'homephone', 'workphone'], sample: '(555) 220-8800' },
			{ key: 'status', label: 'Status', aliases: ['status', 'candidatestatus', 'pipelinestatus'], sample: 'Qualified' },
			{ key: 'source', label: 'Source', aliases: ['source', 'leadsource'], sample: 'LinkedIn' },
			{ key: 'currentJobTitle', label: 'Current Job Title', aliases: ['currentjobtitle', 'jobtitle', 'title'], sample: 'Nurse Case Manager' },
			{ key: 'currentEmployer', label: 'Current Employer', aliases: ['currentemployer', 'employer', 'company'], sample: 'Helix BioLabs' },
			{ key: 'experienceYears', label: 'Years Experience', aliases: ['yearsexperience', 'experienceyears'], sample: '8' },
			{ key: 'address', label: 'Address', aliases: ['address', 'street', 'streetaddress'], sample: '101 Cedar Avenue' },
			{ key: 'city', label: 'City', aliases: ['city'], sample: 'Austin' },
			{ key: 'state', label: 'State', aliases: ['state', 'stateprovince'], sample: 'TX' },
			{ key: 'zipCode', label: 'Zip Code', aliases: ['zip', 'zipcode', 'postalcode'], sample: '78701' },
			{ key: 'linkedinUrl', label: 'LinkedIn URL', aliases: ['linkedin', 'linkedinurl'], sample: 'https://linkedin.com/in/sophiagray' },
			{ key: 'website', label: 'Website', aliases: ['website', 'portfolio', 'url'], sample: 'https://portfolio.example.com/sophiagray' },
			{ key: 'skillSet', label: 'Skills', aliases: ['skills', 'skillset', 'primaryskills'], sample: 'Case Management; EMR; Patient Education' },
			{ key: 'summary', label: 'Summary', aliases: ['summary', 'resumesummary', 'resumetext', 'notes'], sample: 'Experienced healthcare candidate with strong care coordination background.' }
		]
	},
	jobOrders: {
		label: 'Job Orders',
		description: 'Import open and historical job records with related client/contact references.',
		fields: [
			{ key: 'id', label: 'Source ID', aliases: ['id', 'jobid', 'joborderid', 'jobopeningid'], sample: '4001' },
			{ key: 'externalId', label: 'External ID', aliases: ['externalid', 'legacyid', 'sourceid'], sample: 'job-4001' },
			{ key: 'recordId', label: 'Record ID', aliases: ['recordid'], sample: 'JOB-ABC12345' },
			{ key: 'title', label: 'Title', required: true, aliases: ['title', 'jobtitle', 'postingtitle', 'jobopeningname'], sample: 'Nurse Case Manager' },
			{ key: 'status', label: 'Status', aliases: ['status', 'jobstatus', 'jobopeningstatus'], sample: 'Open' },
			{ key: 'employmentType', label: 'Employment Type', aliases: ['employmenttype', 'jobtype', 'type', 'positiontype'], sample: 'Temporary - W2' },
			{ key: 'currency', label: 'Currency', aliases: ['currency'], sample: 'USD' },
			{ key: 'salaryMin', label: 'Salary Min', aliases: ['salarymin', 'minimumsalary', 'salaryfrom', 'payratemin'], sample: '45' },
			{ key: 'salaryMax', label: 'Salary Max', aliases: ['salarymax', 'maximumsalary', 'salaryto', 'payratemax'], sample: '60' },
			{ key: 'openings', label: 'Openings', aliases: ['openings', 'numberofopenings', 'positions', 'numberofpositions'], sample: '2' },
			{ key: 'description', label: 'Description', aliases: ['description', 'internaldescription', 'jobdescription'], sample: 'Internal notes and requirements for recruiting team.' },
			{ key: 'publicDescription', label: 'Public Description', aliases: ['publicdescription', 'externaldescription', 'careersitedescription'], sample: 'Join a collaborative care team as a Nurse Case Manager.' },
			{ key: 'location', label: 'Location', aliases: ['location', 'address'], sample: 'Client HQ' },
			{ key: 'city', label: 'City', aliases: ['city'], sample: 'Dallas' },
			{ key: 'state', label: 'State', aliases: ['state', 'stateprovince'], sample: 'TX' },
			{ key: 'zipCode', label: 'Zip Code', aliases: ['zip', 'zipcode', 'postalcode'], sample: '75201' },
			{ key: 'publishToCareerSite', label: 'Publish To Career Site', aliases: ['publishtocareersite', 'published', 'ispublished'], sample: 'true' },
			{ key: 'clientId', label: 'Client Source ID', aliases: ['clientid', 'accountid', 'companyid'], sample: '1001' },
			{ key: 'clientExternalId', label: 'Client External ID', aliases: ['clientexternalid', 'accountexternalid', 'companyexternalid'], sample: 'client-acme-1' },
			{ key: 'clientRecordId', label: 'Client Record ID', aliases: ['clientrecordid', 'accountrecordid', 'companyrecordid'], sample: 'CLI-ABC12345' },
			{ key: 'clientName', label: 'Client Name', aliases: ['clientname', 'accountname', 'company', 'companyname'], sample: 'Acme Health Partners' },
			{ key: 'contactId', label: 'Contact Source ID', aliases: ['contactid', 'hiringmanagerid'], sample: '2001' },
			{ key: 'contactExternalId', label: 'Contact External ID', aliases: ['contactexternalid', 'hiringmanagerexternalid'], sample: 'contact-2001' },
			{ key: 'contactRecordId', label: 'Contact Record ID', aliases: ['contactrecordid', 'hiringmanagerrecordid'], sample: 'CON-ABC12345' },
			{ key: 'contactEmail', label: 'Contact Email', aliases: ['contactemail', 'hiringmanageremail'], sample: 'jordan.parker@acmehealth.example' },
			{ key: 'contactName', label: 'Contact Name', aliases: ['contactname', 'hiringmanager'], sample: 'Jordan Parker' }
		]
	},
	submissions: {
		label: 'Submissions',
		description: 'Import recruiter submissions tied to candidates and job orders.',
		fields: [
			{ key: 'id', label: 'Source ID', aliases: ['id', 'submissionid'], sample: '5001' },
			{ key: 'externalId', label: 'External ID', aliases: ['externalid', 'legacyid', 'sourceid'], sample: 'sub-5001' },
			{ key: 'recordId', label: 'Record ID', aliases: ['recordid'], sample: 'SUB-ABC12345' },
			{ key: 'candidateId', label: 'Candidate Source ID', aliases: ['candidateid'], sample: '3001' },
			{ key: 'candidateExternalId', label: 'Candidate External ID', aliases: ['candidateexternalid'], sample: 'cand-3001' },
			{ key: 'candidateRecordId', label: 'Candidate Record ID', aliases: ['candidaterecordid'], sample: 'CAN-ABC12345' },
			{ key: 'candidateEmail', label: 'Candidate Email', aliases: ['candidateemail'], sample: 'sophia.gray@example.com' },
			{ key: 'jobOrderId', label: 'Job Order Source ID', aliases: ['joborderid', 'jobid'], sample: '4001' },
			{ key: 'jobOrderExternalId', label: 'Job Order External ID', aliases: ['joborderexternalid', 'jobexternalid'], sample: 'job-4001' },
			{ key: 'jobOrderRecordId', label: 'Job Order Record ID', aliases: ['joborderrecordid', 'jobrecordid'], sample: 'JOB-ABC12345' },
			{ key: 'jobOrderTitle', label: 'Job Order Title', aliases: ['jobordertitle', 'jobtitle', 'title'], sample: 'Nurse Case Manager' },
			{ key: 'status', label: 'Status', aliases: ['status'], sample: 'submitted' },
			{ key: 'notes', label: 'Notes', aliases: ['notes', 'comment', 'submissionnotes'], sample: 'Submitted with updated resume and availability.' }
		]
	},
	interviews: {
		label: 'Interviews',
		description: 'Import interview records tied to candidates and job orders.',
		fields: [
			{ key: 'id', label: 'Source ID', aliases: ['id', 'interviewid'], sample: '6001' },
			{ key: 'externalId', label: 'External ID', aliases: ['externalid', 'legacyid', 'sourceid'], sample: 'int-6001' },
			{ key: 'recordId', label: 'Record ID', aliases: ['recordid'], sample: 'INT-ABC12345' },
			{ key: 'candidateId', label: 'Candidate Source ID', aliases: ['candidateid'], sample: '3001' },
			{ key: 'candidateExternalId', label: 'Candidate External ID', aliases: ['candidateexternalid'], sample: 'cand-3001' },
			{ key: 'candidateRecordId', label: 'Candidate Record ID', aliases: ['candidaterecordid'], sample: 'CAN-ABC12345' },
			{ key: 'candidateEmail', label: 'Candidate Email', aliases: ['candidateemail'], sample: 'sophia.gray@example.com' },
			{ key: 'jobOrderId', label: 'Job Order Source ID', aliases: ['joborderid', 'jobid'], sample: '4001' },
			{ key: 'jobOrderExternalId', label: 'Job Order External ID', aliases: ['joborderexternalid', 'jobexternalid'], sample: 'job-4001' },
			{ key: 'jobOrderRecordId', label: 'Job Order Record ID', aliases: ['joborderrecordid', 'jobrecordid'], sample: 'JOB-ABC12345' },
			{ key: 'jobOrderTitle', label: 'Job Order Title', aliases: ['jobordertitle', 'jobtitle', 'title'], sample: 'Nurse Case Manager' },
			{ key: 'subject', label: 'Subject', aliases: ['subject'], sample: 'Initial screening' },
			{ key: 'status', label: 'Status', aliases: ['status'], sample: 'scheduled' },
			{ key: 'interviewMode', label: 'Interview Mode', aliases: ['interviewmode', 'type'], sample: 'phone' },
			{ key: 'interviewer', label: 'Interviewer', aliases: ['interviewer'], sample: 'Jordan Parker' },
			{ key: 'interviewerEmail', label: 'Interviewer Email', aliases: ['intervieweremail'], sample: 'jordan.parker@acmehealth.example' },
			{ key: 'startsAt', label: 'Starts At', aliases: ['startsat', 'starttime', 'startdate'], sample: '2026-03-10T14:00:00Z' },
			{ key: 'endsAt', label: 'Ends At', aliases: ['endsat', 'endtime', 'enddate'], sample: '2026-03-10T14:30:00Z' },
			{ key: 'location', label: 'Location', aliases: ['location'], sample: 'Phone' },
			{ key: 'videoLink', label: 'Video Link', aliases: ['videolink', 'meetinglink'], sample: 'https://meet.example.com/abc123' }
		]
	},
	placements: {
		label: 'Placements',
		description: 'Import accepted or historical placements tied to candidates, jobs, and submissions.',
		fields: [
			{ key: 'id', label: 'Source ID', aliases: ['id', 'placementid', 'offerid'], sample: '7001' },
			{ key: 'externalId', label: 'External ID', aliases: ['externalid', 'legacyid', 'sourceid'], sample: 'plc-7001' },
			{ key: 'recordId', label: 'Record ID', aliases: ['recordid'], sample: 'PLC-ABC12345' },
			{ key: 'candidateId', label: 'Candidate Source ID', aliases: ['candidateid'], sample: '3001' },
			{ key: 'candidateExternalId', label: 'Candidate External ID', aliases: ['candidateexternalid'], sample: 'cand-3001' },
			{ key: 'candidateRecordId', label: 'Candidate Record ID', aliases: ['candidaterecordid'], sample: 'CAN-ABC12345' },
			{ key: 'candidateEmail', label: 'Candidate Email', aliases: ['candidateemail'], sample: 'sophia.gray@example.com' },
			{ key: 'jobOrderId', label: 'Job Order Source ID', aliases: ['joborderid', 'jobid'], sample: '4001' },
			{ key: 'jobOrderExternalId', label: 'Job Order External ID', aliases: ['joborderexternalid', 'jobexternalid'], sample: 'job-4001' },
			{ key: 'jobOrderRecordId', label: 'Job Order Record ID', aliases: ['joborderrecordid', 'jobrecordid'], sample: 'JOB-ABC12345' },
			{ key: 'jobOrderTitle', label: 'Job Order Title', aliases: ['jobordertitle', 'jobtitle', 'title'], sample: 'Nurse Case Manager' },
			{ key: 'submissionId', label: 'Submission Source ID', aliases: ['submissionid'], sample: '5001' },
			{ key: 'submissionExternalId', label: 'Submission External ID', aliases: ['submissionexternalid'], sample: 'sub-5001' },
			{ key: 'submissionRecordId', label: 'Submission Record ID', aliases: ['submissionrecordid'], sample: 'SUB-ABC12345' },
			{ key: 'status', label: 'Status', aliases: ['status'], sample: 'accepted' },
			{ key: 'placementType', label: 'Placement Type', aliases: ['placementtype', 'type'], sample: 'temp' },
			{ key: 'compensationType', label: 'Compensation Type', aliases: ['compensationtype', 'ratetype'], sample: 'hourly' },
			{ key: 'currency', label: 'Currency', aliases: ['currency'], sample: 'USD' },
			{ key: 'offeredOn', label: 'Offered On', aliases: ['offeredon', 'offerdate'], sample: '2026-03-11' },
			{ key: 'expectedJoinDate', label: 'Expected Join Date', aliases: ['expectedjoindate', 'startdate'], sample: '2026-03-18' },
			{ key: 'endDate', label: 'End Date', aliases: ['enddate'], sample: '2026-09-18' },
			{ key: 'notes', label: 'Notes', aliases: ['notes'], sample: 'Accepted temp placement.' },
			{ key: 'yearlyCompensation', label: 'Yearly Compensation', aliases: ['yearlycompensation', 'salary'], sample: '175000' },
			{ key: 'hourlyRtBillRate', label: 'RT Bill Rate', aliases: ['hourlyrtbillrate', 'rtbillrate'], sample: '100' },
			{ key: 'hourlyRtPayRate', label: 'RT Pay Rate', aliases: ['hourlyrtpayrate', 'rtpayrate'], sample: '50' },
			{ key: 'hourlyOtBillRate', label: 'OT Bill Rate', aliases: ['hourlyotbillrate', 'otbillrate'], sample: '150' },
			{ key: 'hourlyOtPayRate', label: 'OT Pay Rate', aliases: ['hourlyotpayrate', 'otpayrate'], sample: '75' },
			{ key: 'dailyBillRate', label: 'Daily Bill Rate', aliases: ['dailybillrate'], sample: '800' },
			{ key: 'dailyPayRate', label: 'Daily Pay Rate', aliases: ['dailypayrate'], sample: '500' }
		]
	}
});

export const GENERIC_IMPORT_ENTITY_OPTIONS = Object.freeze(
	Object.entries(GENERIC_IMPORT_PROFILES).map(([value, profile]) => ({
		value,
		label: profile.label
	}))
);

export function getGenericImportProfile(entityKey) {
	return GENERIC_IMPORT_PROFILES[entityKey] || null;
}

export function getGenericImportProfileFields(entityKey) {
	return getGenericImportProfile(entityKey)?.fields || [];
}

export function buildGenericCsvTemplate(entityKey) {
	const profile = getGenericImportProfile(entityKey);
	if (!profile) return null;
	return {
		headers: profile.fields.filter((field) => field.sample).map((field) => field.label),
		sample: profile.fields.filter((field) => field.sample).map((field) => field.sample)
	};
}

export function suggestGenericImportMapping(entityKey, headers) {
	const fields = getGenericImportProfileFields(entityKey);
	const byAlias = new Map();
	for (const field of fields) {
		for (const alias of field.aliases || []) {
			byAlias.set(normalizeHeaderKey(alias), field.key);
		}
		byAlias.set(normalizeHeaderKey(field.label), field.key);
	}

	const mapping = {};
	const usedFieldKeys = new Set();
	for (const header of headers || []) {
		const headerKey = typeof header === 'string' ? normalizeHeaderKey(header) : header?.key;
		if (!headerKey) continue;
		const matchedField = byAlias.get(headerKey);
		if (matchedField && !usedFieldKeys.has(matchedField)) {
			mapping[headerKey] = matchedField;
			usedFieldKeys.add(matchedField);
		}
	}
	return mapping;
}

function pickMappedValue(row, mapping, fieldKey) {
	for (const [headerKey, targetFieldKey] of Object.entries(mapping || {})) {
		if (targetFieldKey !== fieldKey) continue;
		const value = row?.[headerKey];
		if (value != null && String(value).trim() !== '') {
			return String(value).trim();
		}
	}
	return null;
}

function parseFullName(value) {
	const fullName = String(value || '').trim();
	if (!fullName) return { firstName: null, lastName: null };
	const parts = fullName.split(/\s+/).filter(Boolean);
	if (parts.length <= 1) {
		return { firstName: parts[0] || null, lastName: null };
	}
	return { firstName: parts[0] || null, lastName: parts.slice(1).join(' ') || null };
}

export function mapGenericImportRow(entityKey, row, mapping) {
	const mapped = {};
	for (const field of getGenericImportProfileFields(entityKey)) {
		const value = pickMappedValue(row, mapping, field.key);
		if (value != null && value !== '') {
			mapped[field.key] = value;
		}
	}

	if (entityKey === 'contacts' || entityKey === 'candidates') {
		const parsedName = parseFullName(mapped.fullName);
		if (!mapped.firstName && parsedName.firstName) mapped.firstName = parsedName.firstName;
		if (!mapped.lastName && parsedName.lastName) mapped.lastName = parsedName.lastName;
		delete mapped.fullName;
	}

	if (Object.keys(mapped).length <= 0) {
		return null;
	}

	return mapped;
}
