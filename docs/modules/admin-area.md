# Admin Area

## What This Module Is For
Admin Area controls platform-level configuration, access, diagnostics, and operational safety.

## Main Areas
- System Settings
- Data Import
- Data Export
- Users
- Divisions
- Skills
- Custom Fields
- Billing (when enabled)
- API Errors

## System Settings
Configuration includes:
- Site name and logo
- Theme preset
- Career site enabled/disabled
- API keys (Google, OpenAI)
- SMTP/email configuration
- Storage configuration (S3/local fallback)
- Demo mode visibility/lock behavior
- System diagnostics and test email tools

## Data Import
Supports:
- Hire Gnome exports
- Bullhorn CSV profiles
- Zoho Recruit CSV profiles

Import workflow:
- Upload source file
- Preview changes
- Apply import

## Data Export
Use Data Export for:
- Full snapshot export
- Incremental date-range export
- Optional audit trail export
- Optional API error log export

Formats:
- JSON
- NDJSON
- ZIP (per-entity files)

## Users
Admins can:
- Create/deactivate users
- Assign roles
- Assign divisions
- Trigger password resets and account access changes

## Divisions
Defines organizational boundaries and collaboration mode:
- Collaborative
- Owner Only

## Skills
Maintains standardized selectable skill options used by candidate records and matching.

## Custom Fields
Admins can define additional fields for:
- Candidates
- Clients
- Contacts
- Job Orders
- Submissions
- Interviews
- Placements

## Billing
Visible only when billing is enabled. Includes seat summary, sync action, and sync history.

## API Errors
Operational error visibility for diagnostics and support.

## Best Practice
1. Lock down admin access to trusted operators only.
2. Keep integration credentials current.
3. Review errors regularly.
4. Use test email mode in non-production environments.
