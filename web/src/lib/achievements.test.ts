import { expect, it } from "vitest";
import {
  ACHIEVEMENTS,
  computeAchievements,
  type AccountSummary,
} from "./achievements";

const empty: AccountSummary = {
  stats: {} as AccountSummary["stats"],
  counters: {},
  unlocks: [],
};
it("has sixteen public goals and twenty-six secrets with unique ids", () => {
  expect(ACHIEVEMENTS.filter((a) => a.secret)).toHaveLength(26);
  expect(ACHIEVEMENTS.filter((a) => !a.secret)).toHaveLength(16);
  expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(42);
  expect(computeAchievements(empty).every((a) => !a.earned)).toBe(true);
});
it("includes every secret shared by Euchre, Golf, and Hearts", () => {
  const shared = [
    "photo_finish",
    "better_with_friends",
    "hot_streak",
    "early_bird",
    "night_owl",
    "geezer",
    "new_year",
    "lonely_heart",
    "lucky_clover",
    "easter_egg",
    "fireworks",
    "spooky",
    "thankful",
    "christmas_spirit",
  ];
  const secrets = new Set(
    ACHIEVEMENTS.filter((a) => a.secret).map((a) => a.id),
  );
  expect(shared.every((id) => secrets.has(id))).toBe(true);
});
it("advances milestones through bronze, silver, and gold and retains the next goal", () => {
  for (const [count, tier, next] of [
    [9, undefined, "10"],
    [10, "bronze", "50"],
    [50, "silver", "200"],
    [200, "gold", "Gold"],
  ] as const) {
    const badge = computeAchievements({
      ...empty,
      counters: { games: count },
      unlocks: ["first_chapter"],
    }).find((a) => a.id === "games")!;
    expect(badge.tier).toBe(tier);
    expect(badge.earned).toBe(count >= 10);
    expect(badge.progress).toContain(next);
  }
});
