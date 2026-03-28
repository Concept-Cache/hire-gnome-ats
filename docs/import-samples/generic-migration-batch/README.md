# Generic CSV Migration Batch Sample

This folder contains a clean sample migration batch for `Admin Area > Data Import > Generic CSV`.

Files are numbered in the same dependency order used by the importer:

1. `01-clients.csv`
2. `02-contacts.csv`
3. `03-candidates.csv`
4. `04-job-orders.csv`
5. `05-submissions.csv`
6. `06-interviews.csv`
7. `07-placements.csv`

Use this batch for:
- testing the generic CSV migration flow end to end
- demoing the migration experience to prospects
- showing how related records link across multiple files in one import

What this sample demonstrates:
- clients can be created first and then linked by contacts and job orders in the same batch
- candidates can be created first and then linked by submissions, interviews, and placements in the same batch
- relationship resolution works cleanly through `External ID` plus readable fallback fields like names and emails

Recommended demo flow:
1. Go to `Admin Area > Data Import`
2. Choose `Generic CSV`
3. Add all seven CSV files as one migration batch
4. Keep the files in numbered order or assign the matching entity profile to each file
5. Preview the import
6. Apply the import
7. Review the linked records in the app

Suggested relationship checks after import:
- `North Peak Advisory` should have `Megan Holt` and `Daniel Brooks` as contacts
- `Senior Data Analyst` should link to `North Peak Advisory` and `Megan Holt`
- `Amelia Bailey` should appear on the `Senior Data Analyst` job order as a submission
- the accepted placement should link back to the imported candidate, job order, and submission

Notes:
- these files are intentionally clean and import-safe so they can be used in demos
- if you want a messier migration test, clone this folder and introduce column-name or value variations for mapping practice
