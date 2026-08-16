import { applyCors, clientIp, isRateLimited } from "./_lib/rate-limit.js";
import { getProjectOwner } from "./_lib/store.js";
import { fetchWithTimeout } from "./_lib/fetch-timeout.js";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-06-20",
});

export default async function handler(req: any, res: any) {
  applyCors(req, res, "POST,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  if (isRateLimited(`checkout:${clientIp(req)}`, 30, 60_000)) {
    return res.status(429).json({ error: "Too many checkout attempts." });
  }

  try {
    const { projectName, cart, successUrl, cancelUrl } = req.body || {};

    if (!projectName || typeof projectName !== "string") {
      return res.status(400).json({ error: "Missing projectName" });
    }
    if (!Array.isArray(cart) || cart.length === 0) {
      return res.status(400).json({ error: "Empty cart" });
    }

    const owner = await getProjectOwner(projectName);
    if (!owner) {
      return res.status(404).json({ error: "Project not found or owner not recorded." });
    }
    if (!owner.stripeAccountId) {
      return res.status(400).json({ error: "The owner of this shop has not connected a Stripe account." });
    }

    // Server-side price validation!
    // We fetch the AI-generated products.json from the deployed site.
    let catalog = [];
    try {
      const catalogRes = await fetchWithTimeout(`${owner.deploymentUrl}/products.json`, {}, 3000);
      if (catalogRes.ok) {
        catalog = await catalogRes.json();
      } else {
        throw new Error("products.json not found");
      }
    } catch (e) {
      return res.status(500).json({ error: "Could not validate prices. The shop may be missing products.json." });
    }

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];

    for (const item of cart) {
      if (!item.id || typeof item.quantity !== "number" || item.quantity <= 0) continue;
      
      const product = catalog.find((p: any) => p.id === item.id);
      if (!product) {
        return res.status(400).json({ error: `Product ${item.id} not found in catalog.` });
      }

      lineItems.push({
        price_data: {
          currency: product.currency || 'usd',
          product_data: {
            name: product.name,
            description: product.description,
            ...(product.image ? { images: [product.image] } : {}),
          },
          unit_amount: product.priceCents,
        },
        quantity: item.quantity,
      });
    }

    if (lineItems.length === 0) {
      return res.status(400).json({ error: "No valid items in cart." });
    }

    // Create the session on the connected account!
    const session = await stripe.checkout.sessions.create(
      {
        payment_method_types: ["card"],
        mode: "payment",
        line_items: lineItems,
        success_url: successUrl || `${owner.deploymentUrl}?checkout=success`,
        cancel_url: cancelUrl || `${owner.deploymentUrl}?checkout=cancel`,
        payment_intent_data: {
          application_fee_amount: 0, // In the future, Quantora could take a cut here
        },
        metadata: {
          projectName,
          userSub: owner.userSub,
        }
      },
      {
        stripeAccount: owner.stripeAccountId,
      }
    );

    return res.status(200).json({ id: session.id, url: session.url });
  } catch (error: any) {
    console.error("Checkout API Error:", error);
    return res.status(500).json({ error: error.message || "Checkout failed" });
  }
}
