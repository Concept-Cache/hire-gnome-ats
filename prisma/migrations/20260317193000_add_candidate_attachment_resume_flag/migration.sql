ALTER TABLE `CandidateAttachment`
ADD COLUMN `isResume` BOOLEAN NOT NULL DEFAULT false;

UPDATE `CandidateAttachment` ca
JOIN (
	SELECT `candidateId`, COUNT(*) AS `attachmentCount`
	FROM `CandidateAttachment`
	GROUP BY `candidateId`
) stats
	ON stats.`candidateId` = ca.`candidateId`
SET ca.`isResume` = true
WHERE
	(
		stats.`attachmentCount` = 1
		AND LOWER(ca.`fileName`) REGEXP '\\.(pdf|doc|docx)$'
	)
	OR LOWER(ca.`fileName`) REGEXP '(^|[^a-z])(resume|curriculum|cv)([^a-z]|$)';

CREATE INDEX `CandidateAttachment_candidateId_isResume_idx`
ON `CandidateAttachment`(`candidateId`, `isResume`);
