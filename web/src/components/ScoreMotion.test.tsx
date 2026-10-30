import { useRef } from "react";
import { fireEvent, render } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ScoreMotion } from "./ScoreMotion";
import { ScoreFlightClip } from "./ScoreFlightClip";
import {
  SCORING_SCENARIOS,
  scoringSequence,
  type ScoreBeat,
} from "../lib/scoringSequence";

let handScroll = 0;
beforeEach(() => {
  handScroll = 0;
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function (this: Element) {
      if (this.matches(".score-motion-layer, .score-flight-clip"))
        return new DOMRect(20, 30, 1000, 800);
      if (this.matches(".hand-scroll")) return new DOMRect(100, 500, 300, 110);
      if (this.matches(".game-page")) return new DOMRect(80, 100, 340, 600);
      if (this.matches(".foot-stack")) return new DOMRect(350, 450, 30, 44);
      const slot = this.closest(".hand-card");
      if (slot) {
        const index = [...slot.parentElement!.children].indexOf(slot);
        return new DOMRect(116 + index * 72 - handScroll, 514, 62, 87);
      }
      return new DOMRect();
    },
  );
});

function Fixture({ beat, index }: { beat: ScoreBeat; index: number }) {
  const board = useRef<HTMLDivElement>(null);
  return (
    <div ref={board} className="game-page partnership-game">
      {!beat.gathered && <div className="foot-stack" />}
      <div className="hand-scroll">
        {beat.hand.map((card) => (
          <div className="hand-card" data-card-id={card.id} key={card.id}>
            <div className="card" />
          </div>
        ))}
      </div>
      <ScoreMotion
        board={board}
        beat={beat}
        beatKey={String(index)}
        reduced={false}
        paused={false}
      />
    </div>
  );
}

it.each([0, 230])(
  "clips foot cards at both edges of a 21-card partners hand (scroll: %s)",
  (scroll) => {
    handScroll = scroll;
    const scenario = SCORING_SCENARIOS[0];
    const beats = scoringSequence({
      ...scenario,
      hand: Array.from({ length: 10 }, (_, index) => ({
        ...scenario.hand[index % scenario.hand.length],
        id: `hand-${index}`,
      })),
    });
    const view = render(<Fixture beat={beats[0]} index={0} />);
    view.rerender(<Fixture beat={beats[1]} index={1} />);
    expect(view.container.querySelectorAll(".hand-card")).toHaveLength(21);
    const flights = [
      ...view.container.querySelectorAll<HTMLElement>(".score-card-flight"),
    ];
    expect(flights).toHaveLength(11);
    const clip =
      view.container.querySelector<HTMLElement>(".score-flight-clip")!;
    expect(flights.every((flight) => flight.parentElement === clip)).toBe(true);
    // The flight still lands in the real sorted slot beyond the scroll edge.
    // Its overlay ancestor now clips that portion, just like the real hand.
    const last = flights.at(-1)!;
    expect(
      parseFloat(last.style.left) +
        20 +
        parseFloat(last.style.getPropertyValue("--score-end-x")),
    ).toBeGreaterThan(400);
    expect(clip.style.clipPath).toBe(
      "polygon(60px 0, 400px 0, 400px 470px, 380px 470px, 380px 100%, 80px 100%, 80px 470px, 60px 470px)",
    );
    // Scrolling with the scrollbar must also discard stale flight positions.
    fireEvent.scroll(view.container.querySelector(".hand-scroll")!);
    expect(view.container.querySelector(".score-card-flight")).toBeNull();
  },
);

it("keeps the hand boundary while its final card leaves and removes the row", () => {
  function LastCard({ empty }: { empty: boolean }) {
    const board = useRef<HTMLDivElement>(null);
    return (
      <div ref={board}>
        {!empty && <div className="hand-scroll" />}
        <ScoreFlightClip board={board} beatKey={String(empty)}>
          <div className="score-card-flight" />
        </ScoreFlightClip>
      </div>
    );
  }
  const view = render(<LastCard empty={false} />);
  const before =
    view.container.querySelector<HTMLElement>(".score-flight-clip")!.style
      .clipPath;
  view.rerender(<LastCard empty />);
  expect(view.container.querySelector(".hand-scroll")).toBeNull();
  expect(
    view.container.querySelector<HTMLElement>(".score-flight-clip")!.style
      .clipPath,
  ).toBe(before);
  expect(before).toContain("380px 470px");
});
