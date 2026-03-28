'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useConfirmDialog } from '@/app/components/confirm-dialog';

const DEFAULT_MESSAGE = 'You have unsaved changes. Discard changes and leave this page?';

function toSerializedValue(value) {
	try {
		return JSON.stringify(value ?? null);
	} catch {
		return '';
	}
}

function isNonNavigatingHref(href) {
	if (!href) return true;
	return (
		href.startsWith('#') ||
		href.startsWith('mailto:') ||
		href.startsWith('tel:') ||
		href.startsWith('javascript:')
	);
}

function shouldIgnoreAnchor(anchor) {
	if (!anchor) return true;
	if (anchor.target && anchor.target !== '_self') return true;
	if (anchor.hasAttribute('download')) return true;
	if (anchor.getAttribute('rel') === 'external') return true;
	return false;
}

export default function useUnsavedChangesGuard(currentValue, options = {}) {
	const { enabled = true, message = DEFAULT_MESSAGE, enableNativeBeforeUnload = false } = options;

	const serializedCurrentValue = useMemo(() => toSerializedValue(currentValue), [currentValue]);
	const baselineRef = useRef(serializedCurrentValue);
	const currentValueRef = useRef(currentValue);
	const allowNextNavigationRef = useRef(false);
	const { requestConfirm } = useConfirmDialog();

	currentValueRef.current = currentValue;

	const isDirty = enabled && serializedCurrentValue !== baselineRef.current;

	const markAsClean = useCallback((nextValue) => {
		const valueToPersist = nextValue === undefined ? currentValueRef.current : nextValue;
		baselineRef.current = toSerializedValue(valueToPersist);
	}, []);

	const confirmNavigation = useCallback(async () => {
		if (!enabled || !isDirty) {
			return true;
		}

		const confirmed = await requestConfirm({
			message,
			confirmLabel: 'Discard Changes',
			cancelLabel: 'Keep Editing',
			isDanger: true
		});
		if (confirmed) {
			allowNextNavigationRef.current = true;
		}
		return confirmed;
	}, [enabled, isDirty, message, requestConfirm]);

	useEffect(() => {
		if (!enableNativeBeforeUnload) return undefined;
		if (typeof window === 'undefined') return undefined;

		const onBeforeUnload = (event) => {
			if (allowNextNavigationRef.current) return;
			if (!enabled || !isDirty) return;
			event.preventDefault();
			event.returnValue = '';
		};

		window.addEventListener('beforeunload', onBeforeUnload);
		return () => {
			window.removeEventListener('beforeunload', onBeforeUnload);
		};
	}, [enableNativeBeforeUnload, enabled, isDirty]);

	useEffect(() => {
		if (typeof document === 'undefined') return undefined;

		const onDocumentClick = (event) => {
			if (!enabled || !isDirty) return;
			if (allowNextNavigationRef.current) {
				allowNextNavigationRef.current = false;
				return;
			}
			if (event.defaultPrevented) return;
			if (event.button !== 0) return;
			if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
			if (!(event.target instanceof Element)) return;

			const anchor = event.target.closest('a[href]');
			if (!anchor || shouldIgnoreAnchor(anchor)) return;

			const href = anchor.getAttribute('href') || '';
			if (isNonNavigatingHref(href)) return;

			const nextUrl = new URL(anchor.href, window.location.href);
			const currentUrl = new URL(window.location.href);
			const samePathAndQuery =
				nextUrl.pathname === currentUrl.pathname && nextUrl.search === currentUrl.search;
			if (samePathAndQuery) return;

			event.preventDefault();
			event.stopPropagation();
			(async () => {
				const confirmed = await confirmNavigation();
				if (!confirmed) return;
				window.location.assign(nextUrl.href);
			})();
			return;
		};

		document.addEventListener('click', onDocumentClick, true);
		return () => {
			document.removeEventListener('click', onDocumentClick, true);
		};
	}, [confirmNavigation, enabled, isDirty]);

	useEffect(() => {
		if (typeof window === 'undefined') return undefined;

		const onPopState = async () => {
			if (!enabled || !isDirty) return;
			if (allowNextNavigationRef.current) {
				allowNextNavigationRef.current = false;
				return;
			}

			const confirmed = await requestConfirm({
				message,
				confirmLabel: 'Discard Changes',
				cancelLabel: 'Keep Editing',
				isDanger: true
			});
			if (!confirmed) {
				window.history.pushState(null, '', window.location.href);
				return;
			}
			allowNextNavigationRef.current = true;
		};

		window.addEventListener('popstate', onPopState);
		return () => {
			window.removeEventListener('popstate', onPopState);
		};
	}, [enabled, isDirty, message, requestConfirm]);

	return {
		isDirty,
		markAsClean,
		confirmNavigation
	};
}
