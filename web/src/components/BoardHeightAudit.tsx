import { useEffect, useState } from "react";

type Range = { min: number; max: number };
type Report = {
  status: "ready" | "sampling" | "complete";
  frames: number;
  closingFrames: number;
  meldFrames: number;
  footFrames: number;
  ranges: Record<string, Range>;
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
  changes: [],
});

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
        ? `${variation.toFixed(2)}px variation across ${report.frames} frames`
        : report.status === "sampling"
          ? "measuring animation…"
          : "play an animation to measure"}
    </p>
  );
}
