ALTER TABLE `Submission`
	ADD COLUMN `isClientVisible` BOOLEAN NOT NULL DEFAULT true;

UPDATE `Submission`
SET `isClientVisible` = false
WHERE `notes` LIKE '[WEB_RESPONSE]%';

CREATE INDEX `Submission_jobOrderId_isClientVisible_idx`
	ON `Submission`(`jobOrderId`, `isClientVisible`);
