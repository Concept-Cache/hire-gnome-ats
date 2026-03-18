CREATE TABLE `ClientPortalAccess` (
	`id` INTEGER NOT NULL AUTO_INCREMENT,
	`recordId` VARCHAR(191) NOT NULL,
	`contactId` INTEGER NOT NULL,
	`jobOrderId` INTEGER NOT NULL,
	`createdByUserId` INTEGER NULL,
	`isRevoked` BOOLEAN NOT NULL DEFAULT false,
	`lastViewedAt` DATETIME(3) NULL,
	`lastActionAt` DATETIME(3) NULL,
	`createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updatedAt` DATETIME(3) NOT NULL,

	UNIQUE INDEX `ClientPortalAccess_recordId_key`(`recordId`),
	UNIQUE INDEX `ClientPortalAccess_contactId_jobOrderId_key`(`contactId`, `jobOrderId`),
	INDEX `ClientPortalAccess_jobOrderId_idx`(`jobOrderId`),
	INDEX `ClientPortalAccess_createdByUserId_idx`(`createdByUserId`),
	INDEX `ClientPortalAccess_isRevoked_idx`(`isRevoked`),
	PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ClientSubmissionFeedback` (
	`id` INTEGER NOT NULL AUTO_INCREMENT,
	`recordId` VARCHAR(191) NOT NULL,
	`submissionId` INTEGER NOT NULL,
	`portalAccessId` INTEGER NOT NULL,
	`actionType` VARCHAR(191) NOT NULL,
	`comment` LONGTEXT NULL,
	`statusApplied` VARCHAR(191) NULL,
	`clientNameSnapshot` VARCHAR(191) NULL,
	`clientEmailSnapshot` VARCHAR(191) NULL,
	`ipAddress` VARCHAR(191) NULL,
	`userAgent` VARCHAR(191) NULL,
	`createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updatedAt` DATETIME(3) NOT NULL,

	UNIQUE INDEX `ClientSubmissionFeedback_recordId_key`(`recordId`),
	INDEX `ClientSubmissionFeedback_submissionId_createdAt_idx`(`submissionId`, `createdAt`),
	INDEX `ClientSubmissionFeedback_portalAccessId_createdAt_idx`(`portalAccessId`, `createdAt`),
	INDEX `ClientSubmissionFeedback_actionType_idx`(`actionType`),
	PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ClientPortalAccess`
	ADD CONSTRAINT `ClientPortalAccess_contactId_fkey`
	FOREIGN KEY (`contactId`) REFERENCES `Contact`(`id`)
	ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ClientPortalAccess`
	ADD CONSTRAINT `ClientPortalAccess_jobOrderId_fkey`
	FOREIGN KEY (`jobOrderId`) REFERENCES `JobOrder`(`id`)
	ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ClientPortalAccess`
	ADD CONSTRAINT `ClientPortalAccess_createdByUserId_fkey`
	FOREIGN KEY (`createdByUserId`) REFERENCES `User`(`id`)
	ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `ClientSubmissionFeedback`
	ADD CONSTRAINT `ClientSubmissionFeedback_submissionId_fkey`
	FOREIGN KEY (`submissionId`) REFERENCES `Submission`(`id`)
	ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ClientSubmissionFeedback`
	ADD CONSTRAINT `ClientSubmissionFeedback_portalAccessId_fkey`
	FOREIGN KEY (`portalAccessId`) REFERENCES `ClientPortalAccess`(`id`)
	ON DELETE CASCADE ON UPDATE CASCADE;
