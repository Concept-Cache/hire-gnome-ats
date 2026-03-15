ALTER TABLE `Interview`
	ADD COLUMN `aiQuestionSet` LONGTEXT NULL,
	ADD COLUMN `aiQuestionSetGeneratedAt` DATETIME(3) NULL,
	ADD COLUMN `aiQuestionSetGeneratedByUserId` INT NULL,
	ADD COLUMN `aiQuestionSetModelName` VARCHAR(191) NULL;

ALTER TABLE `Interview`
	ADD INDEX `Interview_aiQuestionSetGeneratedByUserId_idx`(`aiQuestionSetGeneratedByUserId`);

ALTER TABLE `Interview`
	ADD CONSTRAINT `Interview_aiQuestionSetGeneratedByUserId_fkey`
	FOREIGN KEY (`aiQuestionSetGeneratedByUserId`) REFERENCES `User`(`id`)
	ON DELETE SET NULL
	ON UPDATE CASCADE;
