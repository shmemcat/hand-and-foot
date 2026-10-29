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
import { createPortal } from "react-dom";
import { io, type Socket } from "socket.io-client";
import {
  command,
  getRoom,
  request,
  socketCredentials,
  GameApiError,
} from "../lib/api";
import { removeStorage, writeStorage, readStorage } from "../lib/storage";
import {
  canExtendMeld,
  detectMeldKind,
  pickupPlayableCards,
} from "../lib/melds";
import { goingOutRequirement, hasGoingOutBooks } from "../lib/goingOut";
import { Card } from "../components/Card";
import { DrawCards } from "../components/DrawCards";
import { TableCards } from "../components/TableCards";
import { MeldCards } from "../components/MeldCards";
import { ClosingBooks } from "../components/ClosingBooks";
import { StartingPiles } from "../components/StartingPiles";
import {
  OpeningMotion,
  type OpeningPresentation,
} from "../components/OpeningMotion";
import { FootPreview } from "../components/FootPreview";
import { FootGather } from "../components/FootGather";
import { MeldPile } from "../components/MeldPile";
import { Book, Icon } from "../components/Icons";
import { PageTitle } from "../components/PageTitle";
import { LoginWarning } from "../components/LoginWarning";
import { Lobby } from "../components/Lobby";
import { ScoringReview } from "../components/ScoringReview";
import { RoundScoreSheet } from "../components/RoundScoreSheet";
import { RoundRecordDialog } from "../components/RoundRecordDialog";
import { ResultsToggle } from "../components/ResultsToggle";
import { ScoreCount, SettlementPiles } from "../components/ScoreCount";
import { ScoreMotion } from "../components/ScoreMotion";
import { useLiveScoring } from "../hooks/useLiveScoring";
import { useHandLayoutMotion } from "../hooks/useHandLayoutMotion";
import { useRuleCue } from "../hooks/useRuleCue";
import { GameMenu } from "../components/GameMenu";
import { PlayerBoardNav } from "../components/PlayerBoardNav";
import { PlayDraftButton } from "../components/PlayDraftButton";
import { DrawFirstHint } from "../components/DrawFirstHint";
import { useModalFocus } from "../hooks/useModalFocus";
import { useInactivityNudge } from "../hooks/useInactivityNudge";
import { useTurnIndicator } from "../context/TurnSoundContext";
import { useHorizontalWheel } from "../hooks/useHorizontalWheel";
import { useGameOpening } from "../hooks/useGameOpening";
import { useDrawMotion } from "../hooks/useDrawMotion";
import { useMeldMotion } from "../hooks/useMeldMotion";
import {
  BOOK_CLOSE_MS,
  BOOK_RISE_DELAY_MS,
  useBookClosing,
} from "../hooks/useBookClosing";
import { usePileLayoutMotion } from "../hooks/usePileLayoutMotion";
import { useFootMotion } from "../hooks/useFootMotion";
import { useTableMotion } from "../hooks/useTableMotion";
import { useRedThreeCelebration } from "../hooks/useRedThreeCelebration";
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

export type RoomRehearsal = {
  snapshot: Snapshot;
  recordOpen?: boolean;
  onChoose: (pile: number) => void;
  headerSummary?: ReactNode;
  footerSummary?: ReactNode;
  footerSummaryVisible?: boolean;
  handCaption?: string;
  emptyHandMessage?: string;
  emptyTableMessage?: string;
  cardPoints?: Record<string, number>;
  redThreeBonusLost?: boolean;
  animationKey?: number;
  tableau?: ReactNode;
  deckOverlay?: ReactNode;
  setup?: boolean;
  footSource?: { topCard: Face | null; count: number };
  onDraw?: () => void;
  drawReplay?: number;
  drawSpeed?: number;
  replacementIds?: string[];
  handAnimate?: boolean;
  tableAnimate?: boolean;
  viewedTeam?: number;
  followTurn?: boolean;
  portalMotion?: boolean;
  drawReview?: { key: string; before: Snapshot };
  meldSpeed?: number;
  meldPaused?: boolean;
  meldAnimate?: boolean;
  pileAnimate?: boolean;
  pileShiftDuration?: number;
  pileMotionKey?: string;
  onMeldMotion?: (active: boolean) => void;
  draftReview?: {
    selected: string[];
    drafts: Draft[];
    pickup: boolean;
    busy: boolean;
    error: string;
    showOpeningRequirement?: boolean;
  };
};

