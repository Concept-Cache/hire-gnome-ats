#!/usr/bin/env node

require('./load-env.cjs');

const { PrismaClient } = require('@prisma/client');
const crypto = require('node:crypto');
const { SKILLS_TO_SEED } = require('./seed-skills');

const RECORD_ID_PREFIX_BY_MODEL = Object.freeze({
	Division: 'DIV',
	User: 'USR',
	AuditLog: 'AUD',
	BillingSeatSyncEvent: 'BIL',
	Candidate: 'CAN',
	Skill: 'SKL',
	CandidateNote: 'CNO',
	CandidateActivity: 'CAT',
	CandidateEducation: 'CED',
	CandidateWorkExperience: 'CWR',
	CandidateAttachment: 'CAF',
	Client: 'CLI',
	Contact: 'CON',
	ClientNote: 'CLN',
	ContactNote: 'CTN',
	JobOrder: 'JOB',
	Submission: 'SUB',
	Interview: 'INT',
	Offer: 'PLC'
});

const RECORD_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const RECORD_ID_RANDOM_LENGTH = 8;

function randomRecordIdToken() {
	let token = '';
	for (let index = 0; index < RECORD_ID_RANDOM_LENGTH; index += 1) {
		token += RECORD_ID_ALPHABET[crypto.randomInt(0, RECORD_ID_ALPHABET.length)];
	}
	return token;
}

function withRecordId(data, modelName) {
	if (!data || typeof data !== 'object') return data;
	if (Array.isArray(data)) {
		return data.map((item) => withRecordId(item, modelName));
	}
	if (data.recordId) return data;

	const prefix = RECORD_ID_PREFIX_BY_MODEL[modelName];
	if (!prefix) return data;
	return {
		...data,
		recordId: `${prefix}-${randomRecordIdToken()}`
	};
}

const prisma = new PrismaClient().$extends({
	query: {
		$allModels: {
			async create({ model, args, query }) {
				return query({
					...args,
					data: withRecordId(args && args.data, model)
				});
			},
			async createMany({ model, args, query }) {
				return query({
					...args,
					data: withRecordId(args && args.data, model)
				});
			},
			async upsert({ model, args, query }) {
				return query({
					...args,
					create: withRecordId(args && args.create, model)
				});
			}
		}
	}
});

const PERSON_EMAIL_DOMAIN = 'demoats.com';
const DIVISION_PREFIX = 'HG Seed - ';
const DEFAULT_LOGIN_PASSWORD = String(process.env.AUTH_DEFAULT_PASSWORD || 'Welcome123!').trim() || 'Welcome123!';

const SOURCE_OPTIONS = [
	'CareerBuilder',
	'Facebook',
	'Glassdoor',
	'Indeed',
	'Job Fair/Tradeshow',
	'LinkedIn',
	'Monster',
	'Networking',
	'Other',
	'Previously Placed',
	'Professional Association',
	'Referral',
	'The Ladders'
];

const INDUSTRY_OPTIONS = [
	'Technology',
	'Financial Services',
	'Healthcare',
	'Professional Services',
	'Manufacturing',
	'Telecommunications',
	'Logistics',
	'Energy'
];
const CLIENT_STATUSES = ['Prospect', 'Active', 'Active + Verified', 'Inactive'];

const CANDIDATE_STATUSES = ['new', 'in_review', 'qualified', 'submitted', 'interview', 'offered'];
const JOB_STATUSES = ['open', 'on_hold', 'open'];
const SUBMISSION_STATUSES = ['submitted', 'under_review', 'qualified', 'interview', 'offered'];
const INTERVIEW_STATUSES = ['scheduled', 'completed'];
const INTERVIEW_TYPES = ['phone', 'video', 'in_person'];
const EMPLOYMENT_TYPES = ['Permanent', 'Temporary - W2', 'Temporary - 1099'];

const DIVISIONS_TO_SEED = [
	{ name: `${DIVISION_PREFIX}Technology`, accessMode: 'COLLABORATIVE' },
	{ name: `${DIVISION_PREFIX}Healthcare`, accessMode: 'OWNER_ONLY' },
	{ name: `${DIVISION_PREFIX}Finance & Operations`, accessMode: 'COLLABORATIVE' }
];

