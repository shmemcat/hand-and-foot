import type { ResultCategory } from "./resultCategories";

export type Stats = {
  games: number;
  wins: number;
  rounds: number;
  best: number | null;
  total: number;
  cleanBooks: number;
  dirtyBooks: number;
  goingOut: number;
};
export type AccountSummary = {
  stats: Record<"all" | "practice" | "online", Stats> &
    Partial<Record<ResultCategory, Stats>>;
  counters: Record<string, number>;
  unlocks: string[];
};
type Definition = {
  id: string;
  name: string;
  description: string;
  flavorText?: string;
  icon: string;
  secret?: boolean;
  counter?: string;
  targets?: [number, number, number];
};
export type Achievement = Definition & {
  earned: boolean;
  tier?: "bronze" | "silver" | "gold";
  progress?: string;
};
const goal = (
  id: string,
  name: string,
  description: string,
  icon: string,
): Definition => ({ id, name, description, icon });
const secret = (
  id: string,
  name: string,
  description: string,
  icon: string,
): Definition => ({ ...goal(id, name, description, icon), secret: true });
const milestone = (
  id: string,
  name: string,
  description: string,
  icon: string,
  targets: [number, number, number],
): Definition => ({
  ...goal(id, name, description, icon),
  counter: id,
  targets,
});

