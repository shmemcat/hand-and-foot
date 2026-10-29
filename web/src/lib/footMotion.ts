// Match the opening's Gather beat, with the approved slower source fade.
export const FOOT_GATHER_DELAY_MS = 150;
export const FOOT_GATHER_STAGGER_MS = 65;
export const FOOT_GATHER_FLIGHT_MS = 500;
export const FOOT_SOURCE_FADE_DELAY_MS = 800;
export const FOOT_SOURCE_FADE_MS = 500;
export const FOOT_SETTLE_MS = 100;
export const footGatherDuration = (count: number) =>
  Math.max(
    FOOT_GATHER_DELAY_MS +
      Math.max(0, count - 1) * FOOT_GATHER_STAGGER_MS +
      FOOT_GATHER_FLIGHT_MS,
    FOOT_SOURCE_FADE_DELAY_MS + FOOT_SOURCE_FADE_MS,
  );
