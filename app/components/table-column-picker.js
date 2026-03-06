'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Columns3 } from 'lucide-react';
import {
	normalizeTableKey,
	readHiddenColumnKeys,
	writeHiddenColumnKeys,
	notifyHiddenColumnsChanged
} from '@/lib/table-columns';

export default function TableColumnPicker({ tableKey = '', columns = [] }) {
	const pickerRef = useRef(null);
	const lastPersistedHiddenKeysRef = useRef('[]');
	const [menuOpen, setMenuOpen] = useState(false);
	const [hiddenColumnKeys, setHiddenColumnKeys] = useState([]);

	const normalizedTableKey = normalizeTableKey(tableKey);
	const canCustomizeColumns = Boolean(normalizedTableKey) && columns.length > 1;

	const availableColumnKeys = useMemo(
		() => new Set(columns.map((column) => String(column.key || '').trim()).filter(Boolean)),
		[columns]
	);

	useEffect(() => {
		if (!canCustomizeColumns) {
			lastPersistedHiddenKeysRef.current = '[]';
			setHiddenColumnKeys([]);
			return;
		}

		const nextHiddenKeys = readHiddenColumnKeys(normalizedTableKey).filter((key) => availableColumnKeys.has(key));
		lastPersistedHiddenKeysRef.current = JSON.stringify(nextHiddenKeys);
		setHiddenColumnKeys(nextHiddenKeys);
	}, [availableColumnKeys, canCustomizeColumns, normalizedTableKey]);

	useEffect(() => {
		if (!canCustomizeColumns) return;
		const nextHiddenKeys = hiddenColumnKeys.filter((key) => availableColumnKeys.has(key));
		const serializedHiddenKeys = JSON.stringify(nextHiddenKeys);
		if (serializedHiddenKeys === lastPersistedHiddenKeysRef.current) return;

		lastPersistedHiddenKeysRef.current = serializedHiddenKeys;
		writeHiddenColumnKeys(normalizedTableKey, nextHiddenKeys);
		notifyHiddenColumnsChanged(normalizedTableKey);
	}, [availableColumnKeys, canCustomizeColumns, hiddenColumnKeys, normalizedTableKey]);

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
		setHiddenColumnKeys((current) => {
			const cleanedCurrent = current.filter((key) => availableColumnKeys.has(key));
			const isHidden = cleanedCurrent.includes(columnKey);
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
			>
				<Columns3 aria-hidden="true" />
				<span>Columns</span>
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
