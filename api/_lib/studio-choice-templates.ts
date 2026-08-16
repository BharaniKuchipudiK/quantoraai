import type { StudioDomain } from "./studio-domains.js";

/**
 * Example choice sets the model should adapt — not copy verbatim every turn.
 * Wired into the system prompt when Travel focus or Guided Build is active.
 */

export const TRAVEL_CHOICE_HINTS = `TRAVEL CHOICE TEMPLATES (adapt labels/values to context)
When ONE missing detail would change the itinerary (timing, budget, pace, or group), ask a short natural question then append quantora-choices. Prefer these patterns:

Timing — title "When are you thinking?"
choices: Fixed dates (user will type) | Next 2–4 weeks | Next 1–3 months | Flexible / not sure yet

Budget — title "What's your budget vibe?"
choices: Budget-conscious | Mid-range | Premium / splurge | I'll share a number in chat

Pace — title "How do you like to travel?"
choices: Relaxed — few stops, lots of downtime | Balanced mix | Packed — see as much as possible

Group — title "Who's going?"
choices: Solo | Couple | Family with kids | Group of friends

Example marker (adapt ids/labels/titles):
<quantora-modal>
{"question":"When are you thinking?","options":[{"id":"flex","title":"My dates are flexible","description":"Open to your recommendation"},{"id":"month","title":"Next 1–2 months","description":"Rough near-term trip"},{"id":"fixed","title":"I have fixed dates","description":"Already booked or locked in"}]}
</quantora-modal>`;

export const BUILD_CHOICE_HINTS = `BUILD CHOICE TEMPLATES (adapt labels/values to context)
During guided build intake, when essentials are still unclear, use <quantora-modal> instead of a text checklist. Prefer these on the FIRST turn of a new build.

Business name — title "What's it called?"
choices: I'll type the name in chat | Use a placeholder name for now | Same as my business name on the sign

Service model (cafes, restaurants, food) — title "How do customers order?"
choices: Dine-in only | Takeaway / pickup | Both dine-in and takeaway | Online shop / delivery

Offerings — title "What do you offer?"
choices: Coffee & pastries | Full food menu | Services / price list | I'll describe it in chat

Site type — title "What are you building?"
choices: Business brochure | Online shop | Portfolio / personal | Landing page for one offer

Payments — title "How should checkout work?"
choices: Demo cart only (no real payments) | Stripe Checkout when connected | No payments needed

Style — title "What vibe should it have?"
choices: Clean & minimal | Bold & colorful | Professional / corporate | Cozy & warm

Scope — title "Ready to build?"
choices: Keep clarifying | Build a first draft now (use reasonable defaults for gaps)

Example marker (adapt ids/labels/titles):
<quantora-modal>
{"question":"What are you building?","options":[{"id":"shop","title":"Online shop with checkout","description":"Products + cart"},{"id":"brochure","title":"Business brochure site","description":"No cart"},{"id":"portfolio","title":"Personal portfolio","description":"Creative / personal"}]}
</quantora-modal>`;

export function buildChoiceTemplateDirective(options: {
  studioDomain?: StudioDomain | null;
  guided?: boolean;
  buildMode?: boolean;
}): string {
  const parts: string[] = [];

  if (options.studioDomain === "travel") {
    parts.push(TRAVEL_CHOICE_HINTS);
  }

  if (options.guided || options.buildMode) {
    parts.push(BUILD_CHOICE_HINTS);
  }

  if (!parts.length) return "";
  return `\n\n${parts.join("\n\n")}`;
}