const HEALTHCARE_DIVISION_INDEX = 1;
const CLIENT_DIVISION_SEQUENCE = [1, 0, 2, 1, 0, 1, 2, 1];
const CANDIDATE_DIVISION_SEQUENCE = [1, 0, 2, 1, 0, 1, 2, 0, 1, 2];
const JOB_DIVISION_SEQUENCE = [1, 0, 2, 1, 0, 1, 2, 1, 0, 2];

const USERS_TO_SEED = [
	{ firstName: 'Alicia', lastName: 'Morgan', role: 'ADMINISTRATOR', divisionIndex: 0 },
	{ firstName: 'Derek', lastName: 'Mills', role: 'DIRECTOR', divisionIndex: 0 },
	{ firstName: 'Priya', lastName: 'Shah', role: 'RECRUITER', divisionIndex: 0 },
	{ firstName: 'Noah', lastName: 'Bennett', role: 'RECRUITER', divisionIndex: 0 },
	{ firstName: 'Monica', lastName: 'Ruiz', role: 'DIRECTOR', divisionIndex: 1 },
	{ firstName: 'Ethan', lastName: 'Park', role: 'RECRUITER', divisionIndex: 1 },
	{ firstName: 'Lena', lastName: 'Foster', role: 'RECRUITER', divisionIndex: 1 },
	{ firstName: 'Victor', lastName: 'Nguyen', role: 'DIRECTOR', divisionIndex: 2 },
	{ firstName: 'Sofia', lastName: 'Klein', role: 'RECRUITER', divisionIndex: 2 },
	{ firstName: 'Marcus', lastName: 'Reed', role: 'RECRUITER', divisionIndex: 2 }
];

const CLIENTS_TO_SEED = [
	{ name: 'Northstar Health Systems', website: 'https://www.northstarhealthsystems.com', industry: 'Healthcare' },
	{ name: 'LedgerPeak Financial Group', website: 'https://www.ledgerpeakfinancial.com', industry: 'Financial Services' },
	{ name: 'Atlas Industrial Group', website: 'https://www.atlasindustrialgroup.com', industry: 'Manufacturing' },
	{ name: 'Helix BioLabs', website: 'https://www.helixbiolabs.com', industry: 'Healthcare' },
	{ name: 'Meridian Logistics', website: 'https://www.meridianlogistics.com', industry: 'Logistics' },
	{ name: 'Summit Legal Partners', website: 'https://www.summitlegalpartners.com', industry: 'Professional Services' },
	{ name: 'HarborView Energy', website: 'https://www.harborviewenergy.com', industry: 'Energy' },
	{ name: 'Pioneer Insurance Group', website: 'https://www.pioneerinsurancegroup.com', industry: 'Financial Services' },
	{ name: 'ClearPath Cloud', website: 'https://www.clearpathcloud.com', industry: 'Technology' },
	{ name: 'Stonebridge Manufacturing', website: 'https://www.stonebridgemfg.com', industry: 'Manufacturing' },
	{ name: 'Cedar Ridge Medical', website: 'https://www.cedarridgemedical.com', industry: 'Healthcare' },
	{ name: 'Brightline Telecom', website: 'https://www.brightlinetelecom.com', industry: 'Telecommunications' },
	{ name: 'Redwood Care Partners', website: 'https://www.redwoodcarepartners.com', industry: 'Healthcare' },
	{ name: 'Silverline Clinical Consulting', website: 'https://www.silverlineclinical.com', industry: 'Healthcare' },
	{ name: 'VenturePoint Capital', website: 'https://www.venturepointcapital.com', industry: 'Financial Services' },
	{ name: 'Oakwell Care Management', website: 'https://www.oakwellcare.com', industry: 'Healthcare' },
	{ name: 'Beacon Data Solutions', website: 'https://www.beacondatasolutions.com', industry: 'Technology' },
	{ name: 'Mosaic Care Network', website: 'https://www.mosaiccarenetwork.com', industry: 'Healthcare' }
];

const CONTACT_FIRST_NAMES = [
	'Emily',
	'Daniel',
	'Olivia',
	'Michael',
	'Lauren',
	'Ryan',
	'Tessa',
	'Jonathan',
	'Grace',
	'Henry',
	'Nicole',
	'Adam',
	'Katherine',
	'Benjamin',
	'Rachel',
	'Thomas',
	'Megan',
	'Kevin'
];

const CONTACT_LAST_NAMES = [
	'Carter',
	'Sullivan',
	'Brooks',
	'Price',
	'Hayes',
	'Porter',
	'Bishop',
	'Grant',
	'Fisher',
	'Powell',
	'Hughes',
	'Murphy',
	'Coleman',
	'Watkins',
	'Baxter',
	'Stevens',
	'Ross',
	'Mason'
];

