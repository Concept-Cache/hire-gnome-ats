'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import EntityTable from '@/app/components/entity-table';
import TableColumnPicker from '@/app/components/table-column-picker';
import { divisionAccessModeLabel } from '@/app/constants/access-control-options';
import AdminGate from '@/app/components/admin-gate';

export default function DivisionsPage() {
	const router = useRouter();
	const [rows, setRows] = useState([]);
	const [loading, setLoading] = useState(false);
	const [query, setQuery] = useState('');
	const [modeFilter, setModeFilter] = useState('all');
	const [error, setError] = useState('');

	const modeOptions = useMemo(() => {
		return [...new Set(rows.map((row) => row.accessMode).filter(Boolean))]
			.map((mode) => ({
				value: mode,
				label: rows.find((row) => row.accessMode === mode)?.accessModeLabel || mode
			}))
			.sort((a, b) => a.label.localeCompare(b.label));
	}, [rows]);

	const filteredRows = useMemo(() => {
		const q = query.trim().toLowerCase();
		return rows.filter((row) => {
			const matchesQuery = !q || `${row.name} ${row.accessModeLabel}`.toLowerCase().includes(q);
			const matchesMode = modeFilter === 'all' || row.accessMode === modeFilter;
			return matchesQuery && matchesMode;
		});
	}, [rows, query, modeFilter]);

	useEffect(() => {
		let cancelled = false;

		async function load() {
			setLoading(true);
			try {
				const res = await fetch('/api/divisions');
				if (!res.ok) {
					if (!cancelled) setError('Failed to load divisions.');
					return;
				}

				const data = await res.json();
				if (cancelled || !Array.isArray(data)) return;

				setRows(
					data.map((division) => ({
						...division,
						accessModeLabel: divisionAccessModeLabel(division.accessMode),
						userCount: division._count?.users ?? 0,
						candidateCount: division._count?.candidates ?? 0,
						clientCount: division._count?.clients ?? 0,
						contactCount: division._count?.contacts ?? 0,
						jobOrderCount: division._count?.jobOrders ?? 0
					}))
				);
			} finally {
				if (!cancelled) {
					setLoading(false);
				}
			}
		}

		load();
		return () => {
			cancelled = true;
		};
	}, []);

	function onOpen(row) {
		router.push(`/admin/divisions/${row.id}`);
	}

	const columns = [
		{ key: 'name', label: 'Division' },
		{ key: 'accessModeLabel', label: 'Access Mode' },
		{ key: 'userCount', label: 'Users' },
		{ key: 'candidateCount', label: 'Candidates' },
		{ key: 'clientCount', label: 'Clients' },
		{ key: 'contactCount', label: 'Contacts' },
		{ key: 'jobOrderCount', label: 'Job Orders' }
	];

	return (
		<AdminGate>
			<section className="module-page">
				<header className="module-header module-header-list">
					<div>
						<h2>Divisions</h2>
					</div>
					<div className="module-header-actions">
						<Link
							href="/admin/divisions/new"
							className="btn-link btn-link-icon"
							aria-label="New Division"
							title="New Division"
						>
							<Plus aria-hidden="true" className="btn-refresh-icon-svg" />
						</Link>
					</div>
				</header>

				<article className="panel">
					<h3>Division List</h3>
						<div className="list-controls list-controls-two list-controls-with-columns">
						<input
							placeholder="Search division name or mode"
							value={query}
							onChange={(event) => setQuery(event.target.value)}
						/>
							<select value={modeFilter} onChange={(event) => setModeFilter(event.target.value)}>
								<option value="all">All Access Modes</option>
							{modeOptions.map((option) => (
								<option key={option.value} value={option.value}>
									{option.label}
								</option>
								))}
							</select>
							<TableColumnPicker tableKey="admin-divisions" columns={columns} />
						</div>
						<EntityTable
							tableKey="admin-divisions"
							columns={columns}
							rows={filteredRows}
							loading={loading}
							loadingLabel="Loading divisions"
						rowActions={[{ label: 'Open', onClick: onOpen }]}
					/>
					{error ? <p className="panel-subtext error">{error}</p> : null}
				</article>
			</section>
		</AdminGate>
	);
}