export function Room({ rehearsal }: { rehearsal?: RoomRehearsal } = {}) {
  const { code = "" } = useParams();
  const navigate = useNavigate();
  const sound = useSound();
  const { user } = useAuth();
  const [roomSnapshot, setSnapshot] = useState<Snapshot | null>(null);
  const isRehearsal = Boolean(rehearsal);
  const motionLayer = (children: ReactNode) =>
    rehearsal?.portalMotion ? createPortal(children, document.body) : children;
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
  const [follow, setFollow] = useState(rehearsal?.followTurn ?? true);
  const [viewed, setViewed] = useState(rehearsal?.viewedTeam ?? 0);
  const [scoresOpen, setScoresOpen] = useState(false);
  const [recordOpen, setRecordOpen] = useState(rehearsal?.recordOpen ?? false);
  const [resultsHidden, setResultsHidden] = useState(false);
  const [leavingScores, setLeavingScores] = useState(false);
  const [totalsLanded, setTotalsLanded] = useState(false);
  const [scoringBoardHeight, setScoringBoardHeight] = useState(0);
  const [joining, setJoining] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [joinName, setJoinName] = useState(() =>
    readStorage("handandfoot.name.v1", ""),
  );
  const [leaving, setLeaving] = useState(false);
  const live = useRef(true);
  const roomSocket = useRef<Socket | undefined>(undefined);
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
    viewed,
  );
  const bookClosing = useBookClosing(
    meldMotion.snapshot,
    boardRef,
    opening.reduced || rehearsal?.meldAnimate === false,
    meldMotion.active,
    rehearsal?.meldSpeed ?? 1,
    rehearsal?.meldPaused ?? false,
  );
  const playingMeld = meldMotion.active || bookClosing.active;
  const footMotion = useFootMotion(
    incomingSnapshot,
    bookClosing.snapshot,
    boardRef,
    opening.reduced,
    playingMeld,
    isRehearsal,
    viewed ===
      incomingSnapshot?.players.find(
        (player) => player.id === incomingSnapshot.viewerId,
      )?.team,
  );
  const tableMotion = useTableMotion(
    incomingSnapshot,
    footMotion.snapshot,
    boardRef,
    opening.reduced,
    isRehearsal && !rehearsal?.tableAnimate,
    viewed,
    rehearsal?.meldSpeed ?? 1,
  );
  const scoring = useLiveScoring(
    tableMotion.snapshot,
    !isRehearsal &&
      tableMotion.snapshot?.playMode === "practice" &&
      tableMotion.snapshot?.scoringMode === "individual",
    opening.reduced,
  );
  const snapshot = scoring.snapshot;
  const cardPoints = rehearsal?.cardPoints ?? scoring.beat?.pointsLeft;
  const redThreeBonusLost =
    rehearsal?.redThreeBonusLost ?? scoring.beat?.redsBroken;
  useLayoutEffect(() => {
    setScoringBoardHeight(
      scoring.enabled
        ? (boardRef.current?.querySelector<HTMLElement>(".board-carousel")
            ?.offsetHeight ?? 0)
        : 0,
    );
  }, [scoring.enabled, snapshot?.code, snapshot?.round]);
  usePileLayoutMotion(boardRef, {
    scope: `${snapshot?.code}:${snapshot?.round}:${snapshot?.viewerId}:${viewed}:${rehearsal?.pileMotionKey ?? ""}`,
    enabled: Boolean(
      snapshot?.playMode === "practice" &&
        snapshot?.scoringMode === "individual",
    ),
    reduced:
      opening.reduced ||
      (rehearsal?.pileAnimate ?? rehearsal?.meldAnimate) === false,
    speed: rehearsal?.meldSpeed ?? 1,
    paused: rehearsal?.meldPaused ?? false,
    delay: bookClosing.hiddenPiles.length ? BOOK_RISE_DELAY_MS : 0,
    duration:
      rehearsal?.pileShiftDuration ??
      (scoring.beat?.kind === "break"
        ? BOOK_CLOSE_MS - BOOK_RISE_DELAY_MS
        : undefined) ??
      (bookClosing.hiddenPiles.length
        ? BOOK_CLOSE_MS - BOOK_RISE_DELAY_MS
        : undefined),
  });
  useRedThreeCelebration(
    snapshot?.phase === "scoring" ? null : snapshot,
    boardRef,
    opening.reduced,
  );
  const footSource = rehearsal?.footSource ?? footMotion.source;
  useEffect(() => {
    rehearsal?.onMeldMotion?.(playingMeld);
  }, [playingMeld, rehearsal?.onMeldMotion]);
  const drawMotion = useDrawMotion(
    snapshot,
    opening.reduced,
    rehearsal?.drawSpeed ?? 1,
  );
  const discardView = drawMotion.discardBefore ?? {
    card: snapshot?.discard ?? null,
    count: snapshot?.discardCount ?? 0,
    faceDown: Boolean(snapshot?.discardFaceDown),
  };
  useHandLayoutMotion(
    boardRef,
    `${snapshot?.code}:${snapshot?.round}:${snapshot?.viewerId}`,
    opening.reduced ||
      Boolean(opening.state) ||
      drawMotion.active ||
      playingMeld ||
      footMotion.active ||
      (Boolean(rehearsal) && !rehearsal?.handAnimate),
    rehearsal?.meldSpeed ?? 1,
  );
  const ruleCue = useRuleCue(
    isRehearsal ? null : snapshot,
    playingMeld || footMotion.active || tableMotion.blocking,
  );
  useEffect(() => {
    if (scoring.enabled && snapshot) {
      const owner = snapshot.players.find(
        (player) => player.id === snapshot.viewerId,
      );
      if (owner) setViewed(owner.team);
    }
  }, [scoring.enabled]);
  useEffect(() => {
    setLeavingScores(false);
    setResultsHidden(false);
    setTotalsLanded(false);
    if (!snapshot || !["round_over", "finished"].includes(snapshot.phase))
      return;
    const timer = window.setTimeout(
      () => setTotalsLanded(true),
      opening.reduced ? 0 : 560,
    );
    return () => clearTimeout(timer);
  }, [snapshot?.code, snapshot?.round, snapshot?.phase, opening.reduced]);
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
        rehearsal.replacementIds
          ? { replaceIds: rehearsal.replacementIds }
          : undefined,
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
    !recordOpen &&
      (scoresOpen ||
        leaving ||
        (!scoring.enabled && snapshot?.phase === "scoring") ||
        (!resultsHidden &&
          ["round_over", "finished"].includes(snapshot?.phase || ""))),
    `${snapshot?.phase}:${snapshot?.scoring?.revision}:${leaving}:${scoresOpen}:${resultsHidden}`,
    () => {
      if (leaving) setLeaving(false);
      else if (scoresOpen) setScoresOpen(false);
      else if (["round_over", "finished"].includes(snapshot?.phase || ""))
        setResultsHidden(true);
    },
  );
  const refresh = useCallback(async () => {
    try {
      const incoming = await getRoom(code);
      accept(incoming);
      setJoining(false);
    } catch (error) {
      if (live.current && currentCode.current === code) {
        if (error instanceof GameApiError && error.status === 403) {
          setSnapshot(null);
          setSelected([]);
          setDrafts([]);
          if (error.code === "SEAT_REMOVED") setRemoved(true);
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
    setRemoved(false);
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
        roomSocket.current = socket;
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
      roomSocket.current = undefined;
    };
  }, [code, refresh, isRehearsal]);
  useEffect(() => {
    if (roomSnapshot?.viewerId && !isRehearsal) {
      // An invite visitor connects before joining; subscribe again once seated.
      roomSocket.current?.emit("handandfoot:subscribe", { code });
    }
  }, [roomSnapshot?.viewerId, code, isRehearsal]);
  const viewer = snapshot?.players.find(
    (player) => player.id === snapshot.viewerId,
  );
  const actor = snapshot?.players.find(
    (player) => player.id === snapshot.actorId,
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
  const turnAlertReady =
    !isRehearsal &&
    (!opening.state || opening.state.step === 4) &&
    snapshot?.playMode === "online" &&
    !busy &&
    !drawMotion.active &&
    !footMotion.active &&
    !tableMotion.blocking &&
    !joining &&
    !scoresOpen &&
    !recordOpen &&
    !leaving &&
    (myTurn ||
      (snapshot?.phase === "choose" && Boolean(viewer && !viewer.chosen)));
  const turnDecision = `${code}:${snapshot?.token}`;
  const nudge = useInactivityNudge(turnAlertReady, turnDecision);
  useTurnIndicator(turnAlertReady, turnDecision);
  useEffect(() => {
    if (!snapshot) return;
    if (!isRehearsal) writeStorage("handandfoot.room.v1", snapshot.code);
    if (
      !footMotion.active &&
      !playingMeld &&
      !tableMotion.blocking &&
      !scoring.enabled &&
      follow &&
      actor &&
      (!isRehearsal || snapshot.phase === "draw")
    )
      setViewed(actor.team);
  }, [
    snapshot?.token,
    snapshot?.actorId,
    follow,
    footMotion.active,
    playingMeld,
    tableMotion.blocking,
    scoring.enabled,
  ]);
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
    if (
      (drawMotion.active ||
        playingMeld ||
        footMotion.active ||
        tableMotion.blocking) &&
      type !== "leave"
    )
      return;
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
    if (
      type === "red_three" &&
      payload.expose === false &&
      !drawMotion.begin(
        roomSnapshot,
        boardRef.current?.querySelector(".draw-pile .card") ?? null,
        { replaceIds: (payload.cardIds as string[] | undefined) ?? selected },
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
      if (type === "draw" || type === "red_three") drawMotion.cancel();
      setLeavingScores(false);
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
          seat: null,
        }),
      );
      setJoining(false);
      if (!user) writeStorage("handandfoot.name.v1", joinName);
    } catch (error) {
      if (error instanceof GameApiError && error.code === "TABLE_IN_PROGRESS")
        navigate("/play", { replace: true });
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
  function stageRedThrees() {
    if (!canStageRedThrees) return;
    setDrafts((old) => [...old, { cardIds: [...selected], redThree: true }]);
    setSelected([]);
    setError("");
  }
  const side = snapshot?.sides[viewed] || snapshot?.sides[0];
  function browse(delta: number) {
    if (!snapshot) return;
    if (scoring.active && !scoring.paused && !scoring.done && !scoring.waiting)
      scoring.toggle();
    meldMotion.cancel();
    bookClosing.cancel();
    tableMotion.cancel();
    setViewed(
      (old) => (old + delta + snapshot.sides.length) % snapshot.sides.length,
    );
    setFollow(false);
  }
  function viewBoard(id: number) {
    if (
      scoring.active &&
      id !== viewer?.team &&
      !scoring.paused &&
      !scoring.done &&
      !scoring.waiting
    )
      scoring.toggle();
    meldMotion.cancel();
    bookClosing.cancel();
    tableMotion.cancel();
    setViewed(id);
    setFollow(false);
  }
  if (removed)
    return (
      <div className="page narrow-page">
        <PageTitle>TABLE LEFT</PageTitle>
        <div className="page-body button-stack">
          <p role="status">{error}</p>
          <Link className="button" to="/play">
            Back to Play
          </Link>
        </div>
      </div>
    );
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
              <LoginWarning />
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
    return <Lobby snapshot={snapshot} busy={busy} error={error} act={act} />;

  const stagedIds = new Set(drafts.flatMap((draft) => draft.cardIds));
  const newMeldCount = drafts.filter(
    (draft) => !draft.meldId && !draft.redThree,
  ).length;
  const addedCardCount = new Set(
    drafts
      .filter((draft) => draft.meldId || draft.redThree)
      .flatMap((draft) => draft.cardIds),
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
    (sum, id) =>
      sum + (cardMap.get(id)?.redThree ? 0 : cardMap.get(id)?.value || 0),
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
    !playingMeld &&
    !footMotion.active &&
    !tableMotion.blocking;
  const canDrawStock =
    myTurn &&
    snapshot.phase === "draw" &&
    !busy &&
    !pickup &&
    !drawMotion.active &&
    !playingMeld &&
    !footMotion.active &&
    !tableMotion.blocking;
  const needsSecondDraw = Boolean(snapshot.pickupDrawPending);
  const drawingCount = drawMotion.request?.count ?? snapshot.drawCount ?? 2;
  const showHandActions =
    canStage ||
    (myTurn &&
      needsSecondDraw &&
      !busy &&
      !drawMotion.active &&
      !playingMeld &&
      !footMotion.active &&
      !tableMotion.blocking);
  const canTakeDiscard =
    myTurn &&
    snapshot.phase === "draw" &&
    !busy &&
    !drawMotion.active &&
    !playingMeld &&
    !footMotion.active &&
    !tableMotion.blocking &&
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
  const canGoOut = Boolean(
    viewer?.inFoot &&
      snapshot.hand.length === 1 &&
      hasGoingOutBooks(ownSide.melds),
  );
  const discardLabel = canGoOut ? "Discard & go out" : "Discard";
  const draftRequirement = goingOutRequirement(
    Boolean(viewer?.inFoot),
    snapshot.hand,
    ownSide.melds,
    drafts,
    pickup ? snapshot.discard : null,
    pickup ? 1 : 0,
  );
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
    let target = meld;
    for (const draft of drafts.filter((draft) => draft.meldId === meld.id)) {
      const additions = draft.cardIds.flatMap((id) => cardMap.get(id) || []);
      if (
        additions.length !== draft.cardIds.length ||
        !canExtendMeld(target, additions)
      )
        return false;
      const cards = [...target.cards, ...additions];
      target = {
        ...target,
        cards,
        complete: cards.length >= 7,
        dirty:
          target.dirty ||
          (target.kind === "set" &&
            additions.some((card) => card.wild && card.rank !== target.rank)),
      };
    }
    if (pendingDiscard && target.cards.length === 6) return false;
    return canExtendMeld(target, stageCards);
  }
  function canTargetMeld(meld: Meld) {
    return viewer?.team === side?.id && canAddToMeld(meld);
  }
  const boardPlayers = snapshot.players.filter(
    (player) => player.team === side?.id,
  );
  const review = ["round_over", "finished"].includes(snapshot.phase);
  const selectedRed =
    selected.length > 0 && selected.every((id) => cardMap.get(id)?.redThree);
  const singleRed = selectedRed && selected.length === 1;
  const canStageRedThrees =
    canStage && !pickup && !needsSecondDraw && ownSide.opened && selectedRed;
  const stagedRedCount = drafts
    .filter((draft) => draft.redThree)
    .reduce((count, draft) => count + draft.cardIds.length, 0);
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
    const publicPiles = (
      <BoardPiles
        key={side?.id}
        players={boardPlayers}
        melds={side?.melds ?? []}
        isYou={ownBoard}
        canTarget={(meld) =>
          scoring.waiting
            ? !busy &&
              Boolean(
                snapshot.scoring?.options.some(
                  (option) => option.id === meld.id,
                ),
              )
            : canTargetMeld(meld)
        }
        onTarget={(id) =>
          scoring.waiting ? void act("score_pay", { pileId: id }) : stage(id)
        }
        drafts={drafts}
        flyingIds={meldMotion.hiddenIds}
        cardPoints={cardPoints}
        emptyMessage={
          rehearsal?.emptyTableMessage ??
          (scoring.enabled
            ? scoring.done
              ? "All card values counted."
              : "All table cards used."
            : undefined)
        }
        redThreeBonusLost={redThreeBonusLost}
        redThreeClosing={boardPlayers.some((player) =>
          bookClosing.openRedPlayers.has(player.id),
        )}
        canTargetRedThrees={Boolean(
          (canStageRedThrees ||
            (scoring.waiting &&
              !busy &&
              snapshot.scoring?.options.some((option) => option.redThree))) &&
            ownBoard,
        )}
        onTargetRedThrees={
          scoring.waiting
            ? () => void act("score_pay", { pileId: `reds:${viewer?.team}` })
            : stageRedThrees
        }
        stagedRedCount={ownBoard ? stagedRedCount : 0}
        settling={scoring.waiting}
      />
    );
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
        className={`game-page ${snapshot.scoringMode === "individual" ? "individual-game" : "partnership-game"}${snapshot.opening ? " round-opened" : ""}${scoring.enabled ? " live-scoring" : ""}`}
        data-score-kind={scoring.beat?.kind}
        onPointerDown={nudge.reset}
        onKeyDown={nudge.reset}
      >
        {snapshot.idleWarning && (
          <p className="idle-warning" role="alert">
            You’ve been inactive for 9 minutes. Make your next choice within a
            minute to keep your seat; otherwise a bot will take over.
          </p>
        )}
        {!isRehearsal && connection !== "live" && (
          <p className="connection-note" role="status">
            {connection === "connecting"
              ? "Connecting to your table…"
              : "Reconnecting live updates. Your table is saved; checking every few seconds."}
          </p>
        )}
        <header className="game-header">
          <button
            type="button"
            className="round-pill round-record-trigger"
            aria-label={`Round ${snapshot.round}. View round record`}
            aria-haspopup="dialog"
            aria-expanded={recordOpen}
            onClick={() => {
              setScoresOpen(false);
              if (review) setResultsHidden(true);
              setRecordOpen(true);
            }}
          >
            Round {snapshot.round}
          </button>
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
                  data-foot-discard-hidden={Boolean(footMotion.discardFlight)}
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
                  {discardView.faceDown ? (
                    <span
                      className="discard-face"
                      role="img"
                      aria-label="Final discard, face down"
                    >
                      <Card small />
                    </span>
                  ) : discardView.card ? (
                    <span className="discard-face">
                      <Card card={discardView.card} small />
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
                  Discard <small>{discardView.count}</small>
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
          {scoring.beat && (
            <ScoreCount beat={scoring.beat} beatKey={scoring.key} />
          )}
          {rehearsal?.headerSummary ?? (
            <GameMenu
              snapshot={snapshot}
              onView={viewBoard}
              onScores={() => setScoresOpen(true)}
              onLeave={() =>
                isRehearsal ? navigate("/preview") : setLeaving(true)
              }
            />
          )}
        </header>
        <div
          className={`turn-message ${nudge.shaking ? "inactivity-shake" : ""}`}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <p>
            {scoring.enabled ? (
              scoring.beat?.kind === "ready" &&
              /stack ran out/i.test(snapshot.scoring?.reason ?? "") ? (
                "The deck is exhausted. Settle the cards left in play."
              ) : (
                (scoring.beat?.title ?? snapshot.message)
              )
            ) : bookClosing.flight ? (
              "Closing the book…"
            ) : meldMotion.active ? (
              snapshot.actorId === snapshot.viewerId ? (
                "Playing your draft…"
              ) : (
                `${actor?.name} is playing…`
              )
            ) : tableMotion.holding ? (
              snapshot.message
            ) : tableMotion.flight?.event.faceDown ? (
              "Going out…"
            ) : footMotion.active ? (
              footMotion.discardFlight ? (
                "Discarding your last hand card…"
              ) : (
                "Picking up your foot…"
              )
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
          {ruleCue && !scoring.enabled && (
            <span className="rule-state-cue">{ruleCue}</span>
          )}
          {scoring.beat && snapshot.phase === "scoring" && (
            <div className="live-score-controls">
              {scoring.waiting ? (
                <button
                  className="button small"
                  disabled={busy}
                  onClick={() => void act("score_auto")}
                >
                  Cover automatically
                </button>
              ) : scoring.done ? (
                <>
                  <button
                    className="button small"
                    disabled={busy || snapshot.scoring?.confirmed}
                    onClick={() => void act("score_confirm")}
                  >
                    {snapshot.scoring?.confirmed
                      ? "Waiting for the table…"
                      : "Confirm score"}
                  </button>
                  <button className="text-button" onClick={scoring.replay}>
                    Replay count
                  </button>
                </>
              ) : (
                <>
                  <button className="text-button" onClick={scoring.toggle}>
                    {scoring.paused ? "Resume count" : "Pause count"}
                  </button>
                  <button className="text-button" onClick={scoring.skip}>
                    Skip animation
                  </button>
                </>
              )}
            </div>
          )}
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
            playingMeld || scoring.enabled
              ? {
                  minHeight: Math.max(
                    meldMotion.flight?.boardHeight ?? 0,
                    bookClosing.boardHeight ?? 0,
                    scoringBoardHeight,
                  ),
                }
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
            data-side-id={side?.id}
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
              <h2 className="sr-only">{side?.name}</h2>
              <PlayerBoardNav
                sides={snapshot.sides}
                players={snapshot.players}
                viewed={viewed}
                viewerId={snapshot.viewerId}
                activePlayerId={
                  ["draw", "play"].includes(snapshot.phase)
                    ? snapshot.actorId
                    : null
                }
                dealerId={snapshot.dealerId}
                previousDealerId={motion?.previousDealerId}
                profileIcon={user?.profile_icon}
                onView={viewBoard}
                showLeader={!review || totalsLanded}
              />
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
                  <div className="opening-public-tableau">{publicPiles}</div>
                )}
              </div>
            ) : snapshot.phase === "choose" && !viewer?.chosen && ownBoard ? (
              startingPiles
            ) : (
              publicPiles
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
            <div
              className="board-footer-summary"
              data-visible={
                rehearsal?.footerSummaryVisible ??
                (scoring.enabled || Boolean(rehearsal?.footerSummary))
              }
              aria-hidden={
                !(
                  rehearsal?.footerSummaryVisible ??
                  (scoring.enabled || Boolean(rehearsal?.footerSummary))
                )
              }
            >
              {rehearsal?.footerSummary ?? (
                <SettlementPiles beat={scoring.beat} />
              )}
            </div>
            <div className="board-pagination">
              <div
                className="table-dots"
                role="group"
                aria-label={
                  snapshot.scoringMode === "partnership"
                    ? "Choose a team board"
                    : "Choose a player board"
                }
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
                  {rehearsal?.handCaption ??
                    (scoring.beat?.gathered && snapshot.scoringFoot?.length
                      ? "HAND + FOOT"
                      : undefined) ??
                    `YOUR ${viewer?.inFoot ? "FOOT" : "HAND"}`}
                </span>
                <span>
                  {snapshot.hand.length - drawMotion.hiddenIds.size}{" "}
                  {snapshot.hand.length - drawMotion.hiddenIds.size === 1
                    ? "card"
                    : "cards"}
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
                    {drafts.some((draft) => !draft.redThree) && (
                      <>
                        <span
                          className="draft-summary-dot"
                          aria-hidden="true"
                        />
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
                      </>
                    )}
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
              {(!viewer?.inFoot || footSource) && (
                <FootPreview
                  topCard={footSource?.topCard ?? snapshot.footTop ?? null}
                  count={footSource?.count ?? viewer?.footCount ?? 0}
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
                      pointsLeft={cardPoints?.[card.id]}
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
                {rehearsal?.emptyHandMessage ??
                  (scoring.beat
                    ? scoring.beat.hand.length
                      ? "Your remaining card is above the settlement piles."
                      : "All hand cards settled."
                    : snapshot.phase === "choose"
                      ? "Your chosen cards will appear here."
                      : review
                        ? "A well-played hand."
                        : "Your hand is empty.")}
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
                    blockedReason={draftRequirement}
                    showRequirement={
                      rehearsal?.draftReview?.showOpeningRequirement
                    }
                    onPlay={() =>
                      void act(pickup ? "pickup" : "meld", { groups: drafts })
                    }
                  />
                  <DrawFirstHint
                    blocked={needsSecondDraw || pickup}
                    label={discardLabel}
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
                          singleRed && !canGoOut ? "red_three" : "discard",
                          singleRed && !canGoOut
                            ? { cardIds: selected, expose: false }
                            : { cardId: selected[0] },
                        )
                      }
                    >
                      {canGoOut
                        ? discardLabel
                        : singleRed
                          ? "Replace"
                          : "Discard"}
                    </button>
                  </DrawFirstHint>
                </div>
                {selectedRed &&
                  !pickup &&
                  (selected.length > 1 || !ownSide.opened) && (
                    <div className="red-three-actions">
                      {selected.length > 1 && (
                        <>
                          <span>Red threes:</span>
                          <button
                            className="text-button"
                            disabled={drafts.length > 0}
                            onClick={() =>
                              void act("red_three", {
                                cardIds: selected,
                                expose: false,
                              })
                            }
                          >
                            Replace from stack
                          </button>
                        </>
                      )}
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
        {snapshot.phase === "scoring" &&
          snapshot.scoring &&
          !recordOpen &&
          !scoring.enabled && (
            <ScoringReview
              snapshot={snapshot}
              busy={busy}
              error={error}
              act={act}
            />
          )}
        {!recordOpen &&
          ((review && !resultsHidden) ||
            (scoresOpen && snapshot.phase !== "scoring")) && (
            <div className="modal-backdrop">
              <RoundScoreSheet
                id="round-results"
                snapshot={snapshot}
                profileIcon={user?.profile_icon}
                review={review}
                leavingScores={leavingScores}
                totalsLanded={totalsLanded}
                busy={busy}
                resultNotice={
                  !isRehearsal && (
                    <p className="win-stats-notice">
                      {snapshot.developmentFixture
                        ? "Preview games do not count toward account wins. "
                        : user
                          ? "Your result is saved. "
                          : "Guest games do not count toward account wins. "}
                      <Link
                        className="text-link"
                        to={`/leaderboard?mode=${snapshot.playMode}`}
                      >
                        View{" "}
                        {snapshot.playMode === "practice"
                          ? "Against Bots"
                          : "Multiplayer"}{" "}
                        leaderboard
                      </Link>
                    </p>
                  )
                }
                onClose={() => setScoresOpen(false)}
                onLeave={() => void act("leave")}
                visibilityToggle={
                  review && (
                    <ResultsToggle
                      hidden={false}
                      controls="round-results"
                      onToggle={() => {
                        setResultsHidden(true);
                        setScoresOpen(false);
                      }}
                    />
                  )
                }
                onContinue={() => {
                  if (snapshot.phase !== "finished") {
                    void act("next_round");
                    return;
                  }
                  setLeavingScores(true);
                  window.setTimeout(
                    () =>
                      void act(
                        snapshot.phase === "finished"
                          ? "rematch"
                          : "next_round",
                      ),
                    opening.reduced ? 0 : 240,
                  );
                }}
              />
            </div>
          )}
        {review && resultsHidden && !scoresOpen && (
          <ResultsToggle
            hidden
            controls="round-results"
            onToggle={() => setResultsHidden(false)}
          />
        )}
        {drawMotion.request &&
          drawMotion.cards.length > 0 &&
          motionLayer(
            <DrawCards
              request={drawMotion.request}
              cards={drawMotion.cards}
              board={boardRef}
              toDivider={!isRehearsal && viewed !== viewer?.team}
            />,
          )}
        {meldMotion.flight &&
          motionLayer(
            <MeldCards
              flight={meldMotion.flight}
              paused={rehearsal?.meldPaused ?? false}
            />,
          )}
        {bookClosing.hiddenPiles.length > 0 && (
          <style>
            {bookClosing.hiddenPiles
              .map((pile) => {
                const selector = pile.red
                  ? `.game-page .red-three-pile[data-red-three-player-id="${pile.id}"]`
                  : `.game-page [data-meld-id="${pile.id}"]`;
                return `${selector} ${pile.red ? ".red-three-stack" : ".closed-card-stack"} {visibility:hidden;}
${selector} > .meld-kind, ${selector} > .meld-count {opacity:0;transition:none;}`;
              })
              .join("\n")}
          </style>
        )}
        {bookClosing.flight &&
          motionLayer(
            <ClosingBooks
              flight={bookClosing.flight}
              speed={rehearsal?.meldSpeed ?? 1}
              paused={rehearsal?.meldPaused ?? false}
            />,
          )}
        {footMotion.discardFlight && (
          <MeldCards flight={footMotion.discardFlight} paused={false} />
        )}
        {tableMotion.flight &&
          motionLayer(<TableCards flight={tableMotion.flight} />)}
        {scoring.beat && (
          <ScoreMotion
            board={boardRef}
            beat={scoring.beat}
            beatKey={scoring.key}
            reduced={opening.reduced}
            paused={scoring.paused}
            enabled={viewed === viewer?.team}
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
  const table = opening.state ? (
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
  return (
    <>
      {isRehearsal ? (
        table
      ) : (
        <FootGather
          gathering={footMotion.gathering}
          speed={1}
          enabled={footMotion.enabled}
        >
          {table}
        </FootGather>
      )}
      {recordOpen && incomingSnapshot && (
        <RoundRecordDialog
          snapshot={incomingSnapshot}
          profileIcon={user?.profile_icon}
          onClose={() => setRecordOpen(false)}
        />
      )}
    </>
  );
}

function BoardPiles({
  players,
  melds,
  isYou,
  canTarget,
  onTarget,
  drafts,
  flyingIds,
  cardPoints,
  emptyMessage,
  redThreeBonusLost,
  redThreeClosing,
  canTargetRedThrees,
  onTargetRedThrees,
  stagedRedCount,
  settling = false,
}: {
  players: Player[];
  melds: Meld[];
  isYou: boolean;
  canTarget: (meld: Meld) => boolean;
  onTarget: (id: string) => void;
  drafts: Draft[];
  flyingIds: Set<string>;
  cardPoints?: Record<string, number>;
  emptyMessage?: string;
  redThreeBonusLost?: boolean;
  redThreeClosing?: boolean;
  canTargetRedThrees: boolean;
  onTargetRedThrees: () => void;
  stagedRedCount: number;
  settling?: boolean;
}) {
  const closed = melds.filter((meld) => meld.complete);
  const open = melds.filter((meld) => !meld.complete);
  const redThrees = players.flatMap((player) => player.redThrees);
  const hasRedThrees = redThrees.length > 0;
  const showRedThrees =
    hasRedThrees || canTargetRedThrees || stagedRedCount > 0;
  const closedRedThrees =
    redThrees.length >= 3 && !redThreeBonusLost && !redThreeClosing;
  const redOffset = Math.min(3, 12 / Math.max(1, redThrees.length - 1));
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
              cardPoints={cardPoints}
              targetLabel={
                settling ? `Use ${meld.rank}’s to cover debt` : undefined
              }
            />
          ))}
          {includeRedThrees && (
            <div
              className={`red-three-pile ${canTargetRedThrees ? "legal-target" : ""}`}
              role="group"
              aria-label="Red threes"
              data-red-three-player-id={
                players.length === 1 ? players[0].id : undefined
              }
              data-red-three-team-id={players[0]?.team}
            >
              <span className="meld-kind">
                {redThreeBonusLost ? "Broken reds" : "Red threes"}
              </span>
              {isClosed ? (
                <button
                  className="red-three-stack"
                  disabled={!canTargetRedThrees}
                  aria-label={
                    canTargetRedThrees
                      ? settling
                        ? "Use red threes to cover debt"
                        : "Add selected cards to red threes"
                      : `Red threes, ${redThrees.length} cards`
                  }
                  onClick={onTargetRedThrees}
                  style={{
                    width: 62 + redOffset * (redThrees.length - 1),
                  }}
                >
                  {redThrees.map((card, index) => (
                    <span
                      style={{ left: index * redOffset }}
                      key={card.id}
                      data-card-id={card.id}
                      data-meld-hidden={flyingIds.has(card.id)}
                    >
                      <Card card={card} small />
                    </span>
                  ))}
                </button>
              ) : (
                <button
                  className="red-three-stack meld-card-stack indexed-stack"
                  disabled={!canTargetRedThrees}
                  aria-label={
                    canTargetRedThrees
                      ? settling
                        ? "Use red threes to cover debt"
                        : "Add selected cards to red threes"
                      : `Red threes, ${redThrees.length} cards`
                  }
                  onClick={onTargetRedThrees}
                >
                  <div
                    className="meld-card-layers"
                    style={
                      {
                        "--stack-height": `${106 + Math.max(0, redThrees.length - 1) * 25}px`,
                      } as React.CSSProperties
                    }
                  >
                    {!hasRedThrees && (
                      <span
                        className="red-three-empty-target"
                        aria-hidden="true"
                      >
                        3 <Icon name="heart" />
                      </span>
                    )}
                    {redThrees.map((card, index) => (
                      <div
                        className="meld-card-layer"
                        style={{ top: index * 25 }}
                        key={card.id}
                        data-card-id={card.id}
                        data-meld-hidden={flyingIds.has(card.id)}
                      >
                        <Card
                          card={card}
                          indexed={index < redThrees.length - 1}
                          pointsLeft={cardPoints?.[card.id]}
                        />
                      </div>
                    ))}
                  </div>
                </button>
              )}
              <span className="meld-count">
                {redThrees.length}
                {stagedRedCount > 0 && (
                  <span className="meld-staged-count"> +{stagedRedCount}</span>
                )}
                {redThreeBonusLost
                  ? " · 5 pts each"
                  : redThrees.length < 3
                    ? " / 3"
                    : " cards"}
              </span>
            </div>
          )}
        </div>
      )
    );
  }
  return (
    <section
      className="player-lane"
      aria-label={`${players.map((player) => player.name).join(" & ")}’s public piles`}
      data-player-lane-id={players.length === 1 ? players[0].id : undefined}
      data-team-lane-id={players[0]?.team}
      style={
        {
          "--max-pile-cards": Math.max(
            7,
            ...melds.map((meld) => meld.cards.length),
          ),
        } as React.CSSProperties
      }
    >
      <div className="melds">
        {piles(closed, "Completed books", closedRedThrees)}
        {melds.length === 0 && !showRedThrees ? (
          <div className="empty-lane">
            <Book />
            <p>
              {emptyMessage ??
                (isYou
                  ? "Your melds will appear here."
                  : "No melds on the table yet.")}
            </p>
          </div>
        ) : (
          piles(open, "Open piles", showRedThrees && !closedRedThrees)
        )}
      </div>
    </section>
  );
}
