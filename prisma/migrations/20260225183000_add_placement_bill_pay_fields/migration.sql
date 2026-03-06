ALTER TABLE `Offer`
	ADD COLUMN `hourlyRtBillRate` DOUBLE NULL,
	ADD COLUMN `hourlyRtPayRate` DOUBLE NULL,
	ADD COLUMN `hourlyOtBillRate` DOUBLE NULL,
	ADD COLUMN `hourlyOtPayRate` DOUBLE NULL,
	ADD COLUMN `dailyBillRate` DOUBLE NULL,
	ADD COLUMN `dailyPayRate` DOUBLE NULL,
	ADD COLUMN `yearlyCompensation` DOUBLE NULL;

UPDATE `Offer`
SET
	`hourlyRtBillRate` = CASE
		WHEN `compensationType` = 'hourly' THEN COALESCE(`hourlyRtBillRate`, `regularRate`, `amount`)
		ELSE `hourlyRtBillRate`
	END,
	`hourlyRtPayRate` = CASE
		WHEN `compensationType` = 'hourly' THEN COALESCE(`hourlyRtPayRate`, `regularRate`, `amount`)
		ELSE `hourlyRtPayRate`
	END,
	`hourlyOtBillRate` = CASE
		WHEN `compensationType` = 'hourly' THEN COALESCE(`hourlyOtBillRate`, `overtimeRate`)
		ELSE `hourlyOtBillRate`
	END,
	`hourlyOtPayRate` = CASE
		WHEN `compensationType` = 'hourly' THEN COALESCE(`hourlyOtPayRate`, `overtimeRate`)
		ELSE `hourlyOtPayRate`
	END,
	`dailyBillRate` = CASE
		WHEN `compensationType` = 'daily' THEN COALESCE(`dailyBillRate`, `dailyRate`, `amount`)
		ELSE `dailyBillRate`
	END,
	`dailyPayRate` = CASE
		WHEN `compensationType` = 'daily' THEN COALESCE(`dailyPayRate`, `dailyRate`, `amount`)
		ELSE `dailyPayRate`
	END,
	`yearlyCompensation` = CASE
		WHEN `compensationType` = 'salary' THEN COALESCE(`yearlyCompensation`, `annualSalary`, `amount`)
		ELSE `yearlyCompensation`
	END;