const CONTACT_TITLES = [
	'Hiring Manager',
	'Talent Acquisition Manager',
	'HR Business Partner',
	'Director of Talent',
	'Department Manager'
];

const CONTACT_DEPARTMENTS = [
	'Engineering',
	'Operations',
	'Finance',
	'Clinical',
	'People Operations'
];

const CANDIDATE_FIRST_NAMES = [
	'Emma',
	'Liam',
	'Ava',
	'James',
	'Sophia',
	'Benjamin',
	'Isabella',
	'Lucas',
	'Mia',
	'Mason',
	'Amelia',
	'Elijah',
	'Charlotte',
	'Logan',
	'Harper',
	'Alexander',
	'Evelyn',
	'Jackson',
	'Abigail',
	'Sebastian',
	'Ella',
	'Carter',
	'Elizabeth',
	'Wyatt'
];

const CANDIDATE_LAST_NAMES = [
	'Parker',
	'Turner',
	'Edwards',
	'Cook',
	'Bailey',
	'Rivera',
	'Cooper',
	'Richardson',
	'Cox',
	'Howard',
	'Ward',
	'Torres',
	'Peterson',
	'Gray',
	'Ramirez',
	'James',
	'Watson',
	'Brooks',
	'Kelly',
	'Sanders',
	'Price',
	'Bennett',
	'Wood',
	'Barnes'
];

const CANDIDATE_TITLE_OPTIONS = [
	'Senior Software Engineer',
	'Cloud Platform Engineer',
	'Data Engineer',
	'Product Manager',
	'Project Manager',
	'Business Analyst',
	'Controller',
	'Staff Accountant',
	'FP&A Analyst',
	'Clinical Operations Manager',
	'Clinical Systems Analyst',
	'Revenue Cycle Analyst',
	'Healthcare Project Manager',
	'Nurse Case Manager',
	'Quality Assurance Lead',
	'Security Engineer'
];

const EMPLOYER_OPTIONS = [
	'Blue Ridge Systems',
	'Quantum Ledger',
	'Acadia Health Partners',
	'Riverline Logistics',
	'Titan Manufacturing',
	'Elevate Advisory Group',
	'BrightPath Telecom',
	'Coreline Energy',
	'Merit Financial Services',
	'Crestview Medical'
];

const JOB_ORDER_TITLES = [
	'Senior Backend Engineer',
	'Cloud Infrastructure Engineer',
	'Data Warehouse Engineer',
	'Technical Project Manager',
	'Product Owner',
	'Senior Financial Analyst',
	'Accounting Manager',
	'Clinical Systems Analyst',
	'Nurse Case Manager',
	'Medical Billing Specialist',
	'EHR Integration Analyst',
	'Security Operations Engineer',
	'QA Automation Engineer',
	'IT Support Manager',
	'Compliance Analyst',
	'Network Engineer',
	'Implementation Consultant'
];

const JOB_LOCATIONS = [
	'Remote',
	'Hybrid - Austin, TX',
	'Hybrid - Chicago, IL',
	'On-site - Denver, CO',
	'Hybrid - Atlanta, GA',
	'On-site - Charlotte, NC',
	'Hybrid - Nashville, TN',
	'Remote'
];

const MARKET_LOCATIONS = [
	{ city: 'Austin', state: 'TX', zipCode: '78701' },
	{ city: 'Dallas', state: 'TX', zipCode: '75201' },
	{ city: 'Denver', state: 'CO', zipCode: '80202' },
	{ city: 'Chicago', state: 'IL', zipCode: '60601' },
	{ city: 'Atlanta', state: 'GA', zipCode: '30303' },
	{ city: 'Nashville', state: 'TN', zipCode: '37201' },
	{ city: 'Phoenix', state: 'AZ', zipCode: '85004' },
	{ city: 'Raleigh', state: 'NC', zipCode: '27601' }
];

function pick(list, index) {
	return list[index % list.length];
}

