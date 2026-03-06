-- AlterTable
ALTER TABLE `Client` ADD COLUMN `description` TEXT NULL,
		ADD COLUMN `owner` VARCHAR(191) NULL,
		ADD COLUMN `source` VARCHAR(191) NULL,
		ADD COLUMN `website` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `Contact` ADD COLUMN `department` VARCHAR(191) NULL,
		ADD COLUMN `linkedinUrl` VARCHAR(191) NULL,
		ADD COLUMN `owner` VARCHAR(191) NULL,
		ADD COLUMN `source` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `JobOrder` ADD COLUMN `employmentType` VARCHAR(191) NULL,
		ADD COLUMN `openings` INTEGER NOT NULL DEFAULT 1,
		ADD COLUMN `publishToCareerSite` BOOLEAN NOT NULL DEFAULT false,
		ADD COLUMN `publishToJobBoards` BOOLEAN NOT NULL DEFAULT false,
		ADD COLUMN `publishedAt` DATETIME(3) NULL,
		ADD COLUMN `salaryMax` DOUBLE NULL,
		ADD COLUMN `salaryMin` DOUBLE NULL,
		ADD COLUMN `statusCategory` VARCHAR(191) NOT NULL DEFAULT 'open';

-- CreateTable
CREATE TABLE `Interview` (
		`id` INTEGER NOT NULL AUTO_INCREMENT,
		`interviewMode` VARCHAR(191) NOT NULL DEFAULT 'formal',
		`status` VARCHAR(191) NOT NULL DEFAULT 'scheduled',
		`subject` VARCHAR(191) NOT NULL,
		`interviewer` VARCHAR(191) NULL,
		`interviewerEmail` VARCHAR(191) NULL,
		`startsAt` DATETIME(3) NULL,
		`endsAt` DATETIME(3) NULL,
		`location` VARCHAR(191) NULL,
		`videoLink` VARCHAR(191) NULL,
		`feedback` TEXT NULL,
		`evaluationScore` DOUBLE NULL,
		`recommendation` VARCHAR(191) NULL,
		`createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
		`updatedAt` DATETIME(3) NOT NULL,
		`candidateId` INTEGER NOT NULL,
		`jobOrderId` INTEGER NOT NULL,

		PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Offer` (
		`id` INTEGER NOT NULL AUTO_INCREMENT,
		`status` VARCHAR(191) NOT NULL DEFAULT 'planned',
		`version` INTEGER NOT NULL DEFAULT 1,
		`currency` VARCHAR(191) NOT NULL DEFAULT 'USD',
		`amount` DOUBLE NULL,
		`payPeriod` VARCHAR(191) NULL,
		`offeredOn` DATETIME(3) NULL,
		`expectedJoinDate` DATETIME(3) NULL,
		`withdrawnReason` VARCHAR(191) NULL,
		`notes` TEXT NULL,
		`createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
		`updatedAt` DATETIME(3) NOT NULL,
		`candidateId` INTEGER NOT NULL,
		`jobOrderId` INTEGER NOT NULL,

		PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Review` (
		`id` INTEGER NOT NULL AUTO_INCREMENT,
		`module` VARCHAR(191) NOT NULL DEFAULT 'general',
		`reviewType` VARCHAR(191) NOT NULL DEFAULT 'interviewer',
		`reviewer` VARCHAR(191) NULL,
		`rating` INTEGER NULL,
		`decision` VARCHAR(191) NULL,
		`comments` TEXT NULL,
		`status` VARCHAR(191) NOT NULL DEFAULT 'open',
		`createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
		`updatedAt` DATETIME(3) NOT NULL,
		`candidateId` INTEGER NULL,
		`jobOrderId` INTEGER NULL,
		`interviewId` INTEGER NULL,
		`offerId` INTEGER NULL,

		PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Interview` ADD CONSTRAINT `Interview_candidateId_fkey` FOREIGN KEY (`candidateId`) REFERENCES `Candidate`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Interview` ADD CONSTRAINT `Interview_jobOrderId_fkey` FOREIGN KEY (`jobOrderId`) REFERENCES `JobOrder`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Offer` ADD CONSTRAINT `Offer_candidateId_fkey` FOREIGN KEY (`candidateId`) REFERENCES `Candidate`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Offer` ADD CONSTRAINT `Offer_jobOrderId_fkey` FOREIGN KEY (`jobOrderId`) REFERENCES `JobOrder`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Review` ADD CONSTRAINT `Review_candidateId_fkey` FOREIGN KEY (`candidateId`) REFERENCES `Candidate`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Review` ADD CONSTRAINT `Review_jobOrderId_fkey` FOREIGN KEY (`jobOrderId`) REFERENCES `JobOrder`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Review` ADD CONSTRAINT `Review_interviewId_fkey` FOREIGN KEY (`interviewId`) REFERENCES `Interview`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Review` ADD CONSTRAINT `Review_offerId_fkey` FOREIGN KEY (`offerId`) REFERENCES `Offer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
