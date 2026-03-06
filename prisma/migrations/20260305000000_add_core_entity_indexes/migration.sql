-- Add lookup indexes for core ATS entities.
ALTER TABLE `Candidate`
  ADD INDEX `Candidate_firstName_lastName_idx` (`firstName`,`lastName`),
  ADD INDEX `Candidate_mobile_idx` (`mobile`),
  ADD INDEX `Candidate_status_idx` (`status`),
  ADD INDEX `Candidate_ownerId_status_idx` (`ownerId`,`status`),
  ADD INDEX `Candidate_divisionId_status_idx` (`divisionId`,`status`),
  ADD INDEX `Candidate_zipCode_idx` (`zipCode`);

ALTER TABLE `Client`
  ADD INDEX `Client_name_idx` (`name`),
  ADD INDEX `Client_status_idx` (`status`),
  ADD INDEX `Client_zipCode_idx` (`zipCode`),
  ADD INDEX `Client_ownerId_status_idx` (`ownerId`,`status`);

ALTER TABLE `Contact`
  ADD INDEX `Contact_firstName_lastName_idx` (`firstName`,`lastName`),
  ADD INDEX `Contact_email_idx` (`email`),
  ADD INDEX `Contact_phone_idx` (`phone`),
  ADD COLUMN `zipCode` VARCHAR(191) NULL AFTER `addressLongitude`,
  ADD INDEX `Contact_divisionId_ownerId_idx` (`divisionId`,`ownerId`),
  ADD INDEX `Contact_clientId_divisionId_idx` (`clientId`,`divisionId`),
  ADD INDEX `Contact_zipCode_idx` (`zipCode`);

ALTER TABLE `JobOrder`
  ADD INDEX `JobOrder_title_idx` (`title`),
  ADD INDEX `JobOrder_status_idx` (`status`),
  ADD INDEX `JobOrder_employmentType_idx` (`employmentType`),
  ADD INDEX `JobOrder_contactId_idx` (`contactId`),
  ADD INDEX `JobOrder_clientId_status_idx` (`clientId`,`status`),
  ADD INDEX `JobOrder_divisionId_status_idx` (`divisionId`,`status`),
  ADD INDEX `JobOrder_zipCode_idx` (`zipCode`);

ALTER TABLE `Submission`
  ADD INDEX `Submission_candidateId_status_idx` (`candidateId`,`status`),
  ADD INDEX `Submission_jobOrderId_status_idx` (`jobOrderId`,`status`);

ALTER TABLE `Interview`
  ADD INDEX `Interview_candidateId_startsAt_idx` (`candidateId`,`startsAt`),
  ADD INDEX `Interview_jobOrderId_startsAt_idx` (`jobOrderId`,`startsAt`),
  ADD INDEX `Interview_status_startsAt_idx` (`status`,`startsAt`);

ALTER TABLE `Offer`
  ADD INDEX `Offer_candidateId_status_idx` (`candidateId`,`status`),
  ADD INDEX `Offer_jobOrderId_status_idx` (`jobOrderId`,`status`),
  ADD INDEX `Offer_status_idx` (`status`);
