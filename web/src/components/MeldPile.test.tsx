import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { Card, Meld } from "../types";
import { MeldPile } from "./MeldPile";

function card(id: string, rank = "10", suit = "spades"): Card {
  return {
    id,
    rank,
    suit,
    value: rank === "Joker" ? 50 : rank === "2" ? 20 : 10,
    wild: rank === "2" || rank === "Joker",
    redThree: false,
  };
}
function pile(overrides: Partial<Meld> = {}): Meld {
  return {
    id: "tens",
    creator: "you",
    kind: "set",
    rank: "10",
    cards: [
      card("s1"),
      card("s2"),
      card("club", "10", "clubs"),
      card("heart", "10", "hearts"),
      card("s3"),
    ],
    dirty: false,
    complete: false,
    bonus: 0,
    ...overrides,
  };
}

it("keeps reconciled cards normal when saved scoring metadata marks them spent", () => {
  const meld = pile({ bonusLost: true, spentCardIds: ["s1", "heart"] });
  show(meld);
  expect(document.querySelector(".card.spent")).toBeNull();
  const stack = screen.getByRole("group", { name: "10’s, book broken" });
  expect(stack.querySelectorAll(".card")).toHaveLength(meld.cards.length);
  expect(stack.querySelector(".spent")).toBeNull();
  expect(stack.textContent).not.toContain("×");
});
function show(meld = pile(), canTarget = false) {
  const onTarget = vi.fn();
  render(
    <MeldPile
      meld={meld}
      canTarget={canTarget}
      onTarget={onTarget}
      staged={0}
    />,
  );
  return onTarget;
}

it("shows the simple type and count with indexed strips above the regular bottom card", () => {
  show();
  const group = screen.getByRole("group", { name: "Clean 10’s" });
  expect(within(group).getByText("Clean")).toBeTruthy();
  expect(within(group).getByText("5 / 7")).toBeTruthy();
  const stack = screen.getByRole("group", { name: "10’s, 5 cards" });
  const faces = within(stack).getAllByRole("img");
  expect(
    faces.slice(0, -1).every((face) => face.querySelector(".card-index")),
  ).toBe(true);
  expect(faces.at(-1)?.querySelector(".card-index")).toBeNull();
  expect(faces.at(-1)?.querySelector(".card-art text")?.textContent).toBe("10");
});

it.each(["2", "Joker"])(
  "keeps a natural ten at the bottom when a %s was added last",
  (wildRank) => {
    const meld = pile({ dirty: true });
    meld.cards = [
      ...meld.cards.slice(0, 4),
      card("last-wild", wildRank, wildRank === "Joker" ? "joker" : "diamonds"),
    ];
    const originalIds = meld.cards.map((item) => item.id);
    show(meld);
    expect(screen.getByText("Dirty")).toBeTruthy();
    const faces = within(
      screen.getByRole("group", { name: "10’s, 5 cards" }),
    ).getAllByRole("img");
    expect(faces.at(-1)?.getAttribute("aria-label")).toBe("10 of hearts");
    expect(faces.at(-1)?.querySelector(".card-art text")?.textContent).toBe(
      "10",
    );
    expect(faces.at(-2)?.querySelector(".card-index")?.textContent).toBe(
      wildRank,
    );
    expect(meld.cards.map((item) => item.id)).toEqual(originalIds);
  },
);

it("uses a two as the natural face in a pile of twos with a Joker", () => {
  show(
    pile({
      rank: "2",
      dirty: true,
      cards: [
        card("two-1", "2"),
        card("two-2", "2", "clubs"),
        card("joker", "Joker", "joker"),
      ],
    }),
  );
  const faces = within(
    screen.getByRole("group", { name: "2’s, 3 cards" }),
  ).getAllByRole("img");
  expect(faces.at(-1)?.querySelector(".card-art text")?.textContent).toBe("2");
  expect(screen.getByText("Dirty")).toBeTruthy();
});

it("labels straight flushes separately from clean and dirty books", () => {
  show(
    pile({
      kind: "run",
      rank: "hearts",
      cards: [
        card("five", "5", "hearts"),
        card("six", "6", "hearts"),
        card("seven", "7", "hearts"),
      ],
    }),
  );
  expect(
    screen.getByRole("group", { name: "Straight hearts straight" }),
  ).toBeTruthy();
  expect(screen.getByText("Straight")).toBeTruthy();
  expect(screen.queryByText("Clean")).toBeNull();
  expect(screen.queryByText("Dirty")).toBeNull();
  expect(document.querySelector(".straight-book")).toBeTruthy();
  expect(document.querySelector(".clean-book")).toBeNull();
});

