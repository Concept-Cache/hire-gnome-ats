#!/usr/bin/env node

require('./load-env.cjs');

const mysql = require('mysql2/promise');
const { SKILLS_TO_SEED } = require('./seed-skills');

const PERSON_EMAIL_DOMAIN = 'demoats.com';
const DIVISION_PREFIX = 'HG Demo - ';
const CLIENT_PREFIX = 'HG Demo Client ';

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
	'Telecommunications'
];
const CLIENT_STATUSES = ['Prospect', 'Active', 'Active + Verified', 'Inactive'];
const MARKET_LOCATIONS = [
	{ city: 'Austin', state: 'TX', zipCode: '78701' },
	{ city: 'Denver', state: 'CO', zipCode: '80202' },
	{ city: 'Chicago', state: 'IL', zipCode: '60601' },
	{ city: 'Atlanta', state: 'GA', zipCode: '30303' },
	{ city: 'Nashville', state: 'TN', zipCode: '37201' }
];

const CANDIDATE_STATUSES = ['new', 'in_review', 'qualified', 'submitted', 'interview', 'offered'];
const JOB_STATUSES = ['open', 'on_hold', 'open'];
const SUBMISSION_STATUSES = ['submitted', 'under_review', 'qualified', 'offered'];
const INTERVIEW_TYPES = ['phone', 'video', 'in_person'];
const INTERVIEW_STATUSES = ['scheduled', 'completed'];

function pick(list, index) {
	return list[index % list.length];
}

function phoneFrom(index) {
	const base = 1000000 + index;
	const str = String(base).padStart(7, '0');
	return `(555) ${str.slice(0, 3)}-${str.slice(3)}`;
}

function daysFromToday(offset, hour = 10) {
	const d = new Date();
	d.setHours(hour, 0, 0, 0);
	d.setDate(d.getDate() + offset);
	return d;
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
	return `user${index + 1}@${PERSON_EMAIL_DOMAIN}`;
}

