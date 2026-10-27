import { Room } from "../pages/Room";
import { OpeningMotion } from "./OpeningMotion";
import { samplePiles } from "../lib/openingSequence";
import type { ComponentProps } from "react";

export function OpeningBoard(
  props: Omit<ComponentProps<typeof OpeningMotion>, "children" | "piles">,
) {
  return (
    <OpeningMotion
      {...props}
      piles={samplePiles().map((pile) => [pile[0], pile[10]])}
    >
      {(presentation) => (
        <Room
          key={`${props.snapshot.players.length}-${props.snapshot.scoringMode}`}
          rehearsal={{ ...presentation, snapshot: props.snapshot }}
        />
      )}
    </OpeningMotion>
  );
}
