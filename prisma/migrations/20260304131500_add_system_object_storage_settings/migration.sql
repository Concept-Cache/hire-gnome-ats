ALTER TABLE `SystemSetting`
	ADD COLUMN `objectStorageProvider` VARCHAR(191) NULL DEFAULT 's3',
	ADD COLUMN `objectStorageRegion` VARCHAR(191) NULL DEFAULT 'us-east-1',
	ADD COLUMN `objectStorageBucket` VARCHAR(191) NULL,
	ADD COLUMN `objectStorageEndpoint` VARCHAR(191) NULL,
	ADD COLUMN `objectStorageForcePathStyle` BOOLEAN NOT NULL DEFAULT true,
	ADD COLUMN `objectStorageAccessKeyId` VARCHAR(191) NULL,
	ADD COLUMN `objectStorageSecretAccessKey` TEXT NULL;
