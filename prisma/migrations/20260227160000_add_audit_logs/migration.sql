-- CreateTable
CREATE TABLE `AuditLog` (
	`id` INTEGER NOT NULL AUTO_INCREMENT,
	`entityType` VARCHAR(191) NOT NULL,
	`entityId` INTEGER NULL,
	`action` VARCHAR(191) NOT NULL,
	`actorUserId` INTEGER NULL,
	`summary` VARCHAR(191) NULL,
	`beforeData` JSON NULL,
	`afterData` JSON NULL,
	`changedFields` JSON NULL,
	`metadata` JSON NULL,
	`createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

	INDEX `AuditLog_entityType_entityId_createdAt_idx`(`entityType`, `entityId`, `createdAt`),
	INDEX `AuditLog_actorUserId_idx`(`actorUserId`),
	INDEX `AuditLog_createdAt_idx`(`createdAt`),
	PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `AuditLog`
ADD CONSTRAINT `AuditLog_actorUserId_fkey`
FOREIGN KEY (`actorUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
