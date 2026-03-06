'use client';

import { ArrowDown, ArrowUp } from 'lucide-react';

export default function ListSortControls({
	label = 'Sort',
	options = [],
	value = '',
	direction = 'desc',
	onValueChange,
	onDirectionToggle,
	disabled = false
}) {
	const DirectionIcon = direction === 'asc' ? ArrowUp : ArrowDown;
	const directionLabel = direction === 'asc' ? 'Ascending' : 'Descending';

	return (
		<div className="simple-list-toolbar">
			<label className="simple-list-sort-label">
				<span>{label}</span>
				<select
					value={value}
					onChange={(event) => onValueChange?.(event.target.value)}
					disabled={disabled}
				>
					{options.map((option) => (
						<option key={option.value} value={option.value}>
							{option.label}
						</option>
					))}
				</select>
			</label>
			<button
				type="button"
				className="simple-list-sort-direction"
				onClick={() => onDirectionToggle?.()}
				disabled={disabled}
				aria-label={`Toggle sort direction. Current: ${directionLabel}`}
				title={directionLabel}
			>
				<DirectionIcon aria-hidden="true" />
			</button>
		</div>
	);
}
