ALTER TABLE `SystemSetting`
	MODIFY COLUMN `siteName` VARCHAR(191) NOT NULL DEFAULT 'Hire Gnome ATS';

UPDATE `SystemSetting`
SET `siteTitle` = `siteName`;
