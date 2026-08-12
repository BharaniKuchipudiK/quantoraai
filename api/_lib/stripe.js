/*
 * Minimal Stripe Connect helper.
 *
 * Lives in _lib (a shared module, not a serverless function) and talks to the
 * Stripe REST API directly with fetch — no SDK dependency, and it adds nothing
 * to the platform's function count. It powers two flows, invoked from
 * api/deploy via task routing:
 *   - onboarding: create an Express connected account + an onboarding link, so
 *     a boutique owner attaches THEIR OWN Stripe and payments land in their
 *     account (Stripe Connect), not the platform's.
 *   - checkout: create a Checkout Session ON that connected account for the
 *     cart, so a customer on the published site can actually pay.
 *
 * Everything is inert until a STRIPE_SECRET_KEY is present.
 */

const STRIPE_API = 'https://api.stripe.com/v1';

// Flatten nested objects/arrays into Stripe's bracket form-encoding, e.g.
// line_items[0][price_data][unit_amount]=1999.
function encodeForm(obj, prefix = '', out = new URLSearchParams()) {
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    const field = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((v, i) => {
        if (v && typeof v === 'object') encodeForm(v, `${field}[${i}]`, out);
        else out.append(`${field}[${i}]`, String(v));
      });
    } else if (value && typeof value === 'object') {
      encodeForm(value, field, out);
    } else {
      out.append(field, String(value));
    }
  }
  return out;
}

async function stripeRequest(secretKey, path, params, connectedAccount) {
  const headers = {
    Authorization: `Bearer ${secretKey}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (connectedAccount) headers['Stripe-Account'] = connectedAccount;
  const resp = await fetch(`${STRIPE_API}/${path}`, {
    method: 'POST',
    headers,
    body: encodeForm(params).toString(),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data?.error?.message || `Stripe request to ${path} failed (${resp.status}).`);
  }
  return data;
}

// Create an Express connected account and an onboarding link.
export async function createConnectOnboarding(secretKey, appUrl) {
  const account = await stripeRequest(secretKey, 'accounts', { type: 'express' });
  const link = await stripeRequest(secretKey, 'account_links', {
    account: account.id,
    type: 'account_onboarding',
    refresh_url: `${appUrl}/?stripe=refresh`,
    return_url: `${appUrl}/?stripe=connected&account=${account.id}`,
  });
  return { accountId: account.id, url: link.url };
}

// Create a Checkout Session on the owner's connected account for the cart.
// items: [{ name, amount (integer, minor units), currency, quantity, image }]
export async function createCheckoutSession(secretKey, opts) {
  const { connectedAccount, items, successUrl, cancelUrl, applicationFeePercent = 0 } = opts;
  if (!connectedAccount) throw new Error('Missing connected Stripe account.');
  if (!Array.isArray(items) || items.length === 0) throw new Error('Cart is empty.');

  const line_items = items.map((it) => ({
    quantity: Math.max(1, parseInt(it.quantity, 10) || 1),
    price_data: {
      currency: (it.currency || 'usd').toLowerCase(),
      unit_amount: Math.max(0, Math.round(Number(it.amount) || 0)),
      product_data: {
        name: String(it.name || 'Item').slice(0, 250),
        ...(it.image ? { images: [String(it.image)] } : {}),
      },
    },
  }));

  const subtotal = line_items.reduce((s, li) => s + li.price_data.unit_amount * li.quantity, 0);
  const params = {
    mode: 'payment',
    line_items,
    success_url: successUrl || `${STRIPE_API.replace(/\/v1$/, '')}`,
    cancel_url: cancelUrl || successUrl || 'https://quantoraai.app',
  };
  // Optional platform fee (monetization). 0 by default → owner keeps 100%.
  if (applicationFeePercent > 0) {
    params.payment_intent_data = { application_fee_amount: Math.round((subtotal * applicationFeePercent) / 100) };
  }

  const session = await stripeRequest(secretKey, 'checkout/sessions', params, connectedAccount);
  return { url: session.url, id: session.id };
}
