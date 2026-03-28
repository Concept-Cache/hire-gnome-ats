# Zoho Recruit Batch Sample

This folder contains a clean Zoho Recruit-style CSV batch for testing `Admin Area > Data Import > Zoho Recruit Batch ZIP` or `Zoho Recruit Multi-File`.

Files are ordered by dependency:
1. `01-clients.csv`
2. `02-contacts.csv`
3. `03-candidates.csv`
4. `04-job-orders.csv`
5. `05-submissions.csv`
6. `06-interviews.csv`
7. `07-placements.csv`

The sample is designed to demonstrate:
- Zoho-style account/contact linking
- Candidate imports from Zoho Recruit exports
- Job order imports linked to resolved accounts and contacts
- Candidate/job-order submission linking
- Interview and placement imports tied to the same migration batch
- ZIP or manual multi-file migration flow for Zoho Recruit
