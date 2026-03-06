'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import EntityTable from '@/app/components/entity-table';
import TableColumnPicker from '@/app/components/table-column-picker';
import { roleLabel } from '@/app/constants/access-control-options';
import AdminGate from '@/app/components/admin-gate';

function yesNo(value) {
	return value ? 'Yes' : 'No';
}

export default function UsersPage() {
	const router = useRouter();
	const [rows, setRows] = useState([]);
	const [loading, setLoading] = useState(false);
	const [query, setQuery] = useState('');
	const [roleFilter, setRoleFilter] = useState('all');
	const [activeFilter, setActiveFilter] = useState('all');

	const roleOptions = useMemo(() => {
		return [...new Set(rows.map((row) => row.role).filter(Boolean))]
			.map((role) => ({
				value: role,
				label: rows.find((row) => row.role === role)?.roleLabel || role
			}))
			.sort((a, b) => a.label.localeCompare(b.label));
	}, [rows]);

	const filteredRows = useMemo(() => {
		const q = query.trim().toLowerCase();
		return rows.filter((row) => {
			const matchesQuery =
				!q ||
				`${row.fullName} ${row.email} ${row.roleLabel} ${row.divisionName || ''}`
					.toLowerCase()
					.includes(q);
			const matchesRole = roleFilter === 'all' || row.role === roleFilter;
			const isActive = row.isActive ? 'active' : 'inactive';
			const matchesActive = activeFilter === 'all' || isActive === activeFilter;
			return matchesQuery && matchesRole && matchesActive;
		});
	}, [rows, query, roleFilter, activeFilter]);

	useEffect(() => {
		let cancelled = false;

		async function load() {
			setLoading(true);
			try {
				const res = await fetch('/api/users');
				const data = await res.json();
				if (cancelled || !Array.isArray(data)) return;

				setRows(
					data.map((user) => ({
						...user,
						fullName: `${user.firstName} ${user.lastName}`,
						roleLabel: roleLabel(user.role),
						divisionName: user.division?.name || '-',
						active: yesNo(user.isActive)
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
		router.push(`/admin/users/${row.id}`);
	}

	const columns = [
		{ key: 'fullName', label: 'Name' },
		{ key: 'email', label: 'Email' },
		{ key: 'roleLabel', label: 'Role' },
		{ key: 'divisionName', label: 'Division' },
		{ key: 'active', label: 'Active' }
	];

	return (
		<AdminGate>
			<section className="module-page">
				<header className="module-header module-header-list">
					<div>
						<h2>Users</h2>
					</div>
					<div className="module-header-actions">
						<Link href="/admin/users/new" className="btn-link btn-link-icon" aria-label="New User" title="New User">
							<Plus aria-hidden="true" className="btn-refresh-icon-svg" />
						</Link>
					</div>
				</header>

				<article className="panel">
					<h3>User List</h3>
						<div className="list-controls list-controls-three list-controls-with-columns">
						<input
							placeholder="Search user, email, role, division"
							value={query}
							onChange={(event) => setQuery(event.target.value)}
						/>
						<select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
							<option value="all">All Roles</option>
							{roleOptions.map((option) => (
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
							<TableColumnPicker tableKey="admin-users" columns={columns} />
						</div>
						<EntityTable
							tableKey="admin-users"
							columns={columns}
							rows={filteredRows}
							loading={loading}
							loadingLabel="Loading users"
						rowActions={[{ label: 'Open', onClick: onOpen }]}
					/>
				</article>
			</section>
		</AdminGate>
	);
}
