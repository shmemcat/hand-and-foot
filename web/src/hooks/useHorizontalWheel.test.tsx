import { StrictMode } from "react";
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { useHorizontalWheel } from "./useHorizontalWheel";

function Hand({ enabled = true }: { enabled?: boolean }) {
  const ref = useHorizontalWheel(enabled);
  return <div ref={ref} data-testid="hand" />;
}
function dimensions(strip: HTMLElement, width = 300, content = 1000) {
  Object.defineProperties(strip, {
    clientWidth: { configurable: true, value: width },
    scrollWidth: { configurable: true, value: content },
  });
}
function wheel(strip: HTMLElement, options: WheelEventInit) {
  const event = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    ...options,
  });
  strip.dispatchEvent(event);
  return event;
}

it("moves an overflowing hand sideways with the vertical mouse wheel", () => {
  render(<Hand />);
  const strip = screen.getByTestId("hand");
  dimensions(strip);
  expect(wheel(strip, { deltaY: 120 }).defaultPrevented).toBe(true);
  expect(strip.scrollLeft).toBe(120);
  wheel(strip, { deltaY: -40 });
  expect(strip.scrollLeft).toBe(80);
});

it("keeps the page from jumping when the hand reaches either end", () => {
  render(<Hand />);
  const strip = screen.getByTestId("hand");
  dimensions(strip);
  expect(wheel(strip, { deltaY: -100 }).defaultPrevented).toBe(true);
  expect(strip.scrollLeft).toBe(0);
  expect(wheel(strip, { deltaY: 2000 }).defaultPrevented).toBe(true);
  expect(strip.scrollLeft).toBe(700);
  expect(wheel(strip, { deltaY: 100 }).defaultPrevented).toBe(true);
  expect(strip.scrollLeft).toBe(700);
});

it("leaves ordinary page scrolling alone when the whole hand fits", () => {
  render(<Hand />);
  const strip = screen.getByTestId("hand");
  dimensions(strip, 1000, 1000);
  expect(wheel(strip, { deltaY: 100 }).defaultPrevented).toBe(false);
  expect(strip.scrollLeft).toBe(0);
});

it.each([
  { deltaX: 100, deltaY: 0 },
  { deltaX: 100, deltaY: 20 },
  { deltaY: 100, ctrlKey: true },
  { deltaY: 100, metaKey: true },
  { deltaY: 100, shiftKey: true },
])("preserves horizontal trackpad and modified wheel input: %j", (options) => {
  render(<Hand />);
  const strip = screen.getByTestId("hand");
  dimensions(strip);
  expect(wheel(strip, options).defaultPrevented).toBe(false);
  expect(strip.scrollLeft).toBe(0);
});

it.each([
  [1, 3, 48],
  [2, 1, 300],
])("handles delta mode %s", (deltaMode, deltaY, expected) => {
  render(<Hand />);
  const strip = screen.getByTestId("hand");
  dimensions(strip);
  wheel(strip, { deltaMode, deltaY });
  expect(strip.scrollLeft).toBe(expected);
});

it("attaches when cards appear and cleans up in Strict Mode", () => {
  const view = render(
    <StrictMode>
      <Hand enabled={false} />
    </StrictMode>,
  );
  const strip = screen.getByTestId("hand");
  dimensions(strip);
  expect(wheel(strip, { deltaY: 100 }).defaultPrevented).toBe(false);
  view.rerender(
    <StrictMode>
      <Hand enabled />
    </StrictMode>,
  );
  expect(wheel(strip, { deltaY: 100 }).defaultPrevented).toBe(true);
  expect(strip.scrollLeft).toBe(100);
  view.unmount();
  expect(wheel(strip, { deltaY: 100 }).defaultPrevented).toBe(false);
});
