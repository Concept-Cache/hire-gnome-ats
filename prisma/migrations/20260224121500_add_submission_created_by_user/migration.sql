-- Track which user created each submission
ALTER TABLE `Submission`
	ADD COLUMN `createdByUserId` INTEGER NULL;

ALTER TABLE `Submission`
	ADD INDEX `Submission_createdByUserId_idx`(`createdByUserId`);

ALTER TABLE `Submission`
	ADD CONSTRAINT `Submission_createdByUserId_fkey`
		FOREIGN KEY (`createdByUserId`) REFERENCES `User`(`id`)
		ON DELETE SET NULL ON UPDATE CASCADE;
