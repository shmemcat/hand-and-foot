import {
  useEffect,
  useLayoutEffect,
  useReducer,
  useState,
  type ReactNode,
} from "react";
import { Room } from "./Room";
import {
  INITIAL_OPENING,
  OPENING_BEATS,
  openingReducer,
  openingSnapshot,
  samplePiles,
} from "../lib/openingSequence";
import { OpeningMotion } from "../components/OpeningMotion";
import { FOOT_CARDS } from "../lib/footSequence";
import {
  SCORING_SCENARIOS,
  scoringSequence,
  scoringSnapshot,
} from "../lib/scoringSequence";
import type { Card, Draft, Meld, Snapshot } from "../types";

const faces = [
  ["A", "hearts"],
  ["A", "spades"],
  ["A", "diamonds"],
  ["K", "hearts"],
  ["K", "clubs"],
  ["Q", "hearts"],
  ["Q", "diamonds"],
  ["J", "clubs"],
  ["J", "spades"],
  ["10", "hearts"],
  ["10", "clubs"],
  ["9", "clubs"],
  ["9", "hearts"],
  ["8", "spades"],
  ["7", "hearts"],
  ["7", "clubs"],
  ["7", "diamonds"],
  ["6", "hearts"],
  ["6", "spades"],
  ["5", "clubs"],
  ["4", "diamonds"],
  ["4", "clubs"],
  ["2", "spades"],
  ["Joker", "joker"],
];
function face(id: string, rank: string, suit: string): Card {
  return {
    id,
    rank,
    suit,
    value:
      rank === "Joker"
        ? 50
        : ["A", "2"].includes(rank)
          ? 20
          : ["4", "5", "6", "7", "8"].includes(rank)
            ? 5
            : 10,
    wild: ["2", "Joker"].includes(rank),
    redThree: false,
  };
}
export function mobilePreviewSnapshot(
  count = 24,
  partnership = false,
): Snapshot {
  const base = openingSnapshot({
    state: { ...INITIAL_OPENING, step: 7, choice: 0 },
    names: ["You", "Maya", "Ben", "June", "Sam", "Alex"],
    mode: partnership ? "partnership" : "individual",
    dealer: 5,
    duration: 2200,
  });
  const ranks = ["A", "7", "K", "Q", "J", "10", "9", "8", "6", "4"];
  const hand = Array.from({ length: count }, (_, i) =>
    face(`mobile-hand-${i}`, ...(faces[i % faces.length] as [string, string])),
  );
  return {
    ...base,
    code: "MOBILE-PREVIEW",
    token: `mobile-${count}-${partnership}`,
    phase: "play",
    round: 3,
    opening: {
      id: "mobile-preview",
      ready: base.players.map((p) => p.id),
      complete: true,
    },
    actorId: base.viewerId,
    hand,
    stockCount: 168,
    discardCount: 23,
    discard: face("mobile-discard", "K", "diamonds"),
    message: "Your turn. Build your melds, then discard to finish.",
    players: base.players.map((p, i) => ({
      ...p,
      handCount: i === 0 ? count : 11,
    })),
    sides: base.sides.map((side, team) => {
      const creator = base.players.find((p) => p.team === team)!.id;
      const melds: Meld[] = [...ranks, ...ranks.slice(0, 8)].map((rank, i) => {
        const complete = i >= 10,
          dirty = i % 3 === 2;
        const length = complete ? 7 : [5, 4, 4, 3, 5, 6, 4, 3, 5, 3][i];
        return {
          id: `mobile-${team}-meld-${i}`,
          creator,
          rank,
          kind: "set",
          complete,
          dirty,
          bonus: complete ? (dirty ? 300 : 500) : 0,
          cards: Array.from({ length }, (_, j) =>
            face(
              `mobile-${team}-meld-${i}-card-${j}`,
              dirty && j === 0 ? "2" : rank,
              ["hearts", "spades", "diamonds", "clubs"][j % 4],
            ),
          ),
        };
      });
      return {
        ...side,
        score: [3240, 3010, 2480, 2260, 1940, 1860][team],
        opened: true,
        opening: 90,
        clean: melds.filter((m) => m.complete && !m.dirty).length,
        dirty: melds.filter((m) => m.complete && m.dirty).length,
        melds,
      };
    }),
  };
}

