ALTER TABLE `JobOrder`
	ADD COLUMN `publicDescription` TEXT NULL,
	DROP COLUMN `publishToJobBoards`;
