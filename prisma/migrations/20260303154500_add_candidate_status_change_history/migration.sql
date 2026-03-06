CREATE TABLE `CandidateStatusChange` (
	`id` INTEGER NOT NULL AUTO_INCREMENT,
	`recordId` VARCHAR(191) NOT NULL,
	`candidateId` INTEGER NOT NULL,
	`fromStatus` VARCHAR(191) NULL,
	`toStatus` VARCHAR(191) NOT NULL,
	`reason` TEXT NULL,
	`changedByUserId` INTEGER NULL,
	`createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

	UNIQUE INDEX `CandidateStatusChange_recordId_key`(`recordId`),
	INDEX `CandidateStatusChange_candidateId_createdAt_idx`(`candidateId`, `createdAt`),
	INDEX `CandidateStatusChange_changedByUserId_idx`(`changedByUserId`),
	PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `CandidateStatusChange`
	ADD CONSTRAINT `CandidateStatusChange_candidateId_fkey`
	FOREIGN KEY (`candidateId`) REFERENCES `Candidate`(`id`)
	ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `CandidateStatusChange`
	ADD CONSTRAINT `CandidateStatusChange_changedByUserId_fkey`
	FOREIGN KEY (`changedByUserId`) REFERENCES `User`(`id`)
	ON DELETE SET NULL ON UPDATE CASCADE;
