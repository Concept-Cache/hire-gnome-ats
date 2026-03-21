# Changelog

This changelog captures the main recent product-facing changes shipped in Hire Gnome ATS.

## [1.5.1] - 2026-03-17

#### Changed
- Added a submissions-count column to the job order list so recruiters can see pipeline volume from the main list view.
- Added explicit candidate resume labeling on file attachments, including automatic labeling for known resume upload flows and clearer portal resume presentation.
- Improved the demo seed so recent portal and resume workflows open with more representative data, including seeded primary resumes and client-review activity.
- Refined client portal feedback so `Pass` is confirmed, locks the submission against further client actions, and only the clicked action shows a saving spinner.
- Client portal `Pass` actions now also push the submission to the bottom of the job order's priority ranking, the job-order submissions workspace surfaces the latest client response more clearly, and the portal itself is now limited to the candidate's labeled primary resume.
- Added a user-level `Client Feedback Notifications` setting so portal responses only notify users who have opted in through Account Settings.
- Added an in-app portal email workflow so recruiters can send the persistent client-review link directly to the assigned contact from the job-order portal modal.
- Client feedback notification opt-ins now trigger actual email alerts in addition to in-app notifications.
- Portal management now tracks and displays sent/opened/viewed/acted-on analytics directly on job order detail and in the portal modal.
- Added a global client-portal toggle in admin settings so teams that do not use external client review can disable the feature, hide passive portal UI, and keep the actions-menu entry as a guided prompt.
- Split system settings into separate branding vs. platform cards so branding can always be saved, while integrations, SMTP, and object storage stay separately saveable and remain demo-locked.
- Added configurable public careers hero headline/body copy in branding and tightened the public careers stat boxes so they no longer read overly wide.
- Upgraded client-portal invite emails to a branded HTML template that follows the selected theme, with a clearer CTA, job context, and matching plain-text fallback.
- Audit trail viewing is now restricted to administrators in both the detail-screen UI and the audit-log API.
- Added explicit submission-level client portal visibility so web responses stay differentiated and hidden by default until a recruiter promotes them for client review.
- In demo mode, system settings now allow the full branding card to be saved while keeping integrations, SMTP, and object storage read-only.
- Added a print-friendly submission packet from submission detail that compiles the write-up, primary resume, candidate snapshot, match explanation, and interview prep for internal review or PDF export.
- Upgraded the dashboard `Needs Attention` queue with smarter workflow alerts for web responses, client portal engagement, unscheduled interview requests, and other stale follow-up states.
- Added live dashboard KPI cards for web-response review and client interview requests so the home screen surfaces new recruiting pressure sooner.
- Added a stronger candidate snapshot header with AI summary snippet, last activity, and profile-completeness guidance so recruiters can assess submission readiness at a glance.
- Extended candidate completeness into the list view and added soft submission warnings so recruiters can keep moving while still seeing when a profile needs cleanup.
- Owner performance chips in operational reporting now open the same drill-through detail modal used by the rest of the report, filtered to that owner and metric.

## [1.5.0] - 2026-03-17

#### Added
- Added a client review portal with persistent magic links tied to the job order's assigned client contact, allowing external users to review submitted candidates, download resume/files, leave comments, request interviews, and pass without creating a login.
- Added internal portal management on job-order detail plus submission-level client feedback visibility so recruiters can issue, revoke, and track portal activity from existing workflow screens.

#### Changed
- Refined the portal management modal controls and button presentation so the client-link actions read cleanly as part of the same portal release.

## [1.4.6] - 2026-03-17

#### Fixed
- Cleaned up the job-order submission drag preview so the priority handle drags without the awkward opaque rectangle around it.

## [1.4.5] - 2026-03-17

#### Changed
- Finalized the job-order submission reordering interaction so the priority handle is the sole drag/drop control.

## [1.4.4] - 2026-03-17

#### Changed
- Finalized the submission row layout on job-order detail with ranking on the left and status on the right.

## [1.4.3] - 2026-03-17

#### Fixed
- Updated both demo seed paths to assign explicit submission priority values so job-order ranking works correctly with seeded data.

## [1.4.2] - 2026-03-17

#### Changed
- Continued refining the job-order submission ranking badge styling and spacing.

## [1.4.1] - 2026-03-17

