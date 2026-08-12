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

Example marker (adapt ids/labels/values):
<!-- quantora-choices:{"title":"When are you thinking?","prompt":"Pick one or type your dates below","choices":[{"id":"flex","label":"Flexible","value":"My dates are flexible — suggest the best window","description":"Open to your recommendation"},{"id":"month","label":"Next 1–2 months","value":"I'm planning for the next 1–2 months","description":"Rough near-term trip"},{"id":"fixed","label":"I have fixed dates","value":"I have specific travel dates — I'll share them next","description":"Already booked or locked in"}]} -->`;

export const BUILD_CHOICE_HINTS = `BUILD CHOICE TEMPLATES (adapt labels/values to context)
During guided build intake, when site type, payments, or style is still unclear, use quantora-choices instead of a text checklist.

Site type — title "What are you building?"
choices: Business brochure | Online shop | Portfolio / personal | Landing page for one offer

Payments — title "How should checkout work?"
choices: Demo cart only (no real payments) | Stripe Checkout when connected | No payments needed

Style — title "What vibe should it have?"
choices: Clean & minimal | Bold & colorful | Professional / corporate | Cozy & warm

Scope — title "Ready to build?"
choices: Keep clarifying | Build a first draft now (use reasonable defaults for gaps)

Example marker (adapt ids/labels/values):
<!-- quantora-choices:{"title":"What are you building?","choices":[{"id":"shop","label":"Online shop","value":"I want an online shop with add-to-cart and a demo checkout flow","description":"Products + cart"},{"id":"brochure","label":"Business site","value":"I want a brochure website for my business with contact info and services","description":"No cart"},{"id":"portfolio","label":"Portfolio","value":"I want a portfolio site to showcase my work with a contact form","description":"Creative / personal"}]} -->`;

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
