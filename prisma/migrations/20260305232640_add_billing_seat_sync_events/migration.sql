/*
  Warnings:

  - The primary key for the `zip` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to alter the column `id` on the `zip` table. The data in that column could be lost. The data in that column will be cast from `UnsignedInt` to `Int`.
  - You are about to alter the column `primary_city` on the `zip` table. The data in that column could be lost. The data in that column will be cast from `VarChar(255)` to `VarChar(191)`.

*/
-- AlterTable
ALTER TABLE `AuditLog` MODIFY `recordId` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `Candidate` MODIFY `recordId` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `CandidateActivity` MODIFY `recordId` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `CandidateAttachment` MODIFY `recordId` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `CandidateEducation` MODIFY `recordId` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `CandidateNote` MODIFY `recordId` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `CandidateWorkExperience` MODIFY `recordId` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `Client` MODIFY `recordId` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `ClientNote` MODIFY `recordId` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `Contact` MODIFY `recordId` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `ContactNote` MODIFY `recordId` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `Division` MODIFY `recordId` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `Interview` MODIFY `recordId` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `JobOrder` MODIFY `recordId` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `Offer` MODIFY `recordId` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `Skill` MODIFY `recordId` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `Submission` MODIFY `recordId` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `User` MODIFY `recordId` VARCHAR(191) NOT NULL;

-- AlterTable
ALTER TABLE `zip` DROP PRIMARY KEY,
    MODIFY `id` INTEGER NOT NULL AUTO_INCREMENT,
    MODIFY `primary_city` VARCHAR(191) NOT NULL,
    MODIFY `latitude` DOUBLE NULL,
    MODIFY `longitude` DOUBLE NULL,
    ALTER COLUMN `state` DROP DEFAULT,
    ADD PRIMARY KEY (`id`);
