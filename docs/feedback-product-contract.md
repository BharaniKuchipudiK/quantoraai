# Quantora Feedback Product Contract

Feedback is a first-class product workflow, not a floating utility.

## User experience

1. Entry point: a **Feedback & Suggestions** control in the signed-in Studio
   sidebar footer, rendered as a message icon carrying that name as its
   accessible name and tooltip (2026-09-07). It was a full-width labelled row
   until the sidebar's own text became the thing crowding it out — the widest
   string in the nav, on the least-used control. The requirement is that the
   entry point is always present and always reachable, never that it is the
   loudest thing in the panel.
2. Interaction: open a centered modal over a dimmed, blurred product surface.
3. Choice: select **Feedback** or **Suggestion** with a clear segmented control.
4. Message: one focused text area, maximum 500 characters.
5. Context: current product surface and page are included automatically.
6. Submit: one clear primary action, with loading and error states.
7. Success: explicit confirmation before the modal closes.
8. Accessibility: keyboard focus, Escape-to-close, modal semantics, reduced-motion support, and mobile layout.

## Admin experience

1. Admin Dashboard contains a dedicated **Feedback** tab for `is_admin` users.
2. Summary KPIs: Total, New, Planned, Done.
3. Filter by type, status, and free-text search.
4. Each feedback item remains readable in the list; full content opens in a detail drawer.
5. Detail view includes user identity when available, submitted time, product surface, and page context.
6. Admin workflow states: **New → Reviewed → Planned → Done / Closed**.
7. Status changes are authenticated server-side and persisted to the existing `user_feedback` table.
8. Feedback content never becomes PCL/model context.

## Design principles

- No orphan controls or duplicate entry points.
- One obvious primary action per state.
- Progressive disclosure: list first, detail on demand.
- Premium restraint: fewer borders, badges, and arbitrary colors.
- Every visible state must cover default, hover/focus, loading, success, empty, error, mobile, and reduced motion.
- Frontend admin visibility follows the same `is_admin` source of truth enforced by the backend.
