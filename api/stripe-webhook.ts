import Stripe from "stripe";
import { saveOrder } from "./_lib/store.js";
import { applyCors } from "./_lib/rate-limit.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2024-06-20",
});

const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET || "";

export const config = {
  api: {
    bodyParser: false,
  },
};

// Node stream to buffer conversion for webhook signature verification
async function buffer(readable: any) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req: any, res: any) {
  applyCors(req, res, "POST,OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  const sig = req.headers["stripe-signature"];
  let event: Stripe.Event;

  try {
    const rawBody = await buffer(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
  } catch (err: any) {
    console.error(`Webhook Error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    
    // The metadata was attached during checkout.ts
    const projectName = session.metadata?.projectName;
    const userSub = session.metadata?.userSub;

    if (projectName && userSub) {
      try {
        await saveOrder({
          userSub,
          projectName,
          stripeSessionId: session.id,
          stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : null,
          amountTotal: session.amount_total || 0,
          currency: session.currency || "usd",
          customerEmail: session.customer_details?.email,
          customerName: session.customer_details?.name,
          // Could optionally fetch line items from Stripe API here if we want detailed order history
        });
        console.log(`Order saved for ${projectName} (session: ${session.id})`);
      } catch (e) {
        console.error("Failed to save order to Supabase:", e);
        // We return 200 anyway so Stripe doesn't retry infinitely just because our DB is down.
      }
    }
  }

  return res.status(200).json({ received: true });
}
