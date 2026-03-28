CREATE TABLE `BullhornExportJob` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `recordId` VARCHAR(191) NOT NULL,
    `requestedByUserId` INTEGER NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'queued',
    `dateFrom` DATETIME(3) NOT NULL,
    `dateTo` DATETIME(3) NOT NULL,
    `sampleLimit` INTEGER NOT NULL DEFAULT 10,
    `fileName` VARCHAR(191) NULL,
    `filePath` VARCHAR(191) NULL,
    `rowCounts` JSON NULL,
    `importResult` JSON NULL,
    `errorMessage` TEXT NULL,
    `startedAt` DATETIME(3) NULL,
    `completedAt` DATETIME(3) NULL,
    `importedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `BullhornExportJob_recordId_key`(`recordId`),
    INDEX `BullhornExportJob_requestedByUserId_createdAt_idx`(`requestedByUserId`, `createdAt`),
    INDEX `BullhornExportJob_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `BullhornExportJob`
    ADD CONSTRAINT `BullhornExportJob_requestedByUserId_fkey`
    FOREIGN KEY (`requestedByUserId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
