'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const ConfirmDialogContext = createContext(null);

function fallbackConfirm(message) {
	if (typeof window === 'undefined') {
		return true;
	}

	console.error(
		'[ConfirmDialog] Provider missing; confirmation suppressed.',
		String(message || 'Confirm this action?')
	);
	return false;
}

function fallbackPrompt(message, initialValue) {
	if (typeof window === 'undefined') {
		return null;
	}

	console.error(
		'[ConfirmDialog] Provider missing; prompt suppressed.',
		String(message || 'Enter value.')
	);
	return null;
}

function fallbackConfirmWithOptions(message) {
	if (typeof window === 'undefined') {
		return { confirmed: true, selections: [] };
	}

	console.error(
		'[ConfirmDialog] Provider missing; option confirmation suppressed.',
		String(message || 'Confirm this action?')
	);
	return { confirmed: false, selections: [] };
}

function formatMessage(value) {
	return String(value || '').trim() || 'Confirm this action?';
}

function normalizeConfirmOptions(value) {
	if (!Array.isArray(value)) return [];
	return value
		.map((item) => {
			const id = String(item?.id || '').trim();
			if (!id) return null;
			return {
				id,
				label: String(item?.label || id).trim() || id,
				description: String(item?.description || '').trim(),
				defaultChecked: Boolean(item?.defaultChecked)
			};
		})
		.filter(Boolean);
}

function selectedOptionIdsFromState(options, selectedMap) {
	const next = [];
	for (const option of options) {
		if (selectedMap?.[option.id]) {
			next.push(option.id);
		}
	}
	return next;
}

