-- Add zip code to candidate records
ALTER TABLE `Candidate`
	ADD COLUMN `zipCode` VARCHAR(191) NULL;