/** Local sample actions use the live Room and its normal confirmed-card motions. */
export function MobilePreview({
  count = 24,
  partnership = false,
  scene: initialScene = "play",
}: {
  count?: number;
  partnership?: boolean;
  scene?: "play" | "opening" | "counting" | "foot" | "book";
}) {
  const [scene, setScene] = useState(initialScene);
  const [replay, setReplay] = useState(0);
  useLayoutEffect(() => setScene(initialScene), [initialScene]);
  const controls = (
    <div className="mobile-preview-scenes">
      <h3>Preview animations</h3>
      {(
        [
          ["play", "Draw, meld & discard"],
          ["foot", "Pick up foot"],
          ["book", "Complete a book"],
          ["opening", "Replay opening"],
          ["counting", "Replay counting"],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          className="text-button"
          onClick={(event) => {
            const menu = event.currentTarget.closest("details");
            if (menu) menu.open = false;
            setScene(id);
            setReplay((value) => value + 1);
          }}
        >
          {label}
        </button>
      ))}
      <hr />
    </div>
  );
  const key = `${scene}:${count}:${partnership}:${replay}`;
  return scene === "opening" ? (
    <MobileOpening key={key} partnership={partnership} controls={controls} />
  ) : scene === "counting" ? (
    <MobileCounting key={key} controls={controls} />
  ) : (
    <MobilePlaying
      key={key}
      count={count}
      partnership={partnership}
      controls={controls}
      footEntry={scene === "foot"}
      bookEntry={scene === "book"}
    />
  );
}

function MobilePlaying({
  count,
  partnership,
  controls,
  footEntry = false,
  bookEntry = false,
}: {
  count: number;
  partnership: boolean;
  controls: ReactNode;
  footEntry?: boolean;
  bookEntry?: boolean;
}) {
  const [snapshot, setSnapshot] = useState(() => ({
    ...mobilePreviewSnapshot(
      footEntry ? 1 : bookEntry ? 3 : count,
      partnership,
    ),
    ...(footEntry
      ? { hand: [face("mobile-last-hand-card", "K", "clubs")] }
      : {}),
    ...(bookEntry
      ? {
          hand: [
            face("mobile-book-ace-1", "A", "hearts"),
            face("mobile-book-ace-2", "A", "spades"),
            face("mobile-book-king", "K", "clubs"),
          ],
        }
      : {}),
    phase: (footEntry || bookEntry ? "play" : "draw") as Snapshot["phase"],
  }));
  const draw = () =>
    setSnapshot((old) => {
      const hand = [
        ...old.hand,
        face(`mobile-drawn-nine-${old.revision}`, "9", "hearts"),
        face(`mobile-drawn-king-${old.revision}`, "K", "clubs"),
      ];
      return {
        ...old,
        hand,
        phase: "play",
        revision: old.revision + 1,
        token: `${old.token}:draw`,
        stockCount: old.stockCount - 2,
        players: old.players.map((p) =>
          p.id === old.viewerId ? { ...p, handCount: hand.length } : p,
        ),
      };
    });
  const command = (type: string, payload: Record<string, unknown>) =>
    setSnapshot((old) => {
      const next = structuredClone(old);
      const owner = next.players.find((player) => player.id === next.viewerId)!;
      const side = next.sides.find((item) => item.id === owner.team)!;
      if (type === "meld" || type === "pickup") {
        for (const [index, group] of (
          (payload.groups ?? []) as Draft[]
        ).entries()) {
          const cards = next.hand.filter((card) =>
            group.cardIds.includes(card.id),
          );
          if (
            type === "pickup" &&
            next.discard &&
            group.cardIds.includes(next.discard.id)
          )
            cards.push(next.discard);
          if (group.redThree) owner.redThrees.push(...cards);
          else {
            let meld = side.melds.find((item) => item.id === group.meldId);
            if (!meld)
              side.melds.push(
                (meld = {
                  id: `mobile-new-${next.revision}-${index}`,
                  creator: owner.id,
                  rank: cards.find((card) => !card.wild)?.rank ?? "2",
                  kind: group.kind ?? "set",
                  cards: [],
                  complete: false,
                  dirty: false,
                  bonus: 0,
                }),
              );
            meld.cards.push(...cards);
            meld.dirty = meld.cards.some(
              (card) => card.wild && card.rank !== meld!.rank,
            );
            meld.complete = meld.cards.length >= 7;
            meld.bonus = meld.complete ? (meld.dirty ? 300 : 500) : 0;
          }
          next.hand = next.hand.filter(
            (card) => !group.cardIds.includes(card.id),
          );
        }
        if (type === "pickup") {
          next.discard = null;
          next.discardCount = 0;
          next.phase = "play";
        }
      } else if (type === "discard") {
        const card = next.hand.find((item) => item.id === payload.cardId);
        if (!card) return old;
        next.hand = next.hand.filter((item) => item.id !== card.id);
        next.discard = card;
        next.discardCount++;
        next.discardFaceDown = false;
        next.tableEvents = [
          {
            id: `mobile-discard-${next.revision}`,
            playerId: owner.id,
            kind: "discard",
            count: 1,
            card,
            faceDown: false,
          },
        ];
        next.phase = "draw";
      } else return old;
      if (!next.hand.length && !owner.inFoot && owner.footCount) {
        next.hand = structuredClone(FOOT_CARDS);
        next.footTop = null;
        owner.inFoot = true;
        owner.footCount = 0;
        owner.footTop = null;
        if (type === "discard") next.actorId = next.players[1].id;
      }
      owner.handCount = next.hand.length;
      side.clean = side.melds.filter(
        (meld) => meld.complete && !meld.dirty,
      ).length;
      side.dirty = side.melds.filter(
        (meld) => meld.complete && meld.dirty,
      ).length;
      next.revision++;
      next.token = `${next.token}:${type}:${next.revision}`;
      return next;
    });
  return (
    <Room
      rehearsal={{
        snapshot,
        onChoose: () => {},
        onDraw: draw,
        onCommand: command,
        previewControls: controls,
        footAnimate: true,
      }}
    />
  );
}

