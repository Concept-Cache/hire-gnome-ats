import 'server-only';
import Stripe from 'stripe';
import { prisma } from '@/lib/prisma';

const BILLING_BASE_MONTHLY_CENTS = 7900;
const BILLING_PER_USER_MONTHLY_CENTS = 700;

function parseBooleanEnv(name, fallback = false) {
	const normalized = String(process.env[name] || '').trim().toLowerCase();
	if (!normalized) return fallback;
	if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
	if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
	return fallback;
}

function parseStringEnv(name, fallback = '') {
	const value = String(process.env[name] || '').trim();
	return value || fallback;
}

function toInteger(value, fallback = 0) {
	const parsed = Number(value);
	if (!Number.isInteger(parsed)) return fallback;
	return parsed;
}

function toNullableCurrencyCode(value) {
	const currency = String(value || '').trim().toLowerCase();
	if (!currency || currency.length !== 3) return null;
	return currency;
}

function toErrorMessage(error) {
	if (!error) return 'Unknown billing error.';
	return String(error.message || error).trim() || 'Unknown billing error.';
}

function masked(value) {
	const raw = String(value || '').trim();
	if (!raw) return '';
	if (raw.length <= 7) return `${raw.slice(0, 1)}***${raw.slice(-1)}`;
	return `${raw.slice(0, 4)}...${raw.slice(-3)}`;
}

function getStripeConfig() {
	return {
		enabled: parseBooleanEnv('BILLING_ENABLED', false),
		provider: parseStringEnv('BILLING_PROVIDER', 'stripe').toLowerCase(),
		secretKey: parseStringEnv('BILLING_STRIPE_SECRET_KEY', ''),
		customerId: parseStringEnv('BILLING_STRIPE_CUSTOMER_ID', ''),
		subscriptionId: parseStringEnv('BILLING_STRIPE_SUBSCRIPTION_ID', ''),
		basePriceId: parseStringEnv('BILLING_BASE_PRICE_ID', ''),
		seatPriceId: parseStringEnv('BILLING_SEAT_PRICE_ID', ''),
		seatSubscriptionItemId: parseStringEnv('BILLING_STRIPE_SEAT_SUBSCRIPTION_ITEM_ID', ''),
		baseSubscriptionItemId: parseStringEnv('BILLING_STRIPE_BASE_SUBSCRIPTION_ITEM_ID', ''),
		prorationBehavior: parseStringEnv('BILLING_STRIPE_PRORATION_BEHAVIOR', 'create_prorations'),
		currencyFallback: parseStringEnv('BILLING_CURRENCY', 'usd').toLowerCase()
	};
}

function sanitizeProrationBehavior(value) {
	const normalized = String(value || '').trim().toLowerCase();
	if (normalized === 'none') return 'none';
	if (normalized === 'always_invoice') return 'always_invoice';
	return 'create_prorations';
}

function getStripeClient(secretKey) {
	return new Stripe(secretKey, {
		apiVersion: '2025-02-24.acacia'
	});
}

function formatPrice(price) {
	const unitAmount = Number(price?.unit_amount ?? NaN);
	if (!Number.isFinite(unitAmount)) return null;
	return {
		id: String(price?.id || ''),
		unitAmount,
		currency: String(price?.currency || 'usd').toLowerCase(),
		recurringInterval: String(price?.recurring?.interval || '').toLowerCase() || null
	};
}

async function createSeatSyncEvent(payload) {
	try {
		return await prisma.billingSeatSyncEvent.create({
			data: {
				provider: payload.provider || 'stripe',
				status: payload.status || 'skipped',
				reason: payload.reason || null,
				activeSeatCount: Number(payload.activeSeatCount || 0),
				billedSeatQuantity: Number(payload.billedSeatQuantity || 0),
				previousSeatQuantity:
					payload.previousSeatQuantity == null ? null : Number(payload.previousSeatQuantity),
				nextSeatQuantity: payload.nextSeatQuantity == null ? null : Number(payload.nextSeatQuantity),
				stripeCustomerId: payload.stripeCustomerId || null,
				stripeSubscriptionId: payload.stripeSubscriptionId || null,
				stripeSubscriptionItemId: payload.stripeSubscriptionItemId || null,
				errorMessage: payload.errorMessage || null,
				metadata: payload.metadata || undefined,
				triggeredByUserId: payload.triggeredByUserId || null
			}
		});
	} catch {
		return null;
	}
}

