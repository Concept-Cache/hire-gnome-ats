'use client';

import { useMemo, useState } from 'react';
import { isValidEmailAddress } from '@/lib/email-validation';

function splitEmailInput(rawValue) {
	return String(rawValue || '')
		.split(/[,\n;]+/)
		.map((value) => value.trim())
		.filter(Boolean);
}

export default function EmailChipInput({
	values,
	onChange,
	placeholder = 'name@company.com',
	emptyLabel = 'No optional participants.'
}) {
	const [query, setQuery] = useState('');
	const [error, setError] = useState('');

	const normalizedValues = useMemo(() => {
		const seen = new Set();
		const emails = [];

		for (const value of Array.isArray(values) ? values : []) {
			const email = String(value || '').trim().toLowerCase();
			if (!email || !isValidEmailAddress(email) || seen.has(email)) continue;
			seen.add(email);
			emails.push(email);
		}

		return emails;
	}, [values]);

	function updateValues(nextValues) {
		onChange(nextValues);
	}

	function addFromRaw(rawValue) {
		const candidates = splitEmailInput(rawValue);
		if (candidates.length === 0) return;

		const nextValues = [...normalizedValues];
		const seen = new Set(normalizedValues);

		for (const candidate of candidates) {
			const email = candidate.toLowerCase();
			if (!isValidEmailAddress(email)) {
				setError(`Invalid email: ${candidate}`);
				return;
			}

			if (seen.has(email)) continue;
			seen.add(email);
			nextValues.push(email);
		}

		setError('');
		setQuery('');
		updateValues(nextValues);
	}

	function onRemove(value) {
		const nextValues = normalizedValues.filter((entry) => entry !== value);
		updateValues(nextValues);
	}

	return (
		<div className="email-chip-picker">
			<div className="email-chip-list" aria-live="polite">
				{normalizedValues.length === 0 ? (
					<span className="email-chip-empty">{emptyLabel}</span>
				) : (
					normalizedValues.map((value) => (
						<span key={value} className="email-chip">
							{value}
							<button
								type="button"
								className="email-chip-remove"
								onClick={() => onRemove(value)}
								aria-label={`Remove ${value}`}
							>
								x
							</button>
						</span>
					))
				)}
			</div>
			<div className="email-chip-input-row">
				<input
					type="email"
					inputMode="email"
					autoComplete="email"
					value={query}
					onChange={(event) => {
						setQuery(event.target.value);
						if (error) setError('');
					}}
					onKeyDown={(event) => {
						if (event.key === 'Enter' || event.key === ',') {
							event.preventDefault();
							addFromRaw(query);
						}
					}}
					onBlur={() => {
						if (!query.trim()) return;
						addFromRaw(query);
					}}
					placeholder={placeholder}
					aria-label="Optional participant email"
				/>
				<button
					type="button"
					className="btn-secondary"
					onClick={() => addFromRaw(query)}
					disabled={!query.trim()}
				>
					Add
				</button>
			</div>
			{error ? <p className="panel-subtext error">{error}</p> : null}
		</div>
	);
}
