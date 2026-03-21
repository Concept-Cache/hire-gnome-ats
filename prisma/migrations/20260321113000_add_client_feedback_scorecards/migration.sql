ALTER TABLE `ClientSubmissionFeedback`
	ADD COLUMN `communicationScore` INTEGER NULL,
	ADD COLUMN `technicalFitScore` INTEGER NULL,
	ADD COLUMN `cultureFitScore` INTEGER NULL,
	ADD COLUMN `overallRecommendationScore` INTEGER NULL;
