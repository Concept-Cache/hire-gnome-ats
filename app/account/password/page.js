import { redirect } from 'next/navigation';

export default function LegacyAccountPasswordPage() {
	redirect('/account/settings');
}
