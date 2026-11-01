import { useEffect, useState } from "react";

type Range = { min: number; max: number };
type ScrollState = { x: boolean; y: boolean; width: number; height: number };
type ScrollRange = {
  first: ScrollState;
  last: ScrollState;
  xFrames: number;
  yFrames: number;
  maxWidth: number;
  maxHeight: number;
};
type Report = {
  status: "ready" | "sampling" | "complete";
  frames: number;
  closingFrames: number;
  meldFrames: number;
  footFrames: number;
  ranges: Record<string, Range>;
  scroll: Record<string, ScrollRange>;
  meldVisibility: Record<
    string,
    {
      initialClip: number;
      maxClip: number;
      initialFraction: number;
      clippedFrames: number;
      firstClip?: {
        frame: number;
        parts: { kind: string; rect: DOMRect }[];
        row?: DOMRect;
        strip?: DOMRect;
      };
    }
  >;
  changes: {
    frame: number;
    heights: Record<string, number>;
    boardMinimum: string;
  }[];
};
const emptyReport = (): Report => ({
  status: "ready",
  frames: 0,
  closingFrames: 0,
  meldFrames: 0,
  footFrames: 0,
  ranges: {},
  scroll: {},
  meldVisibility: {},
  changes: [],
});

/** Measure visible card faces and captions against their actual ancestor clips. */
export function meldClipping(pile: HTMLElement) {
  let clipped = 0;
  let fraction = 0;
  for (const part of pile.querySelectorAll<HTMLElement>(
    ".card, .meld-kind, .meld-count",
  )) {
    const style = getComputedStyle(part);
    if (style.visibility === "hidden" || Number(style.opacity) === 0) continue;
    const rect = part.getBoundingClientRect();
    if (!rect.width || !rect.height) continue;
    for (
      let parent = part.parentElement;
      parent;
      parent = parent.parentElement
    ) {
      const clip = getComputedStyle(parent);
      const bounds = parent.getBoundingClientRect();
      const margin = parseFloat(clip.overflowClipMargin) || 0;
      if (/hidden|auto|scroll|clip/.test(clip.overflowX)) {
        const loss = Math.max(
          0,
          Math.min(rect.width, bounds.left - margin - rect.left),
          Math.min(rect.width, rect.right - bounds.right - margin),
        );
        clipped = Math.max(clipped, loss);
        fraction = Math.max(fraction, loss / rect.width);
      }
      if (/hidden|auto|scroll|clip/.test(clip.overflowY)) {
        const loss = Math.max(
          0,
          Math.min(rect.height, bounds.top - margin - rect.top),
          Math.min(rect.height, rect.bottom - bounds.bottom - margin),
        );
        clipped = Math.max(clipped, loss);
        fraction = Math.max(fraction, loss / rect.height);
      }
      if (parent.classList.contains("game-page")) break;
    }
  }
  return { pixels: clipped, fraction };
}

