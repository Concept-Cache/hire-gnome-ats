-- Custom fields foundation for core ATS entities.
ALTER TABLE `Candidate`
	ADD COLUMN `customFields` JSON NULL;

ALTER TABLE `Client`
	ADD COLUMN `customFields` JSON NULL;

ALTER TABLE `Contact`
	ADD COLUMN `customFields` JSON NULL;

ALTER TABLE `JobOrder`
	ADD COLUMN `customFields` JSON NULL;

CREATE TABLE `CustomFieldDefinition` (
	`id` INTEGER NOT NULL AUTO_INCREMENT,
	`recordId` VARCHAR(191) NOT NULL,
	`moduleKey` VARCHAR(191) NOT NULL,
	`fieldKey` VARCHAR(191) NOT NULL,
	`label` VARCHAR(191) NOT NULL,
	`fieldType` VARCHAR(191) NOT NULL DEFAULT 'text',
	`selectOptions` JSON NULL,
	`placeholder` VARCHAR(191) NULL,
	`helpText` TEXT NULL,
	`isRequired` BOOLEAN NOT NULL DEFAULT false,
	`isActive` BOOLEAN NOT NULL DEFAULT true,
	`sortOrder` INTEGER NOT NULL DEFAULT 0,
	`createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updatedAt` DATETIME(3) NOT NULL,

	UNIQUE INDEX `CustomFieldDefinition_recordId_key` (`recordId`),
	UNIQUE INDEX `CustomFieldDefinition_moduleKey_fieldKey_key` (`moduleKey`, `fieldKey`),
	INDEX `CustomFieldDefinition_moduleKey_isActive_sortOrder_idx` (`moduleKey`, `isActive`, `sortOrder`),
	PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
