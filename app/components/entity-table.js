import { createElement, isValidElement, useEffect, useMemo, useState } from 'react';
import {
	ArrowDown,
	ArrowUp,
	ArrowUpDown,
	Archive,
	ChevronLeft,
	ChevronRight,
	Circle,
	Copy,
	Download,
	FolderOpen,
	LoaderCircle,
	Pencil,
	RotateCcw,
	Trash2
} from 'lucide-react';
import {
	columnsStorageKey,
	normalizeTableKey,
	orderColumns,
	readColumnVisibilityState,
	TABLE_COLUMNS_CHANGED_EVENT
} from '@/lib/table-columns';
import {
	buildDefaultTableSortState,
	normalizeTableSortState,
	tableSortStatesEqual
} from '@/lib/table-sort';

const PAGE_SIZE_STORAGE_KEY = 'hg-list-page-size';
const DEFAULT_PAGE_SIZE = 10;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

function actionIconForLabel(label) {
	const normalized = String(label || '').trim().toLowerCase();
	switch (normalized) {
		case 'open':
		case 'view':
			return FolderOpen;
		case 'edit':
		case 'update':
			return Pencil;
		case 'delete':
		case 'remove':
			return Trash2;
		case 'copy':
			return Copy;
		case 'download':
			return Download;
		case 'archive':
			return Archive;
		case 'restore':
			return RotateCcw;
		default:
			return Circle;
	}
}

function renderActionIcon(action, isPending) {
	const iconClassName = isPending ? 'row-action-lucide row-action-icon-spinner' : 'row-action-lucide';
	if (isPending) {
		return <LoaderCircle aria-hidden="true" className={iconClassName} />;
	}

	if (isValidElement(action.icon)) {
		return action.icon;
	}

	if (typeof action.icon === 'function') {
		return createElement(action.icon, { 'aria-hidden': 'true', className: iconClassName });
	}

	if (typeof action.icon === 'string' && action.icon.trim().length > 0) {
		return <span aria-hidden="true">{action.icon}</span>;
	}

	const Icon = actionIconForLabel(action.label);
	return <Icon aria-hidden="true" className={iconClassName} />;
}

function normalizeSortValue(value) {
	if (value == null) return '';
	if (typeof value === 'number') return Number.isFinite(value) ? value : '';
	if (typeof value === 'boolean') return value ? 1 : 0;
	if (value instanceof Date) return value.getTime();
	if (isValidElement(value)) return '';
	return String(value).trim().toLowerCase();
}

