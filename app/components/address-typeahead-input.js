'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

const MIN_QUERY_LENGTH = 3;

function randomSessionToken() {
	return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export default function AddressTypeaheadInput({
	value,
	onChange,
	onPlaceDetailsChange,
	placeholder = 'Search address',
	disabled = false,
	label
}) {
	const [query, setQuery] = useState(value || '');
	const [open, setOpen] = useState(false);
	const [loading, setLoading] = useState(false);
	const [lookupEnabled, setLookupEnabled] = useState(true);
	const [options, setOptions] = useState([]);
	const sessionTokenRef = useRef(randomSessionToken());

	const trimmedQuery = useMemo(() => query.trim(), [query]);

	useEffect(() => {
		setQuery(value || '');
	}, [value]);

	useEffect(() => {
		if (!open || disabled || !lookupEnabled) {
			return undefined;
		}

		if (trimmedQuery.length < MIN_QUERY_LENGTH) {
			setOptions([]);
			return undefined;
		}

		const controller = new AbortController();
		const timeoutId = setTimeout(async () => {
			setLoading(true);

			try {
				const params = new URLSearchParams({
					input: trimmedQuery,
					sessionToken: sessionTokenRef.current
				});
				const response = await fetch(`/api/maps/places-autocomplete?${params.toString()}`, {
					signal: controller.signal
				});
				const data = await response.json().catch(() => ({}));

				if (data.enabled === false) {
					setLookupEnabled(false);
					setOptions([]);
					return;
				}

				setOptions(Array.isArray(data.predictions) ? data.predictions : []);
			} catch (error) {
				if (error?.name !== 'AbortError') {
					setOptions([]);
				}
			} finally {
				setLoading(false);
			}
		}, 200);

		return () => {
			controller.abort();
			clearTimeout(timeoutId);
		};
	}, [disabled, lookupEnabled, open, trimmedQuery]);

	function onInputChange(nextValue) {
		setQuery(nextValue);
		onChange(nextValue);
		if (onPlaceDetailsChange) {
			onPlaceDetailsChange(null);
		}
		setOpen(true);
	}

	async function onOptionSelect(option) {
		const nextValue = option?.description || '';
		const sessionToken = sessionTokenRef.current;
		sessionTokenRef.current = randomSessionToken();
		onChange(nextValue);
		setQuery(nextValue);
		setOpen(false);
		setOptions([]);

		if (onPlaceDetailsChange) {
			onPlaceDetailsChange({
				placeId: option?.placeId || '',
				latitude: null,
				longitude: null
			});
		}

		if (!option?.placeId) {
			return;
		}

		setLoading(true);
		try {
			const params = new URLSearchParams({
				placeId: option.placeId,
				sessionToken
			});
			const response = await fetch(`/api/maps/place-details?${params.toString()}`);
			const data = await response.json().catch(() => ({}));
			if (data.enabled === false) {
				setLookupEnabled(false);
				return;
			}
			if (onPlaceDetailsChange) {
				onPlaceDetailsChange({
					placeId: data.placeId || option.placeId,
					latitude: typeof data.latitude === 'number' ? data.latitude : null,
					longitude: typeof data.longitude === 'number' ? data.longitude : null,
					city: typeof data.city === 'string' ? data.city : null,
					state: typeof data.state === 'string' ? data.state : null,
					postalCode: typeof data.postalCode === 'string' ? data.postalCode : null
				});
			}
		} catch {
			// Keep address text even if details lookup fails.
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className={disabled ? 'typeahead disabled' : 'typeahead'}>
			<div className="typeahead-input-wrap">
				<input
					value={query}
					onChange={(event) => onInputChange(event.target.value)}
					onFocus={() => setOpen(true)}
					onBlur={() => {
						setTimeout(() => {
							setOpen(false);
						}, 120);
					}}
					onKeyDown={(event) => {
						if (event.key === 'Escape') {
							setOpen(false);
						}
					}}
					placeholder={placeholder}
					disabled={disabled}
					aria-label={label || placeholder}
				/>
			</div>

			{open && !disabled && lookupEnabled && trimmedQuery.length >= MIN_QUERY_LENGTH ? (
				<div className="typeahead-menu">
					{loading ? (
						<p className="typeahead-empty">Looking up addresses...</p>
					) : options.length === 0 ? (
						<p className="typeahead-empty">No matching addresses.</p>
					) : (
						options.map((option) => (
							<button
								key={option.placeId}
								type="button"
								className="typeahead-option"
								onMouseDown={(event) => event.preventDefault()}
								onClick={() => onOptionSelect(option)}
							>
								{option.description}
							</button>
						))
					)}
				</div>
			) : null}
		</div>
	);
}
