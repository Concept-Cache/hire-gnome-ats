ALTER TABLE `SystemSetting`
	ADD COLUMN `bullhornUsername` VARCHAR(191) NULL,
	ADD COLUMN `bullhornPassword` TEXT NULL,
	ADD COLUMN `bullhornClientId` VARCHAR(191) NULL,
	ADD COLUMN `bullhornClientSecret` TEXT NULL;
