# Submissions

## What This Module Is For
Submissions tracks candidate presentation to a specific job order.

## Core Relationships
Each submission is linked to:
- One candidate
- One job order
- One client (via job order)
- One hiring manager (via job order/contact)

## Edit Constraints
After creation:
- Candidate and job order are locked
- Converted submissions become non-editable

## Common Lifecycle
1. Create submission.
2. Add recruiter notes/context.
3. Generate or edit a client-facing write-up.
4. Advance status through review/interview steps.
5. Convert to placement when accepted.

## Actions Menu
Key actions:
- Schedule interview
- Convert to placement (with confirmation)
- View audit trail
- Archive

## Client Write-Up
Submission detail includes a dedicated `Client Write-Up` field for polished recruiter/client-facing candidate summaries.

Behavior:
- Generate or refresh from the toolbar above the field
- Copy directly to the clipboard from the toolbar
- Output is stored on the submission record
- Recruiters can edit the generated text before saving
- Uses the OpenAI API key from `Admin Area > System Settings`
- If the submission is converted to a placement, the write-up remains visible but is locked
- If OpenAI is not configured, the generate control remains visible but disabled with an inline hint

## Snapshot Usage
Snapshot emphasizes immutable context and links back to source records.

## Best Practice
- Always add concise submission notes so downstream users understand positioning.
- Keep status current to improve dashboard priority logic.
