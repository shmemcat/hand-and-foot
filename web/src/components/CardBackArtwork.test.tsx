import { fireEvent, render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { Card } from "./Card";

const incoming = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('[data-back-layer="current"]')!;
const previous = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('[data-back-layer="previous"]');
const loaded = (element: HTMLElement) =>
  element.querySelectorAll("img").forEach((image) => fireEvent.load(image));
const animationEnd = (element: Element) =>
  fireEvent(
    element,
    new Event(
      "AnimationEvent" in window ? "animationend" : "webkitAnimationEnd",
      { bubbles: true },
    ),
  );

it("holds the old art until both new theme images load, then clears it after the short fade", () => {
  const view = render(<Card back="royal-fan" small fadeBack />);
  loaded(incoming(view.container));
  view.rerender(<Card back="ginkgo" small fadeBack />);
  const next = incoming(view.container);
  expect(previous(view.container)?.dataset.backDesign).toBe("royal-fan");
  expect(next.dataset.backDesign).toBe("ginkgo");
  expect(next.dataset.ready).toBe("false");
  fireEvent.load(next.querySelector(".light-back")!);
  expect(next.dataset.ready).toBe("false");
  fireEvent.load(next.querySelector(".dark-back")!);
  expect(next.dataset.ready).toBe("true");
  view.rerender(<Card back="ginkgo" small fadeBack />);
  expect(incoming(view.container)).toBe(next);
  animationEnd(next.querySelector("img")!);
  expect(previous(view.container)).not.toBeNull();
  animationEnd(next);
  expect(previous(view.container)).toBeNull();
  expect(incoming(view.container)).toBe(next);
});

it("keeps visible artwork through rapid board switches and ignores a stale image load", () => {
  const view = render(<Card back="royal-fan" fadeBack />);
  loaded(incoming(view.container));
  view.rerender(<Card back="ginkgo" fadeBack />);
  const abandoned = incoming(view.container);
  view.rerender(<Card back="fern-sprig" fadeBack />);
  loaded(abandoned);
  animationEnd(abandoned);
  expect(previous(view.container)?.dataset.backDesign).toBe("royal-fan");
  expect(incoming(view.container).dataset.backDesign).toBe("fern-sprig");
  expect(incoming(view.container).dataset.ready).toBe("false");
  loaded(incoming(view.container));
  animationEnd(incoming(view.container));
  expect(previous(view.container)).toBeNull();
});

it("switches immediately with reduced motion", () => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  const view = render(<Card back="royal-fan" fadeBack />);
  view.rerender(<Card back="ginkgo" fadeBack />);
  expect(previous(view.container)).toBeNull();
  expect(incoming(view.container).dataset.backDesign).toBe("ginkgo");
  expect(
    incoming(view.container).classList.contains("card-back-entering"),
  ).toBe(false);
});

it("keeps face-up cards intact when the viewed back changes", () => {
  const card = {
    id: "discard",
    rank: "A",
    suit: "spades",
    value: 20,
    wild: false,
    redThree: false,
  };
  const view = render(<Card card={card} back="royal-fan" fadeBack />);
  const art = view.container.querySelector(".card-art");
  view.rerender(<Card card={card} back="ginkgo" fadeBack />);
  expect(view.container.querySelector(".card-art")).toBe(art);
  expect(view.container.querySelector(".card-back-layer")).toBeNull();
});
