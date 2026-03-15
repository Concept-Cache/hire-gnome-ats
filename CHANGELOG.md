# Changelog

This changelog captures the main product-facing changes that landed during the `1.2.0` iteration.

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
