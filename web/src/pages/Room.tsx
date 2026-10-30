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
import { useAchievementRefresh } from "../hooks/useAchievementRefresh";
import {
  canExtendMeld,
  detectMeldKind,
  pickupPlayableCards,
} from "../lib/melds";
import { goingOutRequirement, hasGoingOutBooks } from "../lib/goingOut";
import { Card } from "../components/Card";
import { HandDock } from "../components/HandDock";
import { HandInfo } from "../components/HandInfo";
import { HandTabs } from "../components/HandTabs";
import { PublicHand } from "../components/PublicHand";
import { useMobileLayout } from "../hooks/useMobileLayout";
import { usePageSweep } from "../hooks/usePageSweep";
import { useSwipePages } from "../hooks/useSwipePages";
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
import { FootPickupNotice } from "../components/FootPickupNotice";
import { MeldPile } from "../components/MeldPile";
import { Book, Icon } from "../components/Icons";
import { PageTitle } from "../components/PageTitle";
import { Lobby } from "../components/Lobby";
import { RoundScoreSheet } from "../components/RoundScoreSheet";
import { RoundRecordDialog } from "../components/RoundRecordDialog";
import { ResultsToggle } from "../components/ResultsToggle";
import { ScoreCount, SettlementPiles } from "../components/ScoreCount";
import { ScoreMotion } from "../components/ScoreMotion";
import { useLiveScoring } from "../hooks/useLiveScoring";
import {
  MOBILE_PLAY_MS,
  useMobilePlayMotion,
} from "../hooks/useMobilePlayMotion";
import { MobilePlayCards } from "../components/MobilePlayCards";
import { MobileFootCards } from "../components/MobileFootCards";
import { useHandLayoutMotion } from "../hooks/useHandLayoutMotion";
import { useConcealedHand } from "../hooks/useConcealedHand";
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
import { useMeldStackMotion } from "../hooks/useMeldStackMotion";
import { useFootMotion } from "../hooks/useFootMotion";
import { useTableMotion } from "../hooks/useTableMotion";
import { useCardMovementSounds } from "../hooks/useCardMovementSounds";
import { useTurnReady } from "../hooks/useTurnReady";
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
  handExpanded?: boolean;
  emptyHandMessage?: string;
  emptyTableMessage?: string;
  cardPoints?: Record<string, number>;
  redThreeBonusLost?: boolean;
  animationKey?: number;
  tableau?: ReactNode;
  deckOverlay?: ReactNode;
  setup?: boolean;
  openingActive?: boolean;
  footSource?: { topCard: Face | null; count: number };
  onDraw?: () => void;
  onCommand?: (type: string, payload: Record<string, unknown>) => void;
  liveScoring?: boolean;
  footAnimate?: boolean;
  previewControls?: ReactNode;
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

function handOwner(
  snapshot: Snapshot | null,
  viewed: number,
  requested: string | null,
  follow: boolean,
) {
  const team = snapshot?.sides[viewed]?.id ?? snapshot?.sides[0]?.id;
  const members =
    snapshot?.players.filter((player) => player.team === team) ?? [];
  return (
    members.find((player) => player.id === requested) ??
    members.find((player) => follow && player.id === snapshot?.actorId) ??
    members.find((player) => player.id === snapshot?.viewerId) ??
    members[0]
  );
}

