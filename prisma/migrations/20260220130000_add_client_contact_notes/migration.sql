-- Create client and contact note tables for persistent timeline notes
CREATE TABLE `ClientNote` (
	`id` INTEGER NOT NULL AUTO_INCREMENT,
	`content` TEXT NOT NULL,
	`createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updatedAt` DATETIME(3) NOT NULL,
	`clientId` INTEGER NOT NULL,

	PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `ContactNote` (
	`id` INTEGER NOT NULL AUTO_INCREMENT,
	`content` TEXT NOT NULL,
	`createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updatedAt` DATETIME(3) NOT NULL,
	`contactId` INTEGER NOT NULL,

	PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `ClientNote`
	ADD CONSTRAINT `ClientNote_clientId_fkey`
	FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ContactNote`
	ADD CONSTRAINT `ContactNote_contactId_fkey`
	FOREIGN KEY (`contactId`) REFERENCES `Contact`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
