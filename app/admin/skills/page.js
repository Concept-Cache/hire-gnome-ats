'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import EntityTable from '@/app/components/entity-table';
import TableColumnPicker from '@/app/components/table-column-picker';
import AdminGate from '@/app/components/admin-gate';

function yesNo(value) {
	return value ? 'Yes' : 'No';
}

export default function SkillsPage() {
	const router = useRouter();
	const [rows, setRows] = useState([]);
	const [loading, setLoading] = useState(false);
	const [query, setQuery] = useState('');
	const [categoryFilter, setCategoryFilter] = useState('all');
	const [activeFilter, setActiveFilter] = useState('all');
	const [error, setError] = useState('');

	const categoryOptions = useMemo(() => {
		return [...new Set(rows.map((row) => row.category).filter(Boolean))].sort((a, b) =>
			String(a).localeCompare(String(b))
		);
	}, [rows]);

	const filteredRows = useMemo(() => {
		const q = query.trim().toLowerCase();
		return rows.filter((row) => {
			const matchesQuery = !q || `${row.name} ${row.category || ''}`.toLowerCase().includes(q);
			const matchesCategory = categoryFilter === 'all' || row.category === categoryFilter;
			const isActive = row.isActive ? 'active' : 'inactive';
			const matchesActive = activeFilter === 'all' || isActive === activeFilter;
			return matchesQuery && matchesCategory && matchesActive;
		});
	}, [rows, query, categoryFilter, activeFilter]);

	useEffect(() => {
		let cancelled = false;

		async function load() {
			setLoading(true);
			try {
				const res = await fetch('/api/skills');
				if (!res.ok) {
					if (!cancelled) setError('Failed to load skills.');
					return;
				}

				const data = await res.json();
				if (cancelled || !Array.isArray(data)) return;

				setRows(
					data.map((skill) => ({
						...skill,
						activeLabel: yesNo(skill.isActive),
						candidateCount: skill._count?.candidateSkills ?? 0
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
		router.push(`/admin/skills/${row.id}`);
	}

	const columns = [
		{ key: 'name', label: 'Skill' },
		{ key: 'category', label: 'Category' },
		{ key: 'activeLabel', label: 'Active' },
		{ key: 'candidateCount', label: 'Candidates' }
	];

	return (
		<AdminGate>
			<section className="module-page">
				<header className="module-header module-header-list">
					<div>
						<h2>Skills</h2>
					</div>
					<div className="module-header-actions">
						<Link href="/admin/skills/new" className="btn-link btn-link-icon" aria-label="New Skill" title="New Skill">
							<Plus aria-hidden="true" className="btn-refresh-icon-svg" />
						</Link>
					</div>
				</header>

				<article className="panel">
					<h3>Skill List</h3>
						<div className="list-controls list-controls-three list-controls-with-columns">
						<input
							placeholder="Search skill name or category"
							value={query}
							onChange={(event) => setQuery(event.target.value)}
						/>
						<select
							value={categoryFilter}
							onChange={(event) => setCategoryFilter(event.target.value)}
						>
							<option value="all">All Categories</option>
							{categoryOptions.map((category) => (
								<option key={category} value={category}>
									{category}
								</option>
							))}
						</select>
							<select value={activeFilter} onChange={(event) => setActiveFilter(event.target.value)}>
								<option value="all">All Activity</option>
							<option value="active">Active</option>
								<option value="inactive">Inactive</option>
							</select>
							<TableColumnPicker tableKey="admin-skills" columns={columns} />
						</div>
						<EntityTable
							tableKey="admin-skills"
							columns={columns}
							rows={filteredRows}
							loading={loading}
							loadingLabel="Loading skills"
						rowActions={[{ label: 'Open', onClick: onOpen }]}
					/>
					{error ? <p className="panel-subtext error">{error}</p> : null}
				</article>
			</section>
		</AdminGate>
	);
}
