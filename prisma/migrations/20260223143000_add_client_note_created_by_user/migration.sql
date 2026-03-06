-- Track which user created each client note
ALTER TABLE `ClientNote`
	ADD COLUMN `createdByUserId` INTEGER NULL;

CREATE INDEX `ClientNote_createdByUserId_idx` ON `ClientNote`(`createdByUserId`);

ALTER TABLE `ClientNote`
	ADD CONSTRAINT `ClientNote_createdByUserId_fkey`
	FOREIGN KEY (`createdByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
