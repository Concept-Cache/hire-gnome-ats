ALTER TABLE `Submission`
	ADD COLUMN `customFields` JSON NULL;

ALTER TABLE `Interview`
	ADD COLUMN `customFields` JSON NULL;

ALTER TABLE `Offer`
	ADD COLUMN `customFields` JSON NULL;
