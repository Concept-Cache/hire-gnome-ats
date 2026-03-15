# Interviews

## What This Module Is For
Interviews handles scheduling, participant coordination, and calendar payload generation.

## Required Fields
- Interviewer
- Interviewer email
- Start date/time

Additional structured fields:
- Type (`Phone`, `Video`, `In Person`)
- Duration (drives end time calculation)
- Location
- Optional video link
- Optional participants

## Scheduling Logic
- End date/time is calculated from start + duration.
- Candidate and job order are locked after creation.
- Interview status can be cancelled from actions with confirmation.

## Invites And `.ics`
From actions, users can generate/download `.ics` files.

On create/update, email invites can send to participants when SMTP is configured.

Test safety behavior:
- If `EMAIL_TEST_MODE=true`, all outbound mail routes to `EMAIL_TEST_RECIPIENT`.

## Status Behavior
- `Completed` does not trigger invite-send updates.
- Cancel action sets cancelled status intentionally.

## Interview Questions
- Interview detail includes an `Interview Questions` area for AI-assisted question generation.
- Generation uses the candidate profile, resume/work history, skills, and linked job order context.
- Questions are stored on the interview record so recruiters can review, edit, regenerate, or copy them later.
- Uses the OpenAI API key from `Admin Area > System Settings`.
- If OpenAI is not configured, the generate control remains visible but disabled with an inline hint.

## Best Practice
1. Confirm participant emails before save.
2. Keep location/video link accurate.
3. Use optional participants for coordinators and panel observers.