function getConnectionConfig() {
	const dbUrl = process.env.DATABASE_URL || '';
	if (!dbUrl) {
		throw new Error('DATABASE_URL is missing.');
	}

	const parsed = new URL(dbUrl);
	return {
		host: parsed.hostname || 'localhost',
		port: Number(parsed.port || 3306),
		user: decodeURIComponent(parsed.username || 'root'),
		password: decodeURIComponent(parsed.password || ''),
		database: (parsed.pathname || '/ats').replace(/^\//, ''),
		multipleStatements: true
	};
}

async function cleanup(connection) {
	const emailLike = `%@${PERSON_EMAIL_DOMAIN}`;
	const jobLike = 'HG Demo Job Order %';
	const clientLike = `${CLIENT_PREFIX}%`;
	const divisionLike = `${DIVISION_PREFIX}%`;

	await connection.query(
		`DELETE o FROM \`Offer\` o
		 LEFT JOIN \`Candidate\` c ON c.id = o.candidateId
		 LEFT JOIN \`JobOrder\` j ON j.id = o.jobOrderId
		 WHERE c.email LIKE ? OR j.title LIKE ?`,
		[emailLike, jobLike]
	);

	await connection.query(
		`DELETE i FROM \`Interview\` i
		 LEFT JOIN \`Candidate\` c ON c.id = i.candidateId
		 LEFT JOIN \`JobOrder\` j ON j.id = i.jobOrderId
		 WHERE c.email LIKE ? OR j.title LIKE ?`,
		[emailLike, jobLike]
	);

	await connection.query(
		`DELETE s FROM \`Submission\` s
		 LEFT JOIN \`Candidate\` c ON c.id = s.candidateId
		 LEFT JOIN \`JobOrder\` j ON j.id = s.jobOrderId
		 WHERE c.email LIKE ? OR j.title LIKE ?`,
		[emailLike, jobLike]
	);

	await connection.query('DELETE FROM `JobOrder` WHERE title LIKE ?', [jobLike]);
	await connection.query(
		'DELETE cn FROM `ClientNote` cn INNER JOIN `Client` c ON c.id = cn.clientId WHERE c.name LIKE ?',
		[clientLike]
	);
	await connection.query(
		'DELETE ctn FROM `ContactNote` ctn INNER JOIN `Contact` c ON c.id = ctn.contactId WHERE c.email LIKE ?',
		[emailLike]
	);
	await connection.query(
		'DELETE can FROM `CandidateNote` can INNER JOIN `Candidate` c ON c.id = can.candidateId WHERE c.email LIKE ?',
		[emailLike]
	);
	await connection.query(
		'DELETE ca FROM `CandidateActivity` ca INNER JOIN `Candidate` c ON c.id = ca.candidateId WHERE c.email LIKE ?',
		[emailLike]
	);
	await connection.query(
		'DELETE cs FROM `CandidateSkill` cs INNER JOIN `Candidate` c ON c.id = cs.candidateId WHERE c.email LIKE ?',
		[emailLike]
	);
	await connection.query(
		'DELETE ce FROM `CandidateEducation` ce INNER JOIN `Candidate` c ON c.id = ce.candidateId WHERE c.email LIKE ?',
		[emailLike]
	);
	await connection.query(
		'DELETE cw FROM `CandidateWorkExperience` cw INNER JOIN `Candidate` c ON c.id = cw.candidateId WHERE c.email LIKE ?',
		[emailLike]
	);
	await connection.query(
		'DELETE caf FROM `CandidateAttachment` caf INNER JOIN `Candidate` c ON c.id = caf.candidateId WHERE c.email LIKE ?',
		[emailLike]
	);

	await connection.query('DELETE FROM `Contact` WHERE email LIKE ?', [emailLike]);
	await connection.query('DELETE FROM `Client` WHERE name LIKE ?', [clientLike]);
	await connection.query('DELETE FROM `Candidate` WHERE email LIKE ?', [emailLike]);
	await connection.query('DELETE FROM `User` WHERE email LIKE ?', [emailLike]);
	await connection.query('DELETE FROM `Division` WHERE name LIKE ?', [divisionLike]);
}

async function seedSkills(connection) {
	for (let i = 0; i < SKILLS_TO_SEED.length; i += 1) {
		const skill = SKILLS_TO_SEED[i];
		await connection.query(
			'INSERT IGNORE INTO `Skill` (`name`, `category`, `isActive`, `createdAt`, `updatedAt`) VALUES (?, ?, 1, NOW(), NOW())',
			[skill.name, skill.category]
		);
	}

	const [rows] = await connection.query('SELECT id, name FROM `Skill` WHERE isActive = 1 ORDER BY id ASC');
	return rows;
}

async function main() {
	console.log('Seeding linked demo data via mysql2...');
	const connection = await mysql.createConnection(getConnectionConfig());

	try {
		await connection.beginTransaction();
		await cleanup(connection);
		const skills = await seedSkills(connection);

		const divisions = [];
		for (const row of [
			{ name: `${DIVISION_PREFIX}Technology`, accessMode: 'COLLABORATIVE' },
			{ name: `${DIVISION_PREFIX}Professional Services`, accessMode: 'OWNER_ONLY' }
		]) {
			const [result] = await connection.query(
				'INSERT INTO `Division` (`name`, `accessMode`, `createdAt`, `updatedAt`) VALUES (?, ?, NOW(), NOW())',
				[row.name, row.accessMode]
			);
			divisions.push({ id: result.insertId, ...row });
		}

		const usersSeed = [
			{ firstName: 'Alex', lastName: 'Admin', role: 'ADMINISTRATOR', divisionIdx: 0 },
			{ firstName: 'Diane', lastName: 'Director', role: 'DIRECTOR', divisionIdx: 0 },
			{ firstName: 'Riley', lastName: 'Recruiter', role: 'RECRUITER', divisionIdx: 0 },
			{ firstName: 'Sam', lastName: 'Sourcing', role: 'RECRUITER', divisionIdx: 0 },
			{ firstName: 'Pat', lastName: 'Partner', role: 'DIRECTOR', divisionIdx: 1 },
			{ firstName: 'Jordan', lastName: 'Recruiter', role: 'RECRUITER', divisionIdx: 1 },
			{ firstName: 'Taylor', lastName: 'Recruiter', role: 'RECRUITER', divisionIdx: 1 }
		];

		const users = [];
		const userEmailState = {
			adminAssigned: false,
			recruiterAssigned: false
		};
		for (const user of usersSeed) {
			const divisionId = divisions[user.divisionIdx].id;
			const email = buildSeedUserEmail(user, users.length, userEmailState);
			const [result] = await connection.query(
				`INSERT INTO \`User\`
				(\`firstName\`, \`lastName\`, \`email\`, \`role\`, \`divisionId\`, \`isActive\`, \`createdAt\`, \`updatedAt\`)
				VALUES (?, ?, ?, ?, ?, 1, NOW(), NOW())`,
				[user.firstName, user.lastName, email, user.role, divisionId]
			);
			users.push({ id: result.insertId, ...user, divisionId });
		}

		const usersByDivision = new Map();
		for (const user of users) {
			const bucket = usersByDivision.get(user.divisionId) || [];
			bucket.push(user);
			usersByDivision.set(user.divisionId, bucket);
		}

		const clients = [];
		for (let i = 0; i < 10; i += 1) {
			const division = divisions[i % divisions.length];
			const divisionUsers = usersByDivision.get(division.id);
			const owner = divisionUsers[(i + 1) % divisionUsers.length];
			const market = pick(MARKET_LOCATIONS, i);
			const [result] = await connection.query(
				`INSERT INTO \`Client\`
				(\`name\`, \`industry\`, \`status\`, \`phone\`, \`address\`, \`city\`, \`state\`, \`zipCode\`, \`website\`, \`description\`, \`ownerId\`, \`divisionId\`, \`createdAt\`, \`updatedAt\`)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
				[
					`${CLIENT_PREFIX}${i + 1}`,
					pick(INDUSTRY_OPTIONS, i),
					pick(CLIENT_STATUSES, i),
					phoneFrom(90 + i),
					`${110 + i} ${pick(['Market', 'Main', 'Broadway', 'Oak', 'Lake'], i)} Street`,
					market.city,
					market.state,
					market.zipCode,
					`https://client${i + 1}.example.com`,
					`Demo account ${i + 1} for testing.`,
					owner.id,
					division.id
				]
			);
			clients.push({ id: result.insertId, divisionId: division.id, ownerId: owner.id });
		}

		const contacts = [];
		for (let i = 0; i < clients.length; i += 1) {
			const client = clients[i];
			const divisionUsers = usersByDivision.get(client.divisionId);
			for (let j = 0; j < 2; j += 1) {
				const idx = i * 2 + j;
				const owner = divisionUsers[(idx + 2) % divisionUsers.length];
				const [result] = await connection.query(
					`INSERT INTO \`Contact\`
					(\`firstName\`, \`lastName\`, \`email\`, \`phone\`, \`title\`, \`department\`, \`source\`, \`ownerId\`, \`divisionId\`, \`clientId\`, \`createdAt\`, \`updatedAt\`)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
					[
						`Contact${idx + 1}`,
						`Demo${idx + 1}`,
						`contact${idx + 1}@${PERSON_EMAIL_DOMAIN}`,
						phoneFrom(idx + 1),
						j === 0 ? 'Hiring Manager' : 'HR Partner',
						j === 0 ? 'Engineering' : 'People Ops',
						pick(SOURCE_OPTIONS, idx + 1),
						owner.id,
						client.divisionId,
						client.id
					]
				);

				const contactId = result.insertId;
				contacts.push({ id: contactId, clientId: client.id, divisionId: client.divisionId });
				await connection.query(
					'INSERT INTO `ContactNote` (`content`, `contactId`, `createdByUserId`, `createdAt`, `updatedAt`) VALUES (?, ?, ?, NOW(), NOW())',
					['Initial outreach completed.', contactId, owner.id]
				);
			}

			const noteUser = divisionUsers[0];
			await connection.query(
				'INSERT INTO `ClientNote` (`content`, `clientId`, `createdByUserId`, `createdAt`, `updatedAt`) VALUES (?, ?, ?, NOW(), NOW())',
				['Kickoff completed and hiring plan documented.', client.id, noteUser.id]
			);
		}

		const candidates = [];
		for (let i = 0; i < 28; i += 1) {
			const division = divisions[i % divisions.length];
			const divisionUsers = usersByDivision.get(division.id);
			const owner = divisionUsers[(i + 1) % divisionUsers.length];
			const [result] = await connection.query(
				`INSERT INTO \`Candidate\`
				(\`firstName\`, \`lastName\`, \`email\`, \`phone\`, \`mobile\`, \`status\`, \`source\`, \`ownerId\`, \`divisionId\`, \`currentJobTitle\`, \`currentEmployer\`, \`city\`, \`state\`, \`zipCode\`, \`website\`, \`linkedinUrl\`, \`summary\`, \`createdAt\`, \`updatedAt\`)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
				[
					`Candidate${i + 1}`,
					`Demo${i + 1}`,
					`candidate${i + 1}@${PERSON_EMAIL_DOMAIN}`,
					phoneFrom(200 + i),
					phoneFrom(500 + i),
					pick(CANDIDATE_STATUSES, i),
					pick(SOURCE_OPTIONS, i + 1),
					owner.id,
					division.id,
					i % 2 === 0 ? 'Software Engineer' : 'Project Manager',
					`Employer ${i + 1}`,
					i % 2 === 0 ? 'Austin' : 'Denver',
					i % 2 === 0 ? 'TX' : 'CO',
					i % 2 === 0 ? '78701' : '80202',
					`https://candidate${i + 1}.portfolio.example`,
					`https://linkedin.com/in/candidate-demo-${i + 1}`,
					'Demo candidate profile.'
				]
			);
			const candidateId = result.insertId;
			candidates.push({ id: candidateId, divisionId: division.id });

			for (const skill of [skills[i % skills.length], skills[(i + 3) % skills.length], skills[(i + 5) % skills.length]]) {
				await connection.query(
					'INSERT IGNORE INTO `CandidateSkill` (`candidateId`, `skillId`, `createdAt`) VALUES (?, ?, NOW())',
					[candidateId, skill.id]
				);
			}

			await connection.query(
				'INSERT INTO `CandidateNote` (`content`, `candidateId`, `createdByUserId`, `createdAt`, `updatedAt`) VALUES (?, ?, ?, NOW(), NOW())',
				['Intro call completed. Ready for submission.', candidateId, owner.id]
			);
			await connection.query(
				'INSERT INTO `CandidateActivity` (`type`, `subject`, `description`, `dueAt`, `status`, `candidateId`, `createdAt`, `updatedAt`) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())',
				['call', 'Screening Call', 'Initial screening completed.', daysFromToday((i % 6) + 1), 'open', candidateId]
			);
		}

		const jobOrders = [];
		for (let i = 0; i < 14; i += 1) {
			const client = clients[i % clients.length];
			const divisionUsers = usersByDivision.get(client.divisionId);
			const owner = divisionUsers[(i + 2) % divisionUsers.length];
			const clientContacts = contacts.filter((c) => c.clientId === client.id);
			const contact = clientContacts[i % clientContacts.length];
			const market = pick(MARKET_LOCATIONS, i);
			const [result] = await connection.query(
				`INSERT INTO \`JobOrder\`
				(\`title\`, \`description\`, \`publicDescription\`, \`location\`, \`city\`, \`state\`, \`zipCode\`, \`status\`, \`employmentType\`, \`openings\`, \`salaryMin\`, \`salaryMax\`, \`publishToCareerSite\`, \`publishedAt\`, \`ownerId\`, \`divisionId\`, \`clientId\`, \`contactId\`, \`openedAt\`, \`createdAt\`, \`updatedAt\`)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())`,
				[
					`HG Demo Job Order ${i + 1}`,
					`Internal details for demo job ${i + 1}.`,
					i % 2 === 0 ? `<p>Public demo description for job ${i + 1}.</p>` : null,
					`${market.city}, ${market.state}`,
					market.city,
					market.state,
					market.zipCode,
					pick(JOB_STATUSES, i),
					i % 3 === 0 ? 'Permanent' : i % 3 === 1 ? 'Temporary - W2' : 'Temporary - 1099',
					(i % 3) + 1,
					90000 + i * 2500,
					120000 + i * 2500,
					i % 2 === 0 ? 1 : 0,
					i % 2 === 0 ? daysFromToday(-1) : null,
					owner.id,
					client.divisionId,
					client.id,
					contact?.id || null
				]
			);
			jobOrders.push({ id: result.insertId, divisionId: client.divisionId });
		}

		let submissionCount = 0;
		let interviewCount = 0;
		let placementCount = 0;

		for (let i = 0; i < jobOrders.length; i += 1) {
			const job = jobOrders[i];
			const divisionUsers = usersByDivision.get(job.divisionId);
			const creator = divisionUsers[i % divisionUsers.length];
			const candidatesInDivision = candidates.filter((c) => c.divisionId === job.divisionId);
			const picks = [
				candidatesInDivision[i % candidatesInDivision.length],
				candidatesInDivision[(i + 4) % candidatesInDivision.length],
				candidatesInDivision[(i + 8) % candidatesInDivision.length]
			];

			for (let j = 0; j < picks.length; j += 1) {
				const candidate = picks[j];
				const [submissionResult] = await connection.query(
					`INSERT INTO \`Submission\`
					(\`status\`, \`notes\`, \`createdByUserId\`, \`candidateId\`, \`jobOrderId\`, \`createdAt\`, \`updatedAt\`)
					VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
					[pick(SUBMISSION_STATUSES, i + j), 'Demo submission.', creator.id, candidate.id, job.id]
				);
				const submissionId = submissionResult.insertId;
				submissionCount += 1;

				if ((i + j) % 2 === 0) {
					const startsAt = daysFromToday((i + j) % 8, 9);
					const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
					await connection.query(
						`INSERT INTO \`Interview\`
						(\`interviewMode\`, \`status\`, \`subject\`, \`interviewer\`, \`interviewerEmail\`, \`startsAt\`, \`endsAt\`, \`location\`, \`candidateId\`, \`jobOrderId\`, \`createdAt\`, \`updatedAt\`)
						VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
						[
							pick(INTERVIEW_TYPES, i + j),
							pick(INTERVIEW_STATUSES, i + j),
							`Interview - Candidate ${candidate.id}`,
							`Interviewer ${i + j + 1}`,
							`interviewer${i + j + 1}@${PERSON_EMAIL_DOMAIN}`,
							startsAt,
							endsAt,
							(i + j) % 3 === 0 ? 'Video' : 'Client HQ',
							candidate.id,
							job.id
						]
					);
					interviewCount += 1;
				}

				if ((i + j) % 3 === 0) {
					const isTemp = (i + j) % 2 === 0;
					await connection.query(
						`INSERT INTO \`Offer\`
						(\`status\`, \`version\`, \`placementType\`, \`compensationType\`, \`currency\`, \`hourlyRtBillRate\`, \`hourlyRtPayRate\`, \`hourlyOtBillRate\`, \`hourlyOtPayRate\`, \`yearlyCompensation\`, \`offeredOn\`, \`expectedJoinDate\`, \`notes\`, \`submissionId\`, \`candidateId\`, \`jobOrderId\`, \`createdAt\`, \`updatedAt\`)
						VALUES (?, 1, ?, ?, 'USD', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
						[
							'accepted',
							isTemp ? 'temp' : 'perm',
							isTemp ? 'hourly' : 'salary',
							isTemp ? 95 : null,
							isTemp ? 70 : null,
							isTemp ? 125 : null,
							isTemp ? 95 : null,
							isTemp ? null : 145000,
							daysFromToday(-2),
							daysFromToday(14),
							'Demo placement from submission.',
							submissionId,
							candidate.id,
							job.id
						]
					);
					placementCount += 1;
				}
			}
		}

		await connection.commit();
		console.log('Demo seed completed.');
		console.log(`Divisions: ${divisions.length}`);
		console.log(`Users: ${users.length}`);
		console.log(`Clients: ${clients.length}`);
		console.log(`Contacts: ${contacts.length}`);
		console.log(`Candidates: ${candidates.length}`);
		console.log(`Job Orders: ${jobOrders.length}`);
		console.log(`Submissions: ${submissionCount}`);
		console.log(`Interviews: ${interviewCount}`);
		console.log(`Placements: ${placementCount}`);
	} catch (error) {
		await connection.rollback();
		throw error;
	} finally {
		await connection.end();
	}
}

main().catch((error) => {
	console.error('Demo seed failed.');
	console.error(error);
	process.exitCode = 1;
});
