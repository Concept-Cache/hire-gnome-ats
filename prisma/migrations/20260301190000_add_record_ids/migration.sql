ALTER TABLE `Division`
	ADD COLUMN `recordId` VARCHAR(32) NULL;

ALTER TABLE `User`
	ADD COLUMN `recordId` VARCHAR(32) NULL;

ALTER TABLE `AuditLog`
	ADD COLUMN `recordId` VARCHAR(32) NULL;

ALTER TABLE `Candidate`
	ADD COLUMN `recordId` VARCHAR(32) NULL;

ALTER TABLE `Skill`
	ADD COLUMN `recordId` VARCHAR(32) NULL;

ALTER TABLE `CandidateNote`
	ADD COLUMN `recordId` VARCHAR(32) NULL;

ALTER TABLE `CandidateActivity`
	ADD COLUMN `recordId` VARCHAR(32) NULL;

ALTER TABLE `CandidateEducation`
	ADD COLUMN `recordId` VARCHAR(32) NULL;

ALTER TABLE `CandidateWorkExperience`
	ADD COLUMN `recordId` VARCHAR(32) NULL;

ALTER TABLE `CandidateAttachment`
	ADD COLUMN `recordId` VARCHAR(32) NULL;

ALTER TABLE `Client`
	ADD COLUMN `recordId` VARCHAR(32) NULL;

ALTER TABLE `Contact`
	ADD COLUMN `recordId` VARCHAR(32) NULL;

ALTER TABLE `ClientNote`
	ADD COLUMN `recordId` VARCHAR(32) NULL;

ALTER TABLE `ContactNote`
	ADD COLUMN `recordId` VARCHAR(32) NULL;

ALTER TABLE `JobOrder`
	ADD COLUMN `recordId` VARCHAR(32) NULL;

ALTER TABLE `Submission`
	ADD COLUMN `recordId` VARCHAR(32) NULL;

ALTER TABLE `Interview`
	ADD COLUMN `recordId` VARCHAR(32) NULL;

ALTER TABLE `Offer`
	ADD COLUMN `recordId` VARCHAR(32) NULL;

UPDATE `Division`
SET `recordId` = CONCAT('DIV-', LPAD(`id`, 6, '0'))
WHERE `recordId` IS NULL;

UPDATE `User`
SET `recordId` = CONCAT('USR-', LPAD(`id`, 6, '0'))
WHERE `recordId` IS NULL;

UPDATE `AuditLog`
SET `recordId` = CONCAT('AUD-', LPAD(`id`, 6, '0'))
WHERE `recordId` IS NULL;

UPDATE `Candidate`
SET `recordId` = CONCAT('CAN-', LPAD(`id`, 6, '0'))
WHERE `recordId` IS NULL;

UPDATE `Skill`
SET `recordId` = CONCAT('SKL-', LPAD(`id`, 6, '0'))
WHERE `recordId` IS NULL;

UPDATE `CandidateNote`
SET `recordId` = CONCAT('CNO-', LPAD(`id`, 6, '0'))
WHERE `recordId` IS NULL;

UPDATE `CandidateActivity`
SET `recordId` = CONCAT('CAT-', LPAD(`id`, 6, '0'))
WHERE `recordId` IS NULL;

UPDATE `CandidateEducation`
SET `recordId` = CONCAT('CED-', LPAD(`id`, 6, '0'))
WHERE `recordId` IS NULL;

UPDATE `CandidateWorkExperience`
SET `recordId` = CONCAT('CWR-', LPAD(`id`, 6, '0'))
WHERE `recordId` IS NULL;

UPDATE `CandidateAttachment`
SET `recordId` = CONCAT('CAF-', LPAD(`id`, 6, '0'))
WHERE `recordId` IS NULL;

UPDATE `Client`
SET `recordId` = CONCAT('CLI-', LPAD(`id`, 6, '0'))
WHERE `recordId` IS NULL;

UPDATE `Contact`
SET `recordId` = CONCAT('CON-', LPAD(`id`, 6, '0'))
WHERE `recordId` IS NULL;

UPDATE `ClientNote`
SET `recordId` = CONCAT('CLN-', LPAD(`id`, 6, '0'))
WHERE `recordId` IS NULL;

