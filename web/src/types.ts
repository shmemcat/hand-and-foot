export type Card = {
  id: string;
  rank: string;
  suit: string;
  value: number;
  wild: boolean;
  redThree: boolean;
};
export type Meld = {
  id: string;
  creator: string;
  kind: "set" | "run";
  rank: string;
  cards: Card[];
  complete: boolean;
  dirty: boolean;
  bonus: number;
  bonusLost?: boolean;
  spentCardIds?: string[];
};
export type Player = {
  id: string;
  name: string;
  team: number;
  bot: boolean;
  handCount: number;
  footCount: number;
  inFoot: boolean;
  chosen: boolean;
  redThrees: Card[];
  ready: boolean;
  away: boolean;
};
export type Side = {
  id: number;
  name: string;
  score: number;
  opened: boolean;
  melds: Meld[];
  clean: number;
  dirty: number;
  opening: number;
};
export type Draft = {
  cardIds: string[];
  meldId?: string;
  kind?: "set" | "run";
};
export type Score = {
  team: number;
  cards: number;
  debt: number;
  redThrees: number;
  redCredit: number;
  books: number;
  goingOut: number;
  total: number;
  canceled: string[];
  lostBooks: number;
  broken: string[];
  uncovered: number;
};
export type ScoringReview = {
  debtBreakdown: {
    name: string;
    handCount: number;
    footCount: number;
    handPoints: number;
    footPoints: number;
  }[];
  team: number;
  debt: number;
  remaining: number;
  canceled: string[];
  usedPiles: string[];
  broken: string[];
  confirmed: boolean;
  revision: number;
  reason: string;
  confirmedSides: number[];
  score: Score;
  options: {
    id: string;
    label: string;
    points: number;
    bonusAtRisk: number;
    cardIds: string[];
    redThree: boolean;
  }[];
};
export type RoundResult = { round: number; reason: string; scores: Score[] };
export type Snapshot = {
  code: string;
  revision: number;
  token: string;
  status: "lobby" | "playing";
  capacity: number;
  scoringMode: "individual" | "partnership";
  playMode: "practice" | "online";
  viewerId: string;
  hostId: string;
  players: Player[];
  sides: Side[];
  decks: number;
  drawCount: number;
  round: number;
  targetScore: number;
  phase:
    | "lobby"
    | "choose"
    | "draw"
    | "play"
    | "scoring"
    | "round_over"
    | "finished";
  actorId: string | null;
  hand: Card[];
  footPreview: Card[][] | null;
  discard: Card | null;
  discardCount: number;
  stockCount: number;
  history: RoundResult[];
  winners: number[];
  message: string;
  ruleset: string;
  scoring: ScoringReview | null;
};
