import { render } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { usePageSweep } from "./usePageSweep";

function Sample({ page, scope = "table" }: { page: number; scope?: string }) {
  const target = useRef<HTMLDivElement>(null);
  usePageSweep(target, true, page, scope);
  return <div ref={target}>Page {page}</div>;
}
afterEach(() => {
  delete (HTMLElement.prototype as { animate?: unknown }).animate;
});

it("sweeps in the navigation direction, skips unrelated updates, and cancels superseded motion", () => {
  const cancel = vi.fn();
  const animate = vi.fn(
    (
      _frames: Keyframe[] | PropertyIndexedKeyframes | null,
      _options?: number | KeyframeAnimationOptions,
    ) => ({ cancel, id: "" }) as unknown as Animation,
  );
  HTMLElement.prototype.animate = animate;
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([
    {},
  ] as unknown as DOMRectList);
  const view = render(<Sample page={0} />);
  expect(animate).not.toHaveBeenCalled();
  view.rerender(<Sample page={1} />);
  expect(animate.mock.calls[0][0]).toEqual([
    { transform: "translateX(28px)", opacity: 0.45 },
    { transform: "translateX(0)", opacity: 1 },
  ]);
  view.rerender(<Sample page={1} />);
  expect(animate).toHaveBeenCalledTimes(1);
  view.rerender(<Sample page={0} />);
  expect(cancel).toHaveBeenCalledTimes(1);
  expect(animate.mock.calls[1][0]).toEqual([
    { transform: "translateX(-28px)", opacity: 0.45 },
    { transform: "translateX(0)", opacity: 1 },
  ]);
  view.rerender(<Sample page={2} scope="another-table" />);
  expect(animate).toHaveBeenCalledTimes(2);
});

it("shows page changes immediately when reduced motion is enabled", () => {
  const animate = vi.fn();
  HTMLElement.prototype.animate = animate;
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([
    {},
  ] as unknown as DOMRectList);
  vi.mocked(window.matchMedia).mockImplementation(
    () =>
      ({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList,
  );
  const view = render(<Sample page={0} />);
  view.rerender(<Sample page={1} />);
  expect(animate).not.toHaveBeenCalled();
});
