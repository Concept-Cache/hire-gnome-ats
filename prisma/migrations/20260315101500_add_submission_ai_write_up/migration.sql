ALTER TABLE `Submission`
	ADD COLUMN `aiWriteUp` TEXT NULL,
	ADD COLUMN `aiWriteUpGeneratedAt` DATETIME(3) NULL,
	ADD COLUMN `aiWriteUpGeneratedByUserId` INTEGER NULL,
	ADD COLUMN `aiWriteUpModelName` VARCHAR(191) NULL;

CREATE INDEX `Submission_aiWriteUpGeneratedByUserId_idx` ON `Submission`(`aiWriteUpGeneratedByUserId`);

ALTER TABLE `Submission`
	ADD CONSTRAINT `Submission_aiWriteUpGeneratedByUserId_fkey`
	FOREIGN KEY (`aiWriteUpGeneratedByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
