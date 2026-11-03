// Approved card-back collection.
import { asset } from "./assets";
import type { Player } from "../types";

export const DEFAULT_CARD_BACK = "single-leaves";
export const CARD_BACKS = [
  {
    id: "single-leaves",
    name: "Single leaves",
  },
  {
    id: "royal-fan",
    name: "Royal fan",
  },
  {
    id: "heart-locket",
    name: "Heart locket",
  },
  {
    id: "diamond-cut",
    name: "Diamond cut",
  },
  {
    id: "suit-ribbon",
    name: "Suit ribbon",
  },
  {
    id: "the-cut",
    name: "The cut",
  },
  {
    id: "trump-crest",
    name: "Royal crest",
  },
  {
    id: "jokers-bells",
    name: "Joker’s bells",
  },
  {
    id: "house-chip",
    name: "House chip",
  },
  {
    id: "roulette-rose",
    name: "Roulette rose",
  },
  {
    id: "club-lounge",
    name: "Club lounge",
  },
  {
    id: "open-book",
    name: "Open book",
  },
  {
    id: "page-rosette",
    name: "Page rosette",
  },
  {
    id: "seven-card-book",
    name: "Seven-card book",
  },
  {
    id: "grand-folio",
    name: "Grand folio",
  },
  {
    id: "concertina",
    name: "Concertina",
  },
  {
    id: "between-bookends",
    name: "Between bookends",
  },
  {
    id: "midnight-reader",
    name: "Midnight reader",
  },
  {
    id: "by-candlelight",
    name: "By candlelight",
  },
  {
    id: "paper-heart",
    name: "Paper heart",
  },
  {
    id: "literary-butterfly",
    name: "Butterfly",
  },
  {
    id: "story-tree",
    name: "Story tree",
  },
  {
    id: "pressed-pages",
    name: "Pressed pages",
  },
  {
    id: "chapter-seal",
    name: "Chapter seal",
  },
  {
    id: "page-compass",
    name: "Page compass",
  },
  {
    id: "leaf-pair",
    name: "Leaf pair",
  },
  {
    id: "fern-sprig",
    name: "Fern sprig",
  },
  {
    id: "ginkgo",
    name: "Ginkgo",
  },
  {
    id: "laurel-seal",
    name: "Laurel seal",
  },
  {
    id: "acorn",
    name: "Acorn",
  },
  {
    id: "jasmine",
    name: "Jasmine",
  },
  {
    id: "lotus",
    name: "Lotus",
  },
  {
    id: "celestial-seal",
    name: "Celestial seal",
  },
  {
    id: "north-star",
    name: "North star",
  },
  {
    id: "compass",
    name: "Compass",
  },
] as const;
export type CardBackId = (typeof CARD_BACKS)[number]["id"];
export const SELECTABLE_CARD_BACKS = CARD_BACKS;
export function normalizeCardBack(value: unknown): CardBackId {
  return CARD_BACKS.some((back) => back.id === value)
    ? (value as CardBackId)
    : DEFAULT_CARD_BACK;
}
export function playerCardBack(player?: Player): CardBackId | undefined {
  // Bots inherit the viewer's selection rather than owning a design.
  return player?.bot ? undefined : normalizeCardBack(player?.cardBack);
}
export function cardBackAsset(
  value: unknown,
  theme: "light" | "dark",
  small = false,
) {
  const id = normalizeCardBack(value);
  return asset(
    id === DEFAULT_CARD_BACK
      ? `cards/card-back-${theme}${small ? "-mini" : ""}.svg`
      : `cards/backs/${id}-${theme}.svg`,
  );
}
