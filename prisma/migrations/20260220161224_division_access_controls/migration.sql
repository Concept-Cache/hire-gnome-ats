-- AlterTable
ALTER TABLE `Candidate` ADD COLUMN `divisionId` INTEGER NULL;

-- AlterTable
ALTER TABLE `Client` ADD COLUMN `divisionId` INTEGER NULL;

-- AlterTable
ALTER TABLE `Contact` ADD COLUMN `divisionId` INTEGER NULL;

-- AlterTable
ALTER TABLE `JobOrder` ADD COLUMN `divisionId` INTEGER NULL;

-- AlterTable
ALTER TABLE `User` ADD COLUMN `divisionId` INTEGER NULL,
    ADD COLUMN `role` ENUM('ADMINISTRATOR', 'DIRECTOR', 'RECRUITER') NOT NULL DEFAULT 'RECRUITER';

-- CreateTable
CREATE TABLE `Division` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `accessMode` ENUM('COLLABORATIVE', 'OWNER_ONLY') NOT NULL DEFAULT 'COLLABORATIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Division_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Candidate_divisionId_idx` ON `Candidate`(`divisionId`);

-- CreateIndex
CREATE INDEX `Client_divisionId_idx` ON `Client`(`divisionId`);

-- CreateIndex
CREATE INDEX `Contact_divisionId_idx` ON `Contact`(`divisionId`);

-- CreateIndex
CREATE INDEX `JobOrder_divisionId_idx` ON `JobOrder`(`divisionId`);

-- CreateIndex
CREATE INDEX `User_divisionId_idx` ON `User`(`divisionId`);

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_divisionId_fkey` FOREIGN KEY (`divisionId`) REFERENCES `Division`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Candidate` ADD CONSTRAINT `Candidate_divisionId_fkey` FOREIGN KEY (`divisionId`) REFERENCES `Division`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Client` ADD CONSTRAINT `Client_divisionId_fkey` FOREIGN KEY (`divisionId`) REFERENCES `Division`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Contact` ADD CONSTRAINT `Contact_divisionId_fkey` FOREIGN KEY (`divisionId`) REFERENCES `Division`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `JobOrder` ADD CONSTRAINT `JobOrder_divisionId_fkey` FOREIGN KEY (`divisionId`) REFERENCES `Division`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
