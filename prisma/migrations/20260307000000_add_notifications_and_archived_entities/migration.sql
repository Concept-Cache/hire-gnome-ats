CREATE TABLE `AppNotification` (
	`id` INTEGER NOT NULL AUTO_INCREMENT,
	`recordId` VARCHAR(191) NOT NULL,
	`userId` INTEGER NOT NULL,
	`type` VARCHAR(191) NOT NULL DEFAULT 'info',
	`title` VARCHAR(191) NOT NULL,
	`message` TEXT NULL,
	`entityType` VARCHAR(191) NULL,
	`entityId` INTEGER NULL,
	`linkHref` VARCHAR(191) NULL,
	`readAt` DATETIME(3) NULL,
	`createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updatedAt` DATETIME(3) NOT NULL,

	UNIQUE INDEX `AppNotification_recordId_key`(`recordId`),
	INDEX `AppNotification_userId_readAt_createdAt_idx`(`userId`, `readAt`, `createdAt`),
	INDEX `AppNotification_userId_createdAt_idx`(`userId`, `createdAt`),
	PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ArchivedEntity` (
	`id` INTEGER NOT NULL AUTO_INCREMENT,
	`recordId` VARCHAR(191) NOT NULL,
	`entityType` VARCHAR(191) NOT NULL,
	`entityId` INTEGER NOT NULL,
	`reason` TEXT NULL,
	`archivedByUserId` INTEGER NULL,
	`createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updatedAt` DATETIME(3) NOT NULL,

	UNIQUE INDEX `ArchivedEntity_recordId_key`(`recordId`),
	UNIQUE INDEX `ArchivedEntity_entityType_entityId_key`(`entityType`, `entityId`),
	INDEX `ArchivedEntity_entityType_createdAt_idx`(`entityType`, `createdAt`),
	INDEX `ArchivedEntity_archivedByUserId_createdAt_idx`(`archivedByUserId`, `createdAt`),
	PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `AppNotification`
	ADD CONSTRAINT `AppNotification_userId_fkey`
	FOREIGN KEY (`userId`) REFERENCES `User`(`id`)
	ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ArchivedEntity`
	ADD CONSTRAINT `ArchivedEntity_archivedByUserId_fkey`
	FOREIGN KEY (`archivedByUserId`) REFERENCES `User`(`id`)
	ON DELETE SET NULL ON UPDATE CASCADE;
