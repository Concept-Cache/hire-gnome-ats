'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';

const QUICK_CREATE_ITEMS = [
	{ label: 'New Candidate', href: '/candidates/new' },
	{ label: 'New Client', href: '/clients/new' },
	{ label: 'New Contact', href: '/contacts/new' },
	{ label: 'New Job Order', href: '/job-orders/new' },
	{ label: 'New Submission', href: '/submissions/new' },
	{ label: 'New Interview', href: '/interviews/new' },
	{ label: 'New Placement', href: '/placements/new' }
];

export default function QuickCreateMenu() {
	const [open, setOpen] = useState(false);
	const rootRef = useRef(null);

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

	return (
		<div className="topbar-quick-create" ref={rootRef}>
			<button
				type="button"
				className="topbar-icon-trigger topbar-quick-create-trigger"
				onClick={() => setOpen((current) => !current)}
				aria-haspopup="menu"
				aria-expanded={open}
				aria-label="Quick create"
				title="Quick Create"
			>
				<Plus aria-hidden="true" />
			</button>
			{open ? (
				<div className="topbar-quick-create-dropdown" role="menu" aria-label="Quick create">
					{QUICK_CREATE_ITEMS.map((item) => (
						<Link key={item.href} href={item.href} role="menuitem" onClick={() => setOpen(false)}>
							{item.label}
						</Link>
					))}
				</div>
			) : null}
		</div>
	);
}
