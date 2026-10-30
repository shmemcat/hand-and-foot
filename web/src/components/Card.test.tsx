import { render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { Card } from "./Card";
import type { Card as Face } from "../types";

const red: Face = {
  id: "red-discard",
  rank: "8",
  suit: "hearts",
  value: 5,
  wild: false,
  redThree: false,
};
const black: Face = { ...red, id: "black-discard", suit: "spades" };

it.each([false, true])(
  "replaces each new card's artwork so suit colors cannot fade from the previous card (interactive: %s)",
  (interactive) => {
    const onClick = interactive ? vi.fn() : undefined;
    const view = render(<Card card={red} onClick={onClick} small />);
    let previousArt = view.container.querySelector(".card-art")!;

    for (const card of [black, red]) {
      view.rerender(<Card card={card} onClick={onClick} small />);
      const art = view.container.querySelector(".card-art")!;
      expect(art).not.toBe(previousArt);
      expect(previousArt.isConnected).toBe(false);
      expect(art.parentElement?.classList.contains("red")).toBe(card === red);

      // Polling the same physical card must keep its existing artwork.
      view.rerender(<Card card={{ ...card }} onClick={onClick} small />);
      expect(view.container.querySelector(".card-art")).toBe(art);
      previousArt = art;
    }
  },
);
