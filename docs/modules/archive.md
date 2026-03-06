# Archive

## What This Module Is For
Archive provides soft-delete controls so records can be removed from active workflows without hard deletion.

## Why Archive Instead Of Delete
- Safer for operations
- Preserves history and auditability
- Supports restore if archived by mistake

## Archive Flow
1. Archive from a record action menu.
2. Confirm archive.
3. Optionally include related records where cascade choices are available.

## Restore Flow
1. Open Archive module.
2. Filter/search to locate item.
3. Restore to active state.

## Access And Visibility
Archived records are hidden from active module lists but remain available in Archive for permitted users.

## Best Practice
- Use reason notes during archive operations when business context matters.
- Prefer archive for lifecycle cleanup instead of destructive workflows.
