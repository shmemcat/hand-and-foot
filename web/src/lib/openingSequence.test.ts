import { describe, expect, it } from "vitest";
import {
  OPENING_BEATS,
  openingCues,
  dealPilesLanded,
  ARRIVAL_FADE_MS,
  ARRIVAL_STAGGER_MS,
  arrivalMotionScale,
  arrivalDuration,
} from "./openingSequence";

describe("opening timing", () => {
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
  it("uses one shuffle cue and exactly two cues for every deal idea", () => {
    expect(openingCues(2, 4, 2000)).toEqual([{ at: 200, sound: "deal" }]);
    expect(OPENING_BEATS[3].duration).toBe(900);
    for (const style of ["sweeps", "drops", "split"] as const) {
      expect(openingCues(3, 4, 1800, style).length).toBe(2);
      expect(openingCues(3, 8, 1800, style)).toEqual(
        openingCues(3, 4, 1800, style),
      );
      expect(dealPilesLanded(0.1, style)).toBe(0);
      expect(dealPilesLanded(0.5, style)).toBe(style === "split" ? 0 : 1);
      expect(dealPilesLanded(0.8, style)).toBe(2);
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
});
