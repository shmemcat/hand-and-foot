import type { Score, Snapshot } from "../types";
import { INITIAL_OPENING, openingSnapshot } from "./openingSequence";

export type EndingExample = {
  id: string;
  label: string;
  description: string;
  phase: "round_over" | "finished";
  players?: number;
  partners?: boolean;
  online?: boolean;
  waiting?: boolean;
  exhausted?: boolean;
  winners?: number[];
  firstRound?: boolean;
  guest?: boolean;
};

export const ENDING_EXAMPLES: EndingExample[] = [
  {
    id: "round",
    label: "Round complete",
    description: "Two players · against bots · first round",
    phase: "round_over",
    firstRound: true,
  },
  {
    id: "game-win",
    label: "You win",
    description: "Two players · against bots · target reached",
    phase: "finished",
    winners: [0],
  },
  {
    id: "round-deck",
    label: "Deck exhausted",
    description:
      "Three players · negative score, broken book & red-three credit",
    phase: "round_over",
    players: 3,
    exhausted: true,
  },
  {
    id: "round-partners",
    label: "Partnership round",
    description: "Four players · two teams · multiplayer",
    phase: "round_over",
    players: 4,
    partners: true,
    online: true,
  },
  {
    id: "round-six",
    label: "Six individual players",
    description: "Six score cards · multiplayer",
    phase: "round_over",
    players: 6,
    online: true,
  },
  {
    id: "round-three-teams",
    label: "Three partnerships",
    description: "Six players · three teams · multiplayer",
    phase: "round_over",
    players: 6,
    partners: true,
    online: true,
  },
  {
    id: "round-waiting",
    label: "Ready for the next round",
    description: "Your readiness is confirmed · waiting for other players",
    phase: "round_over",
    players: 4,
    online: true,
    waiting: true,
  },
  {
    id: "game-loss",
    label: "Another player wins",
    description: "Two players · against bots · opponent wins",
    phase: "finished",
    winners: [1],
  },
  {
    id: "game-tie",
    label: "Shared win",
    description: "Three players · equal highest totals · multiplayer",
    phase: "finished",
    players: 3,
    online: true,
    winners: [0, 1],
  },
  {
    id: "game-partners",
    label: "Your partnership wins",
    description: "Four players · winning team · multiplayer",
    phase: "finished",
    players: 4,
    partners: true,
    online: true,
    winners: [0],
  },
  {
    id: "game-six",
    label: "Six-player final scores",
    description: "Six individual players · another player wins",
    phase: "finished",
    players: 6,
    online: true,
    winners: [2],
  },
  {
    id: "game-three-teams",
    label: "Three-team final scores",
    description: "Six players · another partnership wins",
    phase: "finished",
    players: 6,
    partners: true,
    online: true,
    winners: [1],
  },
  {
    id: "game-team-tie",
    label: "Partnerships share the win",
    description: "Six players · two teams tied for first",
    phase: "finished",
    players: 6,
    partners: true,
    online: true,
    winners: [0, 1],
  },
  {
    id: "game-waiting",
    label: "Waiting for host",
    description: "Four players · only the host can start a new game",
    phase: "finished",
    players: 4,
    partners: true,
    online: true,
    guest: true,
    winners: [0],
  },
];

function sampleScore(team: number, round: number, exhausted: boolean): Score {
  const penalty = exhausted && team === 0;
  const cards = penalty ? 160 : 495 + team * 65 + round * 10;
  const debt = penalty ? 495 : team === 0 ? 0 : 70 + team * 25;
  const books = penalty ? 0 : team === 0 ? 1300 : 800;
  const redThrees = penalty ? -600 : team === 0 ? 400 : 0;
  const redCredit = penalty ? 5 : 0;
  const goingOut = !exhausted && team === 0 ? 100 : 0;
  return {
    team,
    cards,
    debt,
    books,
    redThrees,
    redCredit,
    goingOut,
    total: cards - debt + books + redThrees + redCredit + goingOut,
    canceled: [],
    lostBooks: penalty ? 1 : 0,
    broken: penalty ? ["sample-broken-book"] : [],
    uncovered: penalty ? 330 : 0,
  };
}

export function endingSnapshot(example: EndingExample): Snapshot {
  const names = [
    "You",
    "Poppy",
    "Jasper",
    "Clementine",
    "Theo",
    "Marigold",
  ].slice(0, example.players ?? 2);
  const snapshot = openingSnapshot({
    state: { ...INITIAL_OPENING, step: 7 },
    names,
    mode: example.partners ? "partnership" : "individual",
    dealer: 0,
    duration: 0,
  });
  const round = example.firstRound ? 1 : example.phase === "finished" ? 5 : 3;
  const history = Array.from({ length: round }, (_, index) => ({
    round: index + 1,
    reason:
      example.exhausted && index === round - 1
        ? "The draw stack is exhausted. The round is over."
        : "You went out first.",
    scores: snapshot.sides.map((side) =>
      sampleScore(
        side.id,
        index + 1,
        Boolean(example.exhausted && index === round - 1),
      ),
    ),
  }));
  if (example.phase === "finished") {
    // Make the declared result consistent with the full round history.
    for (const side of snapshot.sides) {
      const target = example.winners?.includes(side.id)
        ? 10525
        : 7900 - side.id * 325;
      const before = target - history.at(-1)!.scores[side.id].total;
      const typical = Math.floor(before / (round - 1) / 5) * 5;
      history.slice(0, -1).forEach((result, index) => {
        const score = result.scores[side.id];
        score.total =
          index === round - 2 ? before - typical * (round - 2) : typical;
        score.books = 800;
        score.redThrees = 0;
        score.goingOut = 0;
        score.cards = score.total + score.debt - score.books;
      });
    }
  }
  return {
    ...snapshot,
    code: `ENDING-${example.id}`,
    hostId: example.guest ? snapshot.players[1].id : snapshot.hostId,
    phase: example.phase,
    round,
    playMode: example.online ? "online" : "practice",
    players: snapshot.players.map((player, index) => ({
      ...player,
      bot: !example.online && index !== 0,
      inFoot: true,
      handCount: index === 0 ? 0 : 3 + index,
      footCount: 0,
      ready:
        Boolean(example.waiting && index === 0) ||
        Boolean(example.online && index === 1),
    })),
    sides: snapshot.sides.map((side) => ({
      ...side,
      score: history.reduce(
        (sum, result) => sum + result.scores[side.id].total,
        0,
      ),
      opened: true,
    })),
    actorId: null,
    hand: [],
    footPreview: null,
    footTop: null,
    history,
    winners: example.winners ?? [],
    stockCount: example.exhausted ? 0 : 76,
    message: history.at(-1)!.reason,
  };
}
