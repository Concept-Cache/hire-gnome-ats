'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react';

const ToastContext = createContext(null);
let toastIdCounter = 0;

function nextToastId() {
	toastIdCounter += 1;
	return `toast-${toastIdCounter}`;
}

function getToastIcon(type) {
	if (type === 'success') return CheckCircle2;
	if (type === 'error') return CircleAlert;
	return Info;
}

export function ToastProvider({ children }) {
	const [toasts, setToasts] = useState([]);
	const timeoutMapRef = useRef(new Map());

	const removeToast = useCallback((id) => {
		setToasts((current) => current.filter((toast) => toast.id !== id));
		const timeoutId = timeoutMapRef.current.get(id);
		if (timeoutId) {
			clearTimeout(timeoutId);
			timeoutMapRef.current.delete(id);
		}
	}, []);

	const pushToast = useCallback((message, options = {}) => {
		const text = String(message || '').trim();
		if (!text) return '';

		const id = nextToastId();
		const type = String(options.type || 'info').trim().toLowerCase();
		const duration = Number.isFinite(options.duration) ? Number(options.duration) : 4400;
		const toast = {
			id,
			type: type === 'success' || type === 'error' ? type : 'info',
			message: text
		};

		setToasts((current) => {
			const next = [...current, toast];
			return next.slice(-5);
		});

		if (duration > 0) {
			const timeoutId = setTimeout(() => removeToast(id), duration);
			timeoutMapRef.current.set(id, timeoutId);
		}

		return id;
	}, [removeToast]);

	const api = useMemo(() => ({
		show: pushToast,
		success: (message, options = {}) => pushToast(message, { ...options, type: 'success' }),
		error: (message, options = {}) => pushToast(message, { ...options, type: 'error' }),
		info: (message, options = {}) => pushToast(message, { ...options, type: 'info' }),
		remove: removeToast
	}), [pushToast, removeToast]);

	return (
		<ToastContext.Provider value={api}>
			{children}
			<div className="toast-stack" aria-live="polite" aria-atomic="false">
				{toasts.map((toast) => {
					const Icon = getToastIcon(toast.type);

					return (
						<div key={toast.id} className={`toast-item toast-${toast.type}`} role="status">
							<span className="toast-icon" aria-hidden="true">
								<Icon />
							</span>
							<p className="toast-message">{toast.message}</p>
							<button
								type="button"
								className="toast-dismiss"
								onClick={() => removeToast(toast.id)}
								aria-label="Dismiss notification"
							>
								<X />
							</button>
						</div>
					);
				})}
			</div>
		</ToastContext.Provider>
	);
}

export function useToast() {
	const context = useContext(ToastContext);
	if (!context) {
		throw new Error('useToast must be used within a ToastProvider.');
	}

	return context;
}
