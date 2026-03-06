import { redirect } from 'next/navigation';

export default async function LegacyUserDetailsPage({ params }) {
	const awaitedParams = await params;
	redirect(`/admin/users/${awaitedParams.id}`);
}
