'use client';

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

export default function TableEntityLink({ href, children, ariaLabel }) {
	return (
		<Link href={href} className="table-cell-link" aria-label={ariaLabel}>
			<span>{children}</span>
			<ArrowUpRight aria-hidden="true" className="table-cell-link-icon" />
		</Link>
	);
}
