import { renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useAchievementRefresh } from "./useAchievementRefresh";
import { ACHIEVEMENT_EVENT } from "../lib/achievementEvents";
import type { Snapshot } from "../types";

const fixture = (): Snapshot =>
  ({
    code: "TABLE",
    viewerId: "you",
    revision: 1,
    round: 1,
    phase: "draw",
    players: [{ id: "you", inFoot: false }],
  }) as Snapshot;

it("refreshes at foot pickup and scoring transitions without checking every turn or poll", () => {
  const dispatch = vi.spyOn(window, "dispatchEvent");
  const snapshot = fixture();
  const { rerender } = renderHook(
    ({ snapshot }) => useAchievementRefresh(snapshot, true),
    {
      initialProps: { snapshot },
    },
  );
  expect(dispatch).toHaveBeenCalledTimes(1);
  rerender({ snapshot: { ...snapshot, revision: 2 } });
  rerender({ snapshot: { ...snapshot, phase: "play", revision: 3 } });
  expect(dispatch).toHaveBeenCalledTimes(1);
  const inFoot = {
    ...snapshot,
    players: [{ ...snapshot.players[0], inFoot: true }],
  };
  rerender({ snapshot: inFoot });
  expect(dispatch).toHaveBeenCalledTimes(2);
  rerender({ snapshot: { ...inFoot, phase: "scoring" } });
  expect(dispatch).toHaveBeenCalledTimes(3);
  rerender({ snapshot: { ...inFoot, phase: "round_over" } });
  expect(dispatch).toHaveBeenCalledTimes(4);
  rerender({ snapshot: { ...inFoot, round: 2, phase: "choose" } });
  expect(dispatch).toHaveBeenCalledTimes(5);
  rerender({ snapshot: { ...inFoot, round: 2, phase: "finished" } });
  expect(dispatch).toHaveBeenCalledTimes(6);
  expect(
    dispatch.mock.calls.every(([event]) => event.type === ACHIEVEMENT_EVENT),
  ).toBe(true);
});

it("refreshes when entering a different room", () => {
  const dispatch = vi.spyOn(window, "dispatchEvent");
  const { rerender } = renderHook(
    ({ snapshot }) => useAchievementRefresh(snapshot, true),
    {
      initialProps: { snapshot: null as Snapshot | null },
    },
  );
  expect(dispatch).not.toHaveBeenCalled();
  rerender({ snapshot: fixture() });
  rerender({ snapshot: { ...fixture(), code: "OTHER" } });
  expect(dispatch).toHaveBeenCalledTimes(2);
});

it("skips guests, rehearsals and development fixture games", () => {
  const dispatch = vi.spyOn(window, "dispatchEvent");
  const snapshot = fixture();
  const { rerender } = renderHook(
    ({ snapshot, enabled }) => useAchievementRefresh(snapshot, enabled),
    {
      initialProps: { snapshot, enabled: false },
    },
  );
  rerender({ snapshot: { ...snapshot, phase: "finished" }, enabled: false });
  rerender({
    snapshot: { ...snapshot, developmentFixture: true },
    enabled: true,
  });
  expect(dispatch).not.toHaveBeenCalled();
  rerender({ snapshot, enabled: true });
  expect(dispatch).toHaveBeenCalledTimes(1);
});
