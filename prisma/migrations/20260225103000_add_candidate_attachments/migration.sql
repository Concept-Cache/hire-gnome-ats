CREATE TABLE `CandidateAttachment` (
	`id` INTEGER NOT NULL AUTO_INCREMENT,
	`fileName` VARCHAR(191) NOT NULL,
	`contentType` VARCHAR(191) NULL,
	`sizeBytes` INTEGER NOT NULL,
	`storageProvider` VARCHAR(191) NOT NULL DEFAULT 's3',
	`storageBucket` VARCHAR(191) NOT NULL,
	`storageKey` VARCHAR(191) NOT NULL,
	`candidateId` INTEGER NOT NULL,
	`uploadedByUserId` INTEGER NULL,
	`createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updatedAt` DATETIME(3) NOT NULL,

	UNIQUE INDEX `CandidateAttachment_storageKey_key`(`storageKey`),
	INDEX `CandidateAttachment_candidateId_idx`(`candidateId`),
	INDEX `CandidateAttachment_uploadedByUserId_idx`(`uploadedByUserId`),
	PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `CandidateAttachment`
	ADD CONSTRAINT `CandidateAttachment_candidateId_fkey`
	FOREIGN KEY (`candidateId`) REFERENCES `Candidate`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `CandidateAttachment`
	ADD CONSTRAINT `CandidateAttachment_uploadedByUserId_fkey`
	FOREIGN KEY (`uploadedByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
