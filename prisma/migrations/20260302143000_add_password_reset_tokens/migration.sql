CREATE TABLE `PasswordResetToken` (
	`id` INTEGER NOT NULL AUTO_INCREMENT,
	`recordId` VARCHAR(191) NOT NULL,
	`userId` INTEGER NOT NULL,
	`tokenHash` VARCHAR(191) NOT NULL,
	`expiresAt` DATETIME(3) NOT NULL,
	`usedAt` DATETIME(3) NULL,
	`createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
	`updatedAt` DATETIME(3) NOT NULL,

	UNIQUE INDEX `PasswordResetToken_recordId_key`(`recordId`),
	UNIQUE INDEX `PasswordResetToken_tokenHash_key`(`tokenHash`),
	INDEX `PasswordResetToken_userId_idx`(`userId`),
	INDEX `PasswordResetToken_expiresAt_idx`(`expiresAt`),
	PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `PasswordResetToken`
	ADD CONSTRAINT `PasswordResetToken_userId_fkey`
	FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
