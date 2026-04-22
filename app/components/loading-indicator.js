'use client';

import { LoaderCircle } from 'lucide-react';

export default function LoadingIndicator({ className = '', label = 'Loading' }) {
	const rootClassName = className ? `loading-indicator ${className}` : 'loading-indicator';

	return (
		<div className={rootClassName} role="status" aria-label={label}>
			<LoaderCircle aria-hidden="true" className="loading-indicator-spinner" />
		</div>
	);
}
