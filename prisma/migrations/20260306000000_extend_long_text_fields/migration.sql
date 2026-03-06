-- Extend high-volume candidate/submission text fields for parsed payloads.
ALTER TABLE `Candidate`
	MODIFY COLUMN `skillSet` TEXT NULL;

ALTER TABLE `Submission`
	MODIFY COLUMN `notes` TEXT NULL;
