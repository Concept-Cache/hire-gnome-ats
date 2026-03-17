ALTER TABLE `Submission`
ADD COLUMN `submissionPriority` INTEGER NOT NULL DEFAULT 0;

UPDATE `Submission` AS s
JOIN (
	SELECT
		s1.`id`,
		COUNT(s2.`id`) AS `nextPriority`
	FROM `Submission` s1
	LEFT JOIN `Submission` s2
		ON s2.`jobOrderId` = s1.`jobOrderId`
		AND (
			s2.`createdAt` < s1.`createdAt`
			OR (s2.`createdAt` = s1.`createdAt` AND s2.`id` <= s1.`id`)
		)
	GROUP BY s1.`id`
) ranked ON ranked.`id` = s.`id`
SET s.`submissionPriority` = ranked.`nextPriority`;

CREATE INDEX `Submission_jobOrderId_submissionPriority_idx`
ON `Submission`(`jobOrderId`, `submissionPriority`);
