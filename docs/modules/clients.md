# Clients

## What This Module Is For
Clients represents companies your team sells into and recruits for.

## Key Fields
- Client name
- Status (`Prospect`, `Active`, `Active + Verified`, `Inactive`)
- Owner
- Division
- Main phone
- Address (street, city, state, zip)

Zip-based city/state inference is available where configured.

## Required Validation
Save remains disabled until required fields are complete and valid.

## Client Workspace
Use workspace tabs to manage related records without leaving the client context:
- Contacts
- Job Orders
- Notes
- Activities

## Actions Menu
From client detail, common actions include:
- Add new contact (client pre-linked and locked)
- Add new job order (client pre-linked and locked)
- View audit trail
- Archive

## Lifecycle Guidance
1. Create as `Prospect` for new targets.
2. Move to `Active` once engaged.
3. Use `Active + Verified` once relationship quality and contacts are confirmed.
4. Set `Inactive` for dormant/closed relationships.

## Team Accountability
- Keep notes factual and timestamped.
- Capture ownership changes through normal save flow so audit logs track who changed what.
