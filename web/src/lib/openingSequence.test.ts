import { describe, expect, it } from "vitest";
import {
  INITIAL_OPENING,
  OPENING_BEATS,
  openingCues,
  openingReducer,
  samplePiles,
  openingSnapshot,
  DEAL_ANIMATIONS,
  dealPilesLanded,
  ARRIVAL_FADE_MS,
  ARRIVAL_STAGGER_MS,
  arrivalMotionScale,
  arrivalDuration,
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
    const duration = OPENING_BEATS[3].duration;
    let state = openingReducer(INITIAL_OPENING, { type: "seek", step: 3 });
    state = openingReducer(state, { type: "tick", delta: 500, duration });
    state = openingReducer(state, { type: "pause" });
    expect(
      openingReducer(state, { type: "tick", delta: 3000, duration }),
    ).toEqual(state);
    state = openingReducer(state, { type: "replay" });
    state = openingReducer(state, {
      type: "tick",
      delta: 10000,
      duration,
    });
    expect(state).toMatchObject({ step: 3, elapsed: duration, playing: false });
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
  it("uses one shuffle cue and exactly two cues for every deal idea", () => {
    expect(openingCues(2, 4, 2000)).toEqual([{ at: 200, sound: "deal" }]);
    expect(OPENING_BEATS[3].duration).toBe(900);
    for (const idea of DEAL_ANIMATIONS) {
      expect(openingCues(3, 4, 1800, idea.id).length).toBe(2);
      expect(openingCues(3, 8, 1800, idea.id)).toEqual(
        openingCues(3, 4, 1800, idea.id),
      );
      expect(dealPilesLanded(0.1, idea.id)).toBe(0);
      expect(dealPilesLanded(0.5, idea.id)).toBe(idea.id === "split" ? 0 : 1);
      expect(dealPilesLanded(0.8, idea.id)).toBe(2);
    }
  });
  it("keeps the four-player entrance speed and hands off after a short settle", () => {
    const duration = arrivalDuration(4);
    expect(duration).toBe(900);
    expect(arrivalMotionScale(4, duration)).toBe(1);
    const lastPlayerFinishes = ARRIVAL_FADE_MS + 3 * ARRIVAL_STAGGER_MS;
    expect(duration - lastPlayerFinishes).toBe(99);
    expect(openingCues(1, 4, 1500)).toEqual([{ at: 300, sound: "select" }]);
    for (const players of [2, 3, 4, 5, 6, 8]) {
      const beat = arrivalDuration(players);
      expect(
        (ARRIVAL_FADE_MS + (players - 1) * ARRIVAL_STAGGER_MS) *
          arrivalMotionScale(players, beat),
      ).toBeLessThanOrEqual(beat - 80);
    }
  });
  it("supplies the current live board contract including the foot’s outer card and no unplayed melds", () => {
    const state = openingReducer(
      openingReducer(INITIAL_OPENING, { type: "seek", step: 4 }),
      { type: "choose", pile: 1 },
    );
    const snapshot = openingSnapshot({
      state,
      names: ["You", "Poppy", "Hazel", "Jasper"],
      mode: "individual",
      dealer: 0,
      duration: 2000,
    });
    expect(snapshot.hand.map((card) => card.id)).toEqual(
      samplePiles()[1].map((card) => card.id),
    );
    expect(snapshot.footTop?.id).toBe(samplePiles()[0][0].id);
    expect(snapshot.sides.every((side) => side.melds.length === 0)).toBe(true);
    expect(snapshot.dealerId).toBe(snapshot.viewerId);
    expect(snapshot.stockCount).toBe(182);
  });
});