it("keeps a pile static when no game action can target it", () => {
  const onTarget = show();
  const stack = screen.getByRole("group", { name: "10’s, 5 cards" });
  expect(screen.queryByRole("button")).toBeNull();
  expect(stack.hasAttribute("aria-expanded")).toBe(false);
  fireEvent.click(stack);
  expect(onTarget).not.toHaveBeenCalled();
  expect(within(stack).getAllByRole("img")).toHaveLength(5);
  expect(screen.queryByRole("group", { name: "Cards in 10’s" })).toBeNull();
});

it("stages cards by clicking an outlined pile without opening inspection or adding a text button", () => {
  const onTarget = show(pile(), true);
  const stack = screen.getByRole("button", {
    name: "Add selected cards to 10’s",
  });
  expect(stack.closest(".legal-target")).toBeTruthy();
  expect(stack.hasAttribute("aria-expanded")).toBe(false);
  expect(screen.getAllByRole("button")).toHaveLength(1);
  expect(screen.queryByText("+ Add selected")).toBeNull();
  fireEvent.click(stack);
  expect(onTarget).toHaveBeenCalledOnce();
  expect(screen.queryByRole("group", { name: "Cards in 10’s" })).toBeNull();
});

it("preserves completed book bonuses and covers without an inspection toggle", () => {
  const meld = pile({ complete: true, bonus: 500 });
  meld.cards.push(card("sixth"), card("seventh"));
  show(meld);
  expect(screen.getByText("Clean book")).toBeTruthy();
  expect(screen.getByText("7 cards")).toBeTruthy();
  const cover = within(
    screen.getByRole("group", {
      name: "10’s, clean book, 500 bonus points",
    }),
  ).getByRole("img");
  expect(cover.getAttribute("aria-label")).toBe("10 of hearts");
  expect(cover.querySelector(".card-index")).toBeNull();
  fireEvent.click(
    screen.getByRole("group", {
      name: "10’s, clean book, 500 bonus points",
    }),
  );
  expect(screen.queryByRole("button")).toBeNull();
  expect(screen.getAllByRole("img")).toHaveLength(1);
  expect(screen.queryByRole("group", { name: "Cards in 10’s" })).toBeNull();
});

it.each([
  { complete: false, bonus: 300 },
  { complete: true, bonus: 500 },
])(
  "labels a broken $bonus book without presenting a bonus or deduction",
  (state) => {
    show(pile({ ...state, bonusLost: true }));
    expect(screen.getByText("Broken book")).toBeTruthy();
    fireEvent.click(screen.getByRole("group", { name: "10’s, book broken" }));
    expect(screen.queryByText(/bonus|−300|−500/)).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("group", { name: "Cards in 10’s" })).toBeNull();
  },
);

it("explains the hand-only finish on a six-card pile while still accepting hand additions", () => {
  const meld = pile();
  meld.cards.push(card("sixth"));
  const onTarget = show(meld, true);
  const stack = screen.getByRole("button", {
    name: "Add selected cards to 10’s",
  });
  expect(
    document.getElementById(stack.getAttribute("aria-describedby")!)
      ?.textContent,
  ).toContain("from your hand");
  expect(stack.getAttribute("title")).toContain("cannot take the discard");
  fireEvent.click(stack);
  expect(onTarget).toHaveBeenCalledOnce();
  expect(screen.getByText("6 / 7")).toBeTruthy();
});

it("uses a black natural cover for a dirty book and counts additions beyond seven", () => {
  const meld = pile({ complete: true, dirty: true, bonus: 300 });
  meld.cards.push(
    card("sixth", "10", "diamonds"),
    card("seventh", "2", "hearts"),
    card("eighth", "10", "hearts"),
  );
  const onTarget = show(meld, true);
  expect(screen.getByText("Dirty book")).toBeTruthy();
  expect(screen.getByText("8 cards")).toBeTruthy();
  expect(
    within(
      screen.getByRole("button", {
        name: "Add selected cards to 10’s",
      }),
    )
      .getByRole("img")
      .getAttribute("aria-label"),
  ).toBe("10 of spades");
  fireEvent.click(
    screen.getByRole("button", { name: "Add selected cards to 10’s" }),
  );
  expect(onTarget).toHaveBeenCalledOnce();
  expect(screen.queryByRole("group", { name: "Cards in 10’s" })).toBeNull();
});

it("labels a finished straight separately and preserves its suit", () => {
  show(
    pile({
      kind: "run",
      rank: "spades",
      complete: true,
      bonus: 1300,
      cards: ["4", "5", "6", "7", "8", "9", "10"].map((rank) =>
        card(rank, rank),
      ),
    }),
  );
  expect(screen.getByText("Complete straight")).toBeTruthy();
  expect(screen.queryByText("Clean book")).toBeNull();
  expect(
    within(
      screen.getByRole("group", {
        name: "spades straight, straight, 1300 bonus points",
      }),
    )
      .getByRole("img")
      .getAttribute("aria-label"),
  ).toBe("10 of spades");
});
