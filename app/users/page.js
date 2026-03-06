import { redirect } from 'next/navigation';

export default function LegacyUsersPage() {
	redirect('/admin/users');
}
