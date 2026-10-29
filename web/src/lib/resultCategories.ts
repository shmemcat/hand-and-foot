import type { BotDifficulty } from "../types";

export const RESULT_CATEGORIES = [
  "easy",
  "medium",
  "hard",
  "multiplayer",
] as const;
export type ResultCategory = (typeof RESULT_CATEGORIES)[number];
export const LEADERBOARD_CATEGORIES = [
  ...RESULT_CATEGORIES,
  "achievements",
] as const;
export type LeaderboardCategory = (typeof LEADERBOARD_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<LeaderboardCategory, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
  multiplayer: "Multiplayer",
  achievements: "Achievements",
};

export function resultCategory(
  playMode: "practice" | "online",
  difficulty: BotDifficulty = "medium",
): ResultCategory {
  return playMode === "online" ? "multiplayer" : difficulty;
}

export function leaderboardCategory(
  search: URLSearchParams,
): LeaderboardCategory {
  const category = search.get("category");
  if (LEADERBOARD_CATEGORIES.includes(category as LeaderboardCategory))
    return category as LeaderboardCategory;
  const mode = search.get("mode");
  return mode === "achievements"
    ? "achievements"
    : mode === "online"
      ? "multiplayer"
      : "medium";
}
