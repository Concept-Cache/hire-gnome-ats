import { redirect } from 'next/navigation';

export default async function LegacyDivisionDetailsPage({ params }) {
	const awaitedParams = await params;
	redirect(`/admin/divisions/${awaitedParams.id}`);
}