function compareSortValues(a, b) {
	if (typeof a === 'number' && typeof b === 'number') return a - b;
	return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

export default function EntityTable({
	tableKey = '',
	columns,
	rows,
	rowActions = [],
	loading = false,
	loadingLabel = 'Loading records',
	sortState: controlledSortState,
	onSortStateChange
}) {
	const hasActions = rowActions.length > 0;
	const [pendingActionKey, setPendingActionKey] = useState('');
	const [localSortState, setLocalSortState] = useState({ key: '', direction: 'asc' });
	const [currentPage, setCurrentPage] = useState(1);
	const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
	const [hiddenColumnKeys, setHiddenColumnKeys] = useState([]);
	const [orderedColumnKeys, setOrderedColumnKeys] = useState([]);

	const effectiveTableKey = normalizeTableKey(tableKey);
	const canCustomizeColumns = Boolean(effectiveTableKey) && columns.length > 1;

	const visibleColumns = useMemo(() => {
		const next = orderColumns(columns, orderedColumnKeys).filter((column) => !hiddenColumnKeys.includes(column.key));
		if (next.length > 0) return next;
		return orderColumns(columns, orderedColumnKeys);
	}, [columns, hiddenColumnKeys, orderedColumnKeys]);

	const implicitDefaultSortState = useMemo(() => buildDefaultTableSortState(visibleColumns), [visibleColumns]);
	const usingControlledSortState = controlledSortState !== undefined;
	const baseSortState = useMemo(() => {
		if (usingControlledSortState) {
			return normalizeTableSortState(controlledSortState);
		}
		return normalizeTableSortState(localSortState);
	}, [controlledSortState, localSortState, usingControlledSortState]);
	const effectiveSortState = useMemo(() => {
		if (baseSortState.key && visibleColumns.some((column) => column.key === baseSortState.key)) {
			return baseSortState;
		}
		return implicitDefaultSortState;
	}, [baseSortState, implicitDefaultSortState, visibleColumns]);

	const sortedRows = useMemo(() => {
		if (!effectiveSortState.key) return rows;
		const sortColumn = visibleColumns.find((column) => column.key === effectiveSortState.key);
		if (!sortColumn) return rows;

		const directionMultiplier = effectiveSortState.direction === 'desc' ? -1 : 1;
		return [...rows]
			.map((row, index) => ({ row, index }))
			.sort((a, b) => {
				const aRaw =
					typeof sortColumn.getSortValue === 'function'
						? sortColumn.getSortValue(a.row)
						: a.row[sortColumn.key];
				const bRaw =
					typeof sortColumn.getSortValue === 'function'
						? sortColumn.getSortValue(b.row)
						: b.row[sortColumn.key];
				const aValue = normalizeSortValue(aRaw);
				const bValue = normalizeSortValue(bRaw);
				const compared = compareSortValues(aValue, bValue);
				if (compared !== 0) return compared * directionMultiplier;
				return a.index - b.index;
			})
			.map((entry) => entry.row);
	}, [effectiveSortState, rows, visibleColumns]);

	useEffect(() => {
		if (typeof onSortStateChange !== 'function') return;
		if (tableSortStatesEqual(baseSortState, effectiveSortState)) return;
		onSortStateChange(effectiveSortState);
	}, [baseSortState, effectiveSortState, onSortStateChange]);

	useEffect(() => {
		if (typeof window === 'undefined') return;
		const stored = Number(window.localStorage.getItem(PAGE_SIZE_STORAGE_KEY));
		if (PAGE_SIZE_OPTIONS.includes(stored)) {
			setPageSize(stored);
		}
	}, []);

	useEffect(() => {
		if (!canCustomizeColumns || typeof window === 'undefined') {
			setHiddenColumnKeys([]);
			setOrderedColumnKeys([]);
			return;
		}
		const visibilityState = readColumnVisibilityState(effectiveTableKey, columns);
		setHiddenColumnKeys(visibilityState.hiddenColumnKeys);
		setOrderedColumnKeys(visibilityState.orderedColumnKeys);
	}, [canCustomizeColumns, columns, effectiveTableKey]);

	useEffect(() => {
		if (!canCustomizeColumns || typeof window === 'undefined') return undefined;

		function refreshHiddenColumns() {
			const visibilityState = readColumnVisibilityState(effectiveTableKey, columns);
			setHiddenColumnKeys(visibilityState.hiddenColumnKeys);
			setOrderedColumnKeys(visibilityState.orderedColumnKeys);
		}

		function onStorage(event) {
			if (!event?.key || event.key === columnsStorageKey(effectiveTableKey)) {
				refreshHiddenColumns();
			}
		}

		function onColumnsChanged(event) {
			if (event?.detail?.tableKey !== effectiveTableKey) return;
			refreshHiddenColumns();
		}

		window.addEventListener('storage', onStorage);
		window.addEventListener(TABLE_COLUMNS_CHANGED_EVENT, onColumnsChanged);
		return () => {
			window.removeEventListener('storage', onStorage);
			window.removeEventListener(TABLE_COLUMNS_CHANGED_EVENT, onColumnsChanged);
		};
	}, [canCustomizeColumns, columns, effectiveTableKey]);

	const totalRows = sortedRows.length;
	const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
	const skeletonRowCount = Math.max(3, Math.min(6, pageSize));

	useEffect(() => {
		setCurrentPage((current) => {
			if (current < 1) return 1;
			if (current > totalPages) return totalPages;
			return current;
		});
	}, [totalPages]);

	const startIndex = totalRows === 0 ? 0 : (currentPage - 1) * pageSize;
	const endIndex = totalRows === 0 ? 0 : Math.min(startIndex + pageSize, totalRows);
	const visibleRows = sortedRows.slice(startIndex, endIndex);

	function onSortColumn(column) {
		if (column.sortable === false) return;
		const nextSortState =
			effectiveSortState.key === column.key
				? {
					key: column.key,
					direction: effectiveSortState.direction === 'asc' ? 'desc' : 'asc'
				}
				: { key: column.key, direction: 'asc' };
		if (!usingControlledSortState) {
			setLocalSortState(nextSortState);
		}
		onSortStateChange?.(nextSortState);
	}

	function sortIconForColumn(column) {
		if (effectiveSortState.key !== column.key) return ArrowUpDown;
		return effectiveSortState.direction === 'asc' ? ArrowUp : ArrowDown;
	}

	async function onActionClick(action, row) {
		const actionKey = `${row.id}-${action.label}`;
		setPendingActionKey(actionKey);
		try {
			await action.onClick(row);
		} finally {
			setPendingActionKey('');
		}
	}

	function onPageSizeChange(event) {
		const nextSize = Number(event.target.value);
		if (!PAGE_SIZE_OPTIONS.includes(nextSize)) return;
		setPageSize(nextSize);
		setCurrentPage(1);
		if (typeof window !== 'undefined') {
			window.localStorage.setItem(PAGE_SIZE_STORAGE_KEY, String(nextSize));
		}
	}

	function onPreviousPage() {
		setCurrentPage((current) => Math.max(1, current - 1));
	}

	function onNextPage() {
		setCurrentPage((current) => Math.min(totalPages, current + 1));
	}

	return (
		<div
			className="table-shell"
			data-table-key={effectiveTableKey || undefined}
			aria-busy={loading ? 'true' : 'false'}
			aria-label={loading ? loadingLabel : undefined}
		>
			<div className="table-wrap">
				<table>
					<thead>
						<tr>
							{visibleColumns.map((column) => {
								const isSortable = column.sortable !== false;
								const isActive = effectiveSortState.key === column.key;
								const Icon = sortIconForColumn(column);
								return (
									<th key={column.key}>
										{isSortable ? (
											<button
												type="button"
												className="table-sort-button"
												onClick={() => onSortColumn(column)}
												aria-label={`Sort by ${column.label}${isActive ? ` (${effectiveSortState.direction})` : ''}`}
											>
												<span>{column.label}</span>
												<Icon
													aria-hidden="true"
													className={isActive ? 'table-sort-icon active' : 'table-sort-icon'}
												/>
											</button>
										) : (
											column.label
										)}
									</th>
								);
							})}
							{hasActions ? <th className="table-actions-head" aria-label="Actions" /> : null}
						</tr>
					</thead>
					<tbody>
						{loading ? (
							Array.from({ length: skeletonRowCount }).map((_, rowIndex) => (
								<tr key={`skeleton-${rowIndex}`} className="table-skeleton-row" aria-hidden="true">
									{visibleColumns.map((column, columnIndex) => {
										const width = `${42 + ((rowIndex + columnIndex) % 5) * 12}%`;
										return (
											<td key={`${column.key}-skeleton-${rowIndex}`} className="table-skeleton-cell">
												<span className="table-skeleton-bar" style={{ width }} />
											</td>
										);
									})}
									{hasActions ? (
										<td className="table-actions-cell table-skeleton-cell">
											<div className="row-actions">
												<span className="table-skeleton-icon" />
											</div>
										</td>
									) : null}
								</tr>
							))
						) : totalRows === 0 ? (
							<tr>
								<td colSpan={visibleColumns.length + (hasActions ? 1 : 0)}>
									<small>No records yet.</small>
								</td>
							</tr>
						) : (
							visibleRows.map((row) => (
								<tr key={row.id}>
									{visibleColumns.map((column) => {
										const renderedValue =
											typeof column.render === 'function'
												? column.render(row)
												: row[column.key];
										return <td key={column.key}>{renderedValue ?? '-'}</td>;
									})}
									{hasActions ? (
										<td className="table-actions-cell">
											<div className="row-actions">
												{rowActions.map((action) => {
													const actionKey = `${row.id}-${action.label}`;
													const isPending = pendingActionKey === actionKey;

													return (
														<button
															key={action.label}
															type="button"
															className="row-action-icon"
															onClick={() => onActionClick(action, row)}
															disabled={Boolean(pendingActionKey)}
															aria-label={action.label}
															title={action.label}
														>
															{renderActionIcon(action, isPending)}
														</button>
													);
												})}
											</div>
										</td>
									) : null}
								</tr>
							))
						)}
					</tbody>
				</table>
			</div>

			<div className="table-pagination">
				<div className="table-pagination-size">
					<label htmlFor="table-page-size">Page Size</label>
					<select id="table-page-size" value={pageSize} onChange={onPageSizeChange}>
						{PAGE_SIZE_OPTIONS.map((option) => (
							<option key={option} value={option}>
								{option}
							</option>
						))}
					</select>
				</div>
				<div className="table-pagination-nav">
					<span className="table-pagination-range">
						{totalRows === 0 ? '0-0 of 0' : `${startIndex + 1}-${endIndex} of ${totalRows}`}
					</span>
					<button
						type="button"
						className="table-pagination-button"
						onClick={onPreviousPage}
						disabled={currentPage <= 1}
						aria-label="Previous page"
						title="Previous page"
					>
						<ChevronLeft aria-hidden="true" />
					</button>
					<span className="table-pagination-page">
						Page {totalRows === 0 ? 0 : currentPage} of {totalRows === 0 ? 0 : totalPages}
					</span>
					<button
						type="button"
						className="table-pagination-button"
						onClick={onNextPage}
						disabled={currentPage >= totalPages || totalRows === 0}
						aria-label="Next page"
						title="Next page"
					>
						<ChevronRight aria-hidden="true" />
					</button>
				</div>
			</div>
		</div>
	);
}
