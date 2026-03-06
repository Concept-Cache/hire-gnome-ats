# Admin Area

## What This Module Is For
Admin Area controls platform-level configuration, access, diagnostics, and operational safety.

## Main Areas
- System Settings
- Users
- Divisions
- Skills
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

## Billing
Visible only when billing is enabled. Includes seat summary, sync action, and sync history.

## API Errors
Operational error visibility for diagnostics and support.

## Best Practice
1. Lock down admin access to trusted operators only.
2. Keep integration credentials current.
3. Review errors regularly.
4. Use test email mode in non-production environments.
