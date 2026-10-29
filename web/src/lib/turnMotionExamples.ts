import type { Card, Meld, Snapshot, TableEvent } from "../types";
import { INITIAL_OPENING, openingSnapshot } from "./openingSequence";

export type TurnScene = "replacement" | "hand" | "bot" | "draw";
export type TurnExample =
  | "one"
  | "two"
  | "meld"
  | "discard"
  | "new"
  | "add"
  | "close"
  | "offscreen"
  | "mixed";
const suits = ["hearts", "clubs", "diamonds", "spades"];
function face(id: string, rank: string, suit = "clubs"): Card {
  const redThree = rank === "3" && ["hearts", "diamonds"].includes(suit);
  return {
    id,
    rank,
    suit,
    redThree,
    wild: ["2", "Joker"].includes(rank),
    value: redThree
      ? -300
      : rank === "Joker"
        ? 50
        : ["A", "2"].includes(rank)
          ? 20
          : ["4", "5", "6", "7", "8"].includes(rank)
            ? 5
            : 10,
  };
}
function pile(
  id: string,
  rank: string,
  count: number,
  creator: string,
  dirty = false,
): Meld {
  return {
    id,
    rank,
    creator,
    kind: "set",
    dirty,
    complete: count >= 7,
    bonus: count >= 7 ? (dirty ? 300 : 500) : 0,
    cards: Array.from({ length: count }, (_, i) =>
      face(
        `${id}-${i}`,
        dirty && i >= 4 ? (i === 6 ? "Joker" : "2") : rank,
        suits[i % 4],
      ),
    ),
  };
}
export function turnMotionExample(
  scene: TurnScene,
  example: TurnExample,
  played: boolean,
  replay = 0,
  covered = false,
): Snapshot {
  const base = openingSnapshot({
    state: { ...INITIAL_OPENING, step: 7, choice: 0 },
    names: ["You", "Poppy", "Hazel", "Jasper", "Sunny", "Clover"],
    mode: "individual",
    dealer: 3,
    duration: 2200,
  });
  const owner = base.viewerId,
    bot = base.players[1].id;
  const redCount = example === "two" ? 2 : 1;
  const hand =
    scene === "draw"
      ? Array.from({ length: 32 }, (_, i) =>
          face(
            `wide-hand-${i}`,
            ["K", "Q", "J", "10", "9", "8"][i % 6],
            suits[i % 4],
          ),
        )
      : [
          face("hand-joker", "Joker", "joker"),
          ...Array.from({ length: scene === "replacement" ? 1 : 3 }, (_, i) =>
            face(`hand-ace-${i}`, "A", suits[i]),
          ),
          ...["K", "Q", "J", "10", "8", "6", "4", "2"].map((rank, i) =>
            face(`hand-${rank}`, rank, suits[i % 4]),
          ),
          ...(scene === "replacement"
            ? Array.from({ length: redCount }, (_, i) =>
                face(`replace-red-${i}`, "3", i ? "diamonds" : "hearts"),
              )
            : []),
        ];
  const outgoing =
    scene === "replacement"
      ? hand.filter((card) => card.redThree)
      : scene === "hand"
        ? hand.filter((card) =>
            example === "discard" ? card.rank === "10" : card.rank === "A",
          )
        : [];
  const afterHand =
    scene === "bot" || !played
      ? hand
      : hand.filter((card) => !outgoing.some((old) => old.id === card.id));
  if (played && scene === "replacement")
    afterHand.push(
      ...Array.from({ length: redCount }, (_, i) =>
        face(`replacement-${i}`, i ? "9" : "A", i ? "hearts" : "spades"),
      ),
    );
  if (played && scene === "draw")
    afterHand.push(
      face(
        "wide-draw-0",
        example === "mixed" ? "Joker" : "5",
        example === "mixed" ? "joker" : "spades",
      ),
      face("wide-draw-1", "4", "hearts"),
    );
  const cover = hand.find((card) => card.rank === "10")!;
  if (covered && played && scene === "replacement")
    afterHand.splice(
      afterHand.findIndex((card) => card.id === cover.id),
      1,
    );
  const ownMelds = [
    pile("your-kings", "K", 7, owner),
    pile("your-queens", "Q", 7, owner, true),
    pile("your-nines", "9", 3, owner),
    pile("your-eights", "8", 4, owner),
  ];
  if (played && scene === "hand" && example === "meld")
    ownMelds.push({ ...pile("played-aces", "A", 3, owner), cards: outgoing });
  const botMelds = [
    pile("bot-aces", "A", 7, bot),
    pile("bot-queens", "Q", 7, bot, true),
    pile("bot-kings", "K", example === "close" ? 6 : 3, bot),
    pile("bot-eights", "8", 3, bot),
  ];
  if (played && scene === "bot") {
    if (example === "new") botMelds.push(pile("bot-new-jacks", "J", 3, bot));
    else {
      const kings = botMelds.find((meld) => meld.id === "bot-kings")!;
      kings.cards.push(face("bot-added-king", "K", "diamonds"));
      kings.complete = kings.cards.length >= 7;
      kings.bonus = kings.complete ? 500 : 0;
    }
  }
  const replaced = scene === "replacement" && played;
  const discarding =
    (scene === "hand" && example === "discard" && played) ||
    (replaced && covered);
  const discarded = scene === "replacement" ? cover : outgoing[0];
  const events: TableEvent[] = replaced
    ? [
        ...outgoing.map((card, i) => ({
          id: `preview-replace-${replay}-${i}`,
          playerId: owner,
          kind: "replace" as const,
          count: 1,
          card,
          faceDown: false,
        })),
        {
          id: `preview-draw-${replay}`,
          playerId: owner,
          kind: "draw",
          count: redCount,
          card: null,
          faceDown: false,
        },
      ]
    : [];
  if (discarding)
    events.push({
      id: `preview-discard-${replay}`,
      playerId: owner,
      kind: "discard",
      count: 1,
      card: discarded,
      faceDown: false,
    });
  const message =
    scene === "draw"
      ? played
        ? example === "mixed"
          ? "One draw is visible, so your scroll position stays put."
          : "Both draws come into view with room at the edge. If they cannot fit together, the higher card takes priority."
        : "Draw two cards into a hand wider than the screen."
      : scene === "replacement"
        ? played
          ? covered
            ? "Your final discard covers the red three and ends your turn."
            : "The red three stays on the discard pile. Keep playing, then discard over it to end your turn."
          : "Put the outlined red three on the discard pile and draw its replacement."
        : scene === "hand"
          ? played
            ? example === "discard"
              ? "The discard leaves. Your remaining cards slide together."
              : "Three aces land in their meld. Your remaining hand settles."
            : example === "discard"
              ? "Discard the outlined ten and watch the hand close the gap."
              : "Play the three outlined aces and watch your hand settle."
          : played
            ? example === "close"
              ? "Poppy’s final king lands, then the book closes and moves up."
              : example === "add"
                ? "Poppy adds a king to the open pile."
                : "Poppy’s three jacks arrive in a new meld."
            : "Follow Poppy’s board to watch the next play.";
  return {
    ...base,
    code: `TURN-MOTION-${scene}-${example}-${replay}`,
    revision: covered ? 3 : played ? 2 : 1,
    token: `motion-${replay}-${played}-${covered}`,
    phase: discarding || (scene === "draw" && !played) ? "draw" : "play",
    actorId: scene === "bot" || discarding ? bot : owner,
    hand: afterHand,
    stockCount: 245 - (played && scene === "replacement" ? redCount : 0),
    discard: discarding
      ? discarded
      : replaced
        ? outgoing.at(-1)!
        : base.discard,
    discardCount: 1 + (replaced ? redCount : 0) + Number(discarding),
    tableEvents: events,
    opening: { id: `turn-motion-${replay}`, ready: [owner], complete: true },
    message,
    players: base.players.map((player) => ({
      ...player,
      handCount:
        player.id === owner
          ? afterHand.length
          : player.id === bot
            ? 9 - (played && scene === "bot" ? (example === "new" ? 3 : 1) : 0)
            : 8,
      footCount: 11,
      inFoot: false,
      redThrees: [],
    })),
    sides: base.sides.map((side) => {
      const melds = side.id === 0 ? ownMelds : side.id === 1 ? botMelds : [];
      return {
        ...side,
        opened: true,
        score: [2850, 3260, 1940, 2675, 2180, 3020][side.id],
        melds,
        clean: melds.filter((meld) => meld.complete && !meld.dirty).length,
        dirty: melds.filter((meld) => meld.complete && meld.dirty).length,
      };
    }),
  };
}
