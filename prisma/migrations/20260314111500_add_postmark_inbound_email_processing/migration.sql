ALTER TABLE `CandidateNote`
	ADD COLUMN `noteType` VARCHAR(191) NOT NULL DEFAULT 'manual';

ALTER TABLE `ContactNote`
	ADD COLUMN `noteType` VARCHAR(191) NOT NULL DEFAULT 'manual';

CREATE TABLE `InboundEmailEvent` (
	`id` INTEGER NOT NULL AUTO_INCREMENT,
	`recordId` VARCHAR(191) NOT NULL,
	`provider` VARCHAR(191) NOT NULL DEFAULT 'postmark',
	`externalMessageId` VARCHAR(191) NOT NULL,
	`status` VARCHAR(191) NOT NULL DEFAULT 'processed',
	`subject` VARCHAR(191) NULL,
	`fromEmail` VARCHAR(191) NULL,
	`matchedCandidates` INTEGER NOT NULL DEFAULT 0,
	`matchedContacts` INTEGER NOT NULL DEFAULT 0,
	`notesCreated` INTEGER NOT NULL DEFAULT 0,
	`attachmentsSaved` INTEGER NOT NULL DEFAULT 0,
	`payload` JSON NULL,
	`createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updatedAt` DATETIME(3) NOT NULL,

	UNIQUE INDEX `InboundEmailEvent_recordId_key`(`recordId`),
	UNIQUE INDEX `InboundEmailEvent_provider_externalMessageId_key`(`provider`, `externalMessageId`),
	INDEX `InboundEmailEvent_status_idx`(`status`),
	PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
