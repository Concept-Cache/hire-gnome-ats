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

When OpenAI is configured, the editor also supports a sparkles AI enhance action in the public-description toolbar.
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
- Job-order submissions can be ranked in recruiter preference order from the workspace using persisted drag-and-drop ordering.
- Drag-and-drop reorder is available when the submissions workspace is sorted by `Priority Order`.
- If a client passes on a submission through the portal, that submission is automatically moved to the bottom of the priority order.
- Each submission row links directly to the candidate record and also includes a separate submission-detail link.
- The submissions workspace surfaces the latest client portal action/comment so recruiters can scan client response without opening each submission.
- Career-site `Web` responses remain hidden from the client portal until a recruiter promotes them from submission detail.
- Duplicate candidate+job submissions are blocked.
- Candidate typeahead is optimized for larger datasets and qualification filtering.
- Candidate match rows support `Explain Match`, which opens a saved AI explanation of fit, gaps, and recruiter validation points for that candidate/job pair.
- If OpenAI is not configured, `Explain Match` remains visible but disabled with a tooltip/hint.

## Actions Menu
Typical actions include:
- Client Review Portal
- Close job order (with confirmation)
- View career posting
- View audit trail (administrators only)
- Archive

## Client Review Portal
Job order detail includes `Actions > Client Review Portal` for client-facing candidate review without a separate login.

Behavior:
- If the client portal is disabled in `Admin Area > System Settings`, job-order portal analytics stay hidden and the actions-menu entry explains that an administrator must enable the feature
- Creates or reuses a persistent magic link for the assigned hiring-contact record on the job order
- Portal access is scoped to that job order only
- Link remains valid for the life of the job unless revoked
- Internal users can copy, email, open, revoke, or restore the portal link from the modal
- Sending the link from the modal uses a branded email template that follows the selected theme, with a direct CTA and job-specific context
- Job order detail also shows portal analytics for sent, opened, last viewed, acted on, and total client actions logged
- The modal shows the same lifecycle analytics so recruiters can quickly confirm whether the link is being used
- The external portal shows submitted candidates, recruiter write-ups, the candidate's labeled primary resume when available, and response actions

## Best Practice
1. Keep internal and public descriptions distinct.
2. Confirm hiring manager contact before first submission.
3. Close job orders promptly when no longer active.
