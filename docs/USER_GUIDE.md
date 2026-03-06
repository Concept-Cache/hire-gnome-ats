# Hire Gnome ATS User Guide

This guide is for day-to-day users. It explains the core workflow and how each module fits together.

## 1) Core Workflow

Use this sequence as your default process:

1. Create or update a `Client`.
2. Create or update a `Contact` for that client.
3. Create a `Job Order` linked to the client and hiring manager contact.
4. Add or import a `Candidate`.
5. Create a `Submission` for candidate + job order.
6. Schedule one or more `Interviews`.
7. Convert successful submissions to `Placements`.
8. Use notes, activities, and audit trail for accountability.

## 2) Roles And Access

### Administrator
- Full access across all divisions.
- Can manage users, divisions, system settings, billing, and diagnostics.
- Can reassign owners and divisions.

### Director
- Access to all records in their division.
- Can assign ownership to recruiters in the same division.

### Recruiter
- Access is controlled by division mode:
- `Collaborative` division: sees all records in that division.
- `Owner Only` division: sees records they own (plus records explicitly linked by workflow).

## 3) Navigation Basics

- Left navigation: module list.
- Top search: global search across records.
- User menu (`top-right`): account settings, Help, and sign out.
- List pages: search, filters, sorting, paging, and column chooser.
- Detail pages: snapshot at top, editable form, workspace tabs for related records.
- Actions menu (`...`): context actions like archive, close, cancel, convert, view audit.

## 4) Required Field Behavior

- Required fields show a red `*`.
- Save buttons stay disabled until required fields are valid.
- Email and URL fields are validated.
- Phone and currency fields auto-format while typing.
- Zip-based city/state inference is applied where configured.

## 5) Module Guides

## Candidates

Primary purpose:
- Store candidate profile, resume, skills, history, and activity.

Common actions:
1. `Candidates > New Candidate`
2. Fill required identity fields.
3. Add status, source, owner, and current employment details.
4. Add notes, education, work history, and file attachments.
5. Use `Actions` for fast create:
- Add submission
- Add interview
- Add placement

Resume parsing:
- Choose upload or paste mode.
- System attempts AI parsing first if key is configured.
- Falls back to built-in parser if AI is unavailable.
- Parsed resumes can auto-populate candidate data and attach source file.

Duplicate handling:
- Candidate creation includes duplicate checks.
- Merge option is available when duplicate confidence is high.

## Clients

Primary purpose:
- Track companies, ownership, status, and client-level notes/activity.

Common actions:
1. `Clients > New Client`
2. Set required fields including owner and status.
3. Add address and zip for location inference.
4. From client detail actions, create:
- New contact (client locked)
- New job order (client locked)

## Contacts

Primary purpose:
- Track hiring-side people tied to clients.

Common actions:
1. `Contacts > New Contact`
2. Complete required fields:
- Name
- Email
- Mobile
- Source
- Owner
- Client
3. Add title, department, address, and notes.

Behavior notes:
- When creating from a client route, client is locked.
- For existing contact records, client is not editable.

## Job Orders

Primary purpose:
- Define open requisitions and required qualifications.

Common actions:
1. `Job Orders > New Job Order`
2. Set required owner, status, client, and hiring manager contact.
3. Add internal description.
4. If career-site posting is enabled:
- Toggle publish on
- Add public description (required when publishing)

Submission workflow:
- Add submissions directly from job order detail workspace.
- Duplicate submissions for same candidate + job are blocked.
- Candidate suggestions use qualification scoring and typeahead safeguards.

## Submissions

Primary purpose:
- Track candidate delivery to job orders.

Common actions:
1. Create submission from candidate or job order flow.
2. Update status through lifecycle.
3. Use actions menu for:
- Convert to placement (with confirmation)
- Schedule interview

Behavior notes:
- Candidate/job become locked after creation.
- If converted to placement, submission becomes non-editable.

## Interviews

Primary purpose:
- Schedule and coordinate interview events.

Common actions:
1. Create interview from submission or interview list.
2. Required fields:
- Interviewer
- Interviewer email
- Start date/time
3. Set duration; end time auto-calculates.
4. Set type (`Phone`, `Video`, `In Person`) and location.
5. Add optional participants and optional video link.

Calendar + email behavior:
- `.ics` generation is available from interview actions.
- Invite emails are sent on create/update when email config exists.
- In test mode, all emails route to `EMAIL_TEST_RECIPIENT`.
- Status `Completed` does not trigger invite update emails.
- Cancel interview action requires confirmation and marks status accordingly.

## Placements

Primary purpose:
- Track accepted and non-accepted placement outcomes.

Common actions:
1. Convert from submission or create manually.
2. Select compensation type and placement type.
3. Enter required compensation fields based on selected type.
4. Set start/end dates and status.

Status behavior:
- `Accepted` locks the placement record read-only.
- Actions include withdraw/cancel with confirmation and reason capture.

## Archive

Primary purpose:
- Soft-delete flow for safe record cleanup and restore.

Common actions:
1. Archive from detail actions menu.
2. Optionally include related child records when prompted.
3. Use `Archive` module to review and restore.

## 6) Dashboard

Dashboard is designed for action, not reporting noise.

Expect to see:
- Priority queue items requiring attention.
- Upcoming interview schedule.
- Recent/important accessible records.

Data shown is scoped to your permissions and division access rules.

## 7) Career Site Flow

If enabled by admin:
- Public users can browse open jobs and view details.
- Public applications create:
- Candidate (source: `Career Site`)
- Submission linked to the job order
- Uploaded resume file attachment

Owner notifications:
- Job owner can receive quick-apply emails if notification settings allow.

## 8) Audit Trail And Accountability

- Updates are logged with actor, timestamp, and field-level changes.
- Audit panel is opened from actions menu on detail pages.
- Payload view is available for technical/admin review.

## 9) Common Troubleshooting

`Save disabled`:
- Check required fields, email/URL format, and locked-field restrictions.

`No typeahead results`:
- Confirm records exist in your access scope (division + owner rules).
- For submission candidate selection, only qualified/open candidates may appear.

`Invite or notification did not send`:
- Verify SMTP settings in admin.
- Verify user notification preference.
- Check whether test mode rerouted email.

`Cannot edit record`:
- Record may be locked by status (`Accepted`, converted submission, etc.).
- You may not have ownership/division permission.

## 10) First-Day Checklist For New Users

1. Confirm your profile and password.
2. Verify your division and owner assignment.
3. Create one client, one contact, one job order.
4. Add one candidate and create one submission.
5. Schedule one interview and test `.ics` download.
6. Convert one submission to placement to understand the full lifecycle.
