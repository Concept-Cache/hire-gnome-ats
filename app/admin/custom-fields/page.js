'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import AdminGate from '@/app/components/admin-gate';
import EntityTable from '@/app/components/entity-table';
import TableColumnPicker from '@/app/components/table-column-picker';
import {
	CUSTOM_FIELD_MODULE_OPTIONS,
	customFieldModuleLabel,
	customFieldTypeLabel
} from '@/app/constants/custom-field-options';

function yesNoLabel(value) {
	return value ? 'Yes' : 'No';
}

export default function CustomFieldsAdminPage() {
	const router = useRouter();
	const [rows, setRows] = useState([]);
	const [loading, setLoading] = useState(false);
	const [query, setQuery] = useState('');
	const [moduleFilter, setModuleFilter] = useState('all');
	const [activeFilter, setActiveFilter] = useState('all');
	const [error, setError] = useState('');

	useEffect(() => {
		let cancelled = false;

		async function load() {
			setLoading(true);
			setError('');
			try {
				const res = await fetch('/api/admin/custom-fields?includeInactive=true', {
					cache: 'no-store'
				});
				if (!res.ok) {
					const data = await res.json().catch(() => ({}));
					if (!cancelled) {
						setError(data.error || 'Failed to load custom fields.');
					}
					return;
				}

				const data = await res.json().catch(() => []);
				if (cancelled || !Array.isArray(data)) return;

				setRows(
					data.map((row) => ({
						...row,
						moduleLabel: customFieldModuleLabel(row.moduleKey),
						typeLabel: customFieldTypeLabel(row.fieldType),
						requiredLabel: yesNoLabel(row.isRequired),
						activeLabel: yesNoLabel(row.isActive)
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

	const filteredRows = useMemo(() => {
		const q = query.trim().toLowerCase();
		return rows.filter((row) => {
			const matchesQuery =
				!q ||
				`${row.label || ''} ${row.fieldKey || ''} ${row.moduleLabel || ''} ${row.typeLabel || ''}`
					.toLowerCase()
					.includes(q);
			const matchesModule = moduleFilter === 'all' || row.moduleKey === moduleFilter;
			const activeValue = row.isActive ? 'active' : 'inactive';
			const matchesActive = activeFilter === 'all' || activeValue === activeFilter;
			return matchesQuery && matchesModule && matchesActive;
		});
	}, [activeFilter, moduleFilter, query, rows]);

	function onOpen(row) {
		router.push(`/admin/custom-fields/${row.id}`);
	}

	const columns = [
		{ key: 'label', label: 'Label' },
		{ key: 'moduleLabel', label: 'Module' },
		{ key: 'fieldKey', label: 'Key' },
		{ key: 'typeLabel', label: 'Type' },
		{ key: 'requiredLabel', label: 'Required' },
		{ key: 'activeLabel', label: 'Active' },
		{ key: 'sortOrder', label: 'Sort' }
	];

	return (
		<AdminGate>
			<section className="module-page">
				<header className="module-header module-header-list">
					<div>
						<h2>Custom Fields</h2>
					</div>
					<div className="module-header-actions">
						<Link
							href="/admin/custom-fields/new"
							className="btn-link btn-link-icon"
							aria-label="New Custom Field"
							title="New Custom Field"
						>
							<Plus aria-hidden="true" className="btn-refresh-icon-svg" />
						</Link>
					</div>
				</header>

				<article className="panel">
					<h3>Custom Field List</h3>
					<div className="list-controls list-controls-three list-controls-with-columns">
						<input
							placeholder="Search label, key, module, type"
							value={query}
							onChange={(event) => setQuery(event.target.value)}
						/>
						<select value={moduleFilter} onChange={(event) => setModuleFilter(event.target.value)}>
							<option value="all">All Modules</option>
							{CUSTOM_FIELD_MODULE_OPTIONS.map((option) => (
								<option key={option.value} value={option.value}>
									{option.label}
								</option>
							))}
						</select>
						<select value={activeFilter} onChange={(event) => setActiveFilter(event.target.value)}>
							<option value="all">All Activity</option>
							<option value="active">Active</option>
							<option value="inactive">Inactive</option>
						</select>
						<TableColumnPicker tableKey="admin-custom-fields" columns={columns} />
					</div>
					<EntityTable
						tableKey="admin-custom-fields"
						columns={columns}
						rows={filteredRows}
						loading={loading}
						loadingLabel="Loading custom fields"
						rowActions={[{ label: 'Open', onClick: onOpen }]}
					/>
					{error ? <p className="panel-subtext error">{error}</p> : null}
				</article>
			</section>
		</AdminGate>
	);
}