function MobileOpening({
  partnership,
  controls,
}: {
  partnership: boolean;
  controls: ReactNode;
}) {
  const [state, dispatch] = useReducer(openingReducer, {
    ...INITIAL_OPENING,
    playing: true,
    continuous: true,
  });
  const duration = OPENING_BEATS[state.step].duration;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  useEffect(() => {
    if (!state.playing || state.step === 4) return;
    const timer = window.setInterval(() => {
      if (!document.hidden)
        dispatch({ type: "tick", delta: reduced ? 250 : 50, duration });
    }, 50);
    return () => clearInterval(timer);
  }, [state.step, state.playing, reduced, duration]);
  const snapshot = openingSnapshot({
    state,
    names: ["You", "Maya", "Ben", "June", "Sam", "Alex"],
    mode: partnership ? "partnership" : "individual",
    dealer: 5,
    duration,
    dealStyle: "sweeps",
  });
  return (
    <OpeningMotion
      state={state}
      snapshot={snapshot}
      duration={duration}
      speed={1}
      reduced={reduced}
      onChoose={(pile) => dispatch({ type: "choose", pile })}
      dealStyle="sweeps"
      piles={samplePiles().map((pile) => [pile[0], pile[10]])}
    >
      {(presentation) => (
        <Room
          rehearsal={{ ...presentation, snapshot, previewControls: controls }}
        />
      )}
    </OpeningMotion>
  );
}

export function mobileCountingSnapshot(): Snapshot {
  const scenario = SCORING_SCENARIOS[0];
  const usedPiles = [
    ...scenario.melds.filter((meld) => !meld.complete),
    ...scenario.melds.filter((meld) => meld.complete),
  ].map((meld) => meld.id);
  usedPiles.push("reds:0");
  const beats = scoringSequence(scenario, {
    pileIds: usedPiles,
    complete: true,
    qualified: true,
  });
  const total = beats.at(-1)!;
  return {
    ...scoringSnapshot(scenario, beats[0], 0),
    scoringFoot: scenario.foot,
    scoring: {
      team: 0,
      debt: beats[0].remaining,
      remaining: 0,
      canceled: [],
      usedPiles,
      broken: total.broken,
      confirmed: false,
      revision: 0,
      reason: scenario.reason,
      confirmedSides: [],
      debtBreakdown: [],
      redThreeQualified: true,
      options: [],
      score: {
        team: 0,
        cards: total.cardValue,
        debt: beats[0].remaining,
        redThrees: scenario.reds.length * 300,
        redCredit: 0,
        books: scenario.melds
          .filter((meld) => meld.complete && !total.broken.includes(meld.id))
          .reduce((sum, meld) => sum + meld.bonus, 0),
        goingOut: scenario.goingOut,
        total: total.base + total.cardValue,
        canceled: [],
        lostBooks: total.broken.length,
        broken: total.broken,
        uncovered: total.uncovered,
      },
    },
  };
}
function MobileCounting({ controls }: { controls: ReactNode }) {
  const [snapshot, setSnapshot] = useState(mobileCountingSnapshot);
  return (
    <Room
      rehearsal={{
        snapshot,
        onChoose: () => {},
        liveScoring: true,
        previewControls: controls,
        onCommand: (type) => {
          if (type === "score_confirm")
            setSnapshot((old) => {
              const review = old.scoring!;
              return {
                ...old,
                revision: old.revision + 1,
                phase: "round_over",
                scoring: null,
                sides: old.sides.map((side) => ({
                  ...side,
                  score:
                    side.score +
                    (side.id === review.team ? review.score.total : 0),
                })),
                history: [
                  ...old.history,
                  {
                    round: old.round,
                    reason: review.reason,
                    scores: old.sides.map((side) =>
                      side.id === review.team
                        ? review.score
                        : {
                            team: side.id,
                            cards: 0,
                            debt: 0,
                            redThrees: 0,
                            redCredit: 0,
                            books: 0,
                            goingOut: 0,
                            total: 0,
                            canceled: [],
                            lostBooks: 0,
                            broken: [],
                            uncovered: 0,
                          },
                    ),
                  },
                ],
              };
            });
        },
      }}
    />
  );
}
