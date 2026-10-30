import { useRef } from "react";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useConcealedHand } from "./useConcealedHand";
import type { TableEvent } from "../types";

function Hand({
  count,
  scope = "deal:opponent",
  action,
  disabled = false,
}: {
  count: number;
  scope?: string;
  action?: TableEvent;
  disabled?: boolean;
}) {
  const board = useRef<HTMLDivElement>(null);
  const hand = useConcealedHand({
    scope,
    count,
    action,
    disabled,
    board,
  });
  return (
    <div ref={board}>
      <section className="hand-dock">
        <output>{hand.count}</output>
        {hand.slots.map((slot) => (
          <div
            key={slot.id}
            data-public-slot={slot.id}
            data-concealed-hidden={slot.hidden}
            data-concealed-leaving={slot.leaving}
          />
        ))}
      </section>
    </div>
  );
}
const draw: TableEvent = {
  id: "draw",
  playerId: "opponent",
  kind: "draw",
  count: 2,
  card: null,
  faceDown: false,
};
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it("adds new anonymous slots on the left and reveals them when the draw lands", () => {
  const view = render(<Hand count={4} />);
  const ids = () =>
    [...view.container.querySelectorAll<HTMLElement>("[data-public-slot]")].map(
      (slot) => slot.dataset.publicSlot,
    );
  const before = ids();
  view.rerender(<Hand count={6} action={draw} />);
  expect(ids().slice(2)).toEqual(before);
  expect(
    view.container.querySelectorAll('[data-concealed-hidden="true"]'),
  ).toHaveLength(2);
  view.rerender(<Hand count={6} />);
  expect(
    view.container.querySelector('[data-concealed-hidden="true"]'),
  ).toBeNull();
});

it("removes spaces immediately while anonymous copies fade", () => {
  const view = render(<Hand count={9} />);
  view.rerender(<Hand count={6} />);
  expect(view.container.querySelectorAll("[data-public-slot]")).toHaveLength(6);
  expect(
    view.container.querySelectorAll('[data-concealed-ghost="true"]'),
  ).toHaveLength(3);
  act(() => vi.advanceTimersByTime(179));
  expect(
    view.container.querySelectorAll('[data-concealed-ghost="true"]'),
  ).toHaveLength(3);
  act(() => vi.advanceTimersByTime(1));
  expect(view.container.querySelectorAll("[data-public-slot]")).toHaveLength(6);
  expect(
    view.container.querySelector('[data-concealed-ghost="true"]'),
  ).toBeNull();
});

it("settles an interrupted draw when switching players without carrying hidden slots across", () => {
  const view = render(<Hand count={9} />);
  view.rerender(<Hand count={11} action={draw} />);
  view.rerender(<Hand count={5} scope="deal:another-player" />);
  act(() => vi.advanceTimersByTime(2000));
  expect(view.container.querySelectorAll("[data-public-slot]")).toHaveLength(5);
  expect(
    view.container.querySelector('[data-concealed-hidden="true"]'),
  ).toBeNull();
  expect(
    view.container.querySelector('[data-concealed-leaving="true"]'),
  ).toBeNull();
});

it("settles counts immediately with reduced motion", () => {
  const view = render(<Hand count={9} disabled />);
  view.rerender(<Hand count={11} action={draw} disabled />);
  expect(view.container.querySelectorAll("[data-public-slot]")).toHaveLength(
    11,
  );
  expect(
    view.container.querySelector('[data-concealed-hidden="true"]'),
  ).toBeNull();
  view.rerender(<Hand count={6} disabled />);
  expect(view.container.querySelectorAll("[data-public-slot]")).toHaveLength(6);
});

it("reserves the outgoing card when following a queued discard into another hand", () => {
  const view = render(<Hand count={9} />);
  const discard: TableEvent = {
    ...draw,
    id: "discard",
    kind: "discard",
    count: 1,
  };
  view.rerender(<Hand count={3} scope="deal:next-player" action={discard} />);
  expect(view.container.querySelectorAll("[data-public-slot]")).toHaveLength(4);
  expect(
    view.container.querySelectorAll(
      '[data-concealed-leaving="true"][data-concealed-hidden="true"]',
    ),
  ).toHaveLength(1);
  view.rerender(<Hand count={3} scope="deal:next-player" />);
  expect(view.container.querySelectorAll("[data-public-slot]")).toHaveLength(3);
  expect(
    view.container.querySelector('[data-concealed-hidden="true"]'),
  ).toBeNull();
});