export function ConfirmDialogProvider({ children }) {
	const [state, setState] = useState({
		enabled: false,
		mode: 'confirm',
		title: 'Confirm',
		message: 'Confirm this action?',
		confirmLabel: 'Confirm',
		cancelLabel: 'Cancel',
		required: false,
		isDanger: false,
		inputLabel: '',
		inputValue: '',
		initialValue: '',
		options: [],
		selectedOptionMap: {}
	});
	const resolverRef = useRef(null);

	const close = useCallback((result) => {
		setState((current) => ({ ...current, enabled: false }));
		const resolver = resolverRef.current;
		resolverRef.current = null;
		if (typeof resolver === 'function') {
			resolver(result);
		}
	}, []);

	const requestConfirm = useCallback((options = {}) => {
		return new Promise((resolve) => {
			if (typeof window === 'undefined') {
				resolve(fallbackConfirm(formatMessage(options.message)));
				return;
			}

			if (resolverRef.current) {
				const previous = resolverRef.current;
				resolverRef.current = null;
				previous(false);
			}

			resolverRef.current = resolve;
			setState({
				enabled: true,
				mode: 'confirm',
				title: String(options.title || 'Confirm'),
				message: formatMessage(options.message),
				confirmLabel: String(options.confirmLabel || 'Confirm'),
				cancelLabel: String(options.cancelLabel || 'Cancel'),
				required: false,
				isDanger: Boolean(options.isDanger || options.destructive),
				inputLabel: '',
				inputValue: '',
				initialValue: '',
				options: [],
				selectedOptionMap: {}
			});
		});
	}, []);

	const requestConfirmWithOptions = useCallback((options = {}) => {
		return new Promise((resolve) => {
			if (typeof window === 'undefined') {
				resolve(fallbackConfirmWithOptions(formatMessage(options.message)));
				return;
			}

			if (resolverRef.current) {
				const previous = resolverRef.current;
				resolverRef.current = null;
				previous({ confirmed: false, selections: [] });
			}

			const normalizedOptions = normalizeConfirmOptions(options.options);
			const selectedOptionMap = {};
			for (const option of normalizedOptions) {
				if (option.defaultChecked) {
					selectedOptionMap[option.id] = true;
				}
			}

			resolverRef.current = resolve;
			setState({
				enabled: true,
				mode: 'confirm_options',
				title: String(options.title || 'Confirm'),
				message: formatMessage(options.message),
				confirmLabel: String(options.confirmLabel || 'Confirm'),
				cancelLabel: String(options.cancelLabel || 'Cancel'),
				required: false,
				isDanger: Boolean(options.isDanger || options.destructive),
				inputLabel: '',
				inputValue: '',
				initialValue: '',
				options: normalizedOptions,
				selectedOptionMap
			});
		});
	}, []);

	const requestPrompt = useCallback((options = {}) => {
		return new Promise((resolve) => {
			if (typeof window === 'undefined') {
				const value = fallbackPrompt(options.message, options.initialValue);
				if (options.required && !String(value || '').trim()) {
					resolve(null);
					return;
				}
				resolve(value);
				return;
			}

			if (resolverRef.current) {
				const previous = resolverRef.current;
				resolverRef.current = null;
				previous(null);
			}

			const initialValue = String(options.initialValue || '').trim();

			resolverRef.current = resolve;
			setState({
				enabled: true,
				mode: 'prompt',
				title: String(options.title || 'Enter value'),
				message: String(options.message || 'Enter a value.'),
				confirmLabel: String(options.confirmLabel || 'Save'),
				cancelLabel: String(options.cancelLabel || 'Cancel'),
				required: Boolean(options.required),
				isDanger: Boolean(options.isDanger || options.destructive),
				inputLabel: String(options.inputLabel || ''),
				inputValue: initialValue,
				initialValue,
				options: [],
				selectedOptionMap: {}
			});
		});
	}, []);

	useEffect(() => {
		if (!state.enabled) return undefined;

		function onKeyDown(event) {
			if (event.key === 'Escape') {
				if (state.mode === 'prompt') {
					close(null);
					return;
				}
				if (state.mode === 'confirm_options') {
					close({ confirmed: false, selections: [] });
					return;
				}
				close(false);
				return;
			}

			if (event.key === 'Enter') {
				if (state.mode === 'prompt' && state.required && !String(state.inputValue || '').trim()) {
					return;
				}
				if (state.mode === 'prompt') {
					close(String(state.inputValue || '').trim());
					return;
				}
				if (state.mode === 'confirm_options') {
					close({
						confirmed: true,
						selections: selectedOptionIdsFromState(state.options, state.selectedOptionMap)
					});
					return;
				}
				close(true);
			}
		}

		document.addEventListener('keydown', onKeyDown);
		return () => {
			document.removeEventListener('keydown', onKeyDown);
		};
	}, [close, state.enabled, state.mode, state.required]);

	const onCancel = () => {
		if (state.mode === 'prompt') {
			close(null);
			return;
		}
		if (state.mode === 'confirm_options') {
			close({ confirmed: false, selections: [] });
			return;
		}
		close(false);
	};

	const onConfirm = () => {
		if (state.mode === 'prompt') {
			const value = String(state.inputValue || '').trim();
			if (state.required && !value) return;
			close(value);
			return;
		}
		if (state.mode === 'confirm_options') {
			close({
				confirmed: true,
				selections: selectedOptionIdsFromState(state.options, state.selectedOptionMap)
			});
			return;
		}
		close(true);
	};

	const onToggleOption = (optionId) => {
		setState((current) => {
			if (current.mode !== 'confirm_options') return current;
			const selectedOptionMap = { ...(current.selectedOptionMap || {}) };
			selectedOptionMap[optionId] = !Boolean(selectedOptionMap[optionId]);
			return { ...current, selectedOptionMap };
		});
	};

	return (
		<ConfirmDialogContext.Provider value={{ requestConfirm, requestConfirmWithOptions, requestPrompt }}>
			{children}
			{!state.enabled ? null : (
				<div
					className="confirm-overlay"
					role="presentation"
					onClick={(event) => {
						if (event.target !== event.currentTarget) return;
						onCancel();
					}}
				>
					<div
						className="confirm-dialog"
						role="dialog"
						aria-modal="true"
						aria-labelledby="confirm-title"
						aria-describedby="confirm-message"
					>
						<h3 id="confirm-title" className="confirm-title">
							{state.title}
						</h3>
						<p id="confirm-message" className="confirm-message">
							{state.message}
						</p>
						{state.mode === 'prompt' ? (
							<div className="confirm-prompt">
								{state.inputLabel ? <label>{state.inputLabel}</label> : null}
								<input
									autoFocus
									className="confirm-input"
									value={state.inputValue}
									onChange={(event) => {
										const nextValue = event.target.value;
										setState((current) => {
											if (current.mode !== 'prompt') return current;
											return {
												...current,
												inputValue: nextValue
											};
										});
									}}
								/>
							</div>
						) : null}
						{state.mode === 'confirm_options' && state.options.length > 0 ? (
							<div className="confirm-options">
								{state.options.map((option) => (
									<label key={option.id} className="confirm-option">
										<input
											type="checkbox"
											className="confirm-option-input"
											checked={Boolean(state.selectedOptionMap?.[option.id])}
											onChange={() => onToggleOption(option.id)}
										/>
										<span className="confirm-option-copy">
											<strong>{option.label}</strong>
											{option.description ? <small>{option.description}</small> : null}
										</span>
									</label>
								))}
							</div>
						) : null}
						<div className="confirm-actions">
							<button type="button" className="btn-secondary confirm-action-button" onClick={onCancel}>
								{state.cancelLabel}
							</button>
							<button
								type="button"
								className={state.isDanger ? 'btn-danger confirm-action-button' : 'btn-primary confirm-action-button'}
								disabled={state.mode === 'prompt' && state.required && !String(state.inputValue || '').trim()}
								onClick={onConfirm}
							>
								{state.confirmLabel}
							</button>
						</div>
					</div>
				</div>
			)}
		</ConfirmDialogContext.Provider>
	);
}

export function useConfirmDialog() {
	const context = useContext(ConfirmDialogContext);

	if (!context) {
		return {
			requestConfirm: async (options = {}) => fallbackConfirm(formatMessage(options.message)),
			requestConfirmWithOptions: async (options = {}) => fallbackConfirmWithOptions(formatMessage(options.message)),
			requestPrompt: async (options = {}) => {
				const value = fallbackPrompt(options.message, options.initialValue);
				if (options.required && !String(value || '').trim()) {
					return null;
				}
				return value;
			}
		};
	}

	return context;
}