#### Changed
- Introduced the first visual refinement pass for the new job-order submission ranking indicator.

## [1.4.0] - 2026-03-17

#### Added
- Added persisted drag-and-drop submission ranking on job-order detail so recruiters can keep submissions ordered by preference/importance.

## [1.3.17] - 2026-03-17

#### Changed
- Upgraded Next.js to `16.1.7`, refreshed several direct dependencies, and removed the unused `xlsx` package to clear npm audit warnings.

## [1.3.16] - 2026-03-16

#### Added
- Added branded custom 404 and 500 error pages with dedicated Hire Gnome artwork for not-found, route error, and global error states.

## [1.3.15] - 2026-03-16

#### Changed
- Match explanation modals now auto-generate the explanation on open when no cached explanation exists yet.

## [1.3.14] - 2026-03-16

#### Changed
- Kept open job orders matchable even when current submissions meet or exceed openings, so candidate and job-order match views continue surfacing possible fits.

## [1.3.13] - 2026-03-16

#### Fixed
- Prevented workspace save/action buttons from stretching full width so note and other inline actions keep consistent content-width sizing.

## [1.3.12] - 2026-03-16

#### Fixed
- Tightened the shared list-table actions column so single-icon open actions consume less horizontal space.

## [1.3.11] - 2026-03-16

#### Changed
- Removed direct archive actions from list rows and moved record archiving into the detail-screen actions menus with confirmation prompts.

## [1.3.10] - 2026-03-16

#### Changed
- Simplified list-view column chooser triggers to an icon-only control instead of the `Columns` text button.

## [1.3.9] - 2026-03-16

#### Changed
- Switched the job-order public-description AI enhance control to the shared sparkles icon pattern for consistency with other AI actions.

## [1.3.8] - 2026-03-16

#### Fixed
- Matched the candidate AI Summary header button size to the adjacent actions button so header controls align cleanly.

## [1.3.7] - 2026-03-16

#### Fixed
- Corrected the candidate AI Summary header trigger to use a true icon-only sparkles button so the control renders properly on mobile and no longer collapses into broken text layout.

## [1.3.6] - 2026-03-16

#### Changed
- Candidate AI Summary now starts generating automatically when the summary modal opens and no stored summary exists yet.
- Candidate AI Summary documentation now reflects the modal-based flow instead of the old workspace-tab wording.

## [1.3.5] - 2026-03-16

#### Changed
- Moved the candidate AI Summary trigger out of the actions menu and into a dedicated header action.
- Updated the AI Summary modal to use compact icon-based generate/refresh controls instead of a large text button.

## [1.3.4] - 2026-03-16

#### Changed
- Moved candidate AI summaries out of the workspace tab strip and into `Actions > AI Summary`, opening the summary in a dedicated modal with in-place generate/refresh.

## [1.3.3] - 2026-03-15

#### Fixed
- Hardened `/api/lookups/contacts` and `/api/job-orders/[id]/matches` so demo environments with optional schema drift degrade cleanly instead of returning `500` for missing optional fields like `divisionId` or `publicDescription`.

## [1.3.2] - 2026-03-15

#### Changed
- Standardized fallback actor labels so `Unknown User` is capitalized consistently anywhere the UI shows missing authorship information.

## [1.3.1] - 2026-03-15

#### Changed
- Clarified demo welcome copy and user docs so inbound Postmark testing explicitly requires an email address in the forwarded message that matches an existing candidate or contact record.

## [1.3.0] - 2026-03-15

#### Added
- Demo-only first-login welcome modal for authenticated users in demo mode.
- Guided demo messaging that points users to seeded workflows, reporting, and inbound email testing through `demo@hiregnome.com`.

#### Changed
- Demo documentation now calls out the one-time welcome prompt and the inbound email test path explicitly.

## [1.2.0] - 2026-03-15

### 2026-03-15

#### Added
- AI candidate summaries on candidate detail, generated on demand from resume, skills, work history, education, and recent notes.
- AI client submission write-ups on submission detail, with generate/refresh and copy-to-clipboard controls.
- AI interview question generation on interview detail, with saved, editable question sets and copy support.
- AI match explanations for candidate/job-order matches, generated on demand and cached per candidate/job pair.
- AI email drafting for candidates and contacts from the actions menu, with purpose, tone, optional instructions, and copy support.

