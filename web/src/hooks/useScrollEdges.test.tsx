import { StrictMode, useRef } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useScrollEdges } from "./useScrollEdges";

let width: number;
let resized: () => void;
let observed: Element[];
const rendered = vi.fn();

function Strip({
  count = 10,
  enabled = true,
  revision = 1,
}: {
  count?: number;
  enabled?: boolean;
  revision?: number;
}) {
  rendered();
  const ref = useRef<HTMLDivElement>(null);
  useScrollEdges(ref, enabled, revision);
  return (
    <div ref={ref} key={revision} data-testid="strip">
      {Array.from({ length: count }, (_, index) => (
        <span key={index}>Card</span>
      ))}
    </div>
  );
}

beforeEach(() => {
  width = 300;
  observed = [];
  rendered.mockClear();
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(
    () => width,
  );
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(
    function (this: HTMLElement) {
      return this.children.length * 100;
    },
  );
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(150);
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(140);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resized = callback;
      }
      observe(node: Element) {
        observed.push(node);
      }
      disconnect() {
        observed = [];
      }
    },
  );
});

it("indicates only directions with hidden cards without rerendering on scroll", () => {
  render(<Strip />);
  const strip = screen.getByTestId("strip");
  expect(strip.hasAttribute("data-scroll-left")).toBe(false);
  expect(strip.hasAttribute("data-scroll-right")).toBe(true);
  const renders = rendered.mock.calls.length;

  fireEvent.scroll(strip, { target: { scrollLeft: 150 } });
  expect(strip.hasAttribute("data-scroll-left")).toBe(true);
  expect(strip.hasAttribute("data-scroll-right")).toBe(true);

  fireEvent.scroll(strip, { target: { scrollLeft: 699.5 } });
  expect(strip.hasAttribute("data-scroll-left")).toBe(true);
  expect(strip.hasAttribute("data-scroll-right")).toBe(false);

  fireEvent.scroll(strip, { target: { scrollLeft: 0 } });
  expect(strip.hasAttribute("data-scroll-left")).toBe(false);
  expect(strip.hasAttribute("data-scroll-right")).toBe(true);
  expect(rendered).toHaveBeenCalledTimes(renders);
  expect(strip.style.getPropertyValue("--scrollbar-height")).toBe("10px");
});

it("updates when cards are added or removed without replacing the strip", async () => {
  const view = render(<Strip count={3} />);
  const strip = screen.getByTestId("strip");
  expect(strip.hasAttribute("data-scroll-right")).toBe(false);
  view.rerender(<Strip count={5} />);
  await waitFor(() =>
    expect(strip.hasAttribute("data-scroll-right")).toBe(true),
  );
  view.rerender(<Strip count={2} />);
  await waitFor(() =>
    expect(strip.hasAttribute("data-scroll-right")).toBe(false),
  );
  expect(strip.hasAttribute("data-scroll-left")).toBe(false);
  expect(observed).toEqual([strip, ...strip.children]);
});

it("removes the fade when resizing makes all cards fit", () => {
  render(<Strip />);
  const strip = screen.getByTestId("strip");
  expect(strip.hasAttribute("data-scroll-right")).toBe(true);
  width = 1000;
  resized();
  expect(strip.hasAttribute("data-scroll-right")).toBe(false);
  width = 300;
  resized();
  expect(strip.hasAttribute("data-scroll-right")).toBe(true);
});

it("cleans up replaced strips and reattaches after Strict Mode effect replay", () => {
  const view = render(
    <StrictMode>
      <Strip />
    </StrictMode>,
  );
  const previous = screen.getByTestId("strip");
  expect(previous.hasAttribute("data-scroll-right")).toBe(true);
  view.rerender(
    <StrictMode>
      <Strip revision={2} />
    </StrictMode>,
  );
  fireEvent.scroll(previous, { target: { scrollLeft: 100 } });
  expect(previous.hasAttribute("data-scroll-left")).toBe(false);
  expect(previous.hasAttribute("data-scroll-right")).toBe(false);
  const current = screen.getByTestId("strip");
  expect(current.hasAttribute("data-scroll-right")).toBe(true);
  view.unmount();
  expect(current.hasAttribute("data-scroll-right")).toBe(false);
  expect(current.style.getPropertyValue("--scrollbar-height")).toBe("");
  expect(observed).toEqual([]);
});

it("leaves disabled strips unmasked", () => {
  render(<Strip enabled={false} />);
  const strip = screen.getByTestId("strip");
  fireEvent.scroll(strip, { target: { scrollLeft: 100 } });
  expect(strip.hasAttribute("data-scroll-left")).toBe(false);
  expect(strip.hasAttribute("data-scroll-right")).toBe(false);
});
