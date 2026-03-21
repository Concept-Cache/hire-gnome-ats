'use client';

import Link from 'next/link';
import { X } from 'lucide-react';
import LoadingIndicator from '@/app/components/loading-indicator';

export default function ReportDetailModal({ open, detail, detailLoading, onClose }) {
	if (!open) return null;

	return (
		<div className="confirm-overlay" onClick={onClose}>
			<div
				className="confirm-dialog report-detail-modal"
				role="dialog"
				aria-modal="true"
				aria-labelledby="report-detail-modal-title"
				onClick={(event) => event.stopPropagation()}
			>
				<div className="report-detail-modal-head">
					<h3 id="report-detail-modal-title" className="confirm-title">
						{detail.title || 'Report Detail'}
					</h3>
					<button
						type="button"
						className="btn-secondary btn-link-icon report-detail-modal-close"
						onClick={onClose}
						aria-label="Close report detail"
						title="Close"
					>
						<X aria-hidden="true" className="btn-refresh-icon-svg" />
					</button>
				</div>
				{detailLoading ? <LoadingIndicator className="list-loading-indicator" label="Loading report detail" /> : null}
				{!detailLoading && detail.rows.length === 0 ? <p className="panel-subtext">No matching records.</p> : null}
				{!detailLoading && detail.rows.length > 0 ? (
					<ul className="simple-list report-detail-list report-detail-list-modal">
						{detail.rows.map((row) => (
							<li key={`${row.href || row.id}`}>
								<div>
									<strong>{row.href ? <Link href={row.href}>{row.title || '-'}</Link> : row.title || '-'}</strong>
									<p>{row.subtitle || '-'}</p>
									<p className="simple-list-meta">{row.meta || '-'}</p>
								</div>
								<div className="simple-list-actions simple-list-indicators report-detail-chips">
									{row.chips.map((chip) => (
										<span key={chip} className="chip">
											{chip}
										</span>
									))}
								</div>
							</li>
						))}
					</ul>
				) : null}
			</div>
		</div>
	);
}
