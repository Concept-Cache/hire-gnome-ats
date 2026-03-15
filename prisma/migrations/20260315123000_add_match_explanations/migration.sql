CREATE TABLE `MatchExplanation` (
	`id` INT NOT NULL AUTO_INCREMENT,
	`recordId` VARCHAR(191) NOT NULL,
	`whyItMatches` LONGTEXT NOT NULL,
	`potentialGaps` LONGTEXT NOT NULL,
	`whatToValidate` LONGTEXT NOT NULL,
	`recommendedPositioning` LONGTEXT NULL,
	`scorePercent` INT NULL,
	`candidateUpdatedAt` DATETIME(3) NULL,
	`jobOrderUpdatedAt` DATETIME(3) NULL,
	`modelName` VARCHAR(191) NULL,
	`createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updatedAt` DATETIME(3) NOT NULL,
	`candidateId` INT NOT NULL,
	`jobOrderId` INT NOT NULL,
	`generatedByUserId` INT NULL,

	UNIQUE INDEX `MatchExplanation_recordId_key`(`recordId`),
	UNIQUE INDEX `MatchExplanation_candidateId_jobOrderId_key`(`candidateId`, `jobOrderId`),
	INDEX `MatchExplanation_generatedByUserId_idx`(`generatedByUserId`),
	INDEX `MatchExplanation_candidateId_idx`(`candidateId`),
	INDEX `MatchExplanation_jobOrderId_idx`(`jobOrderId`),
	PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `MatchExplanation`
	ADD CONSTRAINT `MatchExplanation_candidateId_fkey`
	FOREIGN KEY (`candidateId`) REFERENCES `Candidate`(`id`)
	ON DELETE CASCADE
	ON UPDATE CASCADE;

ALTER TABLE `MatchExplanation`
	ADD CONSTRAINT `MatchExplanation_jobOrderId_fkey`
	FOREIGN KEY (`jobOrderId`) REFERENCES `JobOrder`(`id`)
	ON DELETE CASCADE
	ON UPDATE CASCADE;

ALTER TABLE `MatchExplanation`
	ADD CONSTRAINT `MatchExplanation_generatedByUserId_fkey`
	FOREIGN KEY (`generatedByUserId`) REFERENCES `User`(`id`)
	ON DELETE SET NULL
	ON UPDATE CASCADE;