UPDATE `ContactNote`
SET `recordId` = CONCAT('CTN-', LPAD(`id`, 6, '0'))
WHERE `recordId` IS NULL;

UPDATE `JobOrder`
SET `recordId` = CONCAT('JOB-', LPAD(`id`, 6, '0'))
WHERE `recordId` IS NULL;

UPDATE `Submission`
SET `recordId` = CONCAT('SUB-', LPAD(`id`, 6, '0'))
WHERE `recordId` IS NULL;

UPDATE `Interview`
SET `recordId` = CONCAT('INT-', LPAD(`id`, 6, '0'))
WHERE `recordId` IS NULL;

UPDATE `Offer`
SET `recordId` = CONCAT('PLC-', LPAD(`id`, 6, '0'))
WHERE `recordId` IS NULL;

ALTER TABLE `Division`
	MODIFY `recordId` VARCHAR(32) NOT NULL,
	ADD UNIQUE INDEX `Division_recordId_key` (`recordId`);

ALTER TABLE `User`
	MODIFY `recordId` VARCHAR(32) NOT NULL,
	ADD UNIQUE INDEX `User_recordId_key` (`recordId`);

ALTER TABLE `AuditLog`
	MODIFY `recordId` VARCHAR(32) NOT NULL,
	ADD UNIQUE INDEX `AuditLog_recordId_key` (`recordId`);

ALTER TABLE `Candidate`
	MODIFY `recordId` VARCHAR(32) NOT NULL,
	ADD UNIQUE INDEX `Candidate_recordId_key` (`recordId`);

ALTER TABLE `Skill`
	MODIFY `recordId` VARCHAR(32) NOT NULL,
	ADD UNIQUE INDEX `Skill_recordId_key` (`recordId`);

ALTER TABLE `CandidateNote`
	MODIFY `recordId` VARCHAR(32) NOT NULL,
	ADD UNIQUE INDEX `CandidateNote_recordId_key` (`recordId`);

ALTER TABLE `CandidateActivity`
	MODIFY `recordId` VARCHAR(32) NOT NULL,
	ADD UNIQUE INDEX `CandidateActivity_recordId_key` (`recordId`);

ALTER TABLE `CandidateEducation`
	MODIFY `recordId` VARCHAR(32) NOT NULL,
	ADD UNIQUE INDEX `CandidateEducation_recordId_key` (`recordId`);

ALTER TABLE `CandidateWorkExperience`
	MODIFY `recordId` VARCHAR(32) NOT NULL,
	ADD UNIQUE INDEX `CandidateWorkExperience_recordId_key` (`recordId`);

ALTER TABLE `CandidateAttachment`
	MODIFY `recordId` VARCHAR(32) NOT NULL,
	ADD UNIQUE INDEX `CandidateAttachment_recordId_key` (`recordId`);

ALTER TABLE `Client`
	MODIFY `recordId` VARCHAR(32) NOT NULL,
	ADD UNIQUE INDEX `Client_recordId_key` (`recordId`);

ALTER TABLE `Contact`
	MODIFY `recordId` VARCHAR(32) NOT NULL,
	ADD UNIQUE INDEX `Contact_recordId_key` (`recordId`);

ALTER TABLE `ClientNote`
	MODIFY `recordId` VARCHAR(32) NOT NULL,
	ADD UNIQUE INDEX `ClientNote_recordId_key` (`recordId`);

ALTER TABLE `ContactNote`
	MODIFY `recordId` VARCHAR(32) NOT NULL,
	ADD UNIQUE INDEX `ContactNote_recordId_key` (`recordId`);

ALTER TABLE `JobOrder`
	MODIFY `recordId` VARCHAR(32) NOT NULL,
	ADD UNIQUE INDEX `JobOrder_recordId_key` (`recordId`);

ALTER TABLE `Submission`
	MODIFY `recordId` VARCHAR(32) NOT NULL,
	ADD UNIQUE INDEX `Submission_recordId_key` (`recordId`);

ALTER TABLE `Interview`
	MODIFY `recordId` VARCHAR(32) NOT NULL,
	ADD UNIQUE INDEX `Interview_recordId_key` (`recordId`);

ALTER TABLE `Offer`
	MODIFY `recordId` VARCHAR(32) NOT NULL,
	ADD UNIQUE INDEX `Offer_recordId_key` (`recordId`);
