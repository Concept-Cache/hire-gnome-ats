'use client';

export default function NewRecordGuide({ title, intro, checklist = [], outcomes = [], tips = [] }) {
	return (
		<aside className="panel new-record-guide" aria-label={`${title} guidance`}>
			<div className="new-record-guide-section">
				<h3>{title}</h3>
				{intro ? <p className="panel-subtext">{intro}</p> : null}
			</div>

			{checklist.length > 0 ? (
				<div className="new-record-guide-section">
					<h4>Before You Save</h4>
					<ul className="new-record-guide-list">
						{checklist.map((item) => (
							<li key={item}>{item}</li>
						))}
					</ul>
				</div>
			) : null}

			{outcomes.length > 0 ? (
				<div className="new-record-guide-section">
					<h4>What Happens Next</h4>
					<ul className="new-record-guide-list">
						{outcomes.map((item) => (
							<li key={item}>{item}</li>
						))}
					</ul>
				</div>
			) : null}

			{tips.length > 0 ? (
				<div className="new-record-guide-section">
					<h4>Good Practice</h4>
					<ul className="new-record-guide-list">
						{tips.map((item) => (
							<li key={item}>{item}</li>
						))}
					</ul>
				</div>
			) : null}
		</aside>
	);
}
