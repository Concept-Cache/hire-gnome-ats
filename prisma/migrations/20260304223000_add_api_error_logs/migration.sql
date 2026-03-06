CREATE TABLE `ApiErrorLog` (
	`id` INTEGER NOT NULL AUTO_INCREMENT,
	`recordId` VARCHAR(191) NOT NULL,
	`level` VARCHAR(191) NOT NULL DEFAULT 'error',
	`event` VARCHAR(191) NOT NULL,
	`requestId` VARCHAR(191) NULL,
	`method` VARCHAR(191) NULL,
	`path` VARCHAR(191) NULL,
	`route` VARCHAR(191) NULL,
	`status` INTEGER NULL,
	`durationMs` INTEGER NULL,
	`summary` TEXT NOT NULL,
	`reason` TEXT NULL,
	`errorData` JSON NULL,
	`payload` JSON NULL,
	`createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

	UNIQUE INDEX `ApiErrorLog_recordId_key`(`recordId`),
	INDEX `ApiErrorLog_createdAt_idx`(`createdAt`),
	INDEX `ApiErrorLog_requestId_createdAt_idx`(`requestId`, `createdAt`),
	INDEX `ApiErrorLog_status_createdAt_idx`(`status`, `createdAt`),
	INDEX `ApiErrorLog_path_createdAt_idx`(`path`, `createdAt`),
	PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
