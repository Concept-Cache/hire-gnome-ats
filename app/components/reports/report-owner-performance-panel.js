'use client';

function OwnerMetricChip({ className, count, label, onClick }) {
	if (!count) {
		return (
			<span className={`chip report-owner-chip ${className} report-owner-chip-disabled`}>
				{label} {count}
			</span>
		);
	}

	return (
		<button type="button" className={`chip report-owner-chip ${className} report-detail-button`} onClick={onClick}>
			{label} {count}
		</button>
	);
}

export default function ReportOwnerPerformancePanel({ owners, onSelectOwnerDetail }) {
	return (
		<article className="panel panel-spacious">
			<h3>Owner Performance</h3>
			{owners.length === 0 ? <p className="panel-subtext">No records yet.</p> : null}
			{owners.length > 0 ? (
				<div className="report-owner-list">
					{owners.map((owner) => (
						<div key={owner.id} className="report-owner-row">
							<div className="report-owner-name">
								<strong>{owner.ownerName}</strong>
							</div>
							<div className="report-owner-chips">
								<OwnerMetricChip className="report-owner-chip-candidates" count={owner.candidatesAdded} label="Candidates" onClick={() => onSelectOwnerDetail(owner, 'candidatesAdded', 'Candidates')} />
								<OwnerMetricChip className="report-owner-chip-jobs" count={owner.jobOrdersOpened} label="Jobs" onClick={() => onSelectOwnerDetail(owner, 'jobOrdersOpened', 'Job Orders')} />
								<OwnerMetricChip className="report-owner-chip-submissions" count={owner.submissionsCreated} label="Submissions" onClick={() => onSelectOwnerDetail(owner, 'submissionsCreated', 'Submissions')} />
								<OwnerMetricChip className="report-owner-chip-interviews" count={owner.interviewsScheduled} label="Interviews" onClick={() => onSelectOwnerDetail(owner, 'interviewsScheduled', 'Interviews')} />
								<OwnerMetricChip className="report-owner-chip-placements" count={owner.placementsClosed} label="Placements" onClick={() => onSelectOwnerDetail(owner, 'placementsClosed', 'Placements')} />
							</div>
						</div>
					))}
				</div>
			) : null}
		</article>
	);
}
