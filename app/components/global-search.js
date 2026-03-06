'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';
import LoadingIndicator from '@/app/components/loading-indicator';

export default function GlobalSearch() {
	const router = useRouter();
	const containerRef = useRef(null);
	const inputRef = useRef(null);
	const [query, setQuery] = useState('');
	const [results, setResults] = useState([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState('');
	const [open, setOpen] = useState(false);
	const [activeIndex, setActiveIndex] = useState(-1);

	useEffect(() => {
		const trimmed = query.trim();
		if (trimmed.length < 2) {
			setResults([]);
			setLoading(false);
			setError('');
			setActiveIndex(-1);
			return;
		}

		const controller = new AbortController();
		const timeoutId = setTimeout(async () => {
			setLoading(true);
			setError('');
			try {
				const params = new URLSearchParams({
					q: trimmed,
					limit: '12'
				});
				const res = await fetch(`/api/search/global?${params.toString()}`, {
					signal: controller.signal
				});
				const data = await res.json().catch(() => ({}));
				if (!res.ok) {
					setError(data.error || 'Search failed.');
					setResults([]);
					setActiveIndex(-1);
					return;
				}

				const nextResults = Array.isArray(data.results) ? data.results : [];
				setResults(nextResults);
				setActiveIndex(nextResults.length > 0 ? 0 : -1);
			} catch (fetchError) {
				if (fetchError?.name !== 'AbortError') {
					setError('Search failed.');
					setResults([]);
					setActiveIndex(-1);
				}
			} finally {
				setLoading(false);
			}
		}, 220);

		return () => {
			clearTimeout(timeoutId);
			controller.abort();
		};
	}, [query]);

	useEffect(() => {
		function onMouseDown(event) {
			if (!containerRef.current) return;
			if (containerRef.current.contains(event.target)) return;
			setOpen(false);
		}

		document.addEventListener('mousedown', onMouseDown);
		return () => document.removeEventListener('mousedown', onMouseDown);
	}, []);

	function onSelectResult(result) {
		if (!result?.href) return;
		setOpen(false);
		setQuery('');
		setResults([]);
		setActiveIndex(-1);
		router.push(result.href);
	}

	function onClear() {
		setQuery('');
		setResults([]);
		setLoading(false);
		setError('');
		setOpen(false);
		setActiveIndex(-1);
		inputRef.current?.focus();
	}

	function onKeyDown(event) {
		if (!open) return;
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			setActiveIndex((current) => {
				if (results.length === 0) return -1;
				return current >= results.length - 1 ? 0 : current + 1;
			});
			return;
		}
		if (event.key === 'ArrowUp') {
			event.preventDefault();
			setActiveIndex((current) => {
				if (results.length === 0) return -1;
				return current <= 0 ? results.length - 1 : current - 1;
			});
			return;
		}
		if (event.key === 'Enter') {
			if (activeIndex >= 0 && activeIndex < results.length) {
				event.preventDefault();
				onSelectResult(results[activeIndex]);
			}
			return;
		}
		if (event.key === 'Escape') {
			setOpen(false);
		}
	}

	return (
		<div className="global-search" ref={containerRef}>
			<div className="global-search-input-wrap">
				<span className="global-search-icon" aria-hidden="true">
					<Search />
				</span>
				<input
					ref={inputRef}
					value={query}
					onChange={(event) => {
						setQuery(event.target.value);
						setOpen(true);
					}}
					onFocus={() => setOpen(true)}
					onKeyDown={onKeyDown}
					placeholder="Search candidates, clients, contacts, job orders..."
					aria-label="Global Search"
				/>
				{query.length > 0 ? (
					<button
						type="button"
						className="global-search-clear"
						onClick={onClear}
						aria-label="Clear search"
						title="Clear"
					>
						<X aria-hidden="true" />
					</button>
				) : null}
			</div>
			{open ? (
				<div className="global-search-menu" role="listbox" aria-label="Global search results">
					{query.trim().length < 2 ? (
						<p className="global-search-empty">Type at least 2 characters.</p>
					) : null}
					{loading ? <LoadingIndicator className="global-search-loading" label="Searching" /> : null}
					{error ? <p className="global-search-empty global-search-error">{error}</p> : null}
					{!loading && !error && query.trim().length >= 2 && results.length === 0 ? (
						<p className="global-search-empty">No matches found.</p>
					) : null}
					{results.map((result, index) => (
						<button
							key={`${result.entityType}-${result.entityId}`}
							type="button"
							className={index === activeIndex ? 'global-search-item active' : 'global-search-item'}
							data-entity-type={result.entityType}
							onClick={() => onSelectResult(result)}
							role="option"
							aria-selected={index === activeIndex}
						>
							<span className="global-search-item-title">{result.title}</span>
							{result.subtitle ? (
								<span className="global-search-item-subtitle">{result.subtitle}</span>
							) : null}
							<span className="global-search-item-meta">{result.meta}</span>
						</button>
					))}
				</div>
			) : null}
		</div>
	);
}
