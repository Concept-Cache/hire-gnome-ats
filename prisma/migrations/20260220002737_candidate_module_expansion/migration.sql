-- AlterTable
ALTER TABLE `Candidate` ADD COLUMN `city` VARCHAR(191) NULL,
		ADD COLUMN `country` VARCHAR(191) NULL,
		ADD COLUMN `currentEmployer` VARCHAR(191) NULL,
		ADD COLUMN `currentJobTitle` VARCHAR(191) NULL,
		ADD COLUMN `experienceYears` DOUBLE NULL,
		ADD COLUMN `linkedinUrl` VARCHAR(191) NULL,
		ADD COLUMN `mobile` VARCHAR(191) NULL,
		ADD COLUMN `owner` VARCHAR(191) NULL,
		ADD COLUMN `skillSet` VARCHAR(191) NULL,
		ADD COLUMN `source` VARCHAR(191) NULL,
		ADD COLUMN `state` VARCHAR(191) NULL,
		ADD COLUMN `summary` TEXT NULL,
		ADD COLUMN `website` VARCHAR(191) NULL,
		MODIFY `status` VARCHAR(191) NOT NULL DEFAULT 'new';

-- CreateTable
CREATE TABLE `CandidateNote` (
		`id` INTEGER NOT NULL AUTO_INCREMENT,
		`content` TEXT NOT NULL,
		`createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
		`updatedAt` DATETIME(3) NOT NULL,
		`candidateId` INTEGER NOT NULL,

		PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CandidateActivity` (
		`id` INTEGER NOT NULL AUTO_INCREMENT,
		`type` VARCHAR(191) NOT NULL DEFAULT 'call',
		`subject` VARCHAR(191) NOT NULL,
		`description` TEXT NULL,
		`dueAt` DATETIME(3) NULL,
		`status` VARCHAR(191) NOT NULL DEFAULT 'open',
		`createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
		`updatedAt` DATETIME(3) NOT NULL,
		`candidateId` INTEGER NOT NULL,

		PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Submission` (
		`id` INTEGER NOT NULL AUTO_INCREMENT,
		`status` VARCHAR(191) NOT NULL DEFAULT 'submitted',
		`notes` VARCHAR(191) NULL,
		`createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
		`updatedAt` DATETIME(3) NOT NULL,
		`candidateId` INTEGER NOT NULL,
		`jobOrderId` INTEGER NOT NULL,

		UNIQUE INDEX `Submission_candidateId_jobOrderId_key`(`candidateId`, `jobOrderId`),
		PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `CandidateNote` ADD CONSTRAINT `CandidateNote_candidateId_fkey` FOREIGN KEY (`candidateId`) REFERENCES `Candidate`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CandidateActivity` ADD CONSTRAINT `CandidateActivity_candidateId_fkey` FOREIGN KEY (`candidateId`) REFERENCES `Candidate`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Submission` ADD CONSTRAINT `Submission_candidateId_fkey` FOREIGN KEY (`candidateId`) REFERENCES `Candidate`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Submission` ADD CONSTRAINT `Submission_jobOrderId_fkey` FOREIGN KEY (`jobOrderId`) REFERENCES `JobOrder`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
