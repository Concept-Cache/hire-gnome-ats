'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Columns3 } from 'lucide-react';
import {
	normalizeTableKey,
	readColumnVisibilityState,
	writeColumnVisibilityState,
	notifyHiddenColumnsChanged
} from '@/lib/table-columns';

export default function TableColumnPicker({ tableKey = '', columns = [] }) {
	const pickerRef = useRef(null);
	const lastPersistedHiddenKeysRef = useRef('[]');
	const lastPersistedShownKeysRef = useRef('[]');
	const [menuOpen, setMenuOpen] = useState(false);
	const [hiddenColumnKeys, setHiddenColumnKeys] = useState([]);
	const [shownColumnKeys, setShownColumnKeys] = useState([]);

	const normalizedTableKey = normalizeTableKey(tableKey);
	const canCustomizeColumns = Boolean(normalizedTableKey) && columns.length > 1;

	const availableColumnKeys = useMemo(
		() => new Set(columns.map((column) => String(column.key || '').trim()).filter(Boolean)),
		[columns]
	);

	useEffect(() => {
		if (!canCustomizeColumns) {
			lastPersistedHiddenKeysRef.current = '[]';
			lastPersistedShownKeysRef.current = '[]';
			setHiddenColumnKeys([]);
			setShownColumnKeys([]);
			return;
		}

		const nextVisibilityState = readColumnVisibilityState(normalizedTableKey, columns);
		lastPersistedHiddenKeysRef.current = JSON.stringify(nextVisibilityState.hiddenColumnKeys);
		lastPersistedShownKeysRef.current = JSON.stringify(nextVisibilityState.shownColumnKeys);
		setHiddenColumnKeys(nextVisibilityState.hiddenColumnKeys);
		setShownColumnKeys(nextVisibilityState.shownColumnKeys);
	}, [availableColumnKeys, canCustomizeColumns, normalizedTableKey]);

	useEffect(() => {
		if (!canCustomizeColumns) return;
		const nextHiddenKeys = hiddenColumnKeys.filter((key) => availableColumnKeys.has(key));
		const nextShownKeys = shownColumnKeys.filter((key) => availableColumnKeys.has(key));
		const serializedHiddenKeys = JSON.stringify(nextHiddenKeys);
		const serializedShownKeys = JSON.stringify(nextShownKeys);
		if (
			serializedHiddenKeys === lastPersistedHiddenKeysRef.current &&
			serializedShownKeys === lastPersistedShownKeysRef.current
		) {
			return;
		}

		lastPersistedHiddenKeysRef.current = serializedHiddenKeys;
		lastPersistedShownKeysRef.current = serializedShownKeys;
		writeColumnVisibilityState(normalizedTableKey, {
			hiddenColumnKeys: nextHiddenKeys,
			shownColumnKeys: nextShownKeys
		});
		notifyHiddenColumnsChanged(normalizedTableKey);
	}, [availableColumnKeys, canCustomizeColumns, hiddenColumnKeys, normalizedTableKey, shownColumnKeys]);

	useEffect(() => {
		if (!menuOpen) return undefined;

		function onMouseDown(event) {
			if (!pickerRef.current || pickerRef.current.contains(event.target)) return;
			setMenuOpen(false);
		}

		function onKeyDown(event) {
			if (event.key === 'Escape') {
				setMenuOpen(false);
			}
		}

		document.addEventListener('mousedown', onMouseDown);
		document.addEventListener('keydown', onKeyDown);
		return () => {
			document.removeEventListener('mousedown', onMouseDown);
			document.removeEventListener('keydown', onKeyDown);
		};
	}, [menuOpen]);

	function onToggleColumn(columnKey) {
		if (!canCustomizeColumns) return;
		const targetColumn = columns.find((column) => String(column?.key || '').trim() === columnKey);
		const isHidden = hiddenColumnKeys.includes(columnKey);
		setHiddenColumnKeys((current) => {
			const cleanedCurrent = current.filter((key) => availableColumnKeys.has(key));
			let nextHiddenKeys = cleanedCurrent;

				if (isHidden) {
					nextHiddenKeys = cleanedCurrent.filter((key) => key !== columnKey);
				} else {
					const visibleCount = columns.length - cleanedCurrent.length;
					if (visibleCount <= 1) return cleanedCurrent;
					nextHiddenKeys = [...cleanedCurrent, columnKey];
				}
				return nextHiddenKeys;
			});
		setShownColumnKeys((current) => {
			const cleanedCurrent = current.filter((key) => availableColumnKeys.has(key));
			if (!targetColumn || targetColumn.defaultVisible !== false) {
				return cleanedCurrent;
			}
			const isShown = cleanedCurrent.includes(columnKey);
			if (isHidden && !isShown) {
				return [...cleanedCurrent, columnKey];
			}
			return cleanedCurrent.filter((key) => key !== columnKey);
		});
	}

	if (!canCustomizeColumns) return null;

	return (
		<div className="table-toolbar-right list-controls-column-picker" ref={pickerRef}>
			<button
				type="button"
				className="table-toolbar-button"
				onClick={() => setMenuOpen((current) => !current)}
				aria-expanded={menuOpen}
				aria-label="Customize visible columns"
				title="Columns"
			>
				<Columns3 aria-hidden="true" />
			</button>
			{menuOpen ? (
				<div className="table-columns-menu">
					{columns.map((column) => {
						const key = String(column.key || '').trim();
						const isVisible = !hiddenColumnKeys.includes(key);
						return (
							<label key={column.key} className="table-columns-option">
								<input
									type="checkbox"
									className="table-columns-input"
									checked={isVisible}
									onChange={() => onToggleColumn(key)}
								/>
								<span className="table-columns-label">{column.label}</span>
							</label>
						);
					})}
				</div>
			) : null}
		</div>
	);
}
