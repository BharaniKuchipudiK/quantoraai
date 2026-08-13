/** Shared flag so auto-hide header ignores chat follow-scroll, not user input. */
let active = false;

export function setProgrammaticScrollActive(value) {
  active = Boolean(value);
}

export function isProgrammaticScrollActive() {
  return active;
}
