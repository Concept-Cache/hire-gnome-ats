# Reports

The Reports module gives teams a scoped operational view of hiring activity without dumping raw database tables on screen.

## What You Can Do

- Run date-based operational reports for the last 7 days by default or any custom range
- Review KPI totals for:
	- Candidates added
	- Job orders opened
	- Submissions created
	- Interviews scheduled
	- Placements created
	- Placements accepted
	- Current open job orders
- See live pipeline totals for candidates, job orders, submissions, and placements
- Review interview type mix (`Phone`, `Video`, `In Person`)
- Review daily activity trend across the selected date range
- Compare owner performance across the users you are allowed to report on
- Export the current report view to an Excel workbook
- Click summary cards and pipeline counts to drill into the matching records in a modal
- Click owner performance chips to drill into the matching owner-scoped records in a modal

## Access Scope

Reporting access is intentionally narrower than normal list visibility.

- `Administrator`
	- Can report on all divisions and all owners
- `Director`
	- Can report on users and records inside their division
- `Recruiter`
	- Reporting is locked to their own data only

This means a recruiter in a collaborative division may still see shared records elsewhere in the app, but the Reports module only rolls up work tied to that recruiter.

## Filters

Use the top filter bar to control:

- `Start Date`
- `End Date`
- `Division` (`Administrator` only)
- `Owner` (`Administrator` and `Director`)

Click `Run Report` after changing filters. `Reset` restores the default last-7-days view.
Use `Export Excel` to download the currently filtered report as an `.xlsx` workbook.

## Drill-Through Detail

Every major count in the report can answer "which records?"

- Summary cards open the matching record list in a modal
- Pipeline panels support:
	- `View All`
	- individual status/type drill-through
- The detail modal shows the matching records with direct links into the source module

This lets you move from top-line metrics into the actual candidates, job orders, submissions, interviews, or placements behind the count.

## Excel Export

The Excel export is organized into a small set of sheets so the output stays readable in Excel without turning into workbook sprawl.

Included sheets:

- `Summary`
	- report header metadata (`date range`, `division`, `owner`)
	- summary-card counts
- `Candidates`
- `Job Orders`
- `Submissions`
- `Interviews`
- `Placements`

Each entity sheet contains the unique records included in the report counts, along with status-style tags, metadata, and flags showing whether the record contributed to a summary-card count such as `New Candidate`, `Open Job Order`, or `Accepted Placement`.
Each entity sheet mirrors the record detail shown in the report modal, using entity-specific columns instead of a generic title/subtitle export.

Examples:

- `Candidates`
	- `Name`
	- `Title`
	- `Company`
	- `Owner`
	- `Updated`
	- `Status`
- `Job Orders`
	- `Title`
	- `Client`
	- `Owner`
	- `Updated`
	- `Opened`
	- `Status`
- `Submissions`
	- `Candidate`
	- `Job Order`
	- `Client`
	- `Submitted By`
	- `Updated`
	- `Status`
- `Interviews`
	- `Subject`
	- `Candidate`
	- `Job Order`
	- `Client`
	- `Scheduled`
	- `Type`
	- `Status`
- `Placements`
	- `Candidate`
	- `Job Order`
	- `Client`
	- `Event`
	- `Event Date`
	- `Status`

Each detail tab is sorted by status first, then alphabetically by the primary record name/title. The export respects the same date range and role-based access rules as the screen view.

## What Counts Mean

### Summary

- `Candidates Added`
	- Candidate records created in the selected range
- `Job Orders Opened`
	- Job orders opened in the selected range
- `Submissions Created`
	- New submissions created in the selected range
- `Interviews Scheduled`
	- Interview records created in the selected range
- `Placements Created`
	- Placement records created in the selected range
- `Placements Accepted`
	- Placements whose status changed to `Accepted` during the selected range
- `Current Open Job Orders`
	- Open or on-hold job orders in the current accessible pipeline

### Pipeline Panels

These show the current count of accessible active records by status, not just records created during the selected range.

### Daily Activity Trend

The trend section rolls up activity by day for the selected range:

- `C` = Candidates
- `J` = Job Orders
- `S` = Submissions
- `I` = Interviews
- `P` = Placements

### Owner Performance

Owner performance assigns activity to the most relevant owner for that workflow:

- Candidates and job orders use their record owner
- Submissions prefer `Submitted By`, then candidate/job order owner
- Interviews use candidate/job order owner
- Placements prefer linked submission creator, then candidate/job order owner

Unowned records appear under `Unassigned`.

Each owner metric chip is clickable:

- `Candidates`
- `Jobs`
- `Submissions`
- `Interviews`
- `Placements`
- `Accepted`

Clicking a chip opens the same report detail modal used elsewhere, filtered to that owner and metric.

## Notes

- Archived records are excluded from reporting
- The report is operational by design and is not intended to replace warehouse-grade analytics
- The current version is focused on recruiting workflow throughput and team accountability
