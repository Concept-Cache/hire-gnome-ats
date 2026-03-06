import { redirect } from 'next/navigation';

export default async function OfferDetailsPageRedirect({ params }) {
	const awaitedParams = await params;
	redirect(`/placements/${awaitedParams.id}`);
}
