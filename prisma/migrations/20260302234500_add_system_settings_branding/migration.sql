CREATE TABLE `SystemSetting` (
	`id` INTEGER NOT NULL AUTO_INCREMENT,
	`recordId` VARCHAR(191) NOT NULL,
	`siteName` VARCHAR(191) NOT NULL DEFAULT 'Hire Gnome',
	`logoStorageProvider` VARCHAR(191) NULL,
	`logoStorageBucket` VARCHAR(191) NULL,
	`logoStorageKey` VARCHAR(191) NULL,
	`logoContentType` VARCHAR(191) NULL,
	`logoFileName` VARCHAR(191) NULL,
	`createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updatedAt` DATETIME(3) NOT NULL,

	UNIQUE INDEX `SystemSetting_recordId_key`(`recordId`),
	PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