function findSeatItemFromSubscription(subscription, config) {
	const items = Array.isArray(subscription?.items?.data) ? subscription.items.data : [];
	if (config.seatSubscriptionItemId) {
		const byItemId = items.find((item) => item.id === config.seatSubscriptionItemId);
		if (byItemId) return byItemId;
	}
	if (config.seatPriceId) {
		const byPriceId = items.find((item) => item.price?.id === config.seatPriceId);
		if (byPriceId) return byPriceId;
	}
	if (items.length === 1) return items[0];
	return null;
}

function findBaseItemFromSubscription(subscription, config, seatItem) {
	const items = Array.isArray(subscription?.items?.data) ? subscription.items.data : [];
	if (config.baseSubscriptionItemId) {
		const byItemId = items.find((item) => item.id === config.baseSubscriptionItemId);
		if (byItemId) return byItemId;
	}
	if (config.basePriceId) {
		const byPriceId = items.find((item) => item.price?.id === config.basePriceId);
		if (byPriceId) return byPriceId;
	}
	const firstNonSeatItem = items.find((item) => item.id !== seatItem?.id);
	return firstNonSeatItem || null;
}

async function resolvePriceSummary(stripe, config) {
	const summary = {
		base: null,
		seat: null,
		currency: toNullableCurrencyCode(config.currencyFallback) || 'usd'
	};

	const [basePrice, seatPrice] = await Promise.all([
		config.basePriceId ? stripe.prices.retrieve(config.basePriceId).catch(() => null) : Promise.resolve(null),
		config.seatPriceId ? stripe.prices.retrieve(config.seatPriceId).catch(() => null) : Promise.resolve(null)
	]);

	const base = formatPrice(basePrice);
	const seat = formatPrice(seatPrice);
	if (base?.currency) {
		summary.currency = base.currency;
	} else if (seat?.currency) {
		summary.currency = seat.currency;
	}
	summary.base = base;
	summary.seat = seat;
	return summary;
}

async function loadRecentSeatSyncEvents() {
	try {
		const events = await prisma.billingSeatSyncEvent.findMany({
			orderBy: { createdAt: 'desc' },
			take: 15,
			select: {
				id: true,
				recordId: true,
				status: true,
				reason: true,
				activeSeatCount: true,
				billedSeatQuantity: true,
				previousSeatQuantity: true,
				nextSeatQuantity: true,
				errorMessage: true,
				stripeSubscriptionItemId: true,
				createdAt: true,
				triggeredByUser: {
					select: {
						id: true,
						firstName: true,
						lastName: true
					}
				}
			}
		});
		return {
			events: Array.isArray(events) ? events : [],
			eventStoreAvailable: true
		};
	} catch {
		return {
			events: [],
			eventStoreAvailable: false
		};
	}
}

export async function getActiveSeatCount() {
	return prisma.user.count({
		where: { isActive: true }
	});
}

export function getBillingConfigPublic() {
	const config = getStripeConfig();
	return {
		enabled: config.enabled,
		provider: config.provider,
		customerIdMasked: masked(config.customerId),
		subscriptionIdMasked: masked(config.subscriptionId),
		basePriceId: config.basePriceId || '',
		seatPriceId: config.seatPriceId || '',
		seatSubscriptionItemIdMasked: masked(config.seatSubscriptionItemId),
		baseSubscriptionItemIdMasked: masked(config.baseSubscriptionItemId)
	};
}

