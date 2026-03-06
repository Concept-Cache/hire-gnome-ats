import { redirect } from 'next/navigation';

export default function LegacyNewUserPage() {
	redirect('/admin/users/new');
}
