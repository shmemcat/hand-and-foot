import { useEffect, useRef, useState } from "react";
import type { Snapshot } from "../types";

export function useRuleCue(snapshot: Snapshot | null, busy: boolean) {
  const [cue, setCue] = useState("");
  const previous = useRef<{
    scope: string;
    opened: boolean;
    books: boolean;
    out: boolean;
  } | null>(null);
  useEffect(() => {
    if (!snapshot || busy || !["play", "draw"].includes(snapshot.phase)) return;
    const player = snapshot.players.find(
      (player) => player.id === snapshot.viewerId,
    );
    const side = snapshot.sides.find((side) => side.id === player?.team);
    if (!side || !player) return;
    const now = {
      scope: `${snapshot.code}:${snapshot.round}`,
      opened: side.opened,
      books: side.clean > 0 && side.dirty > 0,
      out: side.clean > 0 && side.dirty > 0 && player.inFoot,
    };
    const old = previous.current;
    if (old?.scope === now.scope) {
      if (!old.out && now.out)
        setCue("You can go out. Keep a final card to discard.");
      else if (!old.books && now.books)
        setCue("Clean + dirty books complete. Get into your foot to go out.");
      else if (!old.opened && now.opened) setCue("Opening meld complete.");
    }
    previous.current = now;
  }, [snapshot, busy]);
  useEffect(() => {
    if (!cue) return;
    const timer = window.setTimeout(() => setCue(""), 3400);
    return () => clearTimeout(timer);
  }, [cue]);
  return !busy && snapshot && ["play", "draw"].includes(snapshot.phase)
    ? cue
    : "";
}