export async function syncBillingSeats({ triggeredByUserId = null, reason = 'manual' } = {}) {
	const config = getStripeConfig();
	const activeSeatCount = await getActiveSeatCount();
	const nextSeatQuantity = Math.max(0, toInteger(activeSeatCount, 0));

	if (!config.enabled) {
		const event = await createSeatSyncEvent({
			provider: config.provider || 'stripe',
			status: 'skipped',
			reason: 'billing_disabled',
			activeSeatCount,
			billedSeatQuantity: nextSeatQuantity,
			nextSeatQuantity,
			triggeredByUserId
		});
		return {
			ok: true,
			status: 'skipped',
			reason: 'billing_disabled',
			event,
			eventPersisted: Boolean(event),
			activeSeatCount,
			nextSeatQuantity
		};
	}

	if (config.provider !== 'stripe') {
		const event = await createSeatSyncEvent({
			provider: config.provider || 'unknown',
			status: 'skipped',
			reason: 'provider_not_supported',
			activeSeatCount,
			billedSeatQuantity: nextSeatQuantity,
			nextSeatQuantity,
			triggeredByUserId
		});
		return {
			ok: true,
			status: 'skipped',
			reason: 'provider_not_supported',
			event,
			eventPersisted: Boolean(event),
			activeSeatCount,
			nextSeatQuantity
		};
	}

	if (!config.secretKey || !config.subscriptionId) {
		const event = await createSeatSyncEvent({
			provider: 'stripe',
			status: 'skipped',
			reason: 'missing_config',
			activeSeatCount,
			billedSeatQuantity: nextSeatQuantity,
			nextSeatQuantity,
			triggeredByUserId
		});
		return {
			ok: true,
			status: 'skipped',
			reason: 'missing_config',
			event,
			eventPersisted: Boolean(event),
			activeSeatCount,
			nextSeatQuantity
		};
	}

	const stripe = getStripeClient(config.secretKey);
	try {
		const subscription = await stripe.subscriptions.retrieve(config.subscriptionId, {
			expand: ['items.data.price']
		});

		const seatItem = findSeatItemFromSubscription(subscription, config);
		if (!seatItem) {
			const event = await createSeatSyncEvent({
				provider: 'stripe',
				status: 'failed',
				reason: 'seat_item_not_found',
				activeSeatCount,
				billedSeatQuantity: 0,
				nextSeatQuantity,
				stripeCustomerId: String(subscription?.customer || config.customerId || ''),
				stripeSubscriptionId: config.subscriptionId,
				errorMessage:
					'Seat subscription item could not be identified. Set BILLING_SEAT_PRICE_ID or BILLING_STRIPE_SEAT_SUBSCRIPTION_ITEM_ID.',
				triggeredByUserId,
				metadata: { reason, subscriptionStatus: subscription?.status || '' }
			});
			return {
				ok: false,
				status: 'failed',
				reason: 'seat_item_not_found',
				event,
				eventPersisted: Boolean(event),
				activeSeatCount,
				nextSeatQuantity
			};
		}

		const previousSeatQuantity = Number(seatItem.quantity || 0);
		if (previousSeatQuantity === nextSeatQuantity) {
			const event = await createSeatSyncEvent({
				provider: 'stripe',
				status: 'skipped',
				reason: 'already_in_sync',
				activeSeatCount,
				billedSeatQuantity: previousSeatQuantity,
				previousSeatQuantity,
				nextSeatQuantity,
				stripeCustomerId: String(subscription?.customer || config.customerId || ''),
				stripeSubscriptionId: config.subscriptionId,
				stripeSubscriptionItemId: seatItem.id,
				triggeredByUserId,
				metadata: { reason, subscriptionStatus: subscription?.status || '' }
			});
			return {
				ok: true,
				status: 'skipped',
				reason: 'already_in_sync',
				event,
				eventPersisted: Boolean(event),
				activeSeatCount,
				nextSeatQuantity
			};
		}

		await stripe.subscriptionItems.update(seatItem.id, {
			quantity: nextSeatQuantity,
			proration_behavior: sanitizeProrationBehavior(config.prorationBehavior)
		});

		const event = await createSeatSyncEvent({
			provider: 'stripe',
			status: 'updated',
			reason: 'quantity_updated',
			activeSeatCount,
			billedSeatQuantity: nextSeatQuantity,
			previousSeatQuantity,
			nextSeatQuantity,
			stripeCustomerId: String(subscription?.customer || config.customerId || ''),
			stripeSubscriptionId: config.subscriptionId,
			stripeSubscriptionItemId: seatItem.id,
			triggeredByUserId,
			metadata: { reason, subscriptionStatus: subscription?.status || '' }
		});

		return {
			ok: true,
			status: 'updated',
			reason: 'quantity_updated',
			event,
			eventPersisted: Boolean(event),
			activeSeatCount,
			nextSeatQuantity,
			previousSeatQuantity
		};
	} catch (error) {
		const event = await createSeatSyncEvent({
			provider: 'stripe',
			status: 'failed',
			reason: 'stripe_error',
			activeSeatCount,
			billedSeatQuantity: 0,
			nextSeatQuantity,
			stripeCustomerId: config.customerId || null,
			stripeSubscriptionId: config.subscriptionId || null,
			errorMessage: toErrorMessage(error),
			triggeredByUserId,
			metadata: { reason }
		});
		return {
			ok: false,
			status: 'failed',
			reason: 'stripe_error',
			error: toErrorMessage(error),
			event,
			eventPersisted: Boolean(event),
			activeSeatCount,
			nextSeatQuantity
		};
	}
}

