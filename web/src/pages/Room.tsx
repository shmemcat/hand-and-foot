import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { io, type Socket } from "socket.io-client";
import {
  command,
  getRoom,
  request,
  socketCredentials,
  GameApiError,
} from "../lib/api";
import { removeStorage, writeStorage, readStorage } from "../lib/storage";
import { detectMeldKind, isValidMeld, pickupPlayableCards } from "../lib/melds";
import { Card } from "../components/Card";
import { DrawCards } from "../components/DrawCards";
import { MeldCards } from "../components/MeldCards";
import { StartingPiles } from "../components/StartingPiles";
import {
  OpeningMotion,
  type OpeningPresentation,
} from "../components/OpeningMotion";
import { FootPreview } from "../components/FootPreview";
import { MeldPile } from "../components/MeldPile";
import { Book, Icon } from "../components/Icons";
import { PageTitle } from "../components/PageTitle";
import { ScoringReview } from "../components/ScoringReview";
import { GameMenu } from "../components/GameMenu";
import { PlayerBoardNav } from "../components/PlayerBoardNav";
import { PlayDraftButton } from "../components/PlayDraftButton";
import { DrawFirstHint } from "../components/DrawFirstHint";
import { useModalFocus } from "../hooks/useModalFocus";
import { useInactivityNudge } from "../hooks/useInactivityNudge";
import { useHorizontalWheel } from "../hooks/useHorizontalWheel";
import { useGameOpening } from "../hooks/useGameOpening";
import { useDrawMotion } from "../hooks/useDrawMotion";
import { useMeldMotion } from "../hooks/useMeldMotion";
import { useSound } from "../context/SoundContext";
import { useAuth } from "../context/AuthContext";
import type { Card as Face, Draft, Meld, Player, Snapshot } from "../types";

const rankOrder = [
  "Joker",
  "A",
  "K",
  "Q",
  "J",
  "10",
  "9",
  "8",
  "7",
  "6",
  "5",
  "4",
  "3",
  "2",
];
const number = (value: number) => value.toLocaleString();

export type RoomRehearsal = {
  snapshot: Snapshot;
  onChoose: (pile: number) => void;
  animationKey?: number;
  tableau?: ReactNode;
  deckOverlay?: ReactNode;
  setup?: boolean;
  onDraw?: () => void;
  drawReplay?: number;
  drawSpeed?: number;
  drawReview?: { key: string; before: Snapshot };
  meldSpeed?: number;
  meldPaused?: boolean;
  meldAnimate?: boolean;
  onMeldMotion?: (active: boolean) => void;
  draftReview?: {
    selected: string[];
    drafts: Draft[];
    pickup: boolean;
    busy: boolean;
    error: string;
    showOpeningRequirement?: boolean;
    showDrawRequirement?: boolean;
  };
};