function slug(value) {
	return String(value || '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/(^-|-$)/g, '');
}

function makeEmail(kind, _firstName, _lastName, index) {
	return `${kind}${index + 1}@${PERSON_EMAIL_DOMAIN}`;
}

function buildSeedUserEmail(userSeed, index, state) {
	if (userSeed?.role === 'ADMINISTRATOR' && !state.adminAssigned) {
		state.adminAssigned = true;
		return `admin@${PERSON_EMAIL_DOMAIN}`;
	}
	if (userSeed?.role === 'RECRUITER' && !state.recruiterAssigned) {
		state.recruiterAssigned = true;
		return `recruiter@${PERSON_EMAIL_DOMAIN}`;
	}
	return makeEmail('user', userSeed?.firstName, userSeed?.lastName, index);
}

function phoneFrom(index) {
	const base = 2000000 + index;
	const str = String(base).padStart(7, '0');
	return `(555) ${str.slice(0, 3)}-${str.slice(3)}`;
}

function dateDaysFromToday(offset, hour = 10, minute = 0) {
	const d = new Date();
	d.setHours(hour, minute, 0, 0);
	d.setDate(d.getDate() + offset);
	return d;
}

function addMinutes(date, minutes) {
	return new Date(date.getTime() + minutes * 60 * 1000);
}

function dateYearsAgo(years, month = 0) {
	const d = new Date();
	d.setMonth(month, 1);
	d.setHours(9, 0, 0, 0);
	d.setFullYear(d.getFullYear() - years);
	return d;
}

async function clearCustomFieldDefinitions() {
	try {
		await prisma.customFieldDefinition.deleteMany({});
	} catch (error) {
		if (error?.code === 'P2021' || error?.code === 'P2022') {
			console.warn('Skipping custom field definition reset: table not found in current schema.');
			return;
		}
		throw error;
	}
}

async function cleanupSeedData() {
	const seedUsers = await prisma.user.findMany({
		where: {
			email: { endsWith: `@${PERSON_EMAIL_DOMAIN}` }
		},
		select: { id: true }
	});
	const seedUserIds = seedUsers.map((user) => user.id);

	const seedDivisions = await prisma.division.findMany({
		where: { name: { startsWith: DIVISION_PREFIX } },
		select: { id: true }
	});
	const seedDivisionIds = seedDivisions.map((division) => division.id);

	const scopedJobOrderFilter = seedDivisionIds.length > 0 ? { divisionId: { in: seedDivisionIds } } : { id: -1 };

	await prisma.offer.deleteMany({
		where: {
			OR: [
				{ candidate: { email: { endsWith: `@${PERSON_EMAIL_DOMAIN}` } } },
				{ jobOrder: scopedJobOrderFilter }
			]
		}
	});

	await prisma.interview.deleteMany({
		where: {
			OR: [
				{ candidate: { email: { endsWith: `@${PERSON_EMAIL_DOMAIN}` } } },
				{ jobOrder: scopedJobOrderFilter }
			]
		}
	});

	await prisma.submission.deleteMany({
		where: {
			OR: [
				{ candidate: { email: { endsWith: `@${PERSON_EMAIL_DOMAIN}` } } },
				{ jobOrder: scopedJobOrderFilter }
			]
		}
	});

	if (seedDivisionIds.length > 0) {
		await prisma.jobOrder.deleteMany({
			where: { divisionId: { in: seedDivisionIds } }
		});
	}

	await prisma.clientNote.deleteMany({
		where: {
			client: seedDivisionIds.length > 0 ? { divisionId: { in: seedDivisionIds } } : { id: -1 }
		}
	});
	await prisma.contactNote.deleteMany({
		where: {
			contact: {
				OR: [
					{ email: { endsWith: `@${PERSON_EMAIL_DOMAIN}` } },
					...(seedDivisionIds.length > 0 ? [{ divisionId: { in: seedDivisionIds } }] : [])
				]
			}
		}
	});
	await prisma.candidateNote.deleteMany({
		where: {
			candidate: {
				OR: [
					{ email: { endsWith: `@${PERSON_EMAIL_DOMAIN}` } },
					...(seedDivisionIds.length > 0 ? [{ divisionId: { in: seedDivisionIds } }] : [])
				]
			}
		}
	});
	await prisma.candidateActivity.deleteMany({
		where: {
			candidate: {
				OR: [
					{ email: { endsWith: `@${PERSON_EMAIL_DOMAIN}` } },
					...(seedDivisionIds.length > 0 ? [{ divisionId: { in: seedDivisionIds } }] : [])
				]
			}
		}
	});
	await prisma.candidateEducation.deleteMany({
		where: {
			candidate: {
				OR: [
					{ email: { endsWith: `@${PERSON_EMAIL_DOMAIN}` } },
					...(seedDivisionIds.length > 0 ? [{ divisionId: { in: seedDivisionIds } }] : [])
				]
			}
		}
	});
	await prisma.candidateWorkExperience.deleteMany({
		where: {
			candidate: {
				OR: [
					{ email: { endsWith: `@${PERSON_EMAIL_DOMAIN}` } },
					...(seedDivisionIds.length > 0 ? [{ divisionId: { in: seedDivisionIds } }] : [])
				]
			}
		}
	});
	await prisma.candidateSkill.deleteMany({
		where: {
			candidate: {
				OR: [
					{ email: { endsWith: `@${PERSON_EMAIL_DOMAIN}` } },
					...(seedDivisionIds.length > 0 ? [{ divisionId: { in: seedDivisionIds } }] : [])
				]
			}
		}
	});
	await prisma.candidateAttachment.deleteMany({
		where: {
			candidate: {
				OR: [
					{ email: { endsWith: `@${PERSON_EMAIL_DOMAIN}` } },
					...(seedDivisionIds.length > 0 ? [{ divisionId: { in: seedDivisionIds } }] : [])
				]
			}
		}
	});

	await prisma.contact.deleteMany({
		where: {
			OR: [
				{ email: { endsWith: `@${PERSON_EMAIL_DOMAIN}` } },
				...(seedDivisionIds.length > 0 ? [{ divisionId: { in: seedDivisionIds } }] : [])
			]
		}
	});
	if (seedDivisionIds.length > 0) {
		await prisma.client.deleteMany({
			where: { divisionId: { in: seedDivisionIds } }
		});
	}
	await prisma.candidate.deleteMany({
		where: {
			OR: [
				{ email: { endsWith: `@${PERSON_EMAIL_DOMAIN}` } },
				...(seedDivisionIds.length > 0 ? [{ divisionId: { in: seedDivisionIds } }] : [])
			]
		}
	});

	if (seedUserIds.length > 0) {
		await prisma.user.deleteMany({
			where: { id: { in: seedUserIds } }
		});
	}

	if (seedDivisionIds.length > 0) {
		await prisma.division.deleteMany({
			where: { id: { in: seedDivisionIds } }
		});
	}

	await clearCustomFieldDefinitions();
}

async function main() {
	console.log('Resetting and seeding realistic demo data...');
	await cleanupSeedData();

	await prisma.skill.createMany({
		data: SKILLS_TO_SEED.map((skill) => ({
			name: skill.name,
			category: skill.category,
			isActive: true
		})),
		skipDuplicates: true
	});

	const allSkills = await prisma.skill.findMany({
		where: { isActive: true },
		orderBy: { id: 'asc' }
	});

	const divisions = [];
	for (const division of DIVISIONS_TO_SEED) {
		const created = await prisma.division.create({ data: division });
		divisions.push(created);
	}

	const users = [];
	const userEmailState = {
		adminAssigned: false,
		recruiterAssigned: false
	};
	for (let i = 0; i < USERS_TO_SEED.length; i += 1) {
		const userSeed = USERS_TO_SEED[i];
		const division = divisions[userSeed.divisionIndex];
		const created = await prisma.user.create({
			data: {
				firstName: userSeed.firstName,
				lastName: userSeed.lastName,
				email: buildSeedUserEmail(userSeed, i, userEmailState),
				role: userSeed.role,
				divisionId: division?.id ?? null,
				isActive: true
			}
		});
		users.push(created);
	}

	const usersByDivision = new Map();
	for (const user of users) {
		const bucket = usersByDivision.get(user.divisionId) || [];
		bucket.push(user);
		usersByDivision.set(user.divisionId, bucket);
	}

	const clients = [];
	for (let i = 0; i < CLIENTS_TO_SEED.length; i += 1) {
		const clientSeed = CLIENTS_TO_SEED[i];
		const divisionIndex =
			clientSeed.industry === 'Healthcare'
				? HEALTHCARE_DIVISION_INDEX
				: CLIENT_DIVISION_SEQUENCE[i % CLIENT_DIVISION_SEQUENCE.length];
		const division = divisions[divisionIndex];
		const divisionUsers = usersByDivision.get(division.id) || [];
		const owner = divisionUsers[i % divisionUsers.length] || null;
		const market = pick(MARKET_LOCATIONS, i);

		const client = await prisma.client.create({
			data: {
				name: clientSeed.name,
				industry: clientSeed.industry || pick(INDUSTRY_OPTIONS, i),
				status: pick(CLIENT_STATUSES, i),
				phone: phoneFrom(90 + i),
				address: `${110 + i} ${pick(['Market', 'Main', 'Broadway', 'Oak', 'Lake'], i)} Street`,
				city: market.city,
				state: market.state,
				zipCode: market.zipCode,
				website: clientSeed.website,
				description: `${clientSeed.name} is a priority account with recurring hiring needs across professional and technical functions.`,
				ownerId: owner?.id ?? null,
				divisionId: division.id
			}
		});
		clients.push(client);

		await prisma.clientNote.create({
			data: {
				clientId: client.id,
				createdByUserId: owner?.id ?? null,
				content: 'Quarterly planning call complete. Hiring roadmap and interview SLAs confirmed.'
			}
		});
	}

	const contacts = [];
	for (let i = 0; i < clients.length; i += 1) {
		const client = clients[i];
		const divisionUsers = usersByDivision.get(client.divisionId) || [];

		for (let j = 0; j < 2; j += 1) {
			const idx = i * 2 + j;
			const firstName = pick(CONTACT_FIRST_NAMES, idx);
			const lastName = pick(CONTACT_LAST_NAMES, idx * 2 + 1);
			const owner = divisionUsers[(idx + 1) % divisionUsers.length] || null;
			const title = pick(CONTACT_TITLES, idx);

			const contact = await prisma.contact.create({
				data: {
					firstName,
					lastName,
					email: makeEmail('contact', firstName, lastName, idx),
					phone: phoneFrom(300 + idx),
					title,
					department: pick(CONTACT_DEPARTMENTS, idx),
					source: pick(SOURCE_OPTIONS, idx + 4),
					linkedinUrl: `https://linkedin.com/in/${slug(firstName)}-${slug(lastName)}-${idx + 1}`,
					ownerId: owner?.id ?? null,
					divisionId: client.divisionId,
					clientId: client.id
				}
			});
			contacts.push(contact);

			await prisma.contactNote.create({
				data: {
					contactId: contact.id,
					createdByUserId: owner?.id ?? null,
					content: `${title} prefers shortlists with compensation expectations and interview availability.`
				}
			});
		}
	}

	const candidates = [];
	for (let i = 0; i < 48; i += 1) {
		const firstName = pick(CANDIDATE_FIRST_NAMES, i);
		const lastName = pick(CANDIDATE_LAST_NAMES, i * 3 + 1);
		const division = divisions[CANDIDATE_DIVISION_SEQUENCE[i % CANDIDATE_DIVISION_SEQUENCE.length]];
		const divisionUsers = usersByDivision.get(division.id) || [];
		const owner = divisionUsers[(i + 2) % divisionUsers.length] || null;
		const market = pick(MARKET_LOCATIONS, i);
		const title = pick(CANDIDATE_TITLE_OPTIONS, i);
		const employer = pick(EMPLOYER_OPTIONS, i + 1);

		const candidate = await prisma.candidate.create({
			data: {
				firstName,
				lastName,
				email: makeEmail('candidate', firstName, lastName, i),
				phone: phoneFrom(700 + i),
				mobile: phoneFrom(1200 + i),
				status: pick(CANDIDATE_STATUSES, i),
				source: pick(SOURCE_OPTIONS, i + 5),
				ownerId: owner?.id ?? null,
				divisionId: division.id,
				currentJobTitle: title,
				currentEmployer: employer,
				city: market.city,
				state: market.state,
				zipCode: market.zipCode,
				website: `https://portfolio.${slug(firstName)}${i + 1}.com`,
				linkedinUrl: `https://linkedin.com/in/${slug(firstName)}-${slug(lastName)}-${i + 1}`,
				skillSet: i % 9 === 0 ? 'Additional niche tooling available on request.' : null,
				summary: `${title} with strong delivery history across cross-functional teams in ${market.city}. Open to hybrid and remote opportunities.`
			}
		});
		candidates.push(candidate);

		const selectedSkills = [
			allSkills[i % allSkills.length],
			allSkills[(i + 2) % allSkills.length],
			allSkills[(i + 6) % allSkills.length],
			allSkills[(i + 11) % allSkills.length]
		].filter(Boolean);

		for (const skill of selectedSkills) {
			await prisma.candidateSkill.create({
				data: {
					candidateId: candidate.id,
					skillId: skill.id
				}
			});
		}

		await prisma.candidateEducation.create({
			data: {
				candidateId: candidate.id,
				schoolName: i % 2 === 0 ? 'State University' : 'Metro College',
				degree: i % 3 === 0 ? 'MBA' : 'Bachelor of Science',
				fieldOfStudy: i % 2 === 0 ? 'Information Systems' : 'Business Administration',
				startDate: dateYearsAgo(10 + (i % 5), 8),
				endDate: dateYearsAgo(6 + (i % 4), 4),
				description: 'Completed coursework with emphasis on analytics and stakeholder communication.'
			}
		});

		await prisma.candidateWorkExperience.create({
			data: {
				candidateId: candidate.id,
				companyName: pick(EMPLOYER_OPTIONS, i + 3),
				title: pick(CANDIDATE_TITLE_OPTIONS, i + 4),
				location: `${market.city}, ${market.state}`,
				startDate: dateYearsAgo(7 + (i % 4), 1),
				endDate: dateYearsAgo(3 + (i % 2), 11),
				description: 'Led delivery initiatives, partnered with client stakeholders, and improved operational metrics.'
			}
		});

		await prisma.candidateWorkExperience.create({
			data: {
				candidateId: candidate.id,
				companyName: employer,
				title,
				location: `${market.city}, ${market.state}`,
				startDate: dateYearsAgo(3 + (i % 2), 0),
				isCurrent: true,
				description: 'Currently leading projects with direct ownership of quality, timelines, and cross-functional communication.'
			}
		});

		await prisma.candidateNote.create({
			data: {
				candidateId: candidate.id,
				createdByUserId: owner?.id ?? null,
				content: 'Initial recruiter conversation complete. Candidate is responsive and open to interview scheduling this week.'
			}
		});

		await prisma.candidateActivity.create({
			data: {
				candidateId: candidate.id,
				type: 'call',
				subject: 'Recruiter Screen',
				description: 'Validated compensation, notice period, and preferred work arrangement.',
				dueAt: dateDaysFromToday((i % 9) + 1, 11),
				status: 'open'
			}
		});
	}

	const jobOrders = [];
	const clientsByDivision = new Map();
	for (const client of clients) {
		const bucket = clientsByDivision.get(client.divisionId) || [];
		bucket.push(client);
		clientsByDivision.set(client.divisionId, bucket);
	}

	for (let i = 0; i < 26; i += 1) {
		const division = divisions[JOB_DIVISION_SEQUENCE[i % JOB_DIVISION_SEQUENCE.length]];
		const divisionClients = clientsByDivision.get(division.id) || [];
		const client = divisionClients[i % divisionClients.length];
		const divisionUsers = usersByDivision.get(client.divisionId) || [];
		const owner = divisionUsers[(i + 1) % divisionUsers.length] || null;
		const relatedContacts = contacts.filter((contact) => contact.clientId === client.id);
		const hiringContact = relatedContacts[i % relatedContacts.length] || null;
		const title = `${pick(JOB_ORDER_TITLES, i)} - ${client.name}`;
		const market = pick(MARKET_LOCATIONS, i);
		const location = `${market.city}, ${market.state}`;
		const publishToCareerSite = i % 3 !== 0;

		const jobOrder = await prisma.jobOrder.create({
			data: {
				title,
				description: `Internal brief: ${title}. Prioritize candidates with strong stakeholder communication, domain familiarity, and stable tenure.`,
				publicDescription: publishToCareerSite
					? `<p><strong>${title}</strong></p><p>Join a high-performing team and deliver measurable outcomes in a fast-paced environment.</p>`
					: null,
				location,
				city: market.city,
				state: market.state,
				zipCode: market.zipCode,
				status: pick(JOB_STATUSES, i),
				employmentType: pick(EMPLOYMENT_TYPES, i),
				openings: (i % 3) + 1,
				salaryMin: 85000 + i * 3500,
				salaryMax: 115000 + i * 3500,
				publishToCareerSite,
				publishedAt: publishToCareerSite ? dateDaysFromToday(-(i % 7) - 1, 8) : null,
				openedAt: dateDaysFromToday(-(i % 14) - 2, 9),
				ownerId: owner?.id ?? null,
				divisionId: client.divisionId,
				clientId: client.id,
				contactId: hiringContact?.id ?? null
			}
		});
		jobOrders.push(jobOrder);
	}

	let submissionCount = 0;
	let interviewCount = 0;
	let placementCount = 0;

	for (let i = 0; i < jobOrders.length; i += 1) {
		const jobOrder = jobOrders[i];
		const divisionUsers = usersByDivision.get(jobOrder.divisionId) || [];
		const createdByUser = divisionUsers[i % divisionUsers.length] || null;
		const divisionCandidates = candidates.filter((candidate) => candidate.divisionId === jobOrder.divisionId);

		const candidatesForJob = [
			divisionCandidates[i % divisionCandidates.length],
			divisionCandidates[(i + 5) % divisionCandidates.length],
			divisionCandidates[(i + 11) % divisionCandidates.length]
		].filter(Boolean);

		for (let j = 0; j < candidatesForJob.length; j += 1) {
			const candidate = candidatesForJob[j];
			const submission = await prisma.submission.create({
				data: {
					candidateId: candidate.id,
					jobOrderId: jobOrder.id,
					status: pick(SUBMISSION_STATUSES, i + j),
					notes: 'Submitted with updated resume, compensation targets, and interview availability.',
					createdByUserId: createdByUser?.id ?? null
				}
			});
			submissionCount += 1;

			if ((i + j) % 2 === 0) {
				const startsAt = dateDaysFromToday((i + j) % 10 + 1, 9 + ((i + j) % 5));
				await prisma.interview.create({
					data: {
						candidateId: candidate.id,
						jobOrderId: jobOrder.id,
						interviewMode: pick(INTERVIEW_TYPES, i + j),
						status: pick(INTERVIEW_STATUSES, i + j),
						subject: `${jobOrder.title} - ${candidate.firstName} ${candidate.lastName}`,
						interviewer: pick(CONTACT_FIRST_NAMES, i + j) + ' ' + pick(CONTACT_LAST_NAMES, i + j),
						interviewerEmail: `interviewer${i + 1}${j + 1}@${PERSON_EMAIL_DOMAIN}`,
						startsAt,
						endsAt: addMinutes(startsAt, pick([30, 45, 60, 90], i + j)),
						location: pick(['Video', 'Phone', 'Client HQ'], i + j)
					}
				});
				interviewCount += 1;
			}

			if ((i + j) % 4 === 0) {
				const isTempPlacement = (i + j) % 2 === 0;
				await prisma.offer.create({
					data: {
						submissionId: submission.id,
						candidateId: candidate.id,
						jobOrderId: jobOrder.id,
						status: 'accepted',
						placementType: isTempPlacement ? 'temp' : 'perm',
						compensationType: isTempPlacement ? 'hourly' : 'salary',
						currency: 'USD',
						hourlyRtBillRate: isTempPlacement ? 98 + (i % 7) : null,
						hourlyRtPayRate: isTempPlacement ? 72 + (i % 5) : null,
						hourlyOtBillRate: isTempPlacement ? 135 + (i % 7) : null,
						hourlyOtPayRate: isTempPlacement ? 96 + (i % 5) : null,
						yearlyCompensation: isTempPlacement ? null : 132000 + i * 1800,
						offeredOn: dateDaysFromToday(-3, 14),
						expectedJoinDate: dateDaysFromToday(14 + (i % 5), 9),
						notes: 'Placement finalized after client panel interviews and compensation alignment.'
					}
				});
				placementCount += 1;
			}
		}
	}

	console.log('Realistic seed completed.');
	console.log(`Divisions: ${divisions.length}`);
	console.log(`Users: ${users.length}`);
	console.log(`Clients: ${clients.length}`);
	console.log(`Contacts: ${contacts.length}`);
	console.log(`Candidates: ${candidates.length}`);
	console.log(`Job Orders: ${jobOrders.length}`);
	console.log(`Submissions: ${submissionCount}`);
	console.log(`Interviews: ${interviewCount}`);
	console.log(`Placements: ${placementCount}`);

	const adminUser = users.find((user) => user.role === 'ADMINISTRATOR');
	const recruiterUser = users.find((user) => user.role === 'RECRUITER');
	if (adminUser) {
		console.log(`Admin login: ${adminUser.email}`);
	}
	if (recruiterUser) {
		console.log(`Recruiter login: ${recruiterUser.email}`);
	}
	console.log(`Login password for seeded users: ${DEFAULT_LOGIN_PASSWORD}`);
}

main()
	.catch((error) => {
		console.error('Realistic seed failed.');
		console.error(error);
		process.exitCode = 1;
	})
	.finally(async () => {
		await prisma.$disconnect();
	});
