/*
	Warnings:

	- You are about to drop the column `contactEmail` on the `Client` table. All the data in the column will be lost.
	- You are about to drop the column `contactName` on the `Client` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `Client` DROP COLUMN `contactEmail`,
		DROP COLUMN `contactName`;

-- AlterTable
ALTER TABLE `JobOrder` ADD COLUMN `contactId` INTEGER NULL;

-- CreateTable
CREATE TABLE `Contact` (
		`id` INTEGER NOT NULL AUTO_INCREMENT,
		`firstName` VARCHAR(191) NOT NULL,
		`lastName` VARCHAR(191) NOT NULL,
		`email` VARCHAR(191) NULL,
		`phone` VARCHAR(191) NULL,
		`title` VARCHAR(191) NULL,
		`createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
		`updatedAt` DATETIME(3) NOT NULL,
		`clientId` INTEGER NOT NULL,

		PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Contact` ADD CONSTRAINT `Contact_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `JobOrder` ADD CONSTRAINT `JobOrder_contactId_fkey` FOREIGN KEY (`contactId`) REFERENCES `Contact`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
