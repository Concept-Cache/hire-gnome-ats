CREATE TABLE `CandidateEducation` (
	`id` INTEGER NOT NULL AUTO_INCREMENT,
	`schoolName` VARCHAR(191) NOT NULL,
	`degree` VARCHAR(191) NULL,
	`fieldOfStudy` VARCHAR(191) NULL,
	`startDate` DATETIME(3) NULL,
	`endDate` DATETIME(3) NULL,
	`isCurrent` BOOLEAN NOT NULL DEFAULT false,
	`description` TEXT NULL,
	`createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updatedAt` DATETIME(3) NOT NULL,
	`candidateId` INTEGER NOT NULL,

	INDEX `CandidateEducation_candidateId_idx`(`candidateId`),
	PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CandidateWorkExperience` (
	`id` INTEGER NOT NULL AUTO_INCREMENT,
	`companyName` VARCHAR(191) NOT NULL,
	`title` VARCHAR(191) NULL,
	`location` VARCHAR(191) NULL,
	`startDate` DATETIME(3) NULL,
	`endDate` DATETIME(3) NULL,
	`isCurrent` BOOLEAN NOT NULL DEFAULT false,
	`description` TEXT NULL,
	`createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updatedAt` DATETIME(3) NOT NULL,
	`candidateId` INTEGER NOT NULL,

	INDEX `CandidateWorkExperience_candidateId_idx`(`candidateId`),
	PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `CandidateEducation`
	ADD CONSTRAINT `CandidateEducation_candidateId_fkey`
	FOREIGN KEY (`candidateId`) REFERENCES `Candidate`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `CandidateWorkExperience`
	ADD CONSTRAINT `CandidateWorkExperience_candidateId_fkey`
	FOREIGN KEY (`candidateId`) REFERENCES `Candidate`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
