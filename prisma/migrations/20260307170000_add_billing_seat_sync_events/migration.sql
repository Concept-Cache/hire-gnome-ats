CREATE TABLE `BillingSeatSyncEvent` (
	`id` INTEGER NOT NULL AUTO_INCREMENT,
	`recordId` VARCHAR(191) NOT NULL,
	`provider` VARCHAR(191) NOT NULL,
	`status` VARCHAR(191) NOT NULL DEFAULT 'skipped',
	`reason` VARCHAR(191) NULL,
	`activeSeatCount` INTEGER NOT NULL DEFAULT 0,
	`billedSeatQuantity` INTEGER NOT NULL DEFAULT 0,
	`previousSeatQuantity` INTEGER NULL,
	`nextSeatQuantity` INTEGER NULL,
	`stripeCustomerId` VARCHAR(191) NULL,
	`stripeSubscriptionId` VARCHAR(191) NULL,
	`stripeSubscriptionItemId` VARCHAR(191) NULL,
	`errorMessage` TEXT NULL,
	`metadata` JSON NULL,
	`triggeredByUserId` INTEGER NULL,
	`createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updatedAt` DATETIME(3) NOT NULL,

	UNIQUE INDEX `BillingSeatSyncEvent_recordId_key`(`recordId`),
	INDEX `BillingSeatSyncEvent_createdAt_idx`(`createdAt`),
	INDEX `BillingSeatSyncEvent_status_createdAt_idx`(`status`, `createdAt`),
	INDEX `BillingSeatSyncEvent_triggeredByUserId_createdAt_idx`(`triggeredByUserId`, `createdAt`),
	PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `BillingSeatSyncEvent`
ADD CONSTRAINT `BillingSeatSyncEvent_triggeredByUserId_fkey`
FOREIGN KEY (`triggeredByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
