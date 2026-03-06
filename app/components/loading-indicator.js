'use client';

export default function LoadingIndicator({ className = '', label = 'Loading' }) {
	const rootClassName = className ? `loading-indicator ${className}` : 'loading-indicator';

	return (
		<div className={rootClassName} role="status" aria-label={label}>
			<span className="loading-indicator-spinner" aria-hidden="true" />
		</div>
	);
}
