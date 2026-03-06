ALTER TABLE `Contact`
	ADD COLUMN `address` VARCHAR(191) NULL,
	ADD COLUMN `addressPlaceId` VARCHAR(191) NULL,
	ADD COLUMN `addressLatitude` DOUBLE NULL,
	ADD COLUMN `addressLongitude` DOUBLE NULL;
