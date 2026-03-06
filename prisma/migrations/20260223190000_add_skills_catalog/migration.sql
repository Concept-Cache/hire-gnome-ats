-- Skill catalog and candidate-to-skill assignments
CREATE TABLE `Skill` (
	`id` INTEGER NOT NULL AUTO_INCREMENT,
	`name` VARCHAR(191) NOT NULL,
	`category` VARCHAR(191) NULL,
	`isActive` BOOLEAN NOT NULL DEFAULT true,
	`createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updatedAt` DATETIME(3) NOT NULL,

	UNIQUE INDEX `Skill_name_key`(`name`),
	INDEX `Skill_isActive_idx`(`isActive`),
	PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CandidateSkill` (
	`candidateId` INTEGER NOT NULL,
	`skillId` INTEGER NOT NULL,
	`createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

	INDEX `CandidateSkill_skillId_idx`(`skillId`),
	PRIMARY KEY (`candidateId`, `skillId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `CandidateSkill`
	ADD CONSTRAINT `CandidateSkill_candidateId_fkey`
	FOREIGN KEY (`candidateId`) REFERENCES `Candidate`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `CandidateSkill`
	ADD CONSTRAINT `CandidateSkill_skillId_fkey`
	FOREIGN KEY (`skillId`) REFERENCES `Skill`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO `Skill` (`name`, `category`, `isActive`, `createdAt`, `updatedAt`) VALUES
	('JavaScript', 'Engineering', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
	('TypeScript', 'Engineering', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
	('Node.js', 'Engineering', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
	('React', 'Engineering', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
	('Next.js', 'Engineering', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
	('Python', 'Engineering', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
	('Java', 'Engineering', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
	('C#', 'Engineering', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
	('AWS', 'Cloud', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
	('Azure', 'Cloud', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
	('Google Cloud Platform', 'Cloud', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
	('Docker', 'DevOps', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
	('Kubernetes', 'DevOps', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
	('Terraform', 'DevOps', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
	('MySQL', 'Database', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
	('PostgreSQL', 'Database', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
	('MongoDB', 'Database', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
	('Data Analysis', 'Data', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
	('Machine Learning', 'Data', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
	('Project Management', 'Business', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
	('Product Management', 'Business', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
	('Business Development', 'Sales', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
	('Salesforce', 'Sales', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
	('Recruiting', 'Talent', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
	('Sourcing', 'Talent', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
	('Candidate Screening', 'Talent', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
	('Client Management', 'Client Services', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)),
	('Account Management', 'Client Services', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));
