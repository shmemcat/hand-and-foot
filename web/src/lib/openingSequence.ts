export const OPENING_BEATS = [900, 1500, 2000, 900, 0, 2000, 2800, 2200].map(
  (duration) => ({ duration }),
);

export const ARRIVAL_FADE_MS = 396;
export const ARRIVAL_STAGGER_MS = 135;
export function arrivalMotionScale(players: number, duration: number): number {
  const span = ARRIVAL_FADE_MS + (players - 1) * ARRIVAL_STAGGER_MS;
  return Math.min(1, Math.max(0, duration - 80) / span);
}
export function arrivalDuration(players: number): number {
  const span = ARRIVAL_FADE_MS + (players - 1) * ARRIVAL_STAGGER_MS;
  return Math.max(800, Math.round((span + 100) / 100) * 100);
}

export type DealAnimation = "sweeps" | "drops" | "split";
export const DEAL_LAUNCH = [0.1, 0.51] as const;
export const DEAL_LAND = [0.32, 0.73] as const;
export function dealPilesLanded(
  progress: number,
  style: DealAnimation,
): number {
  if (progress >= DEAL_LAND[1]) return 2;
  return style !== "split" && progress >= DEAL_LAND[0] ? 1 : 0;
}

export type OpeningState = {
  step: number;
  elapsed: number;
  playing: boolean;
  continuous: boolean;
  choice: number | null;
  replay: number;
};
export const INITIAL_OPENING: OpeningState = {
  step: 0,
  elapsed: 0,
  playing: false,
  continuous: false,
  choice: null,
  replay: 0,
};
export type OpeningCue = {
  at: number;
  sound: "playerJoin" | "select" | "deal" | "flip" | "slide" | "start";
};
export function openingCues(
  step: number,
  players: number,
  duration: number,
  dealStyle: DealAnimation = "sweeps",
): OpeningCue[] {
  switch (step) {
    case 0:
      return Array.from({ length: players }, (_, i) => ({
        at:
          (144 + i * ARRIVAL_STAGGER_MS) *
          arrivalMotionScale(players, duration),
        sound: "playerJoin",
      }));
    case 1:
      return [{ at: duration * 0.2, sound: "select" }];
    case 2:
      return [{ at: duration * 0.1, sound: "deal" }];
    case 3:
      return (dealStyle === "drops" ? DEAL_LAND : DEAL_LAUNCH).map((ratio) => ({
        at: duration * ratio,
        sound: dealStyle === "drops" ? "select" : "slide",
      }));
    case 4:
      return [
        { at: 100, sound: "flip" },
        { at: 450, sound: "flip" },
      ];
    case 5:
      return [
        { at: duration * 0.075, sound: "deal" },
        { at: duration * 0.65, sound: "select" },
      ];
    case 6:
      return Array.from({ length: players - 1 }, (_, i) => ({
        at: ((i + 1) * duration) / players,
        sound: "select",
      }));
    case 7:
      return [{ at: Math.max(500, duration * 0.3), sound: "start" }];
    default:
      return [];
  }
}
