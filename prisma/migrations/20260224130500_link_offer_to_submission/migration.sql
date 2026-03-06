-- Link converted offers back to submissions
ALTER TABLE `Offer`
	ADD COLUMN `submissionId` INTEGER NULL;

CREATE UNIQUE INDEX `Offer_submissionId_key` ON `Offer`(`submissionId`);

ALTER TABLE `Offer`
	ADD CONSTRAINT `Offer_submissionId_fkey`
		FOREIGN KEY (`submissionId`) REFERENCES `Submission`(`id`)
		ON DELETE SET NULL ON UPDATE CASCADE;