export const ACHIEVEMENTS: Definition[] = [
  goal("first_chapter", "Footloose", "Finish your first game.", "shoe-prints"),
  goal("first_victory", "Foot in the Door", "Win your first game.", "key"),
  milestone("games", "Table Regular", "Finish games", "mug-hot", [10, 50, 200]),
  milestone("wins", "Best Foot Forward", "Win games", "trophy", [5, 25, 100]),
  milestone(
    "clean_books",
    "Clean Collector",
    "Have your side keep clean books after scoring",
    "gem",
    [10, 50, 200],
  ),
  milestone(
    "dirty_books",
    "Wild at Heart",
    "Have your side keep dirty books after scoring",
    "heart",
    [10, 50, 200],
  ),
  milestone(
    "going_out",
    "Closing Time",
    "Have your side go out",
    "key",
    [10, 50, 200],
  ),
  milestone(
    "red_threes",
    "Seeing Red",
    "Keep bonus-scoring red threes on your side",
    "diamond",
    [10, 50, 200],
  ),
  goal(
    "straight_ahead",
    "Straight Ahead",
    "Have your side keep a completed run after scoring.",
    "rocket",
  ),
  goal(
    "matched_set",
    "Matched Set",
    "Keep a clean book and a dirty book in the same round.",
    "yin-yang",
  ),
  goal(
    "big_hand",
    "Big Hand",
    "Have your side score at least 3,000 points in one round.",
    "bolt",
  ),
  goal("team_spirit", "Better Together", "Win a partnership game.", "heart"),
  goal("own_two_feet", "On My Own", "Win an individual game.", "user-ninja"),
  goal("good_company", "Good Company", "Finish a multiplayer game.", "cards"),
  goal(
    "sole_survivor",
    "Sole Survivor",
    "Be the only player or team to reach a foot pile before the round ends.",
    "shield",
  ),
  goal(
    "a_leg_up",
    "A Leg Up",
    "Be the first player in the game to pick up your foot pile.",
    "stairs",
  ),
  secret(
    "caught_red_handed",
    "Caught Red-Handed",
    "Have a red three left in your hand or foot when the round ends.",
    "hand",
  ),
  secret(
    "triple_threat",
    "Three's Company",
    "Keep at least three bonus-scoring red threes in one round.",
    "clover",
  ),
  secret(
    "seeing_red",
    "Scarlet Fever",
    "Keep at least six bonus-scoring red threes in one round.",
    "fire",
  ),
  secret(
    "clean_sweep",
    "Cover to Cover",
    "Win a game with your side scoring strictly highest in every round.",
    "paintbrush-fine",
  ),
  secret(
    "comeback",
    "Plot Twist",
    "Win after your side trailed by at least 2,000 points between rounds.",
    "wand-magic-sparkles",
  ),
  secret(
    "photo_finish",
    "Photo Finish",
    "Win outright by 100 points or fewer.",
    "feather",
  ),
  secret(
    "overachiever",
    "Extra Credit",
    "Win with a score at least 2,000 above the table's target.",
    "star",
  ),
  secret(
    "handle_with_care",
    "Mint Condition",
    "Keep at least three books without breaking any during scoring.",
    "shield",
  ),
  secret("hot_streak", "Hot Streak", "Win five games in a row.", "fire"),
  secret(
    "private_library",
    "Well Read",
    "Keep at least five clean or dirty books in one round.",
    "book-open",
  ),
  secret(
    "balancing_act",
    "Balancing the Books",
    "Keep at least two clean books and two dirty books in one round.",
    "yin-yang",
  ),
  secret(
    "long_story",
    "The Long Haul",
    "Finish a game that lasts at least ten rounds.",
    "hourglass",
  ),
  secret(
    "full_house",
    "Standing Room Only",
    "Finish multiplayer with at least four human players still at the table.",
    "cards",
  ),
  secret(
    "scenic_route",
    "The Scenic Route",
    "Keep two completed runs in a single round.",
    "mountain-sun",
  ),
  secret(
    "better_with_friends",
    "Better with Friends",
    "Finish a multiplayer game with at least two human players still at the table.",
    "cards",
  ),
  secret(
    "early_bird",
    "Early Bird",
    "Finish a game that began between 5 and 8 a.m.",
    "sun-bright",
  ),
  secret(
    "night_owl",
    "Night Owl",
    "Finish a game that began between midnight and 5 a.m.",
    "owl",
  ),
  {
    ...secret("geezer", "Locked in", "Turn the music off.", "music-off"),
    flavorText: "Gotta turn the music down to see better",
  },
  secret(
    "new_year",
    "Auld Lang Syne",
    "Play a game on New Year’s Day.",
    "champagne-glasses",
  ),
  secret(
    "lonely_heart",
    "Lonely Heart",
    "Play a game on Valentine’s Day.",
    "heart",
  ),
  secret(
    "lucky_clover",
    "Lucky Clover",
    "Play a game on St. Patrick’s Day.",
    "clover",
  ),
  secret("easter_egg", "Easter Egg", "Play a game on Easter.", "egg"),
  secret(
    "fireworks",
    "Fireworks",
    "Play a game on the 4th of July.",
    "sparkles",
  ),
  secret("spooky", "Spooky", "Play a game on Halloween.", "ghost"),
  secret("thankful", "Thankful", "Play a game on Thanksgiving.", "turkey"),
  secret(
    "christmas_spirit",
    "Christmas Spirit",
    "Play a game on Christmas.",
    "gift",
  ),
];

export function computeAchievements(data: AccountSummary): Achievement[] {
  return ACHIEVEMENTS.map((definition) => {
    if (!definition.targets || !definition.counter)
      return { ...definition, earned: data.unlocks.includes(definition.id) };
    const count = data.counters[definition.counter] ?? 0;
    const tierIndex =
      definition.targets.filter((target) => count >= target).length - 1;
    const next = definition.targets[Math.min(tierIndex + 1, 2)];
    return {
      ...definition,
      earned: tierIndex >= 0,
      tier:
        tierIndex >= 0
          ? (["bronze", "silver", "gold"] as const)[tierIndex]
          : undefined,
      description: `${definition.description}. Bronze: ${definition.targets[0]} · Silver: ${definition.targets[1]} · Gold: ${definition.targets[2]}.`,
      progress:
        tierIndex === 2
          ? `${count.toLocaleString()} · Gold`
          : `${count.toLocaleString()} / ${next} toward ${["bronze", "silver", "gold"][tierIndex + 1]}`,
    };
  });
}
