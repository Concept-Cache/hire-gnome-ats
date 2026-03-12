'use client';

import { useMemo, useState } from 'react';
import LoadingIndicator from '@/app/components/loading-indicator';

function toIdString(value) {
	return String(value ?? '').trim();
}

export default function KanbanBoard({
	columns = [],
	rows = [],
	getRowId,
	getRowColumn,
	renderCard,
	onMove,
	movingRowIds,
	loading = false,
	loadingLabel = 'Loading board',
	emptyLabel = 'No records in this stage.'
}) {
	const [draggingRowId, setDraggingRowId] = useState('');
	const [draggingColumnKey, setDraggingColumnKey] = useState('');
	const [dropColumnKey, setDropColumnKey] = useState('');
	const movingIdSet = useMemo(() => {
		if (!movingRowIds) return new Set();
		if (movingRowIds instanceof Set) {
			return new Set(Array.from(movingRowIds, (value) => toIdString(value)).filter(Boolean));
		}
		if (Array.isArray(movingRowIds)) {
			return new Set(movingRowIds.map((value) => toIdString(value)).filter(Boolean));
		}
		return new Set();
	}, [movingRowIds]);

	const rowsByColumn = useMemo(() => {
		const mapped = new Map(columns.map((column) => [column.value, []]));
		for (const row of rows) {
			const columnValue = getRowColumn(row);
			if (!mapped.has(columnValue)) continue;
			mapped.get(columnValue).push(row);
		}
		return mapped;
	}, [columns, rows, getRowColumn]);

	function onCardDragStart(event, row, columnValue) {
		const rowId = toIdString(getRowId(row));
		if (!rowId) return;
		setDraggingRowId(rowId);
		setDraggingColumnKey(String(columnValue || ''));
		event.dataTransfer.effectAllowed = 'move';
		event.dataTransfer.setData('text/kanban-row-id', rowId);
	}

	function onCardDragEnd() {
		setDraggingRowId('');
		setDraggingColumnKey('');
		setDropColumnKey('');
	}

	async function onColumnDrop(event, columnValue) {
		event.preventDefault();
		const droppedId =
			toIdString(event.dataTransfer.getData('text/kanban-row-id')) || toIdString(draggingRowId);
		setDropColumnKey('');
		setDraggingRowId('');
		setDraggingColumnKey('');

		if (!droppedId || typeof onMove !== 'function') return;
		await onMove(droppedId, columnValue);
	}

	if (loading) {
		return <LoadingIndicator className="list-loading-indicator" label={loadingLabel} />;
	}

	return (
		<div className="kanban-board" role="list">
			{columns.map((column) => {
				const columnRows = rowsByColumn.get(column.value) || [];
				const isDropTarget = dropColumnKey === column.value;
				return (
					<section
						key={column.value}
						className={`kanban-column${isDropTarget ? ' is-drop-target' : ''}`}
						onDragOver={(event) => {
							event.preventDefault();
							if (dropColumnKey !== column.value) {
								setDropColumnKey(column.value);
							}
						}}
						onDragEnter={(event) => {
							event.preventDefault();
							if (dropColumnKey !== column.value) {
								setDropColumnKey(column.value);
							}
						}}
						onDragLeave={() => {
							if (dropColumnKey === column.value) {
								setDropColumnKey('');
							}
						}}
						onDrop={(event) => onColumnDrop(event, column.value)}
					>
						<header className="kanban-column-header">
							<h4>{column.label}</h4>
							<span className="kanban-column-count">{columnRows.length}</span>
						</header>

						<div className="kanban-column-cards">
							{columnRows.length <= 0 ? (
								<p className="kanban-empty">{emptyLabel}</p>
							) : (
								columnRows.map((row) => {
									const rowId = toIdString(getRowId(row));
									const isMoving = movingIdSet.has(rowId);
									const isDragging = draggingRowId && rowId === draggingRowId;
									return (
										<article
											key={rowId}
											role="listitem"
											className={`kanban-card${isDragging ? ' is-dragging' : ''}${isMoving ? ' is-moving' : ''}`}
											draggable={!isMoving}
											onDragStart={(event) => onCardDragStart(event, row, column.value)}
											onDragEnd={onCardDragEnd}
											data-source-column={column.value}
											data-dragging-column={isDragging ? draggingColumnKey : undefined}
										>
											{renderCard(row)}
										</article>
									);
								})
							)}
						</div>
					</section>
				);
			})}
		</div>
	);
}
