# Job Orders

## What This Module Is For
Job Orders defines open hiring demand and serves as the center for submissions and interview progression.

## Core Fields
- Title
- Owner (required)
- Status (required)
- Employment type (required)
- Client
- Hiring manager contact
- Division
- Internal description (team-only)

## Compensation + Location
Job orders include structured compensation and location details for operations and career-site publishing.

Location support:
- Address typeahead (Google Places when configured)
- Zip-required flow for city/state inference

## Career Site Publishing
If career site is enabled in system settings:
- Publish toggle becomes available
- Publish stays off by default on new job orders
- Publish cannot be enabled until public description is filled in
- Public description is required before publish can be enabled
- Internal description remains internal-only

## Public Description Editor
Rich text formatting is available for readability and candidate conversion quality.

When OpenAI is configured, the editor also supports `Enhance with AI`.
If OpenAI is not configured, that control remains visible but disabled with a hint.

## Job Workspace
Use workspace tabs for:
- Submissions
- Interviews
- Placements
- Notes
- Activities

## Submission Rules
- New submission from job detail is supported.
- Duplicate candidate+job submissions are blocked.
- Candidate typeahead is optimized for larger datasets and qualification filtering.
- Candidate match rows support `Explain Match`, which opens a saved AI explanation of fit, gaps, and recruiter validation points for that candidate/job pair.
- If OpenAI is not configured, `Explain Match` remains visible but disabled with a tooltip/hint.

## Actions Menu
Typical actions include:
- Close job order (with confirmation)
- View career posting
- View audit trail
- Archive

## Best Practice
1. Keep internal and public descriptions distinct.
2. Confirm hiring manager contact before first submission.
3. Close job orders promptly when no longer active.
