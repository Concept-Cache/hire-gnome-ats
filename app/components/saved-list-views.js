'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Bookmark, Check, Plus, RotateCcw, Save, Star, Trash2 } from 'lucide-react';
import { useConfirmDialog } from '@/app/components/confirm-dialog';
import { useToast } from '@/app/components/toast-provider';
import {
	normalizeSavedListKey,
	normalizeSavedListViews,
	normalizeSavedListViewState,
	savedListViewStatesEqual,
	SYSTEM_SAVED_VIEW_ID
} from '@/lib/saved-list-views';
import {
	buildDefaultColumnVisibilityState,
	columnsStorageKey,
	normalizeColumnVisibilityState,
	readColumnVisibilityState,
	statesEqual,
	TABLE_COLUMNS_CHANGED_EVENT,
	writeColumnVisibilityState,
	notifyHiddenColumnsChanged
} from '@/lib/table-columns';

const SYSTEM_VIEW_KEY = SYSTEM_SAVED_VIEW_ID;
const CUSTOM_VIEW_KEY = '__custom__';

function getEmptyGroup() {
	return {
		activeViewId: null,
		defaultViewId: null,
		views: []
	};
}

export default function SavedListViews({ listKey, columns = [], defaultState, currentState, onApplyState }) {
	const toast = useToast();
	const { requestConfirm, requestPrompt } = useConfirmDialog();
	const pickerRef = useRef(null);
	const initializedRef = useRef(false);
	const initializingViewRef = useRef(null);
	const normalizedListKey = normalizeSavedListKey(listKey);
	const normalizedDefaultState = useMemo(() => normalizeSavedListViewState(defaultState), [defaultState]);
	const normalizedCurrentState = useMemo(() => normalizeSavedListViewState(currentState), [currentState]);
	const [savedListViews, setSavedListViews] = useState({});
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [menuOpen, setMenuOpen] = useState(false);
	const [selectedViewKey, setSelectedViewKey] = useState(SYSTEM_VIEW_KEY);
	const [currentColumnVisibilityState, setCurrentColumnVisibilityState] = useState(
		buildDefaultColumnVisibilityState(columns)
	);

	const listGroup = savedListViews[normalizedListKey] || getEmptyGroup();
	const selectedSavedView = listGroup.views.find((view) => view.id === selectedViewKey) || null;
	const selectedBaseState = selectedSavedView?.state || (selectedViewKey === SYSTEM_VIEW_KEY ? normalizedDefaultState : null);
	const defaultColumnVisibilityState = useMemo(
		() => buildDefaultColumnVisibilityState(columns),
		[columns]
	);
	const selectedBaseColumnVisibilityState = selectedSavedView?.columnVisibilityState || (selectedViewKey === SYSTEM_VIEW_KEY ? defaultColumnVisibilityState : null);
	const isDirty =
		(selectedBaseState ? !savedListViewStatesEqual(selectedBaseState, normalizedCurrentState) : false) ||
		(selectedBaseColumnVisibilityState
			? !statesEqual(selectedBaseColumnVisibilityState, currentColumnVisibilityState)
			: false);
	const selectedLabel =
		selectedViewKey === CUSTOM_VIEW_KEY
			? 'Current View'
			: `${selectedSavedView?.name || 'System Default'}${isDirty ? ' • Modified' : ''}`;

	useEffect(() => {
		let active = true;

		async function load() {
			try {
				const response = await fetch('/api/session/saved-views', { cache: 'no-store' });
				const data = await response.json().catch(() => ({}));
				if (!active || !response.ok) return;
				setSavedListViews(normalizeSavedListViews(data.savedListViews));
			} finally {
				if (active) {
					setLoading(false);
				}
			}
		}

		load();
		return () => {
			active = false;
		};
	}, []);

	useEffect(() => {
		if (!normalizedListKey) return undefined;

		function refreshColumnState() {
			setCurrentColumnVisibilityState(readColumnVisibilityState(normalizedListKey, columns));
		}

		refreshColumnState();

		function onStorage(event) {
			if (!event?.key || event.key === columnsStorageKey(normalizedListKey)) {
				refreshColumnState();
			}
		}

		function onColumnsChanged(event) {
			if (event?.detail?.tableKey !== normalizedListKey) return;
			refreshColumnState();
		}

		window.addEventListener('storage', onStorage);
		window.addEventListener(TABLE_COLUMNS_CHANGED_EVENT, onColumnsChanged);
		return () => {
			window.removeEventListener('storage', onStorage);
			window.removeEventListener(TABLE_COLUMNS_CHANGED_EVENT, onColumnsChanged);
		};
	}, [columns, normalizedListKey]);

	useEffect(() => {
		if (!normalizedListKey || loading || initializedRef.current) return;
		initializedRef.current = true;
		const group = savedListViews[normalizedListKey] || getEmptyGroup();
		const initialViewId = group.activeViewId || group.defaultViewId || null;
		if (!initialViewId) {
			setSelectedViewKey(SYSTEM_VIEW_KEY);
			return;
		}
		if (initialViewId === SYSTEM_VIEW_KEY) {
			initializingViewRef.current = {
				viewId: SYSTEM_VIEW_KEY,
				state: normalizedDefaultState,
				columnVisibilityState: normalizeColumnVisibilityState(defaultColumnVisibilityState)
			};
			setSelectedViewKey(SYSTEM_VIEW_KEY);
			persistColumnVisibilityState(defaultColumnVisibilityState);
			onApplyState(normalizedDefaultState);
			return;
		}
		const initialView = group.views.find((view) => view.id === initialViewId);
		if (!initialView) {
			setSelectedViewKey(SYSTEM_VIEW_KEY);
			return;
		}
		initializingViewRef.current = {
			viewId: initialView.id,
			state: initialView.state,
			columnVisibilityState: normalizeColumnVisibilityState(
				initialView.columnVisibilityState || defaultColumnVisibilityState
			)
		};
		setSelectedViewKey(initialView.id);
		persistColumnVisibilityState(initialView.columnVisibilityState || defaultColumnVisibilityState);
		onApplyState(initialView.state);
	}, [
		defaultColumnVisibilityState,
		loading,
		normalizedDefaultState,
		normalizedListKey,
		onApplyState,
		savedListViews
	]);

	useEffect(() => {
		const pendingInitialization = initializingViewRef.current;
		if (!pendingInitialization) return;
		if (
			savedListViewStatesEqual(pendingInitialization.state, normalizedCurrentState) &&
			statesEqual(pendingInitialization.columnVisibilityState, currentColumnVisibilityState)
		) {
			initializingViewRef.current = null;
		}
	}, [currentColumnVisibilityState, normalizedCurrentState]);

	useEffect(() => {
		if (!initializedRef.current) return;
		if (initializingViewRef.current) return;
		const matchingView = listGroup.views.find(
			(view) =>
				savedListViewStatesEqual(view.state, normalizedCurrentState) &&
				statesEqual(view.columnVisibilityState || defaultColumnVisibilityState, currentColumnVisibilityState)
		);
		if (matchingView) {
			setSelectedViewKey(matchingView.id);
			return;
		}
		if (
			savedListViewStatesEqual(normalizedCurrentState, normalizedDefaultState) &&
			statesEqual(defaultColumnVisibilityState, currentColumnVisibilityState)
		) {
			setSelectedViewKey(SYSTEM_VIEW_KEY);
			return;
		}
		if (selectedSavedView) {
			return;
		}
		setSelectedViewKey(CUSTOM_VIEW_KEY);
	}, [
		currentColumnVisibilityState,
		defaultColumnVisibilityState,
		listGroup.views,
		normalizedCurrentState,
		normalizedDefaultState,
		selectedSavedView
	]);

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

	async function persist(actionBody) {
		setSaving(true);
		try {
			const response = await fetch('/api/session/saved-views', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(actionBody)
			});
			const data = await response.json().catch(() => ({}));
			if (!response.ok) {
				toast.error(data.error || 'Failed to update saved views.');
				return null;
			}
			const nextSavedViews = normalizeSavedListViews(data.savedListViews);
			setSavedListViews(nextSavedViews);
			return {
				group: nextSavedViews[normalizedListKey] || getEmptyGroup(),
				affectedViewId: String(data.affectedViewId || '').trim() || null
			};
		} finally {
			setSaving(false);
		}
	}

	async function persistActiveView(viewId) {
		await fetch('/api/session/saved-views', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				action: 'setActive',
				listKey: normalizedListKey,
				viewId
			})
		}).catch(() => null);
	}

	async function persistColumnVisibilityState(visibilityState) {
		const normalizedVisibilityState = normalizeColumnVisibilityState(visibilityState);
		writeColumnVisibilityState(normalizedListKey, normalizedVisibilityState);
		notifyHiddenColumnsChanged(normalizedListKey);
		setCurrentColumnVisibilityState(normalizedVisibilityState);
		await fetch('/api/session/table-columns', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				tableKey: normalizedListKey,
				visibilityState: normalizedVisibilityState
			})
		}).catch(() => null);
	}

	async function onSaveAsNew() {
		const name = await requestPrompt({
			title: 'Save View',
			message: 'Name this saved view.',
			inputLabel: 'View Name',
			confirmLabel: 'Save View',
			cancelLabel: 'Cancel',
			required: true
		});
		if (!name) return;

		const result = await persist({
			action: 'save',
			listKey: normalizedListKey,
			name,
			state: normalizedCurrentState,
			columnVisibilityState: currentColumnVisibilityState
		});
		if (!result) return;

		setSelectedViewKey(result.affectedViewId || SYSTEM_VIEW_KEY);
		await persistActiveView(result.affectedViewId || SYSTEM_VIEW_KEY);
		setMenuOpen(false);
		toast.success(`Saved view "${name}".`);
	}

	async function onUpdateSelected() {
		if (!selectedSavedView) return;
		const result = await persist({
			action: 'save',
			listKey: normalizedListKey,
			viewId: selectedSavedView.id,
			name: selectedSavedView.name,
			state: normalizedCurrentState,
			columnVisibilityState: currentColumnVisibilityState
		});
		if (!result) return;
		setSelectedViewKey(result.affectedViewId || selectedSavedView.id);
		await persistActiveView(result.affectedViewId || selectedSavedView.id);
		setMenuOpen(false);
		toast.success(`Updated "${selectedSavedView.name}".`);
	}

	async function onSetDefault() {
		if (!selectedSavedView) return;
		const result = await persist({
			action: 'setDefault',
			listKey: normalizedListKey,
			viewId: selectedSavedView.id
		});
		if (!result) return;
		setSelectedViewKey(selectedSavedView.id);
		await persistActiveView(selectedSavedView.id);
		setMenuOpen(false);
		toast.success(`"${selectedSavedView.name}" is now your default view.`);
	}

	async function onDeleteSelected() {
		if (!selectedSavedView) return;
		const confirmed = await requestConfirm({
			title: 'Delete Saved View',
			message: `Delete "${selectedSavedView.name}"?`,
			confirmLabel: 'Delete',
			cancelLabel: 'Cancel',
			isDanger: true
		});
		if (!confirmed) return;

		const deletedId = selectedSavedView.id;
		const deletedName = selectedSavedView.name;
		const result = await persist({
			action: 'delete',
			listKey: normalizedListKey,
			viewId: deletedId
		});
		if (!result) return;
		const nextGroup = result.group;
		setMenuOpen(false);
		if (savedListViewStatesEqual(normalizedCurrentState, normalizedDefaultState)) {
			setSelectedViewKey(SYSTEM_VIEW_KEY);
			await persistActiveView(SYSTEM_VIEW_KEY);
		} else if (!nextGroup.views.some((view) => view.id === deletedId)) {
			setSelectedViewKey(CUSTOM_VIEW_KEY);
			await persistActiveView(null);
		}
		toast.success(`Deleted "${deletedName}".`);
	}

	async function applySystemDefault() {
		setSelectedViewKey(SYSTEM_VIEW_KEY);
		await persistColumnVisibilityState(defaultColumnVisibilityState);
		onApplyState(normalizedDefaultState);
		await persistActiveView(SYSTEM_VIEW_KEY);
		setMenuOpen(false);
	}

	async function applySavedView(view) {
		if (!view) return;
		setSelectedViewKey(view.id);
		await persistColumnVisibilityState(view.columnVisibilityState || defaultColumnVisibilityState);
		onApplyState(view.state);
		await persistActiveView(view.id);
		setMenuOpen(false);
	}

	return (
		<div className="table-toolbar-right saved-list-views" ref={pickerRef}>
			<button
				type="button"
				className="table-toolbar-button"
				onClick={() => setMenuOpen((current) => !current)}
				aria-expanded={menuOpen}
				aria-label="Saved Views"
				title={selectedLabel === 'System Default' ? 'Views' : `Views: ${selectedLabel}`}
			>
				<Bookmark aria-hidden="true" />
				<span>Views</span>
			</button>
			{menuOpen ? (
				<div className="saved-list-views-menu">
					<button
						type="button"
						className={`actions-menu-item${selectedViewKey === SYSTEM_VIEW_KEY ? ' is-selected' : ''}`}
						onClick={applySystemDefault}
						disabled={saving}
					>
						<RotateCcw aria-hidden="true" className="actions-menu-item-icon" />
						<span>System Default</span>
					</button>
					{selectedViewKey === CUSTOM_VIEW_KEY ? (
						<div className="saved-list-views-menu-note">Current filters do not match a saved view.</div>
					) : null}
					{listGroup.views.length > 0 ? (
						<>
							<div className="actions-menu-divider" />
							{listGroup.views.map((view) => (
								<button
									key={view.id}
									type="button"
									className={`actions-menu-item${selectedViewKey === view.id ? ' is-selected' : ''}`}
									onClick={() => applySavedView(view)}
									disabled={saving}
								>
									{selectedViewKey === view.id ? (
										<Check aria-hidden="true" className="actions-menu-item-icon" />
									) : view.id === listGroup.defaultViewId ? (
										<Star aria-hidden="true" className="actions-menu-item-icon" />
									) : (
										<Bookmark aria-hidden="true" className="actions-menu-item-icon" />
									)}
									<span>{view.name}</span>
								</button>
							))}
						</>
					) : null}
					<div className="actions-menu-divider" />
					<button
						type="button"
						className="actions-menu-item"
						onClick={onSaveAsNew}
						disabled={loading || saving}
					>
						<Plus aria-hidden="true" className="actions-menu-item-icon" />
						<span>Save Current View</span>
					</button>
					<button
						type="button"
						className="actions-menu-item"
						onClick={onUpdateSelected}
						disabled={loading || saving || !selectedSavedView}
					>
						<Save aria-hidden="true" className="actions-menu-item-icon" />
						<span>Update Current View</span>
					</button>
					<button
						type="button"
						className="actions-menu-item"
						onClick={onSetDefault}
						disabled={loading || saving || !selectedSavedView}
					>
						<Star aria-hidden="true" className="actions-menu-item-icon" />
						<span>Set as Default</span>
					</button>
					<button
						type="button"
						className="actions-menu-item actions-menu-item-danger"
						onClick={onDeleteSelected}
						disabled={loading || saving || !selectedSavedView}
					>
						<Trash2 aria-hidden="true" className="actions-menu-item-icon" />
						<span>Delete View</span>
					</button>
				</div>
			) : null}
		</div>
	);
}