/** Development-only, real-browser check of every painted animation frame. */
export function BoardHeightAudit({
  scope,
  replay,
  duration,
}: {
  scope: string;
  replay: number;
  duration: number;
}) {
  const [report, setReport] = useState<Report>(emptyReport);
  useEffect(() => {
    if (!replay) {
      setReport(emptyReport());
      return;
    }
    const result = emptyReport();
    result.status = "sampling";
    setReport({ ...result });
    const started = performance.now();
    let frame = 0;
    let previous = "";
    const measure = () => {
      result.frames += 1;
      result.closingFrames += Number(
        Boolean(document.querySelector(".book-closing-layer")),
      );
      result.meldFrames += Number(
        Boolean(document.querySelector(".meld-flight-layer")),
      );
      result.footFrames += Number(
        Boolean(
          document.querySelector('.foot-transition[data-gathering="true"]'),
        ),
      );
      const heights: Record<string, number> = {};
      for (const selector of [
        ".site-frame",
        ".game-page",
        ".board-carousel",
        ".tableau",
        ".player-lane",
        ".hand-dock",
      ]) {
        const node = document.querySelector(selector);
        if (!node) continue;
        const height = node.getBoundingClientRect().height;
        heights[selector] = height;
        const range = result.ranges[selector] ?? { min: height, max: height };
        range.min = Math.min(range.min, height);
        range.max = Math.max(range.max, height);
        result.ranges[selector] = range;
      }
      const key = JSON.stringify(heights);
      for (const selector of [
        "html",
        ".player-lane",
        ".closed-books",
        ".open-piles",
        ".hand-scroll",
      ]) {
        const node = document.querySelector(selector);
        if (!node) continue;
        const style = getComputedStyle(node);
        const state = {
          x:
            node.scrollWidth > node.clientWidth + 1 &&
            (selector === "html" || /auto|scroll/.test(style.overflowX)),
          y:
            node.scrollHeight > node.clientHeight + 1 &&
            (selector === "html" || /auto|scroll/.test(style.overflowY)),
          width: node.scrollWidth,
          height: node.scrollHeight,
        };
        const range = result.scroll[selector] ?? {
          first: state,
          last: state,
          xFrames: 0,
          yFrames: 0,
          maxWidth: state.width,
          maxHeight: state.height,
        };
        range.last = state;
        range.xFrames += Number(state.x);
        range.yFrames += Number(state.y);
        range.maxWidth = Math.max(range.maxWidth, state.width);
        range.maxHeight = Math.max(range.maxHeight, state.height);
        result.scroll[selector] = range;
      }
      for (const pile of document.querySelectorAll<HTMLElement>(
        ".open-piles .meld-pile[data-meld-id]",
      )) {
        const { pixels: clipped, fraction } = meldClipping(pile);
        const visibility: Report["meldVisibility"][string] =
          (result.meldVisibility[pile.dataset.meldId!] ??= {
            initialClip: clipped,
            maxClip: clipped,
            initialFraction: fraction,
            clippedFrames: 0,
          });
        visibility.maxClip = Math.max(visibility.maxClip, clipped);
        // Compare the fraction lost: an already offscreen card can rotate to a
        // wider box without losing any more of its visible face.
        const lostVisibility = fraction > visibility.initialFraction + 0.01;
        visibility.clippedFrames += Number(lostVisibility);
        if (lostVisibility && !visibility.firstClip)
          visibility.firstClip = {
            frame: result.frames,
            parts: [
              ...pile.querySelectorAll<HTMLElement>(
                ".card, .meld-kind, .meld-count",
              ),
            ].map((part) => ({
              kind: part.className,
              rect: part.getBoundingClientRect(),
            })),
            row: pile.closest(".pile-row-content")?.getBoundingClientRect(),
            strip: pile.closest(".open-piles")?.getBoundingClientRect(),
          };
      }
      if (key !== previous) {
        result.changes.push({
          frame: result.frames,
          heights,
          boardMinimum:
            (document.querySelector(".board-carousel") as HTMLElement | null)
              ?.style.minHeight ?? "",
        });
        previous = key;
      }
      const moving = document.querySelector(
        '.meld-flight-layer, .book-closing-layer, .foot-transition[data-gathering="true"]',
      );
      if (performance.now() - started < duration || moving)
        frame = requestAnimationFrame(measure);
      else {
        result.status = "complete";
        setReport({ ...result });
      }
    };
    measure();
    return () => cancelAnimationFrame(frame);
  }, [scope, replay, duration]);
  const variation = Math.max(
    0,
    ...Object.values(report.ranges).map(({ min, max }) => max - min),
  );
  const scrollbarFlashes = Object.values(report.scroll).reduce(
    (total, range) =>
      total +
      Number(range.xFrames > 0 && !range.first.x && !range.last.x) +
      Number(range.yFrames > 0 && !range.first.y && !range.last.y),
    0,
  );
  const clippedMelds = Object.values(report.meldVisibility).filter(
    ({ clippedFrames }) => clippedFrames > 0,
  ).length;
  return (
    <p
      role="status"
      data-height-audit={JSON.stringify(report)}
      style={{
        height: 20,
        margin: "0 0 8px",
        overflow: "hidden",
        fontSize: 11,
      }}
    >
      Board height check:{" "}
      {report.status === "complete"
        ? `${variation.toFixed(2)}px variation across ${report.frames} frames · ${scrollbarFlashes} scrollbar flashes · ${clippedMelds} clipped melds`
        : report.status === "sampling"
          ? "measuring animation…"
          : "play an animation to measure"}
    </p>
  );
}
