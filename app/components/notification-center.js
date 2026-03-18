'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Bell, Check, CheckCheck, LoaderCircle, RotateCcw } from 'lucide-react';
import { formatDateTimeAt } from '@/lib/date-format';
import { useToast } from '@/app/components/toast-provider';

function toRows(data) {
	if (!data || !Array.isArray(data.rows)) return [];
	return data.rows;
}

export default function NotificationCenter() {
	const toast = useToast();
	const [open, setOpen] = useState(false);
	const [loading, setLoading] = useState(false);
	const [rows, setRows] = useState([]);
	const [unreadCount, setUnreadCount] = useState(0);
	const [markingAllRead, setMarkingAllRead] = useState(false);
	const rootRef = useRef(null);

	async function loadNotifications({ silent = false } = {}) {
		if (!silent) setLoading(true);
		try {
			const res = await fetch('/api/notifications?limit=25', { cache: 'no-store' });
			const data = await res.json().catch(() => ({}));
			if (!res.ok) {
				if (!silent) {
					toast.error(data.error || 'Failed to load notifications.');
				}
				return;
			}
			setRows(toRows(data));
			setUnreadCount(Number(data.unreadCount) || 0);
		} finally {
			if (!silent) setLoading(false);
		}
	}

	useEffect(() => {
		loadNotifications({ silent: true });
		const intervalId = window.setInterval(() => {
			loadNotifications({ silent: true });
		}, 30000);
		return () => {
			window.clearInterval(intervalId);
		};
	}, []);

	useEffect(() => {
		function onMouseDown(event) {
			if (!rootRef.current || rootRef.current.contains(event.target)) return;
			setOpen(false);
		}

		function onKeyDown(event) {
			if (event.key === 'Escape') {
				setOpen(false);
			}
		}

		document.addEventListener('mousedown', onMouseDown);
		document.addEventListener('keydown', onKeyDown);
		return () => {
			document.removeEventListener('mousedown', onMouseDown);
			document.removeEventListener('keydown', onKeyDown);
		};
	}, []);

	async function onToggleOpen() {
		const nextOpen = !open;
		setOpen(nextOpen);
		if (nextOpen) {
			await loadNotifications();
		}
	}

	async function onMarkNotificationRead(notificationId, read) {
		const res = await fetch(`/api/notifications/${notificationId}`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ read })
		});
		if (!res.ok) {
			const data = await res.json().catch(() => ({}));
			toast.error(data.error || 'Failed to update notification.');
			return;
		}
		await loadNotifications({ silent: true });
	}

	async function onMarkAllRead() {
		if (markingAllRead) return;
		setMarkingAllRead(true);
		try {
			const res = await fetch('/api/notifications', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'mark_all_read' })
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) {
				toast.error(data.error || 'Failed to mark notifications as read.');
				return;
			}
			await loadNotifications({ silent: true });
		} finally {
			setMarkingAllRead(false);
		}
	}

	return (
		<div className="topbar-notification-menu" ref={rootRef}>
			<button
				type="button"
				className="topbar-icon-trigger"
				onClick={onToggleOpen}
				aria-haspopup="menu"
				aria-expanded={open}
				aria-label="Notifications"
				title="Notifications"
			>
				<Bell aria-hidden="true" />
				{unreadCount > 0 ? <span className="topbar-badge">{unreadCount > 99 ? '99+' : unreadCount}</span> : null}
			</button>
			{open ? (
				<div className="topbar-notification-dropdown" role="menu" aria-label="Notifications">
					<div className="topbar-notification-header">
						<strong>Notifications</strong>
						<button
							type="button"
							className="topbar-notification-mark-all"
							onClick={onMarkAllRead}
							disabled={markingAllRead || unreadCount <= 0}
							aria-label="Mark all notifications read"
							title={markingAllRead ? 'Updating notifications' : 'Mark all notifications read'}
						>
							{markingAllRead ? <LoaderCircle aria-hidden="true" className="topbar-notification-spinner" /> : <CheckCheck aria-hidden="true" />}
						</button>
					</div>
					{loading ? <p className="topbar-notification-empty">Loading...</p> : null}
					{!loading && rows.length === 0 ? <p className="topbar-notification-empty">No notifications yet.</p> : null}
					{!loading && rows.length > 0 ? (
						<ul className="topbar-notification-list">
							{rows.map((row) => {
								const isUnread = !row.readAt;
								return (
									<li key={row.id} className={isUnread ? 'topbar-notification-item unread' : 'topbar-notification-item'}>
										<div className="topbar-notification-item-main">
											{row.linkHref ? (
												<Link href={row.linkHref} onClick={() => setOpen(false)}>
													{row.title}
												</Link>
											) : (
												<strong>{row.title}</strong>
											)}
											{row.message ? <p>{row.message}</p> : null}
											<small><span className="meta-emphasis-time">{formatDateTimeAt(row.createdAt)}</span></small>
										</div>
										<button
											type="button"
											className="topbar-notification-item-toggle"
											onClick={() => onMarkNotificationRead(row.id, isUnread)}
											aria-label={isUnread ? 'Mark notification read' : 'Mark notification unread'}
											title={isUnread ? 'Mark notification read' : 'Mark notification unread'}
										>
											{isUnread ? <Check aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}
										</button>
									</li>
								);
							})}
						</ul>
					) : null}
				</div>
			) : null}
		</div>
	);
}
