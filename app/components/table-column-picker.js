'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Columns3, GripVertical } from 'lucide-react';
import {
	isColumnVisibilityStateCustomized,
	normalizeTableKey,
	readColumnVisibilityState,
	resolveOrderedColumnKeys,
	statesEqual,
	writeColumnVisibilityState,
	notifyHiddenColumnsChanged
} from '@/lib/table-columns';

export default function TableColumnPicker({ tableKey = '', columns = [] }) {
	const pickerRef = useRef(null);
	const lastPersistedHiddenKeysRef = useRef('[]');
	const lastPersistedShownKeysRef = useRef('[]');
	const lastPersistedOrderedKeysRef = useRef('[]');
	const [menuOpen, setMenuOpen] = useState(false);
	const [hiddenColumnKeys, setHiddenColumnKeys] = useState([]);
	const [shownColumnKeys, setShownColumnKeys] = useState([]);
	const [orderedColumnKeys, setOrderedColumnKeys] = useState([]);
	const [remoteHydrated, setRemoteHydrated] = useState(false);
	const [draggedColumnKey, setDraggedColumnKey] = useState('');
	const [dropIndicator, setDropIndicator] = useState({ key: '', position: 'before' });

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
			lastPersistedOrderedKeysRef.current = '[]';
			setHiddenColumnKeys([]);
			setShownColumnKeys([]);
			setOrderedColumnKeys(resolveOrderedColumnKeys(columns, []));
			setRemoteHydrated(false);
			return;
		}

		const nextVisibilityState = readColumnVisibilityState(normalizedTableKey, columns);
		lastPersistedHiddenKeysRef.current = JSON.stringify(nextVisibilityState.hiddenColumnKeys);
		lastPersistedShownKeysRef.current = JSON.stringify(nextVisibilityState.shownColumnKeys);
		lastPersistedOrderedKeysRef.current = JSON.stringify(nextVisibilityState.orderedColumnKeys);
		setHiddenColumnKeys(nextVisibilityState.hiddenColumnKeys);
		setShownColumnKeys(nextVisibilityState.shownColumnKeys);
		setOrderedColumnKeys(nextVisibilityState.orderedColumnKeys);
		setRemoteHydrated(false);
	}, [availableColumnKeys, canCustomizeColumns, columns, normalizedTableKey]);

	useEffect(() => {
		if (!canCustomizeColumns) return undefined;
		let cancelled = false;

		async function loadRemoteVisibilityState() {
			try {
				const localState = readColumnVisibilityState(normalizedTableKey, columns);
				const res = await fetch('/api/session/table-columns', { cache: 'no-store' });
				if (!res.ok) {
					if (!cancelled) setRemoteHydrated(true);
					return;
				}

				const data = await res.json().catch(() => ({}));
				if (cancelled) return;
				const remoteState = data?.tableColumnPreferences?.[normalizedTableKey] || null;
				if (remoteState) {
					if (!statesEqual(remoteState, localState)) {
						const normalizedRemoteState = {
							hiddenColumnKeys: remoteState.hiddenColumnKeys || [],
							shownColumnKeys: remoteState.shownColumnKeys || [],
							orderedColumnKeys: resolveOrderedColumnKeys(columns, remoteState.orderedColumnKeys || [])
						};
						lastPersistedHiddenKeysRef.current = JSON.stringify(normalizedRemoteState.hiddenColumnKeys);
						lastPersistedShownKeysRef.current = JSON.stringify(normalizedRemoteState.shownColumnKeys);
						lastPersistedOrderedKeysRef.current = JSON.stringify(normalizedRemoteState.orderedColumnKeys);
						setHiddenColumnKeys(normalizedRemoteState.hiddenColumnKeys);
						setShownColumnKeys(normalizedRemoteState.shownColumnKeys);
						setOrderedColumnKeys(normalizedRemoteState.orderedColumnKeys);
						writeColumnVisibilityState(normalizedTableKey, normalizedRemoteState);
						notifyHiddenColumnsChanged(normalizedTableKey);
					}
				} else if (isColumnVisibilityStateCustomized(localState, columns)) {
					await fetch('/api/session/table-columns', {
						method: 'PATCH',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							tableKey: normalizedTableKey,
							visibilityState: localState
						})
					}).catch(() => null);
				}
			} finally {
				if (!cancelled) setRemoteHydrated(true);
			}
		}

		loadRemoteVisibilityState();
		return () => {
			cancelled = true;
		};
	}, [canCustomizeColumns, columns, normalizedTableKey]);

	useEffect(() => {
		if (!canCustomizeColumns) return;
		const nextHiddenKeys = hiddenColumnKeys.filter((key) => availableColumnKeys.has(key));
		const nextShownKeys = shownColumnKeys.filter((key) => availableColumnKeys.has(key));
		const nextOrderedKeys = resolveOrderedColumnKeys(columns, orderedColumnKeys).filter((key) =>
			availableColumnKeys.has(key)
		);
		const serializedHiddenKeys = JSON.stringify(nextHiddenKeys);
		const serializedShownKeys = JSON.stringify(nextShownKeys);
		const serializedOrderedKeys = JSON.stringify(nextOrderedKeys);
		if (
			serializedHiddenKeys === lastPersistedHiddenKeysRef.current &&
			serializedShownKeys === lastPersistedShownKeysRef.current &&
			serializedOrderedKeys === lastPersistedOrderedKeysRef.current
		) {
			return;
		}

		lastPersistedHiddenKeysRef.current = serializedHiddenKeys;
		lastPersistedShownKeysRef.current = serializedShownKeys;
		lastPersistedOrderedKeysRef.current = serializedOrderedKeys;
		writeColumnVisibilityState(normalizedTableKey, {
			hiddenColumnKeys: nextHiddenKeys,
			shownColumnKeys: nextShownKeys,
			orderedColumnKeys: nextOrderedKeys
		});
		notifyHiddenColumnsChanged(normalizedTableKey);
		if (!remoteHydrated) return;
		fetch('/api/session/table-columns', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				tableKey: normalizedTableKey,
				visibilityState: {
					hiddenColumnKeys: nextHiddenKeys,
					shownColumnKeys: nextShownKeys,
					orderedColumnKeys: nextOrderedKeys
				}
			})
		}).catch(() => null);
	}, [availableColumnKeys, canCustomizeColumns, columns, hiddenColumnKeys, normalizedTableKey, orderedColumnKeys, remoteHydrated, shownColumnKeys]);

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

	function onDragStart(columnKey) {
		setDraggedColumnKey(columnKey);
		setDropIndicator({ key: '', position: 'before' });
	}

	function onDragOverColumn(event, targetColumnKey) {
		if (!draggedColumnKey) return;
		event.preventDefault();
		const bounds = event.currentTarget.getBoundingClientRect();
		const midpoint = bounds.top + bounds.height / 2;
		const position = event.clientY >= midpoint ? 'after' : 'before';
		setDropIndicator((current) =>
			current.key === targetColumnKey && current.position === position
				? current
				: { key: targetColumnKey, position }
		);
	}

	function onDropColumn(targetColumnKey) {
		if (!draggedColumnKey || draggedColumnKey === targetColumnKey) {
			setDropIndicator({ key: '', position: 'before' });
			return;
		}
		setOrderedColumnKeys((current) => {
			const nextOrder = resolveOrderedColumnKeys(columns, current);
			const fromIndex = nextOrder.indexOf(draggedColumnKey);
			const toIndex = nextOrder.indexOf(targetColumnKey);
			if (fromIndex < 0 || toIndex < 0) return nextOrder;
			const reordered = [...nextOrder];
			const [movedKey] = reordered.splice(fromIndex, 1);
			const insertionIndex =
				dropIndicator.key === targetColumnKey && dropIndicator.position === 'after'
					? toIndex + (fromIndex < toIndex ? 0 : 1)
					: toIndex + (fromIndex < toIndex ? -1 : 0);
			reordered.splice(Math.max(0, insertionIndex), 0, movedKey);
			return reordered;
		});
		setDraggedColumnKey('');
		setDropIndicator({ key: '', position: 'before' });
	}

	const orderedColumns = useMemo(
		() =>
			resolveOrderedColumnKeys(columns, orderedColumnKeys)
				.map((columnKey) => columns.find((column) => String(column?.key || '').trim() === columnKey))
				.filter(Boolean),
		[columns, orderedColumnKeys]
	);

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
				<span>Columns</span>
			</button>
			{menuOpen ? (
				<div className="table-columns-menu">
					{orderedColumns.map((column) => {
						const key = String(column.key || '').trim();
						const isVisible = !hiddenColumnKeys.includes(key);
						return (
							<label
								key={column.key}
								className={`table-columns-option${draggedColumnKey === key ? ' is-dragging' : ''}${
									dropIndicator.key === key && dropIndicator.position === 'before' ? ' is-drop-before' : ''
								}${dropIndicator.key === key && dropIndicator.position === 'after' ? ' is-drop-after' : ''}`}
								draggable
								onDragStart={() => onDragStart(key)}
								onDragOver={(event) => onDragOverColumn(event, key)}
								onDrop={() => onDropColumn(key)}
								onDragEnd={() => {
									setDraggedColumnKey('');
									setDropIndicator({ key: '', position: 'before' });
								}}
							>
								<span className="table-columns-drag-handle" aria-hidden="true">
									<GripVertical />
								</span>
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
