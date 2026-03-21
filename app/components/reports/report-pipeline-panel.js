'use client';

export default function ReportPipelinePanel({ title, detailKey, series, total, onSelectDetail }) {
	return (
		<article className="panel panel-spacious">
			<div className="panel-header-row">
				<h3>{title}</h3>
				<button
					type="button"
					className="btn-secondary report-detail-button"
					onClick={() => onSelectDetail({ group: 'pipeline', key: detailKey, value: 'all', label: title })}
				>
					View All
				</button>
			</div>
			<div className="report-series-grid">
				{series.map((item) => (
					<button
						key={item.value}
						type="button"
						className="report-series-card report-detail-button"
						onClick={() =>
							onSelectDetail({
								group: 'pipeline',
								key: detailKey,
								value: item.value,
								label: `${title} - ${item.label}`
							})
						}
					>
						<p className="metric-label">{item.label}</p>
						<p className="report-series-value">{item.count}</p>
					</button>
				))}
			</div>
			<p className="report-panel-total">Total: {total}</p>
		</article>
	);
}
