# Candidates

## What This Module Is For
Candidates stores profile, status, ownership, resume, skills, education, work history, notes, files, and related hiring activity.

It also includes an on-demand AI summary modal, opened from the candidate detail header, that turns the current candidate profile into a concise recruiter-facing brief.

## Required Fields
On create, required fields are enforced with red `*` markers and disabled Save until valid.

Common required fields include:
- Name
- Email
- Mobile phone
- Status
- Source
- Owner
- Current employer
- Current job title

## Resume Intake Options

### Manual Entry
Use when profile data is known and no resume parsing is needed.

### Resume Parse
Use upload or paste mode. The system attempts AI parsing when configured, and falls back to built-in parsing if AI is unavailable.

What parsing can populate:
- Identity/contact fields
- Skills
- Resume summary text
- Education rows
- Work experience rows

## Skills Management
- Skills are selected from admin-maintained options.
- Unknown skills can be captured in the "Other" area.
- Chips are removable inline.

## Candidate Workspace
The workspace provides linked execution views:
- Submissions
- Interviews
- Placements
- Notes
- Activities
- Files
- Matched Job Orders

## AI Summary
Use the sparkles `AI Summary` header button on candidate detail to open the summary modal. If no summary exists yet, the modal starts generating one automatically from the current candidate record.

The generated summary includes:
- Overview
- Strengths
- Concerns
- Suggested next step

Behavior:
- Opening the modal auto-generates the first summary when none exists.
- Existing summaries can be refreshed from the modal.
- Requires an OpenAI API key in `Admin Area > System Settings`.
- The summary is stored separately from the resume text.
- If OpenAI is not configured, the AI controls remain visible but disabled with an inline hint.

## Match Explanations
The matched job orders workspace supports `Explain Match`.

What it does:
- Saves an AI explanation for the current candidate/job pair
- Explains:
	- why the role fits
	- likely gaps
	- what to validate
	- how to position the candidate honestly

Behavior:
- Generated on demand
- Saved and reusable for that candidate/job pair
- Can be refreshed when the candidate or job order changes
- If OpenAI is not configured, `Explain Match` remains visible but disabled with a tooltip/hint.

## Actions Menu
From candidate detail, actions can launch:
- New submission
- New interview
- New placement
- Draft email
- Audit trail

## Email Drafting
Candidate detail actions include `Draft Email`.

What it does:
- Opens an AI drafting modal for the current candidate
- Lets the user choose:
	- purpose
	- tone
	- optional additional instructions
- Generates:
	- subject
	- body
- Supports copy to clipboard

Behavior:
- On demand only; drafts are not auto-saved to the record
- Requires an OpenAI API key in `Admin Area > System Settings`
- If AI is unavailable, the action remains visible but disabled with a hint

## Duplicate Protection
Candidate creation includes duplicate checks and merge support when likely duplicates are detected.

## Best Practice
1. Parse resume if available.
2. Validate contact data and owner.
3. Confirm status and source.
4. Add at least one note with context.
5. Move into submission workflow quickly.
