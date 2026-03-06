-- Track which user created candidate/contact notes
ALTER TABLE `CandidateNote`
	ADD COLUMN `createdByUserId` INTEGER NULL;

CREATE INDEX `CandidateNote_createdByUserId_idx` ON `CandidateNote`(`createdByUserId`);

ALTER TABLE `CandidateNote`
	ADD CONSTRAINT `CandidateNote_createdByUserId_fkey`
	FOREIGN KEY (`createdByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `ContactNote`
	ADD COLUMN `createdByUserId` INTEGER NULL;

CREATE INDEX `ContactNote_createdByUserId_idx` ON `ContactNote`(`createdByUserId`);

ALTER TABLE `ContactNote`
	ADD CONSTRAINT `ContactNote_createdByUserId_fkey`
	FOREIGN KEY (`createdByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
