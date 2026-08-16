import { requireActiveSession } from "./_lib/authz.js";
import { saveStripeAccountId } from "./_lib/store.js";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-06-20",
});

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const auth = await requireActiveSession(req, res);
  if (!auth.ok) {
    return res.redirect("/?error=auth_required");
  }

  const { account_id } = req.query;
  if (!account_id || typeof account_id !== "string") {
    return res.redirect("/?error=missing_account_id");
  }

  try {
    // Verify the account exists on Stripe
    const account = await stripe.accounts.retrieve(account_id);
    if (!account) {
      return res.redirect("/?error=invalid_account");
    }

    // Save to Supabase
    const saved = await saveStripeAccountId(auth.value.sessionUser.sub, account.id);
    if (!saved) {
      return res.redirect("/?error=save_failed");
    }

    // Redirect back to the dashboard/app
    return res.redirect("/?stripe_connected=true");
  } catch (error: any) {
    console.error("Stripe Callback Error:", error);
    return res.redirect("/?error=stripe_error");
  }
}
