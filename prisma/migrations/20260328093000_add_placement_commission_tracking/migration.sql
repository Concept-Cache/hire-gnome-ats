CREATE TABLE `OfferCommissionSplit` (
	`id` INTEGER NOT NULL AUTO_INCREMENT,
	`recordId` VARCHAR(191) NOT NULL,
	`offerId` INTEGER NOT NULL,
	`userId` INTEGER NOT NULL,
	`role` VARCHAR(191) NOT NULL,
	`splitPercent` DOUBLE NOT NULL,
	`commissionPercent` DOUBLE NOT NULL,
	`createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updatedAt` DATETIME(3) NOT NULL,

	UNIQUE INDEX `OfferCommissionSplit_recordId_key`(`recordId`),
	INDEX `OfferCommissionSplit_offerId_role_idx`(`offerId`, `role`),
	INDEX `OfferCommissionSplit_userId_role_idx`(`userId`, `role`),
	PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `OfferCommissionSplit`
	ADD CONSTRAINT `OfferCommissionSplit_offerId_fkey`
	FOREIGN KEY (`offerId`) REFERENCES `Offer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `OfferCommissionSplit`
	ADD CONSTRAINT `OfferCommissionSplit_userId_fkey`
	FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