export function Room({ rehearsal }: { rehearsal?: RoomRehearsal } = {}) {
  const mobile = useMobileLayout();
  const [handExpanded, setHandExpanded] = useState(
    rehearsal?.handExpanded ?? false,
  );
  const [handPage, setHandPage] = useState(0);
  const boardSweepDirection = useRef<number | null>(null);
  const handNavigation = useRef(0);
  const boardSweepRef = useRef<HTMLElement>(null);
  const boardContentRef = useRef<HTMLDivElement>(null);
  const revealAfterDraw = useRef(false);
  const { code = "" } = useParams();
  const navigate = useNavigate();
  const sound = useSound();
  const { user, loading: authLoading } = useAuth();
  const [roomSnapshot, setSnapshot] = useState<Snapshot | null>(null);
  const isRehearsal = Boolean(rehearsal);
  useAchievementRefresh(roomSnapshot, Boolean(user) && !isRehearsal);
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
  // Keep manual browsing through your actions, then resume on the next turn.
  const browsingOwnTurn = useRef(false);
  const [viewed, setViewed] = useState(rehearsal?.viewedTeam ?? 0);
  const [viewedHandPlayerId, setViewedHandPlayerId] = useState<string | null>(
    null,
  );
  const focusHandTab = useRef(false);
  const [scoresOpen, setScoresOpen] = useState(false);
  const [recordOpen, setRecordOpen] = useState(rehearsal?.recordOpen ?? false);
  const [resultsHidden, setResultsHidden] = useState(false);
  const [leavingScores, setLeavingScores] = useState(false);
  const [totalsLanded, setTotalsLanded] = useState(false);
  const [scoringBoardHeight, setScoringBoardHeight] = useState(0);
  const settlingScore = useRef("");
  const [removed, setRemoved] = useState(false);
  const refreshing = useRef<{ code: string } | null>(null);
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
  const incomingHandOwner = handOwner(
    incomingSnapshot,
    viewed,
    viewedHandPlayerId,
    follow,
  );
  const privateFooter = incomingHandOwner?.id === incomingSnapshot?.viewerId;
  const boardRef = useRef<HTMLDivElement>(null);
  const mobileMotion = useMobilePlayMotion(
    incomingSnapshot,
    boardRef,
    mobile && privateFooter && rehearsal?.meldAnimate !== false,
    opening.reduced,
  );
  useLayoutEffect(() => {
    if (mobileMotion.target && mobileMotion.target.kind !== "discard")
      setViewed(mobileMotion.target.team);
  }, [mobileMotion.target]);
  const meldMotion = useMeldMotion(
    mobileMotion.snapshot,
    boardRef,
    opening.reduced ||
      (mobile && privateFooter) ||
      rehearsal?.meldAnimate === false,
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
  const playingMeld =
    meldMotion.active || bookClosing.active || mobileMotion.blocking;
  const footMotion = useFootMotion(
    incomingSnapshot,
    bookClosing.snapshot,
    boardRef,
    opening.reduced,
    playingMeld,
    isRehearsal,
    privateFooter,
    mobile,
    Boolean(rehearsal?.footAnimate),
  );
  const tableMotion = useTableMotion(
    incomingSnapshot,
    footMotion.snapshot,
    boardRef,
    opening.reduced,
    isRehearsal && !rehearsal?.tableAnimate,
    viewed,
    rehearsal?.meldSpeed ?? 1,
    mobile || footMotion.active,
    mobileMotion.blocking || footMotion.active,
    handNavigation.current,
    follow,
    playingMeld,
  );
  const scoring = useLiveScoring(
    tableMotion.snapshot,
    !isRehearsal || Boolean(rehearsal?.liveScoring),
    opening.reduced,
  );
  useCardMovementSounds(
    isRehearsal || opening.state ? null : incomingSnapshot,
    tableMotion.flight?.event ?? tableMotion.pickup,
    tableMotion.blocking,
  );
  const snapshot = scoring.snapshot;
  const review = Boolean(
    snapshot && ["round_over", "finished"].includes(snapshot.phase),
  );
  const footerPlayer =
    scoring.enabled && !scoring.done
      ? snapshot?.players.find((player) => player.id === snapshot.viewerId)
      : handOwner(snapshot, viewed, viewedHandPlayerId, follow);
  const viewingOwnHand = footerPlayer?.id === snapshot?.viewerId;
  useLayoutEffect(() => {
    if (!focusHandTab.current) return;
    focusHandTab.current = false;
    boardRef.current
      ?.querySelector<HTMLButtonElement>('.hand-owner-tab[aria-pressed="true"]')
      ?.focus({ preventScroll: true });
  }, [footerPlayer?.id]);
  const turnReady = useTurnReady(
    isRehearsal ? null : roomSnapshot,
    accept,
    boardRef,
    footMotion.active ||
      tableMotion.blocking ||
      playingMeld ||
      Boolean(opening.state) ||
      (follow && footerPlayer?.id !== roomSnapshot?.actorId),
    opening.reduced,
  );
  const footerMembers =
    snapshot?.players.filter((player) => player.team === footerPlayer?.team) ??
    [];
  const footerTitle = `${viewingOwnHand ? "Your" : `${footerPlayer?.name}’s`} ${review ? "Cards" : footerPlayer?.inFoot ? "foot" : "hand"}`;
  const revealedCards = review ? footerPlayer?.roundCards : undefined;
  const footerHandEvent =
    !review && tableMotion.handEvent?.playerId === footerPlayer?.id
      ? tableMotion.handEvent
      : undefined;
  const concealedHand = useConcealedHand({
    scope: `${snapshot?.code}:${snapshot?.round}:${footerPlayer?.id}`,
    count: viewingOwnHand || review ? 0 : (footerPlayer?.handCount ?? 0),
    action: footerHandEvent,
    disabled:
      review ||
      opening.reduced ||
      Boolean(opening.state) ||
      Boolean(rehearsal && !rehearsal.handAnimate),
    speed: rehearsal?.meldSpeed ?? 1,
    board: boardRef,
  });
  const gatheringViewedFoot =
    (viewingOwnHand && footMotion.gathering) ||
    Boolean(
      !viewingOwnHand && tableMotion.pickup?.playerId === footerPlayer?.id,
    );
  const footPickup = footMotion.pickup ?? tableMotion.pickup;
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
    enabled: Boolean(snapshot),
    reduced:
      opening.reduced ||
      mobile ||
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
  useMeldStackMotion(
    boardRef,
    `${snapshot?.code}:${snapshot?.round}:${snapshot?.viewerId}:${viewed}:${mobile}`,
    opening.reduced || rehearsal?.meldAnimate === false,
    rehearsal?.meldSpeed ?? 1,
    rehearsal?.meldPaused ?? false,
    mobile ? MOBILE_PLAY_MS : undefined,
  );
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
      mobile ||
      !viewingOwnHand ||
      Boolean(opening.state) ||
      drawMotion.active ||
      playingMeld ||
      footMotion.active ||
      (Boolean(rehearsal) && !rehearsal?.handAnimate),
    rehearsal?.meldSpeed ?? 1,
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
  const endingSound = useRef<string | null>(null);
  useEffect(() => {
    if (snapshot?.phase !== "finished") {
      endingSound.current = null;
      return;
    }
    if (recordOpen || (resultsHidden && !scoresOpen)) return;
    const key = `${snapshot.code}:${snapshot.round}`;
    if (endingSound.current === key) return;
    endingSound.current = key;
    sound.play("win");
  }, [
    snapshot?.code,
    snapshot?.round,
    snapshot?.phase,
    recordOpen,
    resultsHidden,
    scoresOpen,
    sound.play,
  ]);
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
      sound.play("select");
    }
  }, [rehearsal?.drawReplay]);
  const setup =
    rehearsal?.setup ?? Boolean(opening.state && opening.state.step <= 4);
  const openingInProgress = Boolean(
    opening.state ||
      rehearsal?.openingActive ||
      snapshot?.phase === "choose" ||
      (snapshot?.opening && !snapshot.opening.complete),
  );
  const scoringInProgress = scoring.enabled && !scoring.done;
  const mobileGame =
    mobile &&
    !setup &&
    Boolean(
      snapshot &&
        (["choose", "draw", "play", "round_over", "finished"].includes(
          snapshot.phase,
        ) ||
          scoring.enabled),
    );
  const handScope = `${snapshot?.code}:${snapshot?.round}:${snapshot?.viewerId}`;
  const previousHand = useRef<{ scope: string; ids: Set<string> } | null>(null);
  useEffect(() => {
    const ids = new Set(snapshot?.hand.map((card) => card.id) ?? []);
    const old = previousHand.current;
    previousHand.current = { scope: handScope, ids };
    if (!mobileGame || !viewingOwnHand) return;
    if (old?.scope !== handScope) {
      setHandPage(0);
      setHandExpanded(false);
      revealAfterDraw.current = false;
      return;
    }
    const sorted = snapshot!.hand
      .slice()
      .sort(
        (a, b) =>
          rankOrder.indexOf(a.rank) - rankOrder.indexOf(b.rank) ||
          a.suit.localeCompare(b.suit) ||
          a.id.localeCompare(b.id),
      );
    const firstNew = sorted.findIndex((card) => !old.ids.has(card.id));
    if (firstNew >= 0) {
      setHandPage(Math.floor(firstNew / 10));
      if (drawMotion.active) revealAfterDraw.current = true;
      else if (snapshot?.phase !== "choose") setHandExpanded(true);
    } else
      setHandPage((page) =>
        Math.min(page, Math.max(0, Math.ceil(ids.size / 10) - 1)),
      );
  }, [
    mobileGame,
    viewingOwnHand,
    handScope,
    snapshot?.hand.map((card) => card.id).join(","),
  ]);
  useLayoutEffect(() => {
    setHandPage(0);
    setHandExpanded(rehearsal?.handExpanded ?? false);
  }, [footerPlayer?.id, handScope]);
  useEffect(() => {
    if (mobileGame && scoringInProgress) setHandExpanded(true);
  }, [mobileGame, scoringInProgress]);
  useEffect(() => {
    if (
      mobileGame &&
      viewingOwnHand &&
      !drawMotion.active &&
      revealAfterDraw.current
    ) {
      revealAfterDraw.current = false;
      setHandExpanded(true);
    }
  }, [mobileGame, viewingOwnHand, drawMotion.active]);
  useEffect(() => {
    if (mobileGame && viewingOwnHand && (pickup || error))
      setHandExpanded(true);
  }, [mobileGame, viewingOwnHand, pickup, error]);
  const handScrollRef = useHorizontalWheel(
    Boolean(snapshot?.hand.length),
    `${footerPlayer?.id}:${rehearsal?.animationKey ?? opening.state?.replay}`,
  );
  usePageSweep(
    handScrollRef,
    mobileGame &&
      !drawMotion.active &&
      !mobileMotion.active &&
      !footMotion.active,
    handPage,
    handScope,
  );
  usePageSweep(
    mobile ? boardSweepRef : boardContentRef,
    boardSweepDirection.current !== null &&
      !setup &&
      !playingMeld &&
      !footMotion.active,
    viewed,
    handScope,
    boardSweepDirection.current ?? undefined,
    mobile ? 180 : 200,
  );
  const handSwipe = useSwipePages(
    mobileGame &&
      !drawMotion.active &&
      !mobileMotion.active &&
      !footMotion.active,
    Math.min(
      handPage,
      Math.max(0, Math.ceil((snapshot?.hand.length ?? 0) / 10) - 1),
    ),
    Math.max(1, Math.ceil((snapshot?.hand.length ?? 0) / 10)),
    setHandPage,
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
    if (refreshing.current?.code === code) return;
    const pending = { code };
    refreshing.current = pending;
    try {
      let incoming: Snapshot;
      try {
        incoming = await getRoom(code);
      } catch (error) {
        if (
          !(error instanceof GameApiError) ||
          error.status !== 403 ||
          error.code === "SEAT_REMOVED" ||
          error.message !== "Join this table before viewing it."
        )
          throw error;
        if (!live.current || currentCode.current !== code) return;
        incoming = await request<Snapshot>(
          `/rooms/${encodeURIComponent(code)}/join`,
          {
            name:
              user?.name ||
              readStorage("handandfoot.name.v1", "").trim() ||
              "Guest",
            seat: null,
          },
        );
        if (live.current && currentCode.current === code) setError("");
      }
      if (!live.current || currentCode.current !== code) return;
      accept(incoming);
    } catch (error) {
      if (live.current && currentCode.current === code) {
        if (error instanceof GameApiError && error.status === 403) {
          setSnapshot(null);
          setSelected([]);
          setDrafts([]);
          if (error.code === "SEAT_REMOVED") setRemoved(true);
        }
        if (error instanceof GameApiError && error.code === "TABLE_IN_PROGRESS")
          navigate("/play", { replace: true });
        setError((error as Error).message);
      }
    } finally {
      if (refreshing.current === pending) refreshing.current = null;
    }
  }, [code, accept, user?.name, navigate]);
  useEffect(() => {
    if (isRehearsal || authLoading) return;
    live.current = true;
    setSnapshot(null);
    setError("");
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
  }, [code, refresh, isRehearsal, authLoading]);
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
        Boolean(rehearsal?.onCommand) ||
        Boolean(rehearsal?.onDraw && snapshot.phase === "draw")) &&
      !opening.state &&
      (!roomSnapshot?.opening || roomSnapshot.opening.complete) &&
      !turnReady.blocking &&
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
    !playingMeld &&
    !footMotion.active &&
    !tableMotion.blocking &&
    !scoresOpen &&
    !recordOpen &&
    !leaving &&
    (myTurn ||
      (snapshot?.phase === "choose" && Boolean(viewer && !viewer.chosen)));
  const turnDecision = `${code}:${snapshot?.token}`;
  const nudge = useInactivityNudge(turnAlertReady, turnDecision);
  useTurnIndicator(turnAlertReady, turnDecision);
  const firstRoundPlaying =
    !isRehearsal &&
    snapshot?.round === 1 &&
    !opening.state &&
    ["draw", "play"].includes(snapshot.phase);
  useEffect(() => {
    if (!firstRoundPlaying) return;
    browsingOwnTurn.current = false;
    setFollow(true);
  }, [firstRoundPlaying, snapshot?.code, snapshot?.opening?.id]);
  useEffect(() => {
    if (!snapshot) return;
    if (!myTurn) browsingOwnTurn.current = false;
    if (!isRehearsal) writeStorage("handandfoot.room.v1", snapshot.code);
    if (openingInProgress) {
      const owner = snapshot.players.find(
        (player) => player.id === snapshot.viewerId,
      );
      if (owner) setViewed(owner.team);
      setViewedHandPlayerId(null);
      return;
    }
    if (
      !footMotion.active &&
      !playingMeld &&
      !scoring.enabled &&
      follow &&
      !browsingOwnTurn.current &&
      actor &&
      (!isRehearsal || snapshot.phase === "draw")
    ) {
      // Turn order always advances forward, including the last-to-first board.
      boardSweepDirection.current = 1;
      setViewed(actor.team);
      setViewedHandPlayerId(null);
    }
  }, [
    snapshot?.token,
    snapshot?.actorId,
    openingInProgress,
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
    const replacingRedThrees = type === "red_three" && payload.expose === false;
    if (rehearsal) {
      if (
        drawMotion.active ||
        playingMeld ||
        tableMotion.blocking ||
        footMotion.active
      )
        return;
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
        sound.play("select");
      }
      if (type !== "draw" && type !== "choose" && rehearsal.onCommand) {
        rehearsal.onCommand(type, payload);
        if (clear) {
          setSelected([]);
          if (!replacingRedThrees) setDrafts([]);
          setPickup(false);
        }
        if (type === "meld" || type === "pickup" || type === "discard")
          sound.play("select");
      }
      return;
    }
    if (!roomSnapshot || busy || (turnReady.blocking && type !== "leave"))
      return;
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
      replacingRedThrees &&
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
        navigate(
          roomSnapshot.playMode === "practice" &&
            roomSnapshot.phase === "finished"
            ? "/"
            : "/play",
        );
        return;
      }
      accept(next);
      if (clear) {
        setSelected([]);
        if (!replacingRedThrees) setDrafts([]);
        setPickup(false);
      }
      if (type === "choose" && !opening.state) sound.play("deal");
      else if (["meld", "pickup", "draw", "discard"].includes(type))
        sound.play("select");
    } catch (error) {
      if (type === "draw" || type === "red_three") drawMotion.cancel();
      setLeavingScores(false);
      setError((error as Error).message);
      void refresh();
    } finally {
      setBusy(false);
    }
  }
  const automaticScoreCommand =
    snapshot?.scoring &&
    snapshot.scoring.remaining > 0 &&
    snapshot.scoring.options.length > 0
      ? "score_auto"
      : "score_confirm";
  const canSettleScore = Boolean(
    snapshot?.phase === "scoring" &&
      snapshot.scoring &&
      !snapshot.scoring.confirmed &&
      automaticScoreCommand &&
      (!isRehearsal || rehearsal?.onCommand) &&
      !busy &&
      !opening.state &&
      !drawMotion.active &&
      !playingMeld &&
      !footMotion.active &&
      !tableMotion.blocking,
  );
  useEffect(() => {
    if (!canSettleScore || !automaticScoreCommand) return;
    if (error) {
      const retry = window.setTimeout(() => {
        settlingScore.current = "";
        setError("");
      }, 1500);
      return () => clearTimeout(retry);
    }
    const key = `${snapshot?.code}:${snapshot?.round}:${snapshot?.viewerId}:${snapshot?.scoring?.revision}:${automaticScoreCommand}`;
    if (settlingScore.current === key) return;
    settlingScore.current = key;
    void act(automaticScoreCommand);
  }, [
    canSettleScore,
    automaticScoreCommand,
    snapshot?.code,
    snapshot?.round,
    snapshot?.viewerId,
    snapshot?.scoring?.revision,
    error,
  ]);
  function stage(meldId?: string) {
    if (!canStage || pickupStagingLocked) return;
    const target = ownSide.melds.find((meld) => meld.id === meldId);
    if (meldId ? !target || !canAddToMeld(target) : !stageKind) return;
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
    if (!snapshot || openingInProgress) return;
    mobileMotion.cancel();
    meldMotion.cancel();
    bookClosing.cancel();
    tableMotion.cancel();
    boardSweepDirection.current = delta;
    handNavigation.current += 1;
    setViewedHandPlayerId(null);
    setViewed(
      (old) => (old + delta + snapshot.sides.length) % snapshot.sides.length,
    );
    if (myTurn) browsingOwnTurn.current = true;
    else setFollow(false);
  }
  function viewBoard(id: number) {
    if (openingInProgress) return;
    mobileMotion.cancel();
    meldMotion.cancel();
    bookClosing.cancel();
    tableMotion.cancel();
    boardSweepDirection.current = null;
    handNavigation.current += 1;
    setViewedHandPlayerId(null);
    setViewed(id);
    if (myTurn) browsingOwnTurn.current = true;
    else setFollow(false);
  }
  function changeFollow(checked: boolean) {
    browsingOwnTurn.current = false;
    setFollow(checked);
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
        <PageTitle>GAME</PageTitle>
        {error ? (
          <div className="page-body button-stack">
            <p className="error" role="alert">
              {error}
            </p>
            <button className="button" onClick={() => void refresh()}>
              Try again
            </button>
            <Link className="text-link" to="/play">
              Back to Play
            </Link>
          </div>
        ) : (
          <p className="page-intro page-body" role="status">
            Connecting to your game…
          </p>
        )}
      </div>
    );
  if (snapshot.phase === "lobby")
    return <Lobby snapshot={snapshot} busy={busy} error={error} act={act} />;

  const canConcede =
    snapshot.playMode === "practice" && snapshot.phase !== "finished";
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
  const visibleHandPage = Math.min(
    handPage,
    Math.max(0, Math.ceil(hand.length / 10) - 1),
  );
  const visibleHand = mobileGame
    ? hand.slice(visibleHandPage * 10, (visibleHandPage + 1) * 10)
    : hand;
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
    Boolean(snapshot.discard && snapshot.discard.rank !== "3");
  function cancelPickup() {
    setPickup(false);
    setDrafts([]);
    setSelected([]);
    setError("");
  }
  const ownSide = snapshot.sides[viewer!.team];
  const footerFootSource = viewingOwnHand
    ? footSource
    : tableMotion.pickup?.playerId === footerPlayer?.id
      ? tableMotion.pickupSource
      : undefined;
  const footerFoot =
    !review &&
    footerPlayer &&
    (!footerPlayer.inFoot ||
      footerFootSource ||
      (scoring.enabled && footerPlayer.footCount > 0)) ? (
      <FootPreview
        topCard={
          footerFootSource?.topCard ??
          (viewingOwnHand ? snapshot.footTop : footerPlayer.footTop) ??
          null
        }
        count={footerFootSource?.count ?? footerPlayer.footCount}
        owner={viewingOwnHand ? "Your" : `${footerPlayer.name}’s`}
      />
    ) : null;
  const ownHandTitle =
    (review ? "YOUR CARDS" : undefined) ??
    rehearsal?.handCaption ??
    (scoring.beat?.gathered && snapshot.scoringFoot?.length
      ? "HAND + FOOT"
      : undefined) ??
    `YOUR ${viewer?.inFoot ? "FOOT" : "HAND"}`;
  const ownHandCount = snapshot.hand.length - drawMotion.hiddenIds.size;
  const footerCount = viewingOwnHand
    ? ownHandCount
    : (revealedCards?.length ??
      (review ? (footerPlayer?.handCount ?? 0) : concealedHand.count));
  const handTabs =
    snapshot.scoringMode === "partnership" && footerMembers.length > 1 ? (
      <HandTabs
        hands={footerMembers.map((player) => ({
          id: player.id,
          name: player.id === viewer?.id ? undefined : player.name,
          title:
            player.id === viewer?.id
              ? ownHandTitle
              : `${player.name}’s ${review ? "Cards" : player.inFoot ? "foot" : "hand"}`,
          count:
            player.id === viewer?.id
              ? ownHandCount
              : player.id === footerPlayer?.id
                ? footerCount
                : review
                  ? (player.roundCards?.length ?? player.handCount)
                  : player.handCount,
        }))}
        selected={footerPlayer?.id}
        disabled={openingInProgress || scoringInProgress}
        onSelect={(id) => {
          if (id === footerPlayer?.id) return;
          focusHandTab.current = true;
          boardSweepDirection.current = null;
          handNavigation.current += 1;
          setViewedHandPlayerId(id);
          if (myTurn) browsingOwnTurn.current = true;
          else setFollow(false);
        }}
      />
    ) : undefined;
  const canGoOut = Boolean(
    viewer?.inFoot &&
      snapshot.hand.length === 1 &&
      !snapshot.hand[0].redThree &&
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
  const pickupStagingLocked = discardIsStaged && ownSide.opened;
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
  const stageKind = hasStageCards ? detectMeldKind(stageCards) : null;
  function canAddToMeld(meld: Meld) {
    if (!canStage || pickupStagingLocked || !hasStageCards) return false;
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
  const selectedRed =
    selected.length > 0 && selected.every((id) => cardMap.get(id)?.redThree);
  const canStageRedThrees =
    canStage && !pickup && !needsSecondDraw && ownSide.opened && selectedRed;
  const stagedRedCount = drafts
    .filter((draft) => draft.redThree)
    .reduce((count, draft) => count + draft.cardIds.length, 0);
  const renderBoard = (motion?: Partial<OpeningPresentation>) => {
    const playerNavigation = (
      <PlayerBoardNav
        sides={snapshot.sides}
        players={snapshot.players}
        viewed={viewed}
        viewerId={snapshot.viewerId}
        activePlayerId={
          ["draw", "play"].includes(snapshot.phase) ? snapshot.actorId : null
        }
        dealerId={snapshot.dealerId}
        previousDealerId={motion?.previousDealerId}
        profileIcon={user?.profile_icon}
        onView={viewBoard}
        disabled={openingInProgress}
        showLeader={!review || totalsLanded}
      />
    );
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
        restingMelds={
          incomingSnapshot?.sides.find((item) => item.id === side?.id)?.melds
        }
        restingRedCount={incomingSnapshot?.players
          .filter((player) => player.team === side?.id)
          .reduce((total, player) => total + player.redThrees.length, 0)}
        isYou={ownBoard}
        canTarget={canTargetMeld}
        onTarget={stage}
        drafts={drafts}
        flyingIds={
          new Set([...meldMotion.hiddenIds, ...mobileMotion.hiddenIds])
        }
        motionTarget={
          mobileMotion.target?.kind === "meld"
            ? mobileMotion.target.id
            : mobileMotion.target?.kind === "red"
              ? "reds"
              : scoring.beat?.activePile
        }
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
        redThreeClosing={boardPlayers.some(
          (player) =>
            bookClosing.openRedPlayers.has(player.id) ||
            mobileMotion.openRedTeams.has(player.team),
        )}
        canTargetRedThrees={Boolean(canStageRedThrees && ownBoard)}
        onTargetRedThrees={stageRedThrees}
        stagedRedCount={ownBoard ? stagedRedCount : 0}
        mobile={mobileGame}
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
        className={`game-page ${snapshot.scoringMode === "individual" ? "individual-game" : "partnership-game"}${snapshot.opening ? " round-opened" : ""}${scoring.enabled ? " live-scoring" : ""}${mobileGame ? " mobile-game" : ""}`}
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
          <div className="round-controls">
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
            {mobileGame && (
              <label className="follow-control">
                <input
                  type="checkbox"
                  checked={follow}
                  onChange={(event) => changeFollow(event.target.checked)}
                />
                <span>Follow turn</span>
              </label>
            )}
          </div>
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
          {scoring.beat && !mobileGame && (
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
            >
              {rehearsal?.previewControls}
            </GameMenu>
          )}
          {!mobile && (
            <div className="desktop-player-navigation">{playerNavigation}</div>
          )}
        </header>
        <div
          className={`turn-message ${nudge.shaking ? "inactivity-shake" : ""}`}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <p>
            {review ? (
              "End of round board state"
            ) : scoring.enabled ? (
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
        </div>
        <div
          className="board-carousel"
          style={
            mobile && (playingMeld || scoring.enabled)
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
              disabled={openingInProgress}
              onClick={() => browse(-1)}
            >
              <Icon name="arrow" />
            </button>
          )}
          <section
            ref={boardSweepRef}
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
              {mobile && playerNavigation}
            </div>
            <div ref={boardContentRef} className="tableau-content">
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
            </div>
          </section>
          {!setup && (
            <button
              className="board-arrow"
              aria-label="Next board"
              disabled={openingInProgress}
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
              {mobileGame && scoring.beat
                ? null
                : (rehearsal?.footerSummary ?? (
                    <SettlementPiles beat={scoring.beat} />
                  ))}
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
                    disabled={openingInProgress && item.id !== viewer?.team}
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
            {!mobileGame && (
              <label className="follow-control">
                <input
                  type="checkbox"
                  checked={follow}
                  onChange={(event) => changeFollow(event.target.checked)}
                />
                <span>Follow turn</span>
              </label>
            )}
            {myTurn && side?.id !== viewer?.team && (
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
          <HandDock
            mobile={mobileGame}
            expanded={
              scoringInProgress ||
              handExpanded ||
              (viewingOwnHand && mobileGame && footMotion.active)
            }
            onExpand={setHandExpanded}
            locked={
              viewingOwnHand &&
              (scoringInProgress || (mobileGame && footMotion.active))
            }
            title={footerTitle}
            ariaLabel={
              review
                ? footerTitle
                : viewingOwnHand
                  ? "Your private hand"
                  : footerTitle
            }
            foot={footerFoot}
            publicPlayerId={viewingOwnHand ? undefined : footerPlayer?.id}
            publicSlots={
              viewingOwnHand || review ? undefined : concealedHand.slots
            }
            handTabs={handTabs}
            navigation={{
              enabled:
                boardSweepDirection.current !== null &&
                !setup &&
                !playingMeld &&
                !footMotion.active,
              page: snapshot.players.findIndex(
                (player) => player.id === footerPlayer?.id,
              ),
              scope: handScope,
              direction: boardSweepDirection.current ?? undefined,
              duration: mobile ? 180 : 200,
            }}
            cards={
              viewingOwnHand
                ? hand.filter(
                    (card) =>
                      !drawMotion.hiddenIds.has(card.id) &&
                      !mobileMotion.handHiddenIds.has(card.id),
                  )
                : (revealedCards ??
                  Array.from(
                    { length: footerPlayer?.handCount ?? 0 },
                    () => undefined,
                  ))
            }
            count={footerCount}
          >
            {viewingOwnHand ? (
              <>
                <div className="hand-heading">
                  {scoringInProgress && (
                    <button
                      type="button"
                      className="button score-skip-button"
                      onClick={scoring.skip}
                    >
                      Skip animation
                    </button>
                  )}
                  {(!mobileGame && handTabs) || (
                    <HandInfo title={ownHandTitle} count={ownHandCount} />
                  )}
                  <div
                    className="draft-summary-slot"
                    role="status"
                    aria-live="polite"
                    aria-atomic="true"
                  >
                    {mobileGame && scoring.beat ? (
                      <ScoreCount beat={scoring.beat} beatKey={scoring.key} />
                    ) : mobileGame && footMotion.active ? (
                      <span className="mobile-target-hint">
                        Picking up your foot…
                      </span>
                    ) : mobileGame &&
                      canStage &&
                      !pickupStagingLocked &&
                      stageIds.length > 0 ? (
                      <div
                        className="mobile-meld-targets"
                        role="group"
                        aria-label="Add selected cards to a pile"
                      >
                        <span className="mobile-target-label">Your piles</span>
                        {ownSide.melds.filter(canAddToMeld).map((meld) => (
                          <button
                            key={meld.id}
                            type="button"
                            className="mobile-target-button"
                            onClick={() => stage(meld.id)}
                            aria-label={`${meld.rank} ${meld.complete ? (meld.dirty ? "dirty book" : "clean book") : meld.kind === "run" ? "run" : "pile"}, ${meld.cards.length}${meld.complete ? " cards" : "/7"}`}
                          >
                            <span className="mobile-target-rank">
                              {meld.rank}
                              {meld.complete && <Book />}
                            </span>
                            <small>
                              {meld.cards.length}
                              {meld.complete ? " cards" : "/7"}
                            </small>
                          </button>
                        ))}
                        {stageKind && (
                          <button
                            type="button"
                            className="mobile-target-button mobile-target-new"
                            onClick={() => stage()}
                          >
                            + New<span>meld</span>
                          </button>
                        )}
                        {canStageRedThrees && (
                          <button
                            type="button"
                            className="mobile-target-button"
                            onClick={stageRedThrees}
                          >
                            <span className="mobile-target-rank">
                              3 <Icon name="heart" />
                            </span>
                            <small>Red threes</small>
                          </button>
                        )}
                        {!stageKind &&
                          !canStageRedThrees &&
                          !ownSide.melds.some(canAddToMeld) && (
                            <span className="mobile-target-hint">
                              Select matching cards
                            </span>
                          )}
                      </div>
                    ) : canStage && drafts.length > 0 ? (
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
                    ) : mobileGame ? (
                      <span className="mobile-target-hint">
                        Select cards to choose a pile
                      </span>
                    ) : null}
                  </div>
                  {footerFoot}
                </div>
                {mobileGame && scoring.beat && (
                  <SettlementPiles beat={scoring.beat} />
                )}
                {snapshot.hand.length || (mobileGame && footMotion.active) ? (
                  <div
                    {...handSwipe}
                    className="hand-scroll"
                    aria-label="Select cards to play"
                    ref={handScrollRef}
                  >
                    {visibleHand.map((card) => (
                      <div
                        className={
                          stagedIds.has(card.id)
                            ? "hand-card staged-card"
                            : "hand-card"
                        }
                        key={card.id}
                        data-card-id={card.id}
                        data-draw-hidden={drawMotion.hiddenIds.has(card.id)}
                        data-foot-hidden={mobileGame && footMotion.gathering}
                        data-meld-hidden={
                          meldMotion.hiddenIds.has(card.id) ||
                          mobileMotion.handHiddenIds.has(card.id)
                        }
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
                    {mobileGame &&
                      Array.from(
                        { length: 10 - visibleHand.length },
                        (_, index) => (
                          <span
                            className="hand-card-placeholder"
                            aria-hidden="true"
                            key={`empty-${index}`}
                          />
                        ),
                      )}
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
                {mobileGame &&
                  (hand.length > 0 || scoring.enabled || footMotion.active) && (
                    <div
                      className="mobile-hand-pagination"
                      aria-label="Hand pages"
                    >
                      <button
                        type="button"
                        className="icon-button previous"
                        aria-label="Previous hand cards"
                        disabled={handPage === 0}
                        onClick={() =>
                          setHandPage((page) => Math.max(0, page - 1))
                        }
                      >
                        <Icon name="arrow" />
                      </button>
                      <span>
                        {hand.length ? (
                          <>
                            {Math.min(
                              handPage,
                              Math.ceil(hand.length / 10) - 1,
                            ) *
                              10 +
                              1}
                            –{Math.min((handPage + 1) * 10, hand.length)} of{" "}
                            {hand.length} cards
                          </>
                        ) : footMotion.active ? (
                          "Picking up your foot…"
                        ) : (
                          "All hand cards settled"
                        )}
                      </span>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label="Next hand cards"
                        disabled={(handPage + 1) * 10 >= hand.length}
                        onClick={() => setHandPage((page) => page + 1)}
                      >
                        <Icon name="arrow" />
                      </button>
                    </div>
                  )}
                {(showHandActions || (mobileGame && myTurn)) && (
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
                        ) : mobileGame && footMotion.active ? (
                          "Cards are arriving…"
                        ) : mobileGame &&
                          (snapshot.phase === "draw" || drawMotion.active) ? (
                          "Draw cards before playing"
                        ) : (
                          "Select cards to play"
                        )}
                      </span>
                      <DrawFirstHint
                        blocked={pickupStagingLocked || needsSecondDraw}
                        label="Stage meld"
                        hint={
                          pickupStagingLocked
                            ? "Play your meld that includes the discard first, then draw before staging more"
                            : undefined
                        }
                      >
                        <button
                          className="button small"
                          disabled={
                            !canStage ||
                            pickupStagingLocked ||
                            (!stageKind && !canStageRedThrees)
                          }
                          onClick={() =>
                            canStageRedThrees ? stageRedThrees() : stage()
                          }
                        >
                          Stage meld
                        </button>
                      </DrawFirstHint>
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
                          void act(pickup ? "pickup" : "meld", {
                            groups: drafts,
                          })
                        }
                      />
                      <DrawFirstHint
                        blocked={needsSecondDraw || pickup}
                        label={discardLabel}
                      >
                        <button
                          className="button small secondary"
                          disabled={
                            !canStage ||
                            (selected.length !== 1 && !selectedRed) ||
                            pickup ||
                            needsSecondDraw ||
                            snapshot.phase !== "play" ||
                            (drafts.length > 0 && (!selectedRed || canGoOut))
                          }
                          onClick={() =>
                            void act(
                              selectedRed && !canGoOut
                                ? "red_three"
                                : "discard",
                              selectedRed && !canGoOut
                                ? { cardIds: selected, expose: false }
                                : { cardId: selected[0] },
                            )
                          }
                        >
                          {canGoOut
                            ? discardLabel
                            : selectedRed
                              ? "Replace"
                              : "Discard"}
                        </button>
                      </DrawFirstHint>
                    </div>
                    {selectedRed && !pickup && !ownSide.opened && (
                      <div className="red-three-actions">
                        <span>
                          Complete your side’s opening meld to lay down red
                          threes.
                        </span>
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
              </>
            ) : (
              <PublicHand
                playerId={footerPlayer!.id}
                title={footerTitle}
                count={
                  revealedCards?.length ??
                  (review ? footerPlayer!.handCount : concealedHand.count)
                }
                slots={review ? undefined : concealedHand.slots}
                drawKey={
                  footerHandEvent &&
                  ["draw", "pickup"].includes(footerHandEvent.kind)
                    ? footerHandEvent.id
                    : undefined
                }
                cards={revealedCards}
                mobile={mobileGame}
                foot={footerFoot}
                handTabs={mobileGame ? undefined : handTabs}
              />
            )}
          </HandDock>
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
                  !isRehearsal &&
                  (snapshot.developmentFixture || !user) && (
                    <p className="win-stats-notice">
                      {snapshot.developmentFixture
                        ? "Preview games do not count toward account wins. "
                        : !user &&
                          "Guest games do not count toward account wins. "}
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
              toDivider={!viewingOwnHand}
              toHandDrawer={mobileGame && viewingOwnHand}
            />,
          )}
        {meldMotion.flight &&
          motionLayer(
            <MeldCards
              flight={meldMotion.flight}
              paused={rehearsal?.meldPaused ?? false}
              board={boardRef}
            />,
          )}
        {mobileMotion.flight &&
          motionLayer(
            <MobilePlayCards flight={mobileMotion.flight} board={boardRef} />,
          )}
        {mobileMotion.bookFlight &&
          motionLayer(
            <ClosingBooks
              flight={mobileMotion.bookFlight}
              speed={1}
              paused={false}
            />,
          )}
        {mobileMotion.closingBookId && (
          <style>{`${mobileMotion.closingRedTeam !== undefined ? `.mobile-game [data-red-three-team-id="${mobileMotion.closingRedTeam}"]` : `.mobile-game [data-meld-id="${mobileMotion.closingBookId}"]`} {visibility:hidden;}`}</style>
        )}
        {bookClosing.hiddenPiles.length > 0 && (
          <style>
            {bookClosing.hiddenPiles
              .map((pile) => {
                const selector = pile.red
                  ? `.game-page .red-three-pile[data-red-three-team-id="${pile.id}"]`
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
        {mobileGame &&
          viewingOwnHand &&
          footMotion.gathering &&
          motionLayer(
            <MobileFootCards
              key={footMotion.key}
              cards={snapshot.hand}
              board={boardRef}
            />,
          )}
        {tableMotion.flight &&
          motionLayer(
            <TableCards flight={tableMotion.flight} board={boardRef} />,
          )}
        {footPickup && (
          <FootPickupNotice
            key={`${snapshot.code}:${snapshot.round}:${footPickup.id}`}
            playerName={
              snapshot.players.find(
                (player) => player.id === footPickup.playerId,
              )?.name ?? "Player"
            }
          />
        )}
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
        {(opening.error || turnReady.error) && (
          <p role="status" className="connection-note">
            {opening.error || turnReady.error}
          </p>
        )}
        {leaving && (
          <div className="modal-backdrop">
            <section
              className="leave-dialog"
              role="dialog"
              aria-modal="true"
              aria-label={canConcede ? "Concede" : "Leave table"}
            >
              <h2>{canConcede ? "Concede the game?" : "Leave the table?"}</h2>
              <p>
                {canConcede
                  ? "Are you sure you want to concede?"
                  : "A bot will take over your seat. The other players can keep playing."}
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
                  {canConcede ? "Concede" : "Leave table"}
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
      {isRehearsal && !rehearsal?.footAnimate ? (
        table
      ) : (
        <FootGather
          gathering={gatheringViewedFoot}
          count={footPickup?.count}
          speed={1}
          enabled={footMotion.enabled}
          mobile={mobile}
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

function MobilePileSection({
  mobile,
  closed,
  children,
}: {
  mobile: boolean;
  closed: boolean;
  children: ReactNode;
}) {
  return mobile ? (
    <div className={`mobile-pile-section${closed ? " mobile-books" : ""}`}>
      {children}
    </div>
  ) : (
    <>{children}</>
  );
}

function DesktopPileRow({
  mobile,
  children,
}: {
  mobile: boolean;
  children: ReactNode;
}) {
  return mobile ? (
    <>{children}</>
  ) : (
    <div className="pile-row-content">{children}</div>
  );
}

function BoardPiles({
  players,
  melds,
  restingMelds = melds,
  restingRedCount,
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
  mobile = false,
  motionTarget,
}: {
  players: Player[];
  melds: Meld[];
  restingMelds?: Meld[];
  restingRedCount?: number;
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
  mobile?: boolean;
  motionTarget?: string;
}) {
  const [openPage, setOpenPage] = useState(0);
  const [bookPage, setBookPage] = useState(0);
  useLayoutEffect(() => {
    if (!mobile || !motionTarget) return;
    const meld = melds.find((item) => item.id === motionTarget);
    if (!meld) return;
    const items = melds.filter((item) => item.complete === meld.complete);
    (meld.complete ? setBookPage : setOpenPage)(
      Math.floor(items.indexOf(meld) / (meld.complete ? 4 : 3)),
    );
  }, [mobile, motionTarget, melds]);
  const openSwipe = useSwipePages(
    mobile && !motionTarget,
    Math.min(
      openPage,
      Math.max(
        0,
        Math.ceil(melds.filter((meld) => !meld.complete).length / 3) - 1,
      ),
    ),
    Math.max(1, Math.ceil(melds.filter((meld) => !meld.complete).length / 3)),
    setOpenPage,
  );
  const bookSwipe = useSwipePages(
    mobile && !motionTarget,
    Math.min(
      bookPage,
      Math.max(
        0,
        Math.ceil(melds.filter((meld) => meld.complete).length / 4) - 1,
      ),
    ),
    Math.max(1, Math.ceil(melds.filter((meld) => meld.complete).length / 4)),
    setBookPage,
  );
  const pileScope = players.map((player) => player.id).join(":");
  const pileRevision = `${pileScope}:${melds.map((meld) => `${meld.id}:${meld.complete}`).join(":")}:${players.reduce((total, player) => total + player.redThrees.length, 0)}`;
  const openSweepRef = useHorizontalWheel(!mobile, pileRevision);
  const bookSweepRef = useHorizontalWheel(!mobile, pileRevision);
  usePageSweep(openSweepRef, mobile && !motionTarget, openPage, pileScope);
  usePageSweep(bookSweepRef, mobile && !motionTarget, bookPage, pileScope);
  const closed = melds.filter((meld) => meld.complete);
  const open = melds.filter((meld) => !meld.complete);
  const redThrees = players.flatMap((player) => player.redThrees);
  const hasRedThrees = redThrees.length > 0;
  const showRedThrees =
    hasRedThrees || canTargetRedThrees || stagedRedCount > 0;
  const closedRedThrees =
    redThrees.length >= 3 && !redThreeBonusLost && !redThreeClosing;
  const redOffset = Math.min(3, 12 / Math.max(1, redThrees.length - 1));
  const redLayerStep = mobile
    ? 25
    : Math.min(25, 100 / Math.max(1, redThrees.length - 1));
  function piles(items: Meld[], label: string, includeRedThrees = false) {
    const count = items.length + Number(includeRedThrees);
    const isClosed = label === "Completed books";
    const restingReds = restingRedCount ?? redThrees.length;
    const restingClosedReds = restingReds >= 3 && !redThreeBonusLost;
    const restingCount =
      restingMelds.filter((meld) => meld.complete === isClosed).length +
      Number(
        isClosed
          ? restingClosedReds
          : (restingReds > 0 || canTargetRedThrees || stagedRedCount > 0) &&
              !restingClosedReds,
      );
    const pageSize = isClosed ? 4 : 3;
    const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
    const focusIndex = motionTarget
      ? items.findIndex((item) => item.id === motionTarget)
      : -1;
    const page =
      focusIndex >= 0
        ? Math.floor(focusIndex / pageSize)
        : Math.min(isClosed ? bookPage : openPage, pageCount - 1);
    const visible = mobile
      ? items.slice(page * pageSize, (page + 1) * pageSize)
      : items;
    return (
      count > 0 && (
        <MobilePileSection mobile={mobile} closed={isClosed}>
          {mobile && (
            <div className="mobile-pile-heading">
              <span>
                {label} <small>· {items.length}</small>
              </span>
              {pageCount > 1 && (
                <div className="mobile-pile-pagination">
                  <button
                    type="button"
                    className="icon-button previous"
                    aria-label={`Previous ${label.toLowerCase()}`}
                    disabled={page === 0}
                    onClick={() =>
                      (isClosed ? setBookPage : setOpenPage)(page - 1)
                    }
                  >
                    <Icon name="arrow" />
                  </button>
                  <span>
                    {page + 1} / {pageCount}
                  </span>
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Next ${label.toLowerCase()}`}
                    disabled={page + 1 >= pageCount}
                    onClick={() =>
                      (isClosed ? setBookPage : setOpenPage)(page + 1)
                    }
                  >
                    <Icon name="arrow" />
                  </button>
                </div>
              )}
            </div>
          )}
          <div
            {...(isClosed ? bookSwipe : openSwipe)}
            ref={isClosed ? bookSweepRef : openSweepRef}
            className={`pile-group ${count > 4 ? "crowded-piles" : ""} ${isClosed ? "closed-books" : "open-piles"} ${isClosed && count > 9 ? "dense-books" : ""}`}
            role="group"
            aria-label={label}
            tabIndex={mobile ? undefined : 0}
            style={
              {
                "--pile-count": count,
                "--resting-pile-count": restingCount,
              } as React.CSSProperties
            }
          >
            <DesktopPileRow mobile={mobile}>
              {visible.map((meld) => (
                <MeldPile
                  key={meld.id}
                  meld={meld}
                  compact={mobile}
                  canTarget={canTarget(meld)}
                  onTarget={() => onTarget(meld.id)}
                  staged={drafts
                    .filter((draft) => draft.meldId === meld.id)
                    .reduce((n, draft) => n + draft.cardIds.length, 0)}
                  flyingIds={flyingIds}
                  cardPoints={cardPoints}
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
                          ? "Add selected cards to red threes"
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
                          ? "Add selected cards to red threes"
                          : `Red threes, ${redThrees.length} cards`
                      }
                      onClick={onTargetRedThrees}
                    >
                      <div
                        className="meld-card-layers"
                        style={
                          {
                            "--stack-height": `${106 + Math.max(0, redThrees.length - 1) * redLayerStep}px`,
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
                            style={{ top: index * redLayerStep }}
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
                      <span className="meld-staged-count">
                        {" "}
                        +{stagedRedCount}
                      </span>
                    )}
                    {redThreeBonusLost
                      ? " · 5 pts each"
                      : redThrees.length < 3
                        ? " / 3"
                        : " cards"}
                  </span>
                </div>
              )}
            </DesktopPileRow>
          </div>
        </MobilePileSection>
      )
    );
  }
  return (
    <section
      className="player-lane"
      aria-label={`${players.map((player) => player.name).join(" & ")}’s public piles`}
      data-player-lane-id={players.length === 1 ? players[0].id : undefined}
      data-team-lane-id={players[0]?.team}
    >
      <div className="melds">
        {!mobile && piles(closed, "Completed books", closedRedThrees)}
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
        {mobile && piles(closed, "Completed books", closedRedThrees)}
      </div>
    </section>
  );
}
