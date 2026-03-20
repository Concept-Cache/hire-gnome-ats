# Dashboard

## What This Page Is For
The dashboard is your launchpad for daily execution. It surfaces what needs attention now and what is scheduled next.

## Main Sections

### Key Metrics
The top row shows quick operational counts with direct links into the related module:
- Interviews Today
- Awaiting Feedback
- Web Responses
- Interview Requests
- Open Jobs Stalled 7d
- Placements This Month

`Interview Requests` is shown only when the client portal feature is enabled in system settings.

Clicking a metric opens a detail modal so users can see the actual records behind the count without leaving the dashboard.

### 7-Day Activity
The activity strip shows a compact daily rollup for:
- Candidates
- Job Orders
- Submissions
- Interviews
- Placements

This is meant to show short-term direction, not replace formal reporting.

### Needs Attention
Shows actionable items that need follow-up, based on lifecycle and date logic.

Typical examples:
- Client interview requests that have not been scheduled yet
- Career-site web responses that still need recruiter review
- Client portal links that were sent but not opened
- Client portals that were viewed without a follow-up action
- Active submissions that are aging without movement
- Open jobs with no new submissions in the last 7 days

Portal-specific alerts are suppressed when the client portal feature is disabled.

### Upcoming Interviews
Shows scheduled interviews you can access based on your role/division permissions.

Each row focuses on:
- Candidate and job order context
- Interview type
- Date/time in app display format (`M/D/YYYY @ h:mm A`)

### Recently Added Candidates
Shows the newest accessible candidate records with owner and status context.

### Recently Opened Job Orders
Shows recently opened active job orders with client, owner, and status context.

## Paging Behavior
- Dashboard sections use fixed-height panels on desktop
- Longer sections page within the card instead of pushing the next section off-screen
- `View All` still opens the full matching set in a modal

## How To Use It Well
1. Work top-down through Needs Attention first.
2. Use the KPI cards when you want a quick drill-through into matching records.
3. Confirm interview readiness for the next 24-72 hours.
4. Use recent adds for situational awareness without opening list views.

## Recommended Daily Routine
1. Start with queue items.
2. Check the 7-day activity strip for short-term pace.
3. Resolve blockers.
4. Update submissions/interviews/placements before end of day.
5. Leave notes for team visibility and accountability.

## Notes
- Data shown is permission-scoped.
- Empty states are expected when no records meet criteria.
