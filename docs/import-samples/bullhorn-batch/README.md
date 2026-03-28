# Bullhorn Batch Sample

This folder contains a clean Bullhorn-style CSV batch for testing `Admin Area > Data Import > Bullhorn Batch ZIP` or `Bullhorn Multi-File`.

Files are ordered by dependency:
1. `00-custom-field-definitions.csv`
2. `01-clients.csv`
3. `02-contacts.csv`
4. `03-candidates.csv`
5. `04-job-orders.csv`
6. `05-submissions.csv`
7. `06-interviews.csv`
8. `07-placements.csv`
9. `08-candidate-notes.csv`
10. `09-candidate-educations.csv`
11. `10-candidate-work-experiences.csv`
12. `11-contact-notes.csv`
13. `12-candidate-files.csv`
14. `files/candidates/...` attachment payloads

The sample is designed to demonstrate:
- Bullhorn-style ID linking across files
- Custom field schema import before record import
- Client -> Contact relationships
- Candidate notes, education, and work history migration
- Contact note migration
- Candidate skill migration through the exported `Skills` column
- Client/Contact -> Job Order relationships
- Candidate/Job Order -> Submission relationships
- Candidate/Job Order -> Interview relationships
- Candidate/Job Order/Submission -> Placement relationships
- Candidate resume/file payloads carried inside the ZIP for file migration testing
- Clean preview/apply behavior without unresolved-link warnings

To create a ZIP for testing:
```bash
cd docs/import-samples/bullhorn-batch
zip -r bullhorn-batch-sample.zip .
```