#### Changed
- AI-triggered controls now stay visible but disable cleanly with hints when OpenAI is not configured in system settings.
- Submission write-up generation moved out of the actions menu and into toolbar controls above the write-up field.
- Match lists now use icon-based explain actions instead of text buttons to reduce row clutter.

#### Fixed
- Candidate/job-order match eligibility is now consistent from both sides of the workflow.
- Match panels suppress extra empty-state and sort UI when an eligibility warning is already shown.
- Dashboard right-side badges were reworked back into proper wrapped pill styling.

### 2026-03-14

#### Added
- Inbound Postmark email webhook processing at `POST /api/inbound/postmark`.
- Candidate/contact email matching from inbound messages with automatic note creation.
- Candidate-only inbound attachment saving from supported email attachments.
- Admin diagnostics visibility for inbound email events, including match counts, notes created, files saved, and attachment skip reasons.

#### Changed
- Inbound email notes are cleaned before saving to remove forwarded-header noise, quoted thread junk, and external warning banners.
- Inbound email note/file attribution now attempts to match the forwarding sender to an internal user by email.
- Demo seed job posting copy was expanded with richer public descriptions aligned to the role.

#### Fixed
- Inbound attachment handling now accepts valid files that arrive with generic `application/octet-stream` content types.
- Email notes no longer blow out workspace width from unwrapped content.
- Demo seed data now creates default system settings when none exist and enables the career site by default for demo instances.

### 2026-03-13

#### Added
- Operational reporting with scoped access by role:
	- administrators see everything
	- directors see records they have access to
	- recruiters see only their own reporting data
- Report drill-through modals from summary cards and pipeline counts.
- Excel export for operational reporting with summary and entity tabs.

#### Changed
- Reporting defaults now use a last-7-days date range to keep the initial view tighter.
- Daily activity trend and owner performance layouts were tightened and visually aligned.
- Report exports were simplified so each entity tab mirrors the record detail shown in the UI instead of dumping raw generic columns.

#### Fixed
- Excel exports now use proper datetime cells and valid workbook styles.
- Owner performance no longer shows duplicate or misleading `Unassigned` rows for recruiter-scoped reporting.
- Recruiter rows in owner performance are now alphabetized.

### 2026-03-12

#### Added
- Kanban pipeline views for candidates and job orders with drag-and-drop status movement.
- Candidate and job-order match workspaces gained clearer fit explanation workflows and cleaner row actions.
- Expanded custom field coverage for submissions, interviews, and placements.

#### Changed
- Match rows were simplified by removing redundant inline warnings once explainable AI fit analysis became available.
- Detail/workspace layouts were tightened and standardized further across snapshot, list, and metadata patterns.

#### Fixed
- Kanban status changes now require the intended prompts and validations before moving records.
- Match-related UI now behaves consistently when jobs are on hold, closed, or over capacity.

### 2026-03-11

#### Added
- Data export in the admin area as a dedicated module/card for logical downstream migration and warehouse use.
- Data import support in the admin area for structured system-to-system migration workflows.
- Additional admin diagnostics surfacing for operational support and troubleshooting.

#### Changed
- Admin area cards were regrouped into clearer sections so configuration, billing, users, exports, imports, and diagnostics read more cleanly.
- Mobile and list-view layouts were refined to reduce wrapping, overflow, and noisy controls.

#### Fixed
- Session and demo-instance behavior was hardened around rebuilds, onboarding flows, and demo reset expectations.
- More list and workspace interactions now use consistent modal/confirm patterns instead of browser-native alerts.

### 2026-03-10

#### Added
- Dashboard refresh toward action-first workflows with KPI cards, needs-attention views, upcoming interviews, recent candidates, and recent job orders.
- Public careers experience improvements for seeded demo data and public job descriptions.
- Broader seeded demo data coverage for realistic records across industries and workflows.

#### Changed
- Demo seed data was cleaned up to better distribute dates, vary activity totals, and avoid duplicate seeded names across entities.
- Seeded job orders no longer all receive the same number of submissions, making match and submission workflows easier to test.

#### Fixed
- Seed data quality issues that made matching and dashboard/testing scenarios too uniform.
- Duplicate-name collisions across demo users, contacts, and candidates.

[1.2.0]: https://github.com/Concept-Cache/hire-gnome-ats
