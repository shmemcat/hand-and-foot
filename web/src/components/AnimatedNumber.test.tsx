import { act, render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AnimatedNumber } from "./ScoringReview";

it.each([
  [0, 1000],
  [2000, 1700],
])(
  "keeps a %s-to-%s score count within its bounds when the first frame predates the effect",
  (from, value) => {
    vi.spyOn(performance, "now").mockReturnValue(1000);
    const callbacks = new Map<number, FrameRequestCallback>();
    let serial = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callbacks.set(++serial, callback);
      return serial;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => callbacks.delete(id));
    const view = render(<AnimatedNumber value={value} from={from} />);
    const shown = () =>
      Number(
        view.container
          .querySelector("[aria-hidden='true']")!
          .textContent!.replaceAll(",", ""),
      );
    const frame = (time: number) =>
      act(() => {
        const [id, callback] = callbacks.entries().next().value!;
        callbacks.delete(id);
        callback(time);
      });
    frame(980);
    expect(shown()).toBe(from);
    frame(1200);
    expect(shown()).toBeGreaterThanOrEqual(Math.min(from, value));
    expect(shown()).toBeLessThanOrEqual(Math.max(from, value));
    frame(1460);
    expect(shown()).toBe(value);
    expect(callbacks.size).toBe(0);
  },
);
