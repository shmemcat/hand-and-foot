import { renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useCardMovementSounds } from "./useCardMovementSounds";
import { footSnapshot } from "../lib/footSequence";
import type { Snapshot, TableEvent } from "../types";

const sound = vi.hoisted(() => ({ play: vi.fn() }));
vi.mock("../context/SoundContext", () => ({ useSound: () => sound }));

function fixture(): Snapshot {
  return {
    ...footSnapshot("play", "ready", 0),
    actorId: "opening-seat-1",
    tableEvents: [],
  };
}
function event(kind: TableEvent["kind"], id = kind): TableEvent {
  return {
    id,
    kind,
    playerId: "opening-seat-1",
    count: kind === "draw" ? 2 : 1,
    card: null,
    faceDown: false,
  };
}
type Props = {
  snapshot: Snapshot | null;
  moving?: TableEvent;
  blocking?: boolean;
};
function listen(snapshot: Snapshot) {
  return renderHook(
    ({ snapshot, moving, blocking = false }: Props) =>
      useCardMovementSounds(snapshot, moving, blocking),
    { initialProps: { snapshot } as Props },
  );
}

beforeEach(() => sound.play.mockClear());

it.each(["draw", "pickup", "discard", "replace"] as const)(
  "sounds a remote %s once, including without an animation",
  (kind) => {
    const source = fixture();
    const view = listen(source);
    const next = { ...source, revision: 2, tableEvents: [event(kind)] };
    view.rerender({ snapshot: next });
    view.rerender({ snapshot: { ...next, revision: 3 } });
    expect(sound.play).toHaveBeenCalledExactlyOnceWith("select");
  },
);

it("leaves foot pickup sounds to the existing announcement", () => {
  const source = fixture();
  const view = listen(source);
  const foot = event("foot");
  const next = { ...source, tableEvents: [foot] };
  view.rerender({ snapshot: next, moving: foot, blocking: true });
  view.rerender({ snapshot: next });
  expect(sound.play).not.toHaveBeenCalled();
});

it("sounds queued movements individually after the board is ready", () => {
  const source = fixture();
  const draw = event("draw");
  const discard = event("discard");
  const next = { ...source, tableEvents: [draw, discard] };
  const view = listen(source);
  view.rerender({ snapshot: next, blocking: true });
  expect(sound.play).not.toHaveBeenCalled();
  view.rerender({ snapshot: next, blocking: true, moving: draw });
  expect(sound.play).toHaveBeenCalledExactlyOnceWith("select");
  view.rerender({ snapshot: next, blocking: true, moving: draw });
  expect(sound.play).toHaveBeenCalledTimes(1);
  view.rerender({ snapshot: next, blocking: true, moving: discard });
  expect(sound.play).toHaveBeenCalledTimes(2);
  view.rerender({ snapshot: next });
  expect(sound.play).toHaveBeenCalledTimes(2);
});

it("does not replay history when joining, reconnecting, or starting a new round", () => {
  const source = { ...fixture(), tableEvents: [event("draw")] };
  const view = listen(source);
  view.rerender({ snapshot: { ...source, revision: 2 } });
  view.rerender({ snapshot: { ...source, round: source.round + 1 } });
  view.rerender({ snapshot: null });
  view.rerender({ snapshot: source });
  view.rerender({ snapshot: { ...source, code: "OTHER" } });
  view.rerender({ snapshot: { ...source, viewerId: "OTHER" } });
  expect(sound.play).not.toHaveBeenCalled();
});

it("keeps local draws, discards, and melds from duplicating command sounds", () => {
  const source = fixture();
  source.actorId = source.viewerId;
  const view = listen(source);
  const ownEvents = [event("draw"), event("discard")].map((action) => ({
    ...action,
    playerId: source.viewerId,
  }));
  const next = structuredClone(source);
  next.actorId = "opening-seat-1";
  next.tableEvents = ownEvents;
  next.sides[0].melds.push({
    id: "local-meld",
    creator: source.viewerId,
    kind: "set",
    rank: source.hand[0].rank,
    cards: source.hand.slice(0, 3),
    complete: false,
    dirty: false,
    bonus: 0,
  });
  view.rerender({ snapshot: next, moving: ownEvents[0], blocking: true });
  view.rerender({ snapshot: next, moving: ownEvents[1], blocking: true });
  view.rerender({ snapshot: next });
  expect(sound.play).not.toHaveBeenCalled();
});

