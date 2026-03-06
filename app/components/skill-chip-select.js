'use client';

import { useMemo, useState } from 'react';

export default function SkillChipSelect({
	options,
	values,
	onChange,
	placeholder = 'Search skills',
	emptyLabel = 'No matching skills.'
}) {
	const [query, setQuery] = useState('');
	const [open, setOpen] = useState(false);

	const selectedSet = useMemo(() => new Set(values.map((value) => String(value))), [values]);

	const selectedOptions = useMemo(
		() => options.filter((option) => selectedSet.has(String(option.value))),
		[options, selectedSet]
	);

	const filteredOptions = useMemo(() => {
		const q = query.trim().toLowerCase();
		return options
			.filter((option) => !selectedSet.has(String(option.value)))
			.filter((option) => (q ? option.label.toLowerCase().includes(q) : true))
			.slice(0, 100);
	}, [options, query, selectedSet]);

	function addOption(option) {
		if (selectedSet.has(String(option.value))) return;
		onChange([...values, String(option.value)]);
		setQuery('');
		setOpen(false);
	}

	function removeOption(optionValue) {
		onChange(values.filter((value) => String(value) !== String(optionValue)));
	}

	return (
		<div className="skill-picker">
			<div className="skill-chip-list" aria-live="polite">
				{selectedOptions.length === 0 ? (
					<span className="skill-chip-empty">No skills selected.</span>
				) : (
					selectedOptions.map((option) => (
						<span key={option.value} className="skill-chip">
							{option.label}
							<button
								type="button"
								className="skill-chip-remove"
								onClick={() => removeOption(option.value)}
								aria-label={`Remove ${option.label}`}
							>
								x
							</button>
						</span>
					))
				)}
			</div>
			<div className="typeahead">
				<div className="typeahead-input-wrap">
					<input
						value={query}
						onChange={(event) => {
							setQuery(event.target.value);
							setOpen(true);
						}}
						onFocus={() => setOpen(true)}
						onBlur={() => {
							setTimeout(() => {
								setOpen(false);
								setQuery('');
							}, 120);
						}}
						onKeyDown={(event) => {
							if (event.key === 'Escape') {
								setOpen(false);
							}

							if (event.key === 'Enter' && filteredOptions.length > 0) {
								event.preventDefault();
								addOption(filteredOptions[0]);
							}
						}}
						placeholder={placeholder}
						aria-label="Skill picker"
					/>
				</div>
				{open ? (
					<div className="typeahead-menu">
						{filteredOptions.length === 0 ? (
							<p className="typeahead-empty">{emptyLabel}</p>
						) : (
							filteredOptions.map((option) => (
								<button
									key={option.value}
									type="button"
									className="typeahead-option"
									onMouseDown={(event) => event.preventDefault()}
									onClick={() => addOption(option)}
								>
									{option.label}
								</button>
							))
						)}
					</div>
				) : null}
			</div>
		</div>
	);
}
