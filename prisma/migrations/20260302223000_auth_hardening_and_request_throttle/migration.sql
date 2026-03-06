ALTER TABLE `User`
	ADD COLUMN `failedLoginAttempts` INTEGER NOT NULL DEFAULT 0,
	ADD COLUMN `lockoutUntil` DATETIME(3) NULL,
	ADD COLUMN `sessionVersion` INTEGER NOT NULL DEFAULT 1;

CREATE TABLE `RequestThrottleEvent` (
	`id` INTEGER NOT NULL AUTO_INCREMENT,
	`routeKey` VARCHAR(191) NOT NULL,
	`ipHash` VARCHAR(191) NOT NULL,
	`createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

	INDEX `RequestThrottleEvent_routeKey_ipHash_createdAt_idx`(`routeKey`, `ipHash`, `createdAt`),
	INDEX `RequestThrottleEvent_createdAt_idx`(`createdAt`),
	PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
