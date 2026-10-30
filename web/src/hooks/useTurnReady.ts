import { useEffect, useRef, useState, type RefObject } from "react";
import { command } from "../lib/api";
import {
  afterCardAnimations,
  BOARD_TRANSITION_MS,
} from "../lib/cardAnimations";
import type { Snapshot } from "../types";

/** Release the next turn only after this client finishes its animations and board sweep. */
export function useTurnReady(
  snapshot: Snapshot | null,
  accept: (snapshot: Snapshot) => void,
  board: RefObject<HTMLDivElement | null>,
  blocked: boolean,
  reduced: boolean,
) {
  const latest = useRef(snapshot);
  latest.current = snapshot;
  const [error, setError] = useState("");
  const presentation = snapshot?.turnPresentation;
  const blocking = Boolean(presentation && !presentation.complete);
  const needsAck = Boolean(
    blocking && snapshot && !presentation!.ready.includes(snapshot.viewerId),
  );
  useEffect(() => {
    if (!needsAck || blocked) return;
    let canceled = false;
    let sending = false;
    let retry = 0;
    const ready = async () => {
      const source = latest.current;
      if (
        canceled ||
        sending ||
        !source ||
        source.turnPresentation?.id !== presentation?.id
      )
        return;
      sending = true;
      try {
        const next = await command(source, "turn_ready", {
          presentationId: presentation!.id,
        });
        if (!canceled) {
          setError("");
          accept(next);
        }
      } catch {
        if (!canceled) {
          setError("Reconnecting to the table before the next turn…");
          retry = window.setTimeout(ready, 1500);
        }
      } finally {
        sending = false;
      }
    };
    const settled = () => {
      if (document.hidden || reduced) void ready();
      else
        afterCardAnimations(
          board.current,
          ".hand-dock, .tableau-content, .tableau",
          () => void ready(),
          false,
        );
    };
    const timer = window.setTimeout(
      settled,
      reduced || document.hidden ? 0 : BOARD_TRANSITION_MS,
    );
    const hide = () => {
      if (document.hidden) {
        clearTimeout(timer);
        void ready();
      }
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      canceled = true;
      clearTimeout(timer);
      clearTimeout(retry);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [needsAck, blocked, presentation?.id, reduced, accept, board]);
  return { blocking, error: needsAck ? error : "" };
}
