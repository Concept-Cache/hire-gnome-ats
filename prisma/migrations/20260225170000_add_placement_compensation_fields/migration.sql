ALTER TABLE `Offer`
	ADD COLUMN `placementType` VARCHAR(191) NOT NULL DEFAULT 'temp',
	ADD COLUMN `compensationType` VARCHAR(191) NOT NULL DEFAULT 'hourly',
	ADD COLUMN `regularRate` DOUBLE NULL,
	ADD COLUMN `overtimeRate` DOUBLE NULL,
	ADD COLUMN `dailyRate` DOUBLE NULL,
	ADD COLUMN `annualSalary` DOUBLE NULL;

UPDATE `Offer`
SET
	`compensationType` = CASE
		WHEN `payPeriod` = 'hourly' THEN 'hourly'
		WHEN `payPeriod` = 'daily' THEN 'daily'
		ELSE 'salary'
	END,
	`regularRate` = CASE
		WHEN `payPeriod` = 'hourly' THEN `amount`
		ELSE NULL
	END,
	`dailyRate` = CASE
		WHEN `payPeriod` = 'daily' THEN `amount`
		ELSE NULL
	END,
	`annualSalary` = CASE
		WHEN `payPeriod` IN ('annual', 'monthly') THEN `amount`
		ELSE NULL
	END,
	`placementType` = CASE
		WHEN `payPeriod` IN ('annual', 'monthly') THEN 'perm'
		ELSE 'temp'
	END;
