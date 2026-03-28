# Generic CSV Migration Batch Sample: Messy Source Version

This folder contains a realistic but still import-safe batch for demonstrating the generic CSV mapping workflow.

Use this set when you want to show:
- inconsistent legacy column names
- alias-based auto-mapping
- manual mapping cleanup where needed
- the same dependency-ordered multi-file migration flow

Files are still numbered in the importer order:
1. `01-clients.csv`
2. `02-contacts.csv`
3. `03-candidates.csv`
4. `04-job-orders.csv`
5. `05-submissions.csv`
6. `06-interviews.csv`
7. `07-placements.csv`

What makes this batch "messy":
- column names use legacy labels like `Company`, `Posting Title`, `Job Opening Status`, `Lead Source`, and `OfferDate`
- values use realistic source-system wording like `Direct Hire`, `Contract W2`, `Shortlisted`, and `Interviewing`
- relationship columns mix external IDs with readable fallback names/emails

Recommended demo use:
- show the clean batch first for the fast happy path
- then show this batch to prove the importer can handle the real-world spreadsheet mess recruiters actually bring over
