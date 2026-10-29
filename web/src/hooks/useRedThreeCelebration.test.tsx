import { useRef } from "react";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import party from "party-js";
import { useRedThreeCelebration } from "./useRedThreeCelebration";
import { footSnapshot } from "../lib/footSequence";
import type { Snapshot } from "../types";

const sound = vi.hoisted(() => ({ play: vi.fn() }));
vi.mock("../context/SoundContext", () => ({ useSound: () => sound }));
vi.mock("party-js", () => ({
  default: { confetti: vi.fn(), variation: { range: () => 90 } },
}));

function Table({
  snapshot,
  viewed = 0,
  reduced = false,
}: {
  snapshot: Snapshot;
  viewed?: number;
  reduced?: boolean;
}) {
  const board = useRef<HTMLDivElement>(null);
  useRedThreeCelebration(snapshot, board, reduced);
  return (
    <div ref={board}>
      <section className="tableau" data-side-id={viewed}>
        <div className="tableau-heading">Board {viewed}</div>
      </section>
    </div>
  );
}
const snapshotWith = (counts: number[]): Snapshot => {
  const snapshot = footSnapshot("play", "ready", 0);
  return {
    ...snapshot,
    players: snapshot.players.map((player, seat) => ({
      ...player,
      redThrees: Array.from({ length: counts[seat] ?? 0 }, (_, index) => ({
        id: `red-${seat}-${index}`,
        rank: "3",
        suit: "hearts",
        value: -300,
        redThree: true,
        wild: false,
      })),
    })),
  };
};
const burst = () => act(() => vi.advanceTimersByTime(20));

beforeEach(() => {
  vi.useFakeTimers();
  sound.play.mockClear();
  vi.mocked(party.confetti).mockClear();
});
afterEach(() => vi.useRealTimers());

it.each([
  [2, 3],
  [0, 3],
  [1, 4],
])("celebrates a pile growing from %s to %s once", (before, after) => {
  const view = render(<Table snapshot={snapshotWith([before])} />);
  view.rerender(<Table snapshot={snapshotWith([after])} />);
  burst();
  expect(sound.play).toHaveBeenCalledExactlyOnceWith("redThreeCelebration");
  expect(party.confetti).toHaveBeenCalledExactlyOnceWith(
    view.getByText("Board 0"),
    { count: 90 },
  );
  view.rerender(<Table snapshot={snapshotWith([after])} />);
  view.rerender(<Table snapshot={snapshotWith([after + 1])} />);
  burst();
  expect(sound.play).toHaveBeenCalledTimes(1);
  expect(party.confetti).toHaveBeenCalledTimes(1);
});

it("combines partners' red threes for the shared threshold", () => {
  const partnership = (counts: number[]) => {
    const snapshot = snapshotWith(counts);
    return {
      ...snapshot,
      scoringMode: "partnership" as const,
      players: snapshot.players.map((player, seat) => ({
        ...player,
        team: seat % 2,
      })),
    };
  };
  const view = render(<Table snapshot={partnership([1, 0, 1])} />);
  view.rerender(<Table snapshot={partnership([1, 0, 2])} />);
  burst();
  expect(sound.play).toHaveBeenCalledExactlyOnceWith("redThreeCelebration");
  expect(party.confetti).toHaveBeenCalledOnce();
});

it("stays quiet below three and when joining an existing pile of three", () => {
  const view = render(<Table snapshot={snapshotWith([3])} />);
  burst();
  expect(sound.play).not.toHaveBeenCalled();
  view.unmount();
  const next = render(<Table snapshot={snapshotWith([0])} />);
  next.rerender(<Table snapshot={snapshotWith([2])} />);
  burst();
  expect(sound.play).not.toHaveBeenCalled();
  expect(party.confetti).not.toHaveBeenCalled();
});

it("anchors confetti to the other player's board after Follow turn updates it", () => {
  const view = render(<Table snapshot={snapshotWith([0, 2])} />);
  const after = snapshotWith([0, 3]);
  view.rerender(<Table snapshot={after} />);
  view.rerender(<Table snapshot={after} viewed={1} />);
  burst();
  expect(party.confetti).toHaveBeenCalledExactlyOnceWith(
    view.getByText("Board 1"),
    { count: 90 },
  );
});

it("never throws confetti on an unrelated board or replays it when browsing", () => {
  const view = render(<Table snapshot={snapshotWith([0, 2])} />);
  const after = snapshotWith([0, 3]);
  view.rerender(<Table snapshot={after} />);
  burst();
  expect(sound.play).toHaveBeenCalledExactlyOnceWith("redThreeCelebration");
  expect(party.confetti).not.toHaveBeenCalled();
  view.rerender(<Table snapshot={after} viewed={1} />);
  burst();
  expect(sound.play).toHaveBeenCalledTimes(1);
  expect(party.confetti).not.toHaveBeenCalled();
});

it("resets between rounds and celebrates the next round's third red three", () => {
  const view = render(<Table snapshot={snapshotWith([2])} />);
  view.rerender(<Table snapshot={{ ...snapshotWith([3]), round: 2 }} />);
  burst();
  expect(sound.play).not.toHaveBeenCalled();
  view.rerender(<Table snapshot={{ ...snapshotWith([0]), round: 3 }} />);
  view.rerender(<Table snapshot={{ ...snapshotWith([3]), round: 3 }} />);
  burst();
  expect(sound.play).toHaveBeenCalledExactlyOnceWith("redThreeCelebration");
  expect(party.confetti).toHaveBeenCalledOnce();
});

it("keeps the sound with reduced motion while skipping confetti", () => {
  const view = render(<Table snapshot={snapshotWith([2])} reduced />);
  view.rerender(<Table snapshot={snapshotWith([3])} reduced />);
  burst();
  expect(sound.play).toHaveBeenCalledExactlyOnceWith("redThreeCelebration");
  expect(party.confetti).not.toHaveBeenCalled();
});

it("cancels a queued burst when leaving the table", () => {
  const view = render(<Table snapshot={snapshotWith([2])} />);
  view.rerender(<Table snapshot={snapshotWith([3])} />);
  view.unmount();
  burst();
  expect(party.confetti).not.toHaveBeenCalled();
});
