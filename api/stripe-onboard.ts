import { requireActiveSession } from "./_lib/authz.js";
import { applyCors } from "./_lib/rate-limit.js";
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

  const auth = await requireActiveSession(req, res);
  if (!auth.ok) return;
  const { sessionUser } = auth.value;

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(503).json({ error: "Stripe integration is not configured." });
  }

  try {
    const account = await stripe.accounts.create({
      type: "standard",
      email: sessionUser.email,
    });

    const origin = req.headers.origin || `https://${req.headers.host}`;
    
    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: `${origin}/`,
      return_url: `${origin}/api/stripe-callback?account_id=${account.id}`,
      type: "account_onboarding",
    });

    return res.status(200).json({ url: accountLink.url });
  } catch (error: any) {
    console.error("Stripe Onboarding Error:", error);
    return res.status(500).json({ error: error.message || "Internal Server Error" });
  }
}
