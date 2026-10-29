import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { Snapshot } from "../types";
import {
  FOOT_GATHER_DELAY_MS,
  FOOT_SETTLE_MS,
  footGatherDuration,
} from "../lib/footMotion";
import {
  MELD_FLIGHT_MS,
  type CardPosition,
  type MeldFlight,
} from "./useMeldMotion";
import { useSound } from "../context/SoundContext";

type Transition = {
  key: number;
  before: Snapshot;
  stage: "leaving" | "gathering";
  discardFlight: MeldFlight | null;
};
const sameDeal = (before: Snapshot, after: Snapshot) =>
  before.code === after.code &&
  before.round === after.round &&
  before.viewerId === after.viewerId;
const player = (snapshot: Snapshot) =>
  snapshot.players.find((seat) => seat.id === snapshot.viewerId);
const position = (element: Element): CardPosition => {
  const { left, top, width, height } = element.getBoundingClientRect();
  return { left, top, width, height };
};

/** Follow a confirmed hand-to-foot change once, including replies received by socket/poll. */
export function useFootMotion(
  incoming: Snapshot | null,
  presented: Snapshot | null,
  board: RefObject<HTMLDivElement | null>,
  reduced: boolean,
  meldActive: boolean,
  rehearsal: boolean,
  ownBoard = true,
) {
  const [desktop, setDesktop] = useState(
    () => window.matchMedia("(min-width: 769px)").matches,
  );
  const [transition, setTransition] = useState<Transition | null>(null);
  const previous = useRef<{
    snapshot: Snapshot;
    positions: Map<string, CardPosition>;
  } | null>(null);
  const serial = useRef(0);
  const sound = useSound();
  const playSound = useRef(sound.play);
  playSound.current = sound.play;
  const cancel = useCallback(() => setTransition(null), []);
  const enabled = Boolean(
    !rehearsal && desktop && incoming?.playMode === "practice",
  );
  const canAnimate = Boolean(
    enabled &&
      !reduced &&
      !document.hidden &&
      incoming &&
      ["draw", "play"].includes(incoming.phase) &&
      !player(incoming)?.bot,
  );
  const prior = previous.current;
  // Lock controls and Follow turn on the first confirming render, before layout effects run.
  const entering = Boolean(
    canAnimate &&
      prior &&
      incoming &&
      sameDeal(prior.snapshot, incoming) &&
      prior.snapshot.actorId === incoming.viewerId &&
      prior.snapshot.phase === "play" &&
      prior.snapshot.hand.length &&
      player(prior.snapshot)?.footCount &&
      !player(prior.snapshot)?.inFoot &&
      player(incoming)?.inFoot &&
      incoming.hand.length,
  );
  const valid = Boolean(
    canAnimate &&
      transition &&
      incoming &&
      sameDeal(transition.before, incoming) &&
      player(incoming)?.inFoot,
  );
  const active = valid || entering;
  const current = valid ? transition : null;
  const gathering = current?.stage === "gathering";

  useLayoutEffect(() => {
    if (transition && !valid) cancel();
    if (entering && incoming && prior && !current) {
      const key = ++serial.current;
      const discarded = prior.snapshot.hand.find(
        (card) => card.id === incoming.discard?.id,
      );
      const from = discarded && prior.positions.get(discarded.id);
      const target = board.current?.querySelector(".discard-pickup .card");
      const divider = board.current
        ?.querySelector(".game-header")
        ?.getBoundingClientRect().bottom;
      const discardFlight: MeldFlight | null =
        discarded && from && target
          ? {
              key,
              token: incoming.token,
              before: prior.snapshot,
              speed: 1,
              boardHeight: 0,
              divider: ownBoard ? undefined : divider,
              cards: [
                {
                  card: discarded,
                  from:
                    ownBoard || divider === undefined
                      ? from
                      : {
                          ...position(target),
                          top: divider - position(target).height * 0.15,
                        },
                  to: position(target),
                  meldId: "discard",
                },
              ],
            }
          : null;
      setTransition({
        key,
        before: prior.snapshot,
        stage: "leaving",
        discardFlight,
      });
    }
    if (!incoming) {
      previous.current = null;
      return;
    }
    const positions = new Map<string, CardPosition>();
    for (const slot of board.current?.querySelectorAll<HTMLElement>(
      ".hand-card[data-card-id]",
    ) ?? []) {
      const card = slot.querySelector(".card");
      if (card) positions.set(slot.dataset.cardId!, position(card));
    }
    previous.current = { snapshot: incoming, positions };
  });

  useEffect(() => {
    if (!current || (current.stage === "leaving" && meldActive)) return;
    const timer = window.setTimeout(
      () => {
        if (current.stage === "gathering") cancel();
        else
          setTransition((old) =>
            old?.key === current.key ? { ...old, stage: "gathering" } : old,
          );
      },
      current.stage === "gathering"
        ? footGatherDuration(incoming!.hand.length)
        : FOOT_SETTLE_MS + (current.discardFlight ? MELD_FLIGHT_MS : 0),
    );
    return () => clearTimeout(timer);
  }, [current?.key, current?.stage, meldActive, cancel]);
  useEffect(() => {
    if (!gathering) return;
    const timer = window.setTimeout(
      () => playSound.current("deal"),
      FOOT_GATHER_DELAY_MS,
    );
    return () => clearTimeout(timer);
  }, [gathering, current?.key]);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 769px)");
    const change = () => setDesktop(media.matches);
    const hide = () => {
      if (document.hidden) cancel();
    };
    media.addEventListener("change", change);
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("resize", cancel);
    return () => {
      media.removeEventListener("change", change);
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("resize", cancel);
    };
  }, [cancel]);
  useEffect(() => {
    if (!current?.discardFlight || gathering) return;
    window.addEventListener("scroll", cancel, true);
    return () => window.removeEventListener("scroll", cancel, true);
  }, [current?.key, gathering, cancel]);

  const hand =
    current?.stage === "leaving"
      ? meldActive
        ? presented!.hand
        : []
      : presented?.hand;
  const snapshot =
    current && presented && hand
      ? {
          ...presented,
          hand,
          players: presented.players.map((seat) =>
            seat.id === presented.viewerId
              ? {
                  ...seat,
                  handCount: hand.length,
                  inFoot: gathering,
                  footCount: gathering ? 0 : player(current.before)!.footCount,
                }
              : seat,
          ),
        }
      : presented;
  return {
    snapshot,
    active,
    gathering,
    enabled,
    cancel,
    source: current
      ? {
          topCard: current.before.footTop,
          count: player(current.before)!.footCount,
        }
      : undefined,
    discardFlight: current?.stage === "leaving" ? current.discardFlight : null,
  };
}