export function Room({ rehearsal }: { rehearsal?: RoomRehearsal } = {}) {
  const { code = "" } = useParams();
  const navigate = useNavigate();
  const sound = useSound();
  const { user } = useAuth();
  const [roomSnapshot, setSnapshot] = useState<Snapshot | null>(null);
  const isRehearsal = Boolean(rehearsal);
  const [error, setError] = useState("");
  const [connection, setConnection] = useState<
    "connecting" | "live" | "polling"
  >("connecting");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [pickup, setPickup] = useState(false);
  const discardStagedLabel = useId();
  // Development rehearsals show the same local draft states as a live table.
  useLayoutEffect(() => {
    const review = rehearsal?.draftReview;
    if (!review) return;
    setSelected(review.selected);
    setDrafts(review.drafts);
    setPickup(review.pickup);
    setBusy(review.busy);
    setError(review.error);
  }, [rehearsal?.draftReview]);
  const [follow, setFollow] = useState(true);
  const [viewed, setViewed] = useState(0);
  const [scoresOpen, setScoresOpen] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joinName, setJoinName] = useState(() =>
    readStorage("handandfoot.name.v1", ""),
  );
  const [copied, setCopied] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [swapSeat, setSwapSeat] = useState<string | null>(null);
  const live = useRef(true);
  const currentCode = useRef(code);
  currentCode.current = code;
  const accept = useCallback((incoming: Snapshot) => {
    if (live.current && incoming.code === currentCode.current)
      setSnapshot((old) =>
        old && old.code === incoming.code && old.revision > incoming.revision
          ? old
          : incoming,
      );
  }, []);
  const opening = useGameOpening(isRehearsal ? null : roomSnapshot, accept);
  const incomingSnapshot = rehearsal?.snapshot ?? opening.snapshot;
  const boardRef = useRef<HTMLDivElement>(null);
  const meldMotion = useMeldMotion(
    incomingSnapshot,
    boardRef,
    opening.reduced || rehearsal?.meldAnimate === false,
    rehearsal?.meldSpeed ?? 1,
    rehearsal?.meldPaused ?? false,
  );
  const snapshot = meldMotion.snapshot;
  useEffect(() => {
    rehearsal?.onMeldMotion?.(meldMotion.active);
  }, [meldMotion.active, rehearsal?.onMeldMotion]);
  const drawMotion = useDrawMotion(
    snapshot,
    opening.reduced,
    rehearsal?.drawSpeed ?? 1,
  );
  const lastDrawReplay = useRef(0);
  const lastDrawReview = useRef("");
  useLayoutEffect(() => {
    const review = rehearsal?.drawReview;
    if (review && review.key !== lastDrawReview.current) {
      lastDrawReview.current = review.key;
      drawMotion.cancel();
      drawMotion.begin(
        review.before,
        boardRef.current?.querySelector(".draw-pile .card") ?? null,
      );
    } else if (
      !review &&
      rehearsal?.draftReview &&
      rehearsal.snapshot.phase === "draw"
    ) {
      drawMotion.cancel();
    }
  }, [rehearsal?.drawReview?.key, rehearsal?.snapshot.token]);
  useEffect(() => {
    if (
      !rehearsal?.drawReplay ||
      rehearsal.drawReplay === lastDrawReplay.current ||
      !rehearsal.onDraw
    )
      return;
    lastDrawReplay.current = rehearsal.drawReplay;
    drawMotion.cancel();
    if (
      drawMotion.begin(
        rehearsal.snapshot,
        boardRef.current?.querySelector(".draw-pile .card") ?? null,
      )
    ) {
      rehearsal.onDraw();
      sound.play("deal");
    }
  }, [rehearsal?.drawReplay]);
  const setup =
    rehearsal?.setup ?? Boolean(opening.state && opening.state.step <= 4);
  const handScrollRef = useHorizontalWheel(
    Boolean(snapshot?.hand.length),
    rehearsal?.animationKey ?? opening.state?.replay,
  );
  useModalFocus(
    scoresOpen ||
      leaving ||
      ["scoring", "round_over", "finished"].includes(snapshot?.phase || ""),
    `${snapshot?.phase}:${snapshot?.scoring?.revision}:${leaving}:${scoresOpen}`,
    () => {
      if (leaving) setLeaving(false);
      else if (scoresOpen) setScoresOpen(false);
    },
  );
  const refresh = useCallback(async () => {
    try {
      const incoming = await getRoom(code);
      accept(incoming);
      setJoining(false);
    } catch (error) {
      if (live.current) {
        if (error instanceof GameApiError && error.status === 403) {
          setSnapshot(null);
          setSelected([]);
          setDrafts([]);
        }
        setError(
          error instanceof GameApiError &&
            error.status === 403 &&
            error.message === "Join this table before viewing it."
            ? ""
            : (error as Error).message,
        );
        setJoining(true);
      }
    }
  }, [code, accept]);
  useEffect(() => {
    if (isRehearsal) return;
    live.current = true;
    setSnapshot(null);
    setError("");
    setJoining(false);
    setDrafts([]);
    setSelected([]);
    void refresh();
    const poll = window.setInterval(() => {
      void refresh();
    }, 3000);
    let socket: Socket | undefined;
    let disposed = false;
    void socketCredentials()
      .then((auth) => {
        if (disposed) return;
        socket = io("/hand-and-foot", {
          path: "/hand-and-foot/socket.io",
          auth,
          transports: ["websocket", "polling"],
        });
        socket.on("connect", () => {
          setConnection("live");
          socket?.emit("handandfoot:subscribe", { code });
          void refresh();
        });
        socket.on("disconnect", () => {
          setConnection("polling");
        });
        socket.on("connect_error", () => {
          setConnection("polling");
        });
        socket.on("handandfoot:updated", () => {
          void refresh();
        });
      })
      .catch(() => {
        setConnection("polling");
      });
    return () => {
      disposed = true;
      live.current = false;
      window.clearInterval(poll);
      socket?.disconnect();
    };
  }, [code, refresh, isRehearsal]);
  const viewer = snapshot?.players.find(
    (player) => player.id === snapshot.viewerId,
  );
  const actor = snapshot?.players.find(
    (player) => player.id === snapshot.actorId,
  );
  const dealer = snapshot?.players.find(
    (player) => player.id === snapshot.dealerId,
  );
  const myTurn = Boolean(
    snapshot &&
      (!isRehearsal ||
        Boolean(rehearsal?.draftReview) ||
        Boolean(rehearsal?.onDraw && snapshot.phase === "draw")) &&
      !opening.state &&
      (!roomSnapshot?.opening || roomSnapshot.opening.complete) &&
      viewer &&
      snapshot.actorId === viewer.id &&
      ["draw", "play"].includes(snapshot.phase),
  );
  const nudge = useInactivityNudge(
    !isRehearsal &&
      (!opening.state || opening.state.step === 4) &&
      snapshot?.playMode === "online" &&
      !busy &&
      !drawMotion.active &&
      !joining &&
      !scoresOpen &&
      !leaving &&
      (myTurn ||
        (snapshot?.phase === "choose" && Boolean(viewer && !viewer.chosen))),
    `${code}:${snapshot?.token}`,
  );
  useEffect(() => {
    if (!snapshot) return;
    if (!isRehearsal) writeStorage("handandfoot.room.v1", snapshot.code);
    if (follow && actor && (!isRehearsal || snapshot.phase === "draw"))
      setViewed(actor.team);
  }, [snapshot?.token, snapshot?.actorId, follow]);
  useEffect(() => {
    if (!snapshot || rehearsal?.draftReview) return;
    const available = new Set(snapshot.hand.map((card) => card.id));
    setSelected((old) => old.filter((id) => available.has(id)));
    if (pickup && snapshot.phase === "draw" && snapshot.discard)
      available.add(snapshot.discard.id);
    setDrafts((old) =>
      old.every((group) => group.cardIds.every((id) => available.has(id)))
        ? old
        : [],
    );
  }, [
    snapshot?.hand.map((card) => card.id).join(","),
    snapshot?.discard?.id,
    pickup,
  ]);

  async function act(
    type: string,
    payload: Record<string, unknown> = {},
    clear = true,
  ) {
    if (rehearsal) {
      if (type === "choose" && (payload.pile === 0 || payload.pile === 1))
        rehearsal.onChoose(payload.pile);
      if (
        type === "draw" &&
        rehearsal.onDraw &&
        !drawMotion.active &&
        drawMotion.begin(
          rehearsal.snapshot,
          boardRef.current?.querySelector(".draw-pile .card") ?? null,
        )
      ) {
        rehearsal.onDraw();
        sound.play("deal");
      }
      return;
    }
    if (!roomSnapshot || busy) return;
    if ((drawMotion.active || meldMotion.active) && type !== "leave") return;
    if (
      opening.state &&
      type !== "leave" &&
      (type !== "choose" || opening.state.step !== 4)
    )
      return;
    if (
      type === "draw" &&
      !drawMotion.begin(
        roomSnapshot,
        boardRef.current?.querySelector(".draw-pile .card") ?? null,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      if (type === "meld" || type === "pickup") {
        const player = roomSnapshot.players.find(
          (item) => item.id === roomSnapshot.viewerId,
        );
        if (player) setViewed(player.team);
      }
      if (type === "choose" && (payload.pile === 0 || payload.pile === 1))
        opening.choose(payload.pile);
      const next = await command(roomSnapshot, type, payload);
      if (type === "leave") {
        removeStorage("handandfoot.room.v1");
        navigate("/play");
        return;
      }
      accept(next);
      if (clear) {
        setSelected([]);
        setDrafts([]);
        setPickup(false);
      }
      if (type === "meld" || type === "pickup") sound.play("slide");
      else if (type === "draw" || (type === "choose" && !opening.state))
        sound.play("deal");
      else if (type === "discard") sound.play("select");
    } catch (error) {
      if (type === "draw") drawMotion.cancel();
      setError((error as Error).message);
      void refresh();
    } finally {
      setBusy(false);
    }
  }
  async function join() {
    setBusy(true);
    setError("");
    try {
      accept(
        await request<Snapshot>(`/rooms/${code}/join`, {
          name: user?.name || joinName.trim() || "Guest",
        }),
      );
      setJoining(false);
      if (!user) writeStorage("handandfoot.name.v1", joinName);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function stage(meldId?: string) {
    if (!canStage) return;
    const target = ownSide.melds.find((meld) => meld.id === meldId);
    if (meldId ? !target || !canTargetMeld(target) : !stageKind) return;
    setDrafts((old) => [
      ...old,
      { cardIds: stageIds, ...(meldId ? { meldId } : { kind: stageKind! }) },
    ]);
    setSelected([]);
    setError("");
  }
  const side = snapshot?.sides[viewed] || snapshot?.sides[0];
  function browse(delta: number) {
    if (!snapshot) return;
    meldMotion.cancel();
    setViewed(
      (old) => (old + delta + snapshot.sides.length) % snapshot.sides.length,
    );
    setFollow(false);
  }
  function viewBoard(id: number) {
    meldMotion.cancel();
    setViewed(id);
    setFollow(false);
  }
  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(`Your table code is ${code}. Share it with your friends.`);
    }
  }
  if (!snapshot)
    return (
      <div className="page narrow-page">
        <PageTitle>{joining ? "JOIN GAME" : "GAME"}</PageTitle>
        {joining ? (
          <>
            <p className="page-intro page-body">{code}</p>
            <form
              className="setup-form"
              onSubmit={(e) => {
                e.preventDefault();
                void join();
              }}
            >
              {!user && (
                <label className="placeholder-field">
                  <span className="sr-only">Your name</span>
                  <input
                    value={joinName}
                    maxLength={24}
                    onChange={(e) => setJoinName(e.target.value)}
                    placeholder="Your Name"
                    autoComplete="nickname"
                  />
                </label>
              )}
              <button className="button" disabled={busy}>
                Join Game
              </button>
            </form>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <Link className="text-link" to="/play">
              Back to Play
            </Link>
          </>
        ) : (
          <p className="page-intro page-body" role="status">
            Connecting to your game…
          </p>
        )}
      </div>
    );
  if (snapshot.phase === "lobby")
    return (
      <div className="page lobby-page">
        <PageTitle>LOBBY</PageTitle>
        <button
          className="table-code"
          title="Copy invite link"
          aria-label={`Copy invite link, ${code}`}
          onClick={() => void copyInvite()}
        >
          {code}
          <Icon name={copied ? "check" : "copy"} />
        </button>
        {copied && (
          <p className="muted" role="status">
            Invite link copied.
          </p>
        )}
        <div className="lobby-seats">
          {Array.from({ length: snapshot.capacity }, (_, index) => {
            const player = snapshot.players[index];
            const team =
              snapshot.scoringMode === "partnership"
                ? index % (snapshot.capacity / 2)
                : index;
            return (
              <div className="lobby-seat" key={index}>
                <span className={`avatar team-${team}`}>
                  {player ? player.name[0].toUpperCase() : "+"}
                </span>
                <strong>{player?.name || "Open seat"}</strong>
                <small>
                  {snapshot.scoringMode === "partnership"
                    ? `Team ${team + 1}`
                    : `Seat ${index + 1}`}
                  {player?.id === snapshot.hostId ? " · Host" : ""}
                </small>
                {player &&
                  snapshot.hostId === snapshot.viewerId &&
                  snapshot.players.length > 1 && (
                    <button
                      className={`seat-swap ${swapSeat === player.id ? "selected-seat" : ""}`}
                      aria-pressed={swapSeat === player.id}
                      disabled={busy}
                      onClick={() => {
                        if (swapSeat === player.id) setSwapSeat(null);
                        else if (!swapSeat) setSwapSeat(player.id);
                        else {
                          void act("swap_seats", {
                            firstId: swapSeat,
                            secondId: player.id,
                          });
                          setSwapSeat(null);
                        }
                      }}
                    >
                      {swapSeat === player.id
                        ? "Selected · cancel"
                        : swapSeat
                          ? "Swap here"
                          : "Move seat"}
                    </button>
                  )}
              </div>
            );
          })}
        </div>
        {snapshot.hostId === snapshot.viewerId &&
          snapshot.players.length > 1 &&
          swapSeat && <p className="fine-print">Choose a seat to swap.</p>}
        <p className="fine-print">{snapshot.decks} decks</p>
        {snapshot.hostId === snapshot.viewerId ? (
          <button
            className="button"
            disabled={busy}
            onClick={() => void act("start")}
          >
            {snapshot.players.length < snapshot.capacity
              ? "Add bots & play"
              : "Start Game"}
          </button>
        ) : (
          <p className="status-note">Waiting for host…</p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="text-button" onClick={() => void act("leave")}>
          Leave table
        </button>
      </div>
    );

  const stagedIds = new Set(drafts.flatMap((draft) => draft.cardIds));
  const newMeldCount = drafts.filter((draft) => !draft.meldId).length;
  const addedCardCount = new Set(
    drafts.filter((draft) => draft.meldId).flatMap((draft) => draft.cardIds),
  ).size;
  const draftSummaryLabel = [
    newMeldCount
      ? `${newMeldCount} new meld${newMeldCount === 1 ? "" : "s"}`
      : null,
    addedCardCount
      ? `${addedCardCount} card${addedCardCount === 1 ? "" : "s"} added`
      : null,
  ]
    .filter(Boolean)
    .join(" + ");
  const cardMap = new Map(snapshot.hand.map((card) => [card.id, card]));
  if (snapshot.discard) cardMap.set(snapshot.discard.id, snapshot.discard);
  const draftTotal = [...stagedIds].reduce(
    (sum, id) => sum + (cardMap.get(id)?.value || 0),
    0,
  );
  const hand = snapshot.hand
    .slice()
    .sort(
      (a, b) =>
        rankOrder.indexOf(a.rank) - rankOrder.indexOf(b.rank) ||
        a.suit.localeCompare(b.suit) ||
        a.id.localeCompare(b.id),
    );
  const canStage =
    myTurn &&
    (snapshot.phase === "play" || pickup) &&
    !busy &&
    !drawMotion.active &&
    !meldMotion.active;
  const canDrawStock =
    myTurn &&
    snapshot.phase === "draw" &&
    !busy &&
    !pickup &&
    !drawMotion.active &&
    !meldMotion.active;
  const needsSecondDraw = Boolean(snapshot.pickupDrawPending);
  const drawingCount = drawMotion.request?.count ?? snapshot.drawCount ?? 2;
  const showHandActions =
    canStage ||
    (myTurn &&
      needsSecondDraw &&
      !busy &&
      !drawMotion.active &&
      !meldMotion.active);
  const canTakeDiscard =
    myTurn &&
    snapshot.phase === "draw" &&
    !busy &&
    !drawMotion.active &&
    !meldMotion.active &&
    !needsSecondDraw &&
    Boolean(
      snapshot.discard &&
        !snapshot.discard.wild &&
        snapshot.discard.rank !== "3",
    );
  function cancelPickup() {
    setPickup(false);
    setDrafts([]);
    setSelected([]);
    setError("");
  }
  const ownSide = snapshot.sides[viewer!.team];
  const discardIsStaged = Boolean(
    pickup && snapshot.discard && stagedIds.has(snapshot.discard.id),
  );
  const pendingDiscard =
    pickup && snapshot.discard && !discardIsStaged ? snapshot.discard : null;
  const pickupPlayableIds = pendingDiscard
    ? pickupPlayableCards(
        hand.filter((card) => !stagedIds.has(card.id)),
        pendingDiscard,
        ownSide.melds,
        selected,
      )
    : null;
  const stageIds = [
    ...selected,
    ...(pendingDiscard ? [pendingDiscard.id] : []),
  ];
  const stageCards = stageIds.flatMap((id) => cardMap.get(id) || []);
  const hasStageCards =
    stageIds.length > 0 && stageCards.length === stageIds.length;
  const detectedStageKind = hasStageCards ? detectMeldKind(stageCards) : null;
  const stageKind =
    pendingDiscard &&
    detectedStageKind === "set" &&
    stageCards.filter(
      (card) =>
        card.id !== pendingDiscard.id &&
        !card.wild &&
        card.rank === pendingDiscard.rank,
    ).length < 2
      ? null
      : detectedStageKind;
  function canAddToMeld(meld: Meld) {
    if (!canStage || !hasStageCards) return false;
    const earlierIds = drafts
      .filter((draft) => draft.meldId === meld.id)
      .flatMap((draft) => draft.cardIds);
    const earlierCards = earlierIds.flatMap((id) => cardMap.get(id) || []);
    if (earlierCards.length !== earlierIds.length) return false;
    if (pendingDiscard && meld.cards.length + earlierCards.length === 6)
      return false;
    return isValidMeld(
      [...meld.cards, ...earlierCards, ...stageCards],
      meld.kind,
    );
  }
  function canTargetMeld(meld: Meld) {
    return viewer?.team === side?.id && canAddToMeld(meld);
  }
  const orderedLanes = snapshot.players
    .filter((player) => player.team === side?.id)
    .sort((a, b) => {
      const bottom =
        actor && actor.team === side?.id
          ? actor.id
          : viewer && viewer.team === side?.id
            ? viewer.id
            : undefined;
      return Number(a.id === bottom) - Number(b.id === bottom);
    });
  const review = ["round_over", "finished"].includes(snapshot.phase);
  const selectedRed =
    selected.length > 0 && selected.every((id) => cardMap.get(id)?.redThree);
  const singleRed = selectedRed && selected.length === 1;
  const renderBoard = (motion?: Partial<OpeningPresentation>) => {
    const startingPiles = (
      <StartingPiles
        piles={snapshot.footPreview ?? []}
        opening={setup}
        disabled={busy}
        onChoose={(pile) =>
          motion?.onChoose
            ? motion.onChoose(pile)
            : void act("choose", { pile })
        }
      />
    );
    const openingTableau = motion
      ? (motion.tableau ??
        (snapshot.phase === "choose" && !viewer?.chosen ? startingPiles : null))
      : null;
    const ownBoard = side?.id === viewer?.team;
    const lanes = orderedLanes.map((player) => (
      <Lane
        key={player.id}
        player={player}
        melds={side?.melds.filter((meld) => meld.creator === player.id) || []}
        active={player.id === snapshot.actorId}
        isYou={player.id === viewer?.id}
        canTarget={canTargetMeld}
        onTarget={(id) => stage(id)}
        drafts={drafts}
        individual={snapshot.scoringMode === "individual"}
        flyingIds={meldMotion.hiddenIds}
      />
    ));
    const waitingForHands = motion
      ? snapshot.message ===
        "Waiting for the other players to choose their hands."
      : snapshot.phase === "choose" && viewer?.chosen;
    const waitingForTable =
      snapshot.message === "Waiting for the table to be ready." ||
      (!motion &&
        snapshot.phase === "draw" &&
        snapshot.opening &&
        !snapshot.opening.complete);
    return (
      <div
        ref={boardRef}
        key={motion?.animationKey}
        className={`game-page ${snapshot.scoringMode === "individual" ? "individual-game" : "partnership-game"}${snapshot.opening ? " round-opened" : ""}`}
        onPointerDown={nudge.reset}
        onKeyDown={nudge.reset}
      >
        {!isRehearsal && connection !== "live" && (
          <p className="connection-note" role="status">
            {connection === "connecting"
              ? "Connecting to your table…"
              : "Reconnecting live updates. Your table is saved; checking every few seconds."}
          </p>
        )}
        <header className="game-header">
          <span className="round-pill">Round {snapshot.round}</span>
          <div className="piles-row" role="group" aria-label="Draw piles">
            <div className="draw-pile">
              <button
                className="pile-button"
                disabled={!canDrawStock}
                data-draw-available={canDrawStock}
                onClick={() => void act("draw")}
                aria-label={
                  needsSecondDraw
                    ? "Draw your second card from the deck"
                    : `Draw ${snapshot.drawCount || 2} cards from the stack`
                }
              >
                <span className="draw-deck-cards">
                  <Card small />
                  {motion?.deckOverlay}
                </span>
                {!needsSecondDraw && !drawMotion.request?.afterPickup && (
                  <span className="draw-two">+{snapshot.drawCount || 2}</span>
                )}
                <span
                  className="draw-available-indicator"
                  data-active={canDrawStock}
                  data-stack="true"
                  aria-hidden="true"
                />
              </button>
              <span>
                Deck <small>{snapshot.stockCount}</small>
              </span>
            </div>
            <div className="draw-pile">
              <DrawFirstHint
                blocked={myTurn && needsSecondDraw}
                label="Discard pile"
              >
                <button
                  className={`pile-button discard-pickup ${pickup ? "pickup-active" : ""}`}
                  disabled={!canTakeDiscard}
                  data-draw-available={canTakeDiscard && !pickup}
                  data-staged={discardIsStaged}
                  aria-pressed={pickup}
                  aria-describedby={
                    discardIsStaged ? discardStagedLabel : undefined
                  }
                  onClick={() => {
                    if (pickup) {
                      cancelPickup();
                      return;
                    }
                    setPickup(true);
                    setDrafts([]);
                    setSelected([]);
                    setError("");
                  }}
                  aria-label="Pick up and immediately play the top discard"
                >
                  {snapshot.discard ? (
                    <span className="discard-face">
                      <Card card={snapshot.discard} small />
                      {discardIsStaged && (
                        <span className="staged-label" id={discardStagedLabel}>
                          STAGED
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="empty-card">—</span>
                  )}
                  <span
                    className="draw-available-indicator"
                    data-active={canTakeDiscard || pickup}
                    data-selected={pickup}
                    aria-hidden="true"
                  />
                </button>
              </DrawFirstHint>
              <span className="discard-caption" data-pickup={pickup}>
                <span
                  className="discard-count"
                  aria-hidden={pickup || undefined}
                >
                  Discard <small>{snapshot.discardCount}</small>
                </span>
                {pickup && (
                  <button
                    type="button"
                    className="text-button cancel-pickup"
                    aria-label="Cancel pickup"
                    disabled={busy}
                    onClick={cancelPickup}
                  >
                    Cancel
                  </button>
                )}
              </span>
            </div>
          </div>
          <GameMenu
            snapshot={snapshot}
            onView={viewBoard}
            onScores={() => setScoresOpen(true)}
            onLeave={() =>
              isRehearsal ? navigate("/preview") : setLeaving(true)
            }
          />
        </header>
        <div
          className={`turn-message ${nudge.shaking ? "inactivity-shake" : ""}`}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <p>
            {meldMotion.active ? (
              "Playing your draft…"
            ) : drawMotion.active ? (
              `Drawing ${drawingCount} ${drawingCount === 1 ? "card" : "cards"}…`
            ) : waitingForHands ? (
              <>
                Waiting for the other players to choose their hands
                <span className="waiting-ellipsis" aria-hidden="true">
                  ...
                </span>
              </>
            ) : waitingForTable ? (
              <>
                Waiting for the table to be ready
                <span className="waiting-ellipsis" aria-hidden="true">
                  ...
                </span>
              </>
            ) : pickup ? (
              "Play the top discard onto your board."
            ) : myTurn && needsSecondDraw ? (
              "Draw your second card from the deck before discarding."
            ) : motion ? (
              snapshot.message
            ) : snapshot.phase === "choose" ? (
              viewer?.chosen ? (
                "Waiting for the other players to choose their hands."
              ) : (
                "Choose a pile for your hand. The other becomes your foot."
              )
            ) : review ? (
              snapshot.message
            ) : myTurn ? (
              snapshot.phase === "draw" ? (
                `Your turn. Draw ${snapshot.drawCount || 2} cards, or play the top discard.`
              ) : (
                "Your turn. Build your melds, then discard to finish."
              )
            ) : (
              snapshot.message
            )}
          </p>
          {myTurn &&
            !pickup &&
            !needsSecondDraw &&
            snapshot.drawCount === 3 && (
              <span className="catch-up-note">
                An extra catch-up card this turn.
              </span>
            )}
        </div>
        <div
          className="board-carousel"
          style={
            meldMotion.flight
              ? { minHeight: meldMotion.flight.boardHeight }
              : undefined
          }
        >
          {!setup && (
            <button
              className="board-arrow previous"
              aria-label="Previous board"
              onClick={() => browse(-1)}
            >
              <Icon name="arrow" />
            </button>
          )}
          <section
            className="tableau"
            aria-label={
              side?.id === viewer?.team ? "Your board" : `${side?.name}’s board`
            }
            aria-roledescription="carousel"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.target !== event.currentTarget) return;
              if (event.key === "ArrowLeft") {
                event.preventDefault();
                browse(-1);
              }
              if (event.key === "ArrowRight") {
                event.preventDefault();
                browse(1);
              }
            }}
            onTouchStart={(event) => {
              const touch = event.touches[0];
              event.currentTarget.dataset.startX = String(touch.clientX);
              event.currentTarget.dataset.startY = String(touch.clientY);
            }}
            onTouchEnd={(event) => {
              const touch = event.changedTouches[0];
              const dx =
                touch.clientX - Number(event.currentTarget.dataset.startX);
              const dy =
                touch.clientY - Number(event.currentTarget.dataset.startY);
              if (Math.abs(dx) > 75 && Math.abs(dy) < 45)
                browse(dx < 0 ? 1 : -1);
            }}
          >
            <div className="tableau-heading">
              {snapshot.scoringMode === "individual" || Boolean(motion) ? (
                <>
                  <h2 className="sr-only">{side?.name}</h2>
                  <PlayerBoardNav
                    sides={snapshot.sides}
                    viewed={viewed}
                    viewerTeam={viewer!.team}
                    activeTeam={
                      ["draw", "play"].includes(snapshot.phase)
                        ? (actor?.team ?? null)
                        : null
                    }
                    dealerTeam={dealer?.team ?? null}
                    previousDealerTeam={
                      snapshot.players.find(
                        (p) => p.id === motion?.previousDealerId,
                      )?.team
                    }
                    profileIcon={user?.profile_icon}
                    onView={viewBoard}
                  />
                </>
              ) : (
                <>
                  <h2>{side?.name}</h2>
                  <span className="board-score">
                    {number(side?.score ?? 0)} <small>points</small>
                  </span>
                </>
              )}
            </div>
            {openingTableau ? (
              <div className="opening-tableau-stage">
                <div
                  className="opening-tableau-content"
                  aria-hidden={!ownBoard || undefined}
                  style={{ visibility: ownBoard ? "visible" : "hidden" }}
                >
                  {openingTableau}
                </div>
                {!ownBoard && (
                  <div className="opening-public-tableau">{lanes}</div>
                )}
              </div>
            ) : snapshot.phase === "choose" && !viewer?.chosen && ownBoard ? (
              startingPiles
            ) : (
              lanes
            )}
          </section>
          {!setup && (
            <button
              className="board-arrow"
              aria-label="Next board"
              onClick={() => browse(1)}
            >
              <Icon name="arrow" />
            </button>
          )}
        </div>
        {!setup && (
          <div className="board-browser">
            <div className="board-pagination">
              <div
                className="table-dots"
                role="group"
                aria-label="Choose a player board"
              >
                {snapshot.sides.map((item) => (
                  <button
                    key={item.id}
                    className={item.id === viewed ? "active" : ""}
                    aria-label={`View ${item.id === viewer?.team ? "your" : `${item.name}’s`} board`}
                    aria-pressed={item.id === viewed}
                    onClick={() => viewBoard(item.id)}
                  />
                ))}
              </div>
              <span className="board-caption">
                {side?.id === viewer?.team
                  ? "Your board"
                  : `${side?.name}’s board`}{" "}
                · {viewed + 1} / {snapshot.sides.length}
              </span>
            </div>
            <label className="follow-control">
              <input
                type="checkbox"
                checked={follow}
                onChange={(event) => setFollow(event.target.checked)}
              />
              <span>Follow turn</span>
            </label>
            {myTurn && viewed !== viewer?.team && (
              <button
                className="text-button return-board"
                onClick={() => viewBoard(viewer!.team)}
              >
                Back to your board
              </button>
            )}
          </div>
        )}
        {!setup && (
          <section className="hand-dock" aria-label="Your private hand">
            <div className="hand-heading">
              <div className="hand-info">
                <span className="eyebrow">
                  YOUR {viewer?.inFoot ? "FOOT" : "HAND"}
                </span>
                <span>
                  {snapshot.hand.length - drawMotion.hiddenIds.size} cards
                </span>
              </div>
              <div
                className="draft-summary-slot"
                role="status"
                aria-live="polite"
                aria-atomic="true"
              >
                {canStage && drafts.length > 0 && (
                  <div
                    className="draft-summary"
                    role="group"
                    aria-label="Staged draft"
                  >
                    <span>{draftSummaryLabel}</span>
                    <span className="draft-summary-dot" aria-hidden="true" />
                    <strong
                      aria-label={
                        ownSide.opened
                          ? `${draftTotal} points`
                          : `${draftTotal} points, ${ownSide.opening} points to open`
                      }
                    >
                      {draftTotal}
                      {!ownSide.opened && (
                        <span className="draft-opening">
                          {" "}
                          / {ownSide.opening}
                        </span>
                      )}{" "}
                      pts
                    </strong>
                    <button
                      type="button"
                      className="draft-clear"
                      aria-label="Clear draft"
                      title="Clear draft"
                      onClick={() => {
                        setDrafts([]);
                        setSelected([]);
                      }}
                    >
                      <Icon name="close" />
                    </button>
                  </div>
                )}
              </div>
              {!viewer?.inFoot && (
                <FootPreview
                  topCard={snapshot.footTop ?? null}
                  count={viewer?.footCount ?? 0}
                />
              )}
            </div>
            {snapshot.hand.length ? (
              <div
                className="hand-scroll"
                aria-label="Select cards to play"
                ref={handScrollRef}
              >
                {hand.map((card) => (
                  <div
                    className={
                      stagedIds.has(card.id)
                        ? "hand-card staged-card"
                        : "hand-card"
                    }
                    key={card.id}
                    data-card-id={card.id}
                    data-draw-hidden={drawMotion.hiddenIds.has(card.id)}
                    data-meld-hidden={meldMotion.hiddenIds.has(card.id)}
                    data-pickup-blocked={Boolean(
                      pickupPlayableIds &&
                        !selected.includes(card.id) &&
                        !pickupPlayableIds.has(card.id),
                    )}
                  >
                    <Card
                      card={card}
                      selected={selected.includes(card.id)}
                      disabled={
                        !canStage ||
                        stagedIds.has(card.id) ||
                        Boolean(
                          pickupPlayableIds &&
                            !selected.includes(card.id) &&
                            !pickupPlayableIds.has(card.id),
                        )
                      }
                      onClick={() => {
                        setSelected((old) =>
                          old.includes(card.id)
                            ? old.filter((id) => id !== card.id)
                            : [...old, card.id],
                        );
                        sound.play("select");
                      }}
                    />
                    {stagedIds.has(card.id) && (
                      <span className="staged-label">STAGED</span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-hand">
                {snapshot.phase === "choose"
                  ? "Your chosen cards will appear here."
                  : review
                    ? "A well-played hand."
                    : "Your hand is empty."}
              </p>
            )}
            {showHandActions && (
              <>
                <div className="hand-actions">
                  <span className="selection-count">
                    {selected.length ? (
                      <>
                        {selected.length} selected
                        <span aria-hidden="true"> · </span>
                        <button
                          type="button"
                          className="clear-selection"
                          onClick={() => setSelected([])}
                        >
                          clear selection
                        </button>
                      </>
                    ) : (
                      "Select cards to play"
                    )}
                  </span>
                  <button
                    className="button small"
                    disabled={!canStage || !stageKind}
                    onClick={() => stage()}
                  >
                    Stage meld
                  </button>
                  <PlayDraftButton
                    count={drafts.length}
                    total={draftTotal}
                    minimum={ownSide.opened ? null : ownSide.opening}
                    blocked={!canStage || (pickup && !discardIsStaged)}
                    showRequirement={
                      rehearsal?.draftReview?.showOpeningRequirement
                    }
                    onPlay={() =>
                      void act(pickup ? "pickup" : "meld", { groups: drafts })
                    }
                  />
                  <DrawFirstHint
                    blocked={needsSecondDraw || pickup}
                    label="Discard"
                    show={rehearsal?.draftReview?.showDrawRequirement}
                  >
                    <button
                      className="button small secondary"
                      disabled={
                        selected.length !== 1 ||
                        pickup ||
                        needsSecondDraw ||
                        snapshot.phase !== "play" ||
                        drafts.length > 0
                      }
                      onClick={() =>
                        void act(
                          singleRed ? "red_three" : "discard",
                          singleRed
                            ? { cardIds: selected, expose: false }
                            : { cardId: selected[0] },
                        )
                      }
                    >
                      {singleRed ? "Replace" : "Discard"}
                    </button>
                  </DrawFirstHint>
                </div>
                {selectedRed && selected.length > 1 && !pickup && (
                  <div className="red-three-actions">
                    <span>Red threes:</span>
                    <button
                      className="text-button"
                      onClick={() =>
                        void act("red_three", {
                          cardIds: selected,
                          expose: false,
                        })
                      }
                    >
                      Replace from stack
                    </button>
                    <button
                      className="text-button"
                      disabled={!ownSide.opened}
                      onClick={() =>
                        void act("red_three", {
                          cardIds: selected,
                          expose: true,
                        })
                      }
                    >
                      Lay down for your side
                    </button>
                    {!ownSide.opened && (
                      <span>
                        Complete your side’s opening meld to lay down red
                        threes.
                      </span>
                    )}
                  </div>
                )}
              </>
            )}
            {error && (
              <div className="error inline-error" role="alert">
                <span>{error}</span>
                <button
                  className="icon-button"
                  aria-label="Dismiss message"
                  onClick={() => setError("")}
                >
                  <Icon name="close" />
                </button>
              </div>
            )}
          </section>
        )}
        {snapshot.phase === "scoring" && snapshot.scoring && (
          <ScoringReview
            snapshot={snapshot}
            busy={busy}
            error={error}
            act={act}
          />
        )}
        {(review || (scoresOpen && snapshot.phase !== "scoring")) && (
          <div className="modal-backdrop">
            <section
              className="score-sheet"
              role="dialog"
              aria-modal="true"
              aria-label="Score sheet"
            >
              <div className="sheet-topline">
                <p className="eyebrow">
                  {snapshot.phase === "finished"
                    ? "A MATCH WELL PLAYED"
                    : `ROUND ${snapshot.round} · TARGET ${number(snapshot.targetScore)}`}
                </p>
                {!review && (
                  <button
                    autoFocus
                    className="icon-button"
                    aria-label="Close score sheet"
                    onClick={() => setScoresOpen(false)}
                  >
                    <Icon name="close" />
                  </button>
                )}
              </div>
              <div className="modal-heading">
                <Book />
                <h2>
                  {snapshot.phase === "finished"
                    ? "FINAL SCORES"
                    : review
                      ? "ROUND SCORES"
                      : "SCORES"}
                </h2>
              </div>
              <p className="muted">
                {snapshot.phase === "finished"
                  ? `${snapshot.winners.map((id) => snapshot.sides[id].name).join(" & ")} ${snapshot.winners.length > 1 ? "share the win" : "wins"}!`
                  : snapshot.history.at(-1)?.reason ||
                    "Your round totals will appear here."}
              </p>
              <div className="score-details">
                {snapshot.sides.map((item) => {
                  const result = snapshot.history
                    .at(-1)
                    ?.scores.find((score) => score.team === item.id);
                  return (
                    <div className="side-result" key={item.id}>
                      <h3>{item.name}</h3>
                      {result && (
                        <dl>
                          <div>
                            <dt>Card points</dt>
                            <dd>{number(result.cards)}</dd>
                          </div>
                          <div>
                            <dt>Leftover-card debt</dt>
                            <dd>−{number(result.debt)}</dd>
                          </div>
                          <div>
                            <dt>Books & straight flushes</dt>
                            <dd>{number(result.books)}</dd>
                          </div>
                          <div>
                            <dt>Red threes</dt>
                            <dd>{number(result.redThrees)}</dd>
                          </div>
                          {result.redCredit > 0 && (
                            <div>
                              <dt>Red-three debt credit</dt>
                              <dd>+{number(result.redCredit)}</dd>
                            </div>
                          )}
                          <div>
                            <dt>Going out first</dt>
                            <dd>{number(result.goingOut)}</dd>
                          </div>
                          {result.lostBooks > 0 && (
                            <div className="lost-book">
                              <dt>Books broken by debt</dt>
                              <dd>{result.lostBooks}</dd>
                            </div>
                          )}
                          <div className="round-total">
                            <dt>Round {snapshot.round}</dt>
                            <dd>{number(result.total)}</dd>
                          </div>
                        </dl>
                      )}
                      <div className="match-total">
                        <span>Match total</span>
                        <strong>{number(item.score)}</strong>
                      </div>
                    </div>
                  );
                })}
              </div>
              {snapshot.history.length > 1 && (
                <details className="round-history">
                  <summary>Previous rounds</summary>
                  {snapshot.history.slice(0, -1).map((round) => (
                    <p key={round.round}>
                      Round {round.round}:{" "}
                      {round.scores
                        .map(
                          (score) =>
                            `${snapshot.sides[score.team].name}: ${number(score.total)}`,
                        )
                        .join(" · ")}
                    </p>
                  ))}
                </details>
              )}
              {review && (
                <>
                  <button
                    autoFocus
                    className="button full"
                    disabled={busy || viewer?.ready}
                    onClick={() =>
                      void act(
                        snapshot.phase === "finished"
                          ? "rematch"
                          : "next_round",
                      )
                    }
                  >
                    {viewer?.ready
                      ? "Waiting for the table…"
                      : snapshot.phase === "finished"
                        ? "Play again"
                        : "Ready for the next round"}
                  </button>
                  <p className="fine-print">
                    {
                      snapshot.players.filter(
                        (player) => !player.bot && player.ready,
                      ).length
                    }{" "}
                    of {snapshot.players.filter((player) => !player.bot).length}{" "}
                    players ready · Bots are always ready
                  </p>
                  <Link className="text-link" to="/play">
                    Back to Play
                  </Link>
                </>
              )}
            </section>
          </div>
        )}
        {drawMotion.request && drawMotion.cards.length > 0 && (
          <DrawCards
            request={drawMotion.request}
            cards={drawMotion.cards}
            board={boardRef}
          />
        )}
        {meldMotion.flight && (
          <MeldCards
            flight={meldMotion.flight}
            paused={rehearsal?.meldPaused ?? false}
          />
        )}
        {opening.error && (
          <p role="status" className="connection-note">
            {opening.error}
          </p>
        )}
        {leaving && (
          <div className="modal-backdrop">
            <section
              className="leave-dialog"
              role="dialog"
              aria-modal="true"
              aria-label="Leave table"
            >
              <h2>Leave the table?</h2>
              <p>
                A bot will take over your seat. The other players can keep
                playing.
              </p>
              <div>
                <button
                  autoFocus
                  className="button secondary"
                  onClick={() => setLeaving(false)}
                >
                  Stay
                </button>
                <button
                  className="button"
                  disabled={busy}
                  onClick={() => void act("leave")}
                >
                  Leave table
                </button>
              </div>
            </section>
          </div>
        )}
      </div>
    );
  };
  return opening.state ? (
    <OpeningMotion
      state={opening.state}
      snapshot={snapshot}
      duration={opening.duration}
      speed={1}
      reduced={opening.reduced}
      onChoose={(pile) => void act("choose", { pile })}
      dealStyle="drops"
      piles={opening.state.piles}
      previousDealerId={opening.state.previousDealerId}
    >
      {renderBoard}
    </OpeningMotion>
  ) : (
    renderBoard(rehearsal)
  );
}

function Lane({
  player,
  melds,
  active,
  isYou,
  canTarget,
  onTarget,
  drafts,
  individual,
  flyingIds,
}: {
  player: Player;
  melds: Meld[];
  active: boolean;
  isYou: boolean;
  canTarget: (meld: Meld) => boolean;
  onTarget: (id: string) => void;
  drafts: Draft[];
  individual: boolean;
  flyingIds: Set<string>;
}) {
  const closed = melds.filter((meld) => meld.complete);
  const open = melds.filter((meld) => !meld.complete);
  const hasRedThrees = player.redThrees.length > 0;
  const redOffset = Math.min(3, 12 / Math.max(1, player.redThrees.length - 1));
  function piles(items: Meld[], label: string, includeRedThrees = false) {
    const count = items.length + Number(includeRedThrees);
    const isClosed = label === "Completed books";
    return (
      count > 0 && (
        <div
          className={`pile-group ${count > 4 ? "crowded-piles" : ""} ${isClosed ? "closed-books" : "open-piles"} ${isClosed && count > 9 ? "dense-books" : ""}`}
          role="group"
          aria-label={label}
          style={{ "--pile-count": count } as React.CSSProperties}
        >
          {items.map((meld) => (
            <MeldPile
              key={meld.id}
              meld={meld}
              canTarget={canTarget(meld)}
              onTarget={() => onTarget(meld.id)}
              staged={drafts
                .filter((draft) => draft.meldId === meld.id)
                .reduce((n, draft) => n + draft.cardIds.length, 0)}
              flyingIds={flyingIds}
            />
          ))}
          {includeRedThrees && (
            <div
              className="red-three-pile"
              role="group"
              aria-label="Red threes"
            >
              <span className="meld-kind">Red threes</span>
              <div
                className="red-three-stack"
                style={{
                  width: 62 + redOffset * (player.redThrees.length - 1),
                }}
              >
                {player.redThrees.map((card, index) => (
                  <span style={{ left: index * redOffset }} key={card.id}>
                    <Card card={card} small />
                  </span>
                ))}
              </div>
              <span className="meld-count">
                {player.redThrees.length < 3
                  ? `${player.redThrees.length} / 3`
                  : `${player.redThrees.length} cards`}
              </span>
            </div>
          )}
        </div>
      )
    );
  }
  return (
    <section
      className={`player-lane ${active ? "active-lane" : ""}`}
      aria-label={`${player.name}’s public piles`}
    >
      {!individual && (
        <div className="lane-heading">
          <span className={`avatar team-${player.team}`}>
            {player.name[0].toUpperCase()}
          </span>
          <strong>
            {player.name}
            {isYou && <small> (you)</small>}
          </strong>
          <span className="lane-player-state">
            {player.bot ? (player.away ? "Away · Bot playing" : "Bot") : ""}
            {player.bot ? " · " : ""}
            {player.inFoot ? "Foot" : "Hand"} · {player.handCount} cards
            {active && <span className="playing-tag">Playing</span>}
          </span>
        </div>
      )}
      <div className="melds">
        {piles(closed, "Completed books", hasRedThrees)}
        {melds.length === 0 && !hasRedThrees ? (
          <div className="empty-lane">
            <Book />
            <p>
              {isYou
                ? "Your melds will appear here."
                : "No melds on the table yet."}
            </p>
          </div>
        ) : (
          piles(open, "Open piles")
        )}
      </div>
    </section>
  );
}