export async function getBillingSummary() {
	const config = getStripeConfig();
	const publicConfig = getBillingConfigPublic();
	const [activeSeatCount, recentEventState] = await Promise.all([
		getActiveSeatCount(),
		loadRecentSeatSyncEvents()
	]);

	const recentEvents = Array.isArray(recentEventState?.events) ? recentEventState.events : [];
	const eventStoreAvailable = Boolean(recentEventState?.eventStoreAvailable);

	const summary = {
		config: publicConfig,
		activeSeatCount,
		eventStoreAvailable,
		lastSyncedAt: recentEvents[0]?.createdAt || null,
		recentEvents,
		stripe: {
			status: 'not_configured',
			subscriptionStatus: '',
			seatQuantity: null,
			basePrice: null,
			seatPrice: null,
			estimatedMonthlyAmountCents: null,
			currency: toNullableCurrencyCode(config.currencyFallback) || 'usd',
			error: '',
			pricingWarning: ''
		}
	};

	if (config.enabled) {
		summary.stripe.estimatedMonthlyAmountCents =
			BILLING_BASE_MONTHLY_CENTS + BILLING_PER_USER_MONTHLY_CENTS * activeSeatCount;
	}

	if (!config.enabled || config.provider !== 'stripe' || !config.secretKey || !config.subscriptionId) {
		return summary;
	}

	try {
		const stripe = getStripeClient(config.secretKey);
		const [subscription, priceSummary] = await Promise.all([
			stripe.subscriptions.retrieve(config.subscriptionId, { expand: ['items.data.price'] }),
			resolvePriceSummary(stripe, config)
		]);

		const seatItem = findSeatItemFromSubscription(subscription, config);
		const baseItem = findBaseItemFromSubscription(subscription, config, seatItem);
		const seatQuantity = seatItem ? Number(seatItem.quantity || 0) : null;

		const basePriceFromSubscription = formatPrice(baseItem?.price || null) || priceSummary.base;
		const seatPriceFromSubscription = formatPrice(seatItem?.price || null) || priceSummary.seat;
		const baseAmount = Number(basePriceFromSubscription?.unitAmount || 0);
		const seatAmount = Number(seatPriceFromSubscription?.unitAmount || 0);
		const pricingWarning =
			basePriceFromSubscription?.id &&
			seatPriceFromSubscription?.id &&
			basePriceFromSubscription.id === seatPriceFromSubscription.id
				? 'Base and seat price IDs are the same. Check BILLING_BASE_PRICE_ID and BILLING_SEAT_PRICE_ID.'
				: '';

		summary.stripe = {
			status: 'connected',
			subscriptionStatus: String(subscription?.status || ''),
			seatQuantity,
			basePrice: basePriceFromSubscription,
			seatPrice: seatPriceFromSubscription,
			estimatedMonthlyAmountCents:
				BILLING_BASE_MONTHLY_CENTS + BILLING_PER_USER_MONTHLY_CENTS * activeSeatCount,
			currency:
				seatPriceFromSubscription?.currency || basePriceFromSubscription?.currency || priceSummary.currency || 'usd',
			error: '',
			pricingWarning
		};
	} catch (error) {
		summary.stripe = {
			...summary.stripe,
			status: 'error',
			error: toErrorMessage(error)
		};
	}

	return summary;
}
