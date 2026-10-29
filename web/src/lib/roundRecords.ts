import type { RoundResult, Snapshot } from "../types";

export function completedRoundRecords(snapshot: Snapshot): RoundResult[] {
  return snapshot.history.slice().sort((a, b) => a.round - b.round);
}

export function recordGameTotal(
  snapshot: Snapshot,
  round: number,
  team: number,
) {
  const later = snapshot.history
    .filter((entry) => entry.round > round)
    .reduce(
      (sum, entry) =>
        sum + (entry.scores.find((score) => score.team === team)?.total ?? 0),
      0,
    );
  return (snapshot.sides.find((side) => side.id === team)?.score ?? 0) - later;
}
