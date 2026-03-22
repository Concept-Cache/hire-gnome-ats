# Contacts

## What This Module Is For
Contacts tracks people at client organizations, typically hiring managers and stakeholder partners.

The contacts list also supports a separate `Advanced Search` builder so recruiters can combine structured filters like client, owner, status, notes count, job-order count, and last-activity dates without overloading the basic search box.

## Required Fields
- Name
- Email
- Mobile phone
- Source
- Owner
- Client

## Identity And Business Profile
Typical fields include:
- Title
- Department
- Status
- Website and LinkedIn URL (validated)
- Address and location enrichment

## Client Link Behavior
- Creating from a client route pre-fills and locks the client.
- Existing contacts do not allow changing client to prevent cross-link data drift.

## Workspace Usage
Use workspace tabs for:
- Notes
- Activities

## Actions Menu
Typical actions:
- Add job order
- Draft email
- View audit trail (administrators only)

## Email Drafting
Contact detail actions include `Draft Email`.

What it does:
- Opens an AI drafting modal for the current contact
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

## Best Practice
1. Verify email and mobile before first outreach.
2. Keep title/department current to improve submission targeting.
3. Use notes for call outcomes and relationship intelligence.

## Advanced Search
Use advanced search on the contacts list when quick lookup is not enough.

Useful examples:
- `Client = Atlas Test`
- `Status = Active`
- `Job Orders >= 1`
- `Notes > 0`
- `Last Activity Date in past 30 days`