it("sounds remote meld additions even when extending a pile created by the viewer", () => {
  const source = fixture();
  source.sides[0].melds[0].creator = source.viewerId;
  const view = listen(source);
  const next = structuredClone(source);
  next.sides[0].melds[0].cards.push({
    ...source.hand[0],
    id: "partner-card",
  });
  view.rerender({ snapshot: next });
  view.rerender({ snapshot: { ...next, revision: 3 } });
  expect(sound.play).toHaveBeenCalledExactlyOnceWith("select");
});

it("sounds a whole bot turn received between two turns belonging to the viewer", () => {
  const source = fixture();
  source.actorId = source.viewerId;
  const view = listen(source);
  const draw = event("draw");
  const discard = event("discard");
  const next = structuredClone(source);
  next.tableEvents = [draw, discard];
  next.sides[1].melds.push({
    ...source.sides[0].melds[0],
    id: "bot-meld",
    creator: "opening-seat-1",
    cards: source.hand.slice(0, 3).map((card) => ({
      ...card,
      id: `bot-${card.id}`,
    })),
  });
  view.rerender({ snapshot: next, moving: draw, blocking: true });
  expect(sound.play).toHaveBeenCalledTimes(2); // Draw and meld.
  view.rerender({ snapshot: next, moving: discard, blocking: true });
  view.rerender({ snapshot: next });
  expect(sound.play).toHaveBeenCalledTimes(3);
});

it("does not duplicate a local red-three placement cue", () => {
  const source = fixture();
  source.actorId = source.viewerId;
  const red = { ...source.hand[0], redThree: true, rank: "3", suit: "hearts" };
  source.hand = [red];
  const view = listen(source);
  const next = structuredClone(source);
  next.hand = [];
  next.players[0].redThrees.push(red);
  view.rerender({ snapshot: next });
  expect(sound.play).not.toHaveBeenCalled();
});

it("sounds a bot's exposed red threes once per play", () => {
  const source = fixture();
  const view = listen(source);
  const next = structuredClone(source);
  next.players[1].redThrees.push(
    ...["red-1", "red-2"].map((id) => ({
      ...source.hand[0],
      id,
      redThree: true,
      rank: "3",
      suit: "hearts",
    })),
  );
  view.rerender({ snapshot: next });
  view.rerender({ snapshot: { ...next, revision: 3 } });
  expect(sound.play).toHaveBeenCalledExactlyOnceWith("select");
});

it("uses one cue for a discard pickup and the meld played with it", () => {
  const source = fixture();
  const view = listen(source);
  const pickup = event("pickup");
  const next = structuredClone(source);
  next.tableEvents = [pickup];
  next.sides[0].melds[0].cards.push({ ...source.hand[0], id: "pickup-card" });
  view.rerender({ snapshot: next, blocking: true });
  expect(sound.play).not.toHaveBeenCalled();
  view.rerender({ snapshot: next, moving: pickup, blocking: true });
  view.rerender({ snapshot: next });
  expect(sound.play).toHaveBeenCalledExactlyOnceWith("select");
});

it("consumes background actions and pending cues without replaying on return", () => {
  const source = fixture();
  const view = listen(source);
  const first = { ...source, tableEvents: [event("draw")] };
  view.rerender({ snapshot: first, blocking: true });
  const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  const next = {
    ...first,
    tableEvents: [...first.tableEvents, event("discard")],
  };
  view.rerender({ snapshot: next, blocking: true });
  hidden.mockReturnValue(false);
  view.rerender({ snapshot: next });
  expect(sound.play).not.toHaveBeenCalled();
  hidden.mockRestore();
});
