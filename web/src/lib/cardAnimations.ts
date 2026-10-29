/** A duration is a minimum; delayed browser frames must finish before the handoff. */
export function afterCardAnimations(
  root: Element | null,
  selector: string,
  complete: () => void,
) {
  const animations = [...(root?.querySelectorAll(selector) ?? [])].flatMap(
    (card) => card.getAnimations?.({ subtree: true }) ?? [],
  );
  if (animations.length)
    void Promise.allSettled(
      animations.map((animation) => animation.finished),
    ).then(complete);
  else complete();
}
