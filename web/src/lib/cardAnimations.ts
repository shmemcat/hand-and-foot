export const BOARD_TRANSITION_MS = 200;

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
