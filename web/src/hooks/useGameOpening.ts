import { useEffect, useRef, useState } from "react";
import { command } from "../lib/api";
import {
  liveOpeningDuration,
  liveOpeningSnapshot,
  syncLiveOpening,
  tickLiveOpening,
  type LiveOpening,
} from "../lib/liveOpening";
import { openingCues } from "../lib/openingSequence";
import { useSound } from "../context/SoundContext";
import type { Snapshot } from "../types";

export function useGameOpening(
  snapshot: Snapshot | null,
  accept: (snapshot: Snapshot) => void,
) {
  const [state, setState] = useState<LiveOpening | null>(null);
  // Reconcile a new deal before painting, including the first snapshot after a reconnect.
  const synced = syncLiveOpening(state, snapshot);
  if (synced !== state) setState(synced);
  const current = synced;
  const active = Boolean(current && !current.done);
  const [hidden, setHidden] = useState(document.hidden);
  const [reduced, setReduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [error, setError] = useState("");
  const sound = useSound();
  const play = useRef(sound.play);
  play.current = sound.play;
  const latest = useRef(snapshot);
  latest.current = snapshot;
  const cursor = useRef(-1);
  const duration = current
    ? liveOpeningDuration(current, snapshot?.players.length ?? 4)
    : 0;
  const step = current?.step;
  const animation = current ? `${current.id}:${current.replay}` : "";
  useEffect(() => {
    // Once a hand is chosen, a background tab must not hold up everyone else.
    if (!hidden || !active) return;
    if (step === 5)
      setState((old) =>
        old ? { ...old, step: 6, elapsed: 0, replay: old.replay + 1 } : old,
      );
    if (step === 7)
      setState((old) => (old ? { ...old, elapsed: duration } : old));
  }, [hidden, active, step, duration]);
  useEffect(() => {
    const visibility = () => setHidden(document.hidden);
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const motion = () => setReduced(media.matches);
    document.addEventListener("visibilitychange", visibility);
    media.addEventListener("change", motion);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      media.removeEventListener("change", motion);
    };
  }, []);
  useEffect(() => {
    if (!active || hidden || step === 4 || step === 6) return;
    let previous: number | null = null;
    let frame = 0;
    const tick = (now: number) => {
      const delta = previous === null ? 0 : Math.min(100, now - previous);
      previous = now;
      setState((old) =>
        old
          ? tickLiveOpening(old, delta, latest.current?.players.length ?? 4)
          : old,
      );
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, hidden, animation, step]);
  useEffect(() => {
    cursor.current = -1;
  }, [animation]);
  useEffect(() => {
    if (
      !active ||
      hidden ||
      step === undefined ||
      step === 4 ||
      step === 6 ||
      !current
    )
      return;
    const cues = openingCues(
      step,
      snapshot?.players.length ?? 4,
      duration,
      "drops",
    );
    for (let i = cursor.current + 1; i < cues.length; i++) {
      if (cues[i].at > current.elapsed) break;
      play.current(cues[i].sound);
      cursor.current = i;
    }
  }, [
    active,
    hidden,
    animation,
    step,
    current?.elapsed,
    duration,
    snapshot?.players.length,
  ]);
  useEffect(() => {
    if (!active || hidden || step !== 4) return;
    const timers = openingCues(4, 4, 1000).map((cue, i) =>
      window.setTimeout(() => {
        if (i > cursor.current) {
          play.current(cue.sound);
          cursor.current = i;
        }
      }, cue.at),
    );
    return () => timers.forEach(clearTimeout);
  }, [active, hidden, animation, step]);
  const chosenIds =
    snapshot?.players
      .filter((p) => p.chosen)
      .map((p) => p.id)
      .join(",") ?? "";
  const readySeen = useRef({
    id: "",
    step: undefined as number | undefined,
    chosen: new Set<string>(),
  });
  useEffect(() => {
    const chosen = new Set(chosenIds.split(",").filter(Boolean));
    if (
      active &&
      current?.id === readySeen.current.id &&
      (step === 6 || readySeen.current.step === 6)
    )
      for (const id of chosen)
        if (!readySeen.current.chosen.has(id)) play.current("select");
    readySeen.current = { id: current?.id ?? "", step, chosen };
  }, [chosenIds, active, step, current?.id]);
  const needsAck = Boolean(
    snapshot?.status !== "closed" &&
      active &&
      step === 7 &&
      current &&
      current.elapsed >= duration &&
      snapshot?.opening &&
      !snapshot.opening.ready.includes(snapshot.viewerId),
  );
  useEffect(() => {
    if (!needsAck) return;
    let canceled = false;
    let retry = 0;
    const ready = async () => {
      const source = latest.current;
      if (!source) return;
      try {
        const next = await command(source, "opening_ready");
        if (!canceled) {
          setError("");
          accept(next);
        }
      } catch {
        if (!canceled) {
          setError("Reconnecting to the table before the first turn…");
          retry = window.setTimeout(ready, 1500);
        }
      }
    };
    void ready();
    return () => {
      canceled = true;
      clearTimeout(retry);
    };
  }, [needsAck, current?.id, accept]);
  function choose(pile: number) {
    play.current("select");
    setState((old) => (old && old.step === 4 ? { ...old, choice: pile } : old));
  }
  return {
    state: active && current ? { ...current, playing: !hidden } : null,
    snapshot:
      active && current && snapshot
        ? liveOpeningSnapshot(snapshot, current)
        : snapshot,
    duration,
    reduced,
    choose,
    error: active ? error : "",
  };
}
