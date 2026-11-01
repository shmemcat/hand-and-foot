export const BOARD_TRANSITION_MS = 200;

const pileScrollClamps = new WeakMap<Element, number>();
const clampedScrollEvents = new WeakSet<Event>();

/** A shrinking pile row can move its scroll position without user input. */
export function markPileScrollClamp(strip: HTMLElement) {
  pileScrollClamps.set(strip, strip.scrollLeft);
}

export function isPileScrollClamp(event: Event): boolean {
  if (clampedScrollEvents.has(event)) return true;
  const strip = event.target;
  if (!(strip instanceof HTMLElement)) return false;
  const expected = pileScrollClamps.get(strip);
  if (expected === undefined || strip.scrollLeft !== expected) return false;
  // Native listeners can have microtask checkpoints between their callbacks.
  // Identify this event for every listener, without ignoring the next scroll.
  pileScrollClamps.delete(strip);
  clampedScrollEvents.add(event);
  return true;
}

/** A duration is a minimum; delayed browser frames must finish before the handoff. */
export function afterCardAnimations(
  root: Element | null,
  selector: string,
  complete: () => void,
  subtree = true,
) {
  const animations = [...(root?.querySelectorAll(selector) ?? [])].flatMap(
    (card) => card.getAnimations?.({ subtree }) ?? [],
  );
  if (animations.length)
    void Promise.allSettled(
      animations.map((animation) => animation.finished),
    ).then(complete);
  else complete();
}
