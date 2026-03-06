-- Create users table for owner assignment across modules
CREATE TABLE `User` (
	`id` INTEGER NOT NULL AUTO_INCREMENT,
	`firstName` VARCHAR(191) NOT NULL,
	`lastName` VARCHAR(191) NOT NULL,
	`email` VARCHAR(191) NOT NULL,
	`isActive` BOOLEAN NOT NULL DEFAULT true,
	`createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updatedAt` DATETIME(3) NOT NULL,
	UNIQUE INDEX `User_email_key`(`email`),
	PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `Candidate` ADD COLUMN `ownerId` INTEGER NULL;
ALTER TABLE `Client` ADD COLUMN `ownerId` INTEGER NULL;
ALTER TABLE `Contact` ADD COLUMN `ownerId` INTEGER NULL;
ALTER TABLE `JobOrder` ADD COLUMN `ownerId` INTEGER NULL;

CREATE INDEX `Candidate_ownerId_idx` ON `Candidate`(`ownerId`);
CREATE INDEX `Client_ownerId_idx` ON `Client`(`ownerId`);
CREATE INDEX `Contact_ownerId_idx` ON `Contact`(`ownerId`);
CREATE INDEX `JobOrder_ownerId_idx` ON `JobOrder`(`ownerId`);

ALTER TABLE `Candidate`
	ADD CONSTRAINT `Candidate_ownerId_fkey`
	FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `Client`
	ADD CONSTRAINT `Client_ownerId_fkey`
	FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `Contact`
	ADD CONSTRAINT `Contact_ownerId_fkey`
	FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `JobOrder`
	ADD CONSTRAINT `JobOrder_ownerId_fkey`
	FOREIGN KEY (`ownerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
