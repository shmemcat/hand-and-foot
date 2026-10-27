import { useCallback, useEffect, useRef, useState } from "react";
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
import { detectMeldKind, isValidMeld } from "../lib/melds";
import { Card } from "../components/Card";
import { MeldPile } from "../components/MeldPile";
import { Book, Icon } from "../components/Icons";
import { PageTitle } from "../components/PageTitle";
import { ScoringReview } from "../components/ScoringReview";
import { GameMenu } from "../components/GameMenu";
import { ProfileIcon } from "../components/ProfileIcon";
import { useModalFocus } from "../hooks/useModalFocus";
import { useInactivityNudge } from "../hooks/useInactivityNudge";
import { useHorizontalWheel } from "../hooks/useHorizontalWheel";
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

export function Room() {
  const { code = "" } = useParams();
  const navigate = useNavigate();
  const sound = useSound();
  const { user } = useAuth();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [connection, setConnection] = useState<
    "connecting" | "live" | "polling"
  >("connecting");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [pickup, setPickup] = useState(false);
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
  const handScrollRef = useHorizontalWheel(Boolean(snapshot?.hand.length));
  const lastSoundToken = useRef("");
  const live = useRef(true);
  const currentCode = useRef(code);
  currentCode.current = code;
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
  const accept = useCallback((incoming: Snapshot) => {
    if (live.current && incoming.code === currentCode.current)
      setSnapshot((old) =>
        old && old.code === incoming.code && old.revision > incoming.revision
          ? old
          : incoming,
      );
  }, []);
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
  }, [code, refresh]);
  const viewer = snapshot?.players.find(
    (player) => player.id === snapshot.viewerId,
  );
  const actor = snapshot?.players.find(
    (player) => player.id === snapshot.actorId,
  );
  const myTurn = Boolean(
    snapshot &&
      viewer &&
      snapshot.actorId === viewer.id &&
      ["draw", "play"].includes(snapshot.phase),
  );
  const nudge = useInactivityNudge(
    snapshot?.playMode === "online" &&
      !busy &&
      !joining &&
      !scoresOpen &&
      !leaving &&
      (myTurn ||
        (snapshot?.phase === "choose" && Boolean(viewer && !viewer.chosen))),
    `${code}:${snapshot?.token}`,
  );
  useEffect(() => {
    if (!snapshot) return;
    writeStorage("handandfoot.room.v1", snapshot.code);
    if (follow && actor) setViewed(actor.team);
    if (
      lastSoundToken.current &&
      lastSoundToken.current !== snapshot.token &&
      myTurn &&
      snapshot.phase === "draw"
    )
      sound.play("turn");
    lastSoundToken.current = snapshot.token;
  }, [snapshot?.token, snapshot?.actorId, follow]);
  useEffect(() => {
    if (!snapshot) return;
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
    if (!snapshot || busy) return;
    setBusy(true);
    setError("");
    try {
      const next = await command(snapshot, type, payload);
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
      else if (type === "draw" || type === "choose") sound.play("deal");
      else if (type === "discard") sound.play("select");
    } catch (error) {
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
    setViewed(
      (old) => (old + delta + snapshot.sides.length) % snapshot.sides.length,
    );
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
  const canStage = myTurn && (snapshot.phase === "play" || pickup) && !busy;
  const ownSide = snapshot.sides[viewer!.team];
  const pendingDiscard =
    pickup && snapshot.discard && !stagedIds.has(snapshot.discard.id)
      ? snapshot.discard
      : null;
  const stageIds = [
    ...selected,
    ...(pendingDiscard ? [pendingDiscard.id] : []),
  ];
  const stageCards = stageIds.flatMap((id) => cardMap.get(id) || []);
  const hasStageCards =
    stageIds.length > 0 && stageCards.length === stageIds.length;
  const stageKind = hasStageCards ? detectMeldKind(stageCards) : null;
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
  const hasExistingTarget =
    selected.length > 0 && ownSide.melds.some(canAddToMeld);
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
  return (
    <div
      className={`game-page ${snapshot.scoringMode === "individual" ? "individual-game" : "partnership-game"}`}
      onPointerDown={nudge.reset}
      onKeyDown={nudge.reset}
    >
      {connection !== "live" && (
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
              disabled={!myTurn || snapshot.phase !== "draw" || busy || pickup}
              onClick={() => void act("draw")}
              aria-label={`Draw ${snapshot.drawCount || 2} cards from the stack`}
            >
              <Card small />
              <span className="draw-two">+{snapshot.drawCount || 2}</span>
            </button>
            <span>
              Deck <small>{snapshot.stockCount}</small>
            </span>
          </div>
          <div className="draw-pile">
            <button
              className={`pile-button ${pickup ? "pickup-active" : ""}`}
              disabled={
                !myTurn ||
                snapshot.phase !== "draw" ||
                busy ||
                !snapshot.discard ||
                snapshot.discard.wild ||
                snapshot.discard.rank === "3"
              }
              onClick={() => {
                setPickup(!pickup);
                setDrafts([]);
                setSelected([]);
                setError("");
              }}
              aria-label="Pick up and immediately play the top discard"
            >
              {snapshot.discard ? (
                <Card card={snapshot.discard} small />
              ) : (
                <span className="empty-card">—</span>
              )}
            </button>
            <span>
              Discard <small>{snapshot.discardCount}</small>
            </span>
          </div>
        </div>
        <GameMenu
          snapshot={snapshot}
          onView={(id) => {
            setViewed(id);
            setFollow(false);
          }}
          onScores={() => setScoresOpen(true)}
          onLeave={() => setLeaving(true)}
        />
      </header>
      <div
        className={`turn-message ${nudge.shaking ? "inactivity-shake" : ""}`}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <p>
          {snapshot.phase === "choose"
            ? viewer?.chosen
              ? "Waiting for the other players to choose their hands."
              : "Choose a pile for your hand. The other becomes your foot."
            : review
              ? snapshot.message
              : myTurn
                ? snapshot.phase === "draw"
                  ? `Your turn. Draw ${snapshot.drawCount || 2} cards, or play the top discard.`
                  : "Your turn. Build your piles, then discard to finish."
                : snapshot.message}
        </p>
        {myTurn && snapshot.drawCount === 3 && (
          <span className="catch-up-note">
            An extra catch-up card this turn.
          </span>
        )}
      </div>
      {pickup && (
        <p className="pickup-notice">
          Play the top discard in your draft. A pile at 6 / 7 must be completed
          from your hand, never with the discard.{" "}
          <button
            className="text-button"
            onClick={() => {
              setPickup(false);
              setDrafts([]);
            }}
          >
            Cancel pickup
          </button>
        </p>
      )}
      <div className="board-carousel">
        <button
          className="board-arrow previous"
          aria-label="Previous board"
          onClick={() => browse(-1)}
          disabled={snapshot.phase === "choose"}
        >
          <Icon name="arrow" />
        </button>
        {snapshot.phase === "choose" && !viewer?.chosen ? (
          <div className="choose-piles">
            <p>
              See the top & bottom cards. Choose one pile as your hand.
              <br />
              <span>The other becomes your face-down foot.</span>
            </p>
            <div>
              {snapshot.footPreview?.map((pile, index) => (
                <button
                  className="choose-pile"
                  key={index}
                  disabled={busy}
                  onClick={() => void act("choose", { pile: index })}
                >
                  <span className="pile-preview">
                    <Card card={pile[0]} />
                    <Card />
                    <Card card={pile[1]} />
                  </span>
                  <strong>Play pile {index + 1}</strong>
                  <small>11 cards · Top & bottom shown</small>
                </button>
              ))}
            </div>
          </div>
        ) : (
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
              <h2>
                {snapshot.scoringMode === "individual" && (
                  <ProfileIcon
                    name={
                      side?.id === viewer?.team ? user?.profile_icon : undefined
                    }
                  />
                )}
                {side?.name}
              </h2>
              <span className="board-score">
                {number(side?.score ?? 0)} <small>points</small>
              </span>
            </div>
            {orderedLanes.map((player) => (
              <Lane
                key={player.id}
                player={player}
                melds={
                  side?.melds.filter((meld) => meld.creator === player.id) || []
                }
                active={player.id === snapshot.actorId}
                isYou={player.id === viewer?.id}
                canTarget={canTargetMeld}
                onTarget={(id) => stage(id)}
                drafts={drafts}
                individual={snapshot.scoringMode === "individual"}
              />
            ))}
          </section>
        )}
        <button
          className="board-arrow"
          aria-label="Next board"
          onClick={() => browse(1)}
          disabled={snapshot.phase === "choose"}
        >
          <Icon name="arrow" />
        </button>
      </div>
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
                onClick={() => {
                  setViewed(item.id);
                  setFollow(false);
                }}
              />
            ))}
          </div>
          <span className="board-caption">
            {side?.id === viewer?.team ? "Your board" : `${side?.name}’s board`}{" "}
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
            onClick={() => {
              setViewed(viewer!.team);
              setFollow(false);
            }}
          >
            Back to your board
          </button>
        )}
      </div>
      <section className="hand-dock" aria-label="Your private hand">
        <div className="hand-heading">
          <div>
            <span className="eyebrow">
              YOUR {viewer?.inFoot ? "FOOT" : "HAND"}
            </span>
            <span>{snapshot.hand.length} cards</span>
          </div>
          {!viewer?.inFoot && (
            <span className="foot-status">
              <Card small />
              Foot · {viewer?.footCount} cards
            </span>
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
                  stagedIds.has(card.id) ? "hand-card staged-card" : "hand-card"
                }
                key={card.id}
              >
                <Card
                  card={card}
                  selected={selected.includes(card.id)}
                  disabled={!canStage || stagedIds.has(card.id)}
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
        {canStage && (
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
                disabled={!stageKind}
                onClick={() => stage()}
              >
                {hasExistingTarget ? "New meld" : "Stage"}
              </button>
              <button
                className="button small"
                disabled={!drafts.length}
                onClick={() =>
                  void act(pickup ? "pickup" : "meld", { groups: drafts })
                }
              >
                Play draft{drafts.length ? ` · ${draftTotal} pts` : ""}
              </button>
              <button
                className="button small secondary"
                disabled={selected.length !== 1 || pickup || drafts.length > 0}
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
                    void act("red_three", { cardIds: selected, expose: true })
                  }
                >
                  Lay down for your side
                </button>
                {!ownSide.opened && (
                  <span>
                    Complete your side’s opening meld to lay down red threes.
                  </span>
                )}
              </div>
            )}
            {drafts.length > 0 && (
              <div className="draft-summary">
                <span>
                  {drafts.length} staged pile{drafts.length === 1 ? "" : "s"} ·{" "}
                  <strong>{draftTotal} points</strong>
                  {!ownSide.opened && ` / over ${ownSide.opening} to open`}
                </span>
                <button
                  className="text-button"
                  onClick={() => {
                    setDrafts([]);
                    setSelected([]);
                  }}
                >
                  Clear draft
                </button>
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
                      snapshot.phase === "finished" ? "rematch" : "next_round",
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
}: {
  player: Player;
  melds: Meld[];
  active: boolean;
  isYou: boolean;
  canTarget: (meld: Meld) => boolean;
  onTarget: (id: string) => void;
  drafts: Draft[];
  individual: boolean;
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
          className={`pile-group ${count > 4 ? "crowded-piles" : ""} ${isClosed ? "closed-books" : "open-piles"} ${isClosed && count > 9 ? "dense-books" : ""} ${!isClosed && count >= 8 ? "compact-piles" : ""}`}
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
