import { describe, expect, it } from "vitest";
import {
  INITIAL_OPENING,
  OPENING_BEATS,
  openingCues,
  openingReducer,
  samplePiles,
} from "./openingSequence";

describe("opening playback", () => {
  it("plays through the opening and waits indefinitely for an actual pile choice", () => {
    let state = openingReducer(INITIAL_OPENING, { type: "restart" });
    for (let step = 0; step < 4; step++) {
      expect(state.step).toBe(step);
      state = openingReducer(state, {
        type: "tick",
        delta: 20000,
        duration: OPENING_BEATS[step].duration,
      });
    }
    state = openingReducer(state, { type: "tick", delta: 100000, duration: 0 });
    expect(state.step).toBe(4);
    expect(state.choice).toBeNull();
    state = openingReducer(state, { type: "choose", pile: 1 });
    expect(state).toMatchObject({
      step: 5,
      choice: 1,
      playing: true,
      continuous: true,
    });
    for (let step = 5; step < 8; step++)
      state = openingReducer(state, {
        type: "tick",
        delta: 20000,
        duration: OPENING_BEATS[step].duration,
      });
    expect(state).toMatchObject({ step: 7, playing: false, choice: 1 });
  });
  it("preserves progress when paused and does not advance a manually selected beat", () => {
    let state = openingReducer(INITIAL_OPENING, { type: "seek", step: 3 });
    state = openingReducer(state, { type: "tick", delta: 500, duration: 6200 });
    state = openingReducer(state, { type: "pause" });
    expect(
      openingReducer(state, { type: "tick", delta: 3000, duration: 6200 }),
    ).toEqual(state);
    state = openingReducer(state, { type: "replay" });
    state = openingReducer(state, {
      type: "tick",
      delta: 10000,
      duration: 6200,
    });
    expect(state).toMatchObject({ step: 3, elapsed: 6200, playing: false });
  });
  it("clears a previous choice when going back, and preserves it when replaying later beats", () => {
    let state = openingReducer(INITIAL_OPENING, { type: "seek", step: 4 });
    state = openingReducer(state, { type: "choose", pile: 1 });
    state = openingReducer(state, { type: "seek", step: 7 });
    expect(state.choice).toBe(1);
    expect(openingReducer(state, { type: "seek", step: 4 }).choice).toBeNull();
    expect(openingReducer(state, { type: "restart" }).choice).toBeNull();
  });
  it("rejects choices outside the choice beat or outside the two piles", () => {
    expect(
      openingReducer(INITIAL_OPENING, { type: "choose", pile: 0 }),
    ).toEqual(INITIAL_OPENING);
    const state = openingReducer(INITIAL_OPENING, { type: "seek", step: 4 });
    expect(openingReducer(state, { type: "choose", pile: 2 })).toEqual(state);
  });
  it.each([2, 3, 4, 5, 6, 8])(
    "keeps %s-player cues ordered and within their beat",
    (players) => {
      OPENING_BEATS.forEach((beat, step) => {
        for (const duration of [beat.duration || 1000, 800, 12000]) {
          const cues = openingCues(step, players, duration);
          expect(cues.map((c) => c.at)).toEqual(
            cues.map((c) => c.at).sort((a, b) => a - b),
          );
          expect(cues.every((c) => c.at >= 0 && c.at <= duration)).toBe(true);
        }
      });
    },
  );
  it("provides exactly two complete, distinct sample piles", () => {
    const piles = samplePiles();
    expect(piles.map((pile) => pile.length)).toEqual([11, 11]);
    expect(new Set(piles.flat().map((card) => card.id)).size).toBe(22);
  });
});
