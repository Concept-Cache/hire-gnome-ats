CREATE TABLE `CandidateAiSummary` (
	`id` INTEGER NOT NULL AUTO_INCREMENT,
	`recordId` VARCHAR(191) NOT NULL,
	`candidateId` INTEGER NOT NULL,
	`overview` TEXT NOT NULL,
	`strengths` JSON NULL,
	`concerns` JSON NULL,
	`suggestedNextStep` TEXT NULL,
	`modelName` VARCHAR(191) NULL,
	`generatedByUserId` INTEGER NULL,
	`createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updatedAt` DATETIME(3) NOT NULL,

	UNIQUE INDEX `CandidateAiSummary_recordId_key`(`recordId`),
	UNIQUE INDEX `CandidateAiSummary_candidateId_key`(`candidateId`),
	INDEX `CandidateAiSummary_generatedByUserId_idx`(`generatedByUserId`),
	PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `CandidateAiSummary`
	ADD CONSTRAINT `CandidateAiSummary_candidateId_fkey`
	FOREIGN KEY (`candidateId`) REFERENCES `Candidate`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `CandidateAiSummary`
	ADD CONSTRAINT `CandidateAiSummary_generatedByUserId_fkey`
	FOREIGN KEY (`generatedByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
