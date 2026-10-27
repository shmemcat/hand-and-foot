import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { command, getRoom } from "../lib/api";
import type { Snapshot } from "../types";
import { Room } from "./Room";

vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ user: null }) }));
const sound = vi.hoisted(() => ({ play: vi.fn() }));
vi.mock("../context/SoundContext", () => ({
  useSound: () => sound,
}));
vi.mock("socket.io-client", () => ({
  io: () => ({ on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() }),
}));
vi.mock("../lib/api", async (original) => ({
  ...(await original<typeof import("../lib/api")>()),
  getRoom: vi.fn(),
  command: vi.fn(),
  socketCredentials: vi.fn().mockResolvedValue({ csrf: "test" }),
}));

function fixture(): Snapshot {
  return {
    code: "REVIEW",
    revision: 1,
    token: "turn-1",
    status: "playing",
    capacity: 2,
    scoringMode: "individual",
    playMode: "practice",
    viewerId: "you",
    hostId: "you",
    actorId: "you",
    players: ["You", "Poppy"].map((name, team) => ({
      id: team ? "bot" : "you",
      name,
      team,
      bot: team === 1,
      handCount: 11,
      footCount: 11,
      inFoot: false,
      chosen: true,
      redThrees: [],
      ready: false,
      away: false,
    })),
    sides: ["You", "Poppy"].map((name, id) => ({
      id,
      name,
      score: 0,
      opened: false,
      melds: [],
      clean: 0,
      dirty: 0,
      opening: 50,
    })),
    decks: 3,
    drawCount: 2,
    round: 1,
    targetScore: 10000,
    phase: "draw",
    hand: ["clubs", "hearts", "spades"].map((suit) => ({
      id: `ace-${suit}`,
      rank: "A",
      suit,
      value: 20,
      wild: false,
      redThree: false,
    })),
    footPreview: null,
    discard: null,
    discardCount: 0,
    stockCount: 100,
    history: [],
    winners: [],
    message: "Your turn",
    ruleset: "family",
    scoring: null,
  };
}
function openRoom() {
  render(
    <MemoryRouter initialEntries={["/room/REVIEW"]}>
      <Routes>
        <Route path="/room/:code" element={<Room />} />
      </Routes>
    </MemoryRouter>,
  );
}

it("groups completed books above open piles and lets a completed book receive more cards", async () => {
  const snapshot = fixture();
  snapshot.phase = "play";
  snapshot.sides[0].opened = true;
  const ace = snapshot.hand[1];
  snapshot.sides[0].melds = [
    {
      id: "open",
      creator: "you",
      kind: "set",
      rank: "Q",
      complete: false,
      dirty: false,
      bonus: 0,
      cards: Array.from({ length: 3 }, (_, index) => ({
        ...ace,
        id: `queen-${index}`,
        rank: "Q",
        value: 10,
      })),
    },
    {
      id: "closed",
      creator: "you",
      kind: "set",
      rank: "A",
      complete: true,
      dirty: false,
      bonus: 500,
      cards: Array.from({ length: 7 }, (_, index) => ({
        ...ace,
        id: `book-ace-${index}`,
      })),
    },
  ];
  snapshot.players[0].redThrees = [
    { ...ace, id: "red", rank: "3", value: -300, redThree: true },
  ];
  vi.mocked(getRoom).mockResolvedValue(snapshot);
  openRoom();
  const closed = await screen.findByRole("group", { name: "Completed books" });
  const open = screen.getByRole("group", { name: "Open piles" });
  expect(
    within(closed).getByRole("group", { name: "Red threes" }),
  ).toBeTruthy();
  expect(within(open).queryByRole("group", { name: "Red threes" })).toBeNull();
  expect(
    closed.compareDocumentPosition(open) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(screen.queryByText(/laid down/)).toBeNull();
  fireEvent.click(
    within(screen.getByRole("region", { name: "Your private hand" })).getByRole(
      "button",
      { name: "A of clubs" },
    ),
  );
  fireEvent.click(
    within(closed).getByRole("button", { name: "Add selected cards to A’s" }),
  );
  vi.mocked(command).mockResolvedValue(snapshot);
  fireEvent.click(screen.getByRole("button", { name: "Play draft · 20 pts" }));
  await waitFor(() =>
    expect(command).toHaveBeenCalledWith(snapshot, "meld", {
      groups: [{ meldId: "closed", cardIds: ["ace-clubs"] }],
    }),
  );
});
beforeEach(() => {
  sound.play.mockClear();
  vi.mocked(getRoom).mockResolvedValue(fixture());
  vi.mocked(command).mockReset();
});
afterEach(() => vi.useRealTimers());

it.each(["choose", "draw", "play"] as const)(
  "never plays an inactivity sound or shakes the phase hint in a bot game's %s phase",
  async (phase) => {
    vi.useFakeTimers();
    const snapshot = fixture();
    snapshot.phase = phase;
    snapshot.players[0].chosen = phase !== "choose";
    vi.mocked(getRoom).mockResolvedValue(snapshot);
    await act(async () => openRoom());
    await act(async () => vi.advanceTimersByTime(60_000));
    expect(sound.play).not.toHaveBeenCalledWith("notification");
    expect(document.querySelector(".turn-message.inactivity-shake")).toBeNull();
  },
);

it("keeps inactivity reminders for online games", async () => {
  vi.useFakeTimers();
  const snapshot = fixture();
  snapshot.playMode = "online";
  vi.mocked(getRoom).mockResolvedValue(snapshot);
  await act(async () => openRoom());
  await act(async () => vi.advanceTimersByTime(15_000));
  expect(sound.play).toHaveBeenCalledExactlyOnceWith("notification");
  expect(
    document.querySelector(".turn-message.inactivity-shake"),
  ).not.toBeNull();
});

it("browses individual boards while keeping the private hand and using a real follow checkbox", async () => {
  openRoom();
  const ownBoard = await screen.findByRole("region", { name: "Your board" });
  expect(within(ownBoard).getByRole("heading", { name: "You" })).toBeTruthy();
  const follow = screen.getByRole("checkbox", {
    name: "Follow turn",
  }) as HTMLInputElement;
  expect(follow.checked).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Next board" }));
  expect(screen.getByRole("region", { name: "Poppy’s board" })).toBeTruthy();
  expect(follow.checked).toBe(false);
  expect(
    within(
      screen.getByRole("region", { name: "Your private hand" }),
    ).getAllByRole("button"),
  ).toHaveLength(3);
  fireEvent.keyDown(screen.getByRole("region", { name: "Poppy’s board" }), {
    key: "ArrowLeft",
  });
  expect(screen.getByRole("region", { name: "Your board" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Next board" }));
  fireEvent.click(follow);
  expect(follow.checked).toBe(true);
  expect(screen.getByRole("region", { name: "Your board" })).toBeTruthy();
});

it("keeps scores in the dismissible menu and can open and close the score sheet", async () => {
  openRoom();
  await screen.findByRole("region", { name: "Your board" });
  const summary = screen.getByLabelText("Game information and scores");
  const menu = summary.closest("details")!;
  expect(menu.open).toBe(false);
  fireEvent.click(summary);
  expect(menu.open).toBe(true);
  expect(
    within(menu).getByRole("heading", { name: "Your progress" }),
  ).toBeTruthy();
  expect(within(menu).queryByText("Players / decks")).toBeNull();
  expect(within(menu).queryByText("Connection")).toBeNull();
  expect(within(menu).queryByText("Table", { exact: true })).toBeNull();
  expect(within(menu).queryByText("Game", { exact: true })).toBeNull();
  expect(within(menu).queryByRole("link", { name: "Rules" })).toBeNull();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(menu.open).toBe(false);
  expect(document.activeElement).toBe(summary);
  fireEvent.click(summary);
  fireEvent.pointerDown(screen.getByRole("region", { name: "Your board" }));
  expect(menu.open).toBe(false);
  fireEvent.click(summary);
  fireEvent.click(
    within(menu).getByRole("button", { name: "View score sheet" }),
  );
  expect(menu.open).toBe(false);
  expect(screen.getByRole("dialog", { name: "Score sheet" })).toBeTruthy();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog", { name: "Score sheet" })).toBeNull();
  fireEvent.click(summary);
  fireEvent.click(within(menu).getByRole("button", { name: "Leave table" }));
  expect(menu.open).toBe(false);
  expect(screen.getByRole("dialog", { name: "Leave table" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Stay" }));
  expect(screen.queryByRole("dialog", { name: "Leave table" })).toBeNull();
});

it("removes the separate foot indicator once those cards become the active hand", async () => {
  const snapshot = fixture();
  snapshot.players[0].inFoot = true;
  snapshot.players[0].footCount = 0;
  vi.mocked(getRoom).mockResolvedValue(snapshot);
  openRoom();
  const hand = await screen.findByRole("region", { name: "Your private hand" });
  expect(within(hand).getByText("YOUR FOOT")).toBeTruthy();
  expect(
    within(hand).queryByRole("img", { name: "Face-down card" }),
  ).toBeNull();
  expect(within(hand).queryByText(/Foot ·/)).toBeNull();
});

it("draws from the header and submits the selected opening cards", async () => {
  const snapshot = fixture();
  const drawn = {
    ...snapshot,
    phase: "play" as const,
    revision: 2,
    token: "turn-2",
  };
  vi.mocked(command)
    .mockResolvedValueOnce(drawn)
    .mockResolvedValueOnce({ ...drawn, revision: 3 });
  openRoom();
  fireEvent.click(
    await screen.findByRole("button", { name: "Draw 2 cards from the stack" }),
  );
  await waitFor(() =>
    expect(vi.mocked(command)).toHaveBeenCalledWith(snapshot, "draw", {}),
  );
  await screen.findByText(
    "Your turn. Build your piles, then discard to finish.",
  );
  for (const card of within(
    screen.getByRole("region", { name: "Your private hand" }),
  ).getAllByRole("button", { name: /^A of/ })) {
    fireEvent.click(card);
  }
  fireEvent.click(screen.getByRole("button", { name: "Stage" }));
  fireEvent.click(screen.getByRole("button", { name: "Play draft · 60 pts" }));
  await waitFor(() =>
    expect(vi.mocked(command)).toHaveBeenLastCalledWith(drawn, "meld", {
      groups: [
        { cardIds: ["ace-clubs", "ace-hearts", "ace-spades"], kind: "set" },
      ],
    }),
  );
});

it("only enables the single Stage button for a valid selected group", async () => {
  const snapshot = fixture();
  snapshot.phase = "play";
  snapshot.hand.push({
    id: "king",
    rank: "K",
    suit: "clubs",
    value: 10,
    wild: false,
    redThree: false,
  });
  vi.mocked(getRoom).mockResolvedValue(snapshot);
  openRoom();
  const stage = (await screen.findByRole("button", {
    name: "Stage",
  })) as HTMLButtonElement;
  expect(stage.disabled).toBe(true);
  expect(screen.queryByRole("button", { name: "Stage flush" })).toBeNull();
  const hand = within(
    screen.getByRole("region", { name: "Your private hand" }),
  );
  const aces = hand.getAllByRole("button", { name: /^A of/ });
  fireEvent.click(aces[0]);
  expect(stage.disabled).toBe(true);
  fireEvent.click(aces[1]);
  expect(stage.disabled).toBe(true);
  fireEvent.click(aces[2]);
  expect(stage.disabled).toBe(false);
  fireEvent.click(hand.getByRole("button", { name: "K of clubs" }));
  expect(stage.disabled).toBe(true);
  fireEvent.click(hand.getByRole("button", { name: "K of clubs" }));
  expect(stage.disabled).toBe(false);
  fireEvent.click(stage);
  expect(stage.disabled).toBe(true);
  expect(
    screen.getByRole("button", { name: "Play draft · 60 pts" }),
  ).toBeTruthy();
});

it("offers New meld when selected cards can join an existing pile and stages a separate meld", async () => {
  const snapshot = fixture();
  snapshot.phase = "play";
  snapshot.sides[0].opened = true;
  snapshot.sides[0].melds = [
    {
      id: "existing-aces",
      creator: "you",
      kind: "set",
      rank: "A",
      cards: snapshot.hand.map((card) => ({ ...card, id: `table-${card.id}` })),
      complete: false,
      dirty: false,
      bonus: 0,
    },
  ];
  vi.mocked(getRoom).mockResolvedValue(snapshot);
  vi.mocked(command).mockResolvedValue({ ...snapshot, revision: 2 });
  openRoom();
  const hand = within(
    await screen.findByRole("region", { name: "Your private hand" }),
  );
  const aces = hand.getAllByRole("button", { name: /^A of/ });
  fireEvent.click(aces[0]);
  expect(
    (screen.getByRole("button", { name: "New meld" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(
    screen.getByRole("button", { name: "Add selected cards to A’s" }),
  ).toBeTruthy();
  fireEvent.click(aces[1]);
  expect(
    (screen.getByRole("button", { name: "New meld" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fireEvent.click(aces[2]);
  expect(
    (screen.getByRole("button", { name: "New meld" }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "clear selection" }));
  expect(screen.getByRole("button", { name: "Stage" })).toBeTruthy();
  for (const ace of aces) fireEvent.click(ace);
  fireEvent.click(screen.getByRole("button", { name: "Next board" }));
  expect(
    screen.queryByRole("button", { name: /^Add selected cards to/ }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "New meld" }));
  fireEvent.click(screen.getByRole("button", { name: "Play draft · 60 pts" }));
  await waitFor(() =>
    expect(command).toHaveBeenCalledWith(snapshot, "meld", {
      groups: [{ cardIds: snapshot.hand.map((card) => card.id), kind: "set" }],
    }),
  );
});

it("automatically stages a straight flush with the correct move type", async () => {
  const snapshot = fixture();
  snapshot.phase = "play";
  snapshot.sides[0].opened = true;
  snapshot.hand = ["5", "6", "7"].map((rank) => ({
    id: `heart-${rank}`,
    rank,
    suit: "hearts",
    value: 5,
    wild: false,
    redThree: false,
  }));
  vi.mocked(getRoom).mockResolvedValue(snapshot);
  vi.mocked(command).mockResolvedValue({ ...snapshot, revision: 2 });
  openRoom();
  const hand = within(
    await screen.findByRole("region", { name: "Your private hand" }),
  );
  for (const rank of ["7", "5", "6"])
    fireEvent.click(hand.getByRole("button", { name: `${rank} of hearts` }));
  fireEvent.click(screen.getByRole("button", { name: "Stage" }));
  fireEvent.click(screen.getByRole("button", { name: "Play draft · 15 pts" }));
  await waitFor(() =>
    expect(command).toHaveBeenCalledWith(snapshot, "meld", {
      groups: [{ cardIds: ["heart-7", "heart-5", "heart-6"], kind: "run" }],
    }),
  );
});

it("includes the top discard when detecting a staged matching pile", async () => {
  const snapshot = fixture();
  snapshot.hand = snapshot.hand.slice(0, 2);
  snapshot.discard = {
    ...snapshot.hand[0],
    id: "discard-ace",
    suit: "diamonds",
  };
  vi.mocked(getRoom).mockResolvedValue(snapshot);
  vi.mocked(command).mockResolvedValue({
    ...snapshot,
    revision: 2,
    phase: "play",
  });
  openRoom();
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Pick up and immediately play the top discard",
    }),
  );
  const stage = screen.getByRole("button", {
    name: "Stage",
  }) as HTMLButtonElement;
  expect(stage.disabled).toBe(true);
  const hand = within(
    screen.getByRole("region", { name: "Your private hand" }),
  );
  for (const ace of hand.getAllByRole("button", { name: /^A of/ }))
    fireEvent.click(ace);
  expect(stage.disabled).toBe(false);
  fireEvent.click(stage);
  fireEvent.click(screen.getByRole("button", { name: "Play draft · 60 pts" }));
  await waitFor(() =>
    expect(command).toHaveBeenCalledWith(snapshot, "pickup", {
      groups: [
        { cardIds: ["ace-clubs", "ace-hearts", "discard-ace"], kind: "set" },
      ],
    }),
  );
});

it("never offers the discard as an addition to a six-card pile", async () => {
  const snapshot = fixture();
  snapshot.sides[0].opened = true;
  snapshot.sides[0].melds = [
    {
      id: "six-aces",
      creator: "you",
      kind: "set",
      rank: "A",
      complete: false,
      dirty: false,
      bonus: 0,
      cards: Array.from({ length: 6 }, (_, index) => ({
        ...snapshot.hand[0],
        id: `table-ace-${index}`,
      })),
    },
  ];
  snapshot.discard = {
    ...snapshot.hand[0],
    id: "discard-ace",
    suit: "diamonds",
  };
  vi.mocked(getRoom).mockResolvedValue(snapshot);
  openRoom();
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Pick up and immediately play the top discard",
    }),
  );
  const hand = within(
    screen.getByRole("region", { name: "Your private hand" }),
  );
  for (const ace of hand.getAllByRole("button", { name: /^A of/ }).slice(0, 2))
    fireEvent.click(ace);
  expect(
    screen.queryByRole("button", { name: "Add selected cards to A’s" }),
  ).toBeNull();
  const stack = screen.getByRole("button", { name: "Inspect A’s, 6 cards" });
  expect(
    document.getElementById(stack.getAttribute("aria-describedby")!)
      ?.textContent,
  ).toContain("cannot take the discard");
  expect(
    (screen.getByRole("button", { name: "Stage" }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
});

it("only highlights piles with a natural majority and includes earlier draft additions in validation", async () => {
  const snapshot = fixture();
  snapshot.phase = "play";
  snapshot.sides[0].opened = true;
  const eights = ["clubs", "hearts", "spades"].map((suit) => ({
    id: `table-8-${suit}`,
    rank: "8",
    suit,
    value: 5,
    wild: false,
    redThree: false,
  }));
  snapshot.sides[0].melds = [
    {
      id: "eights",
      creator: "you",
      kind: "set",
      rank: "8",
      cards: [
        ...eights,
        ...["table-two-1", "table-two-2"].map((id) => ({
          id,
          rank: "2",
          suit: "clubs",
          value: 20,
          wild: true,
          redThree: false,
        })),
      ],
      complete: false,
      dirty: true,
      bonus: 0,
    },
  ];
  snapshot.hand = [
    { ...eights[0], id: "extra-eight" },
    {
      id: "wild-two",
      rank: "2",
      suit: "hearts",
      value: 20,
      wild: true,
      redThree: false,
    },
    ...snapshot.hand,
  ];
  vi.mocked(getRoom).mockResolvedValue(snapshot);
  openRoom();
  const hand = within(
    await screen.findByRole("region", { name: "Your private hand" }),
  );
  fireEvent.click(hand.getByRole("button", { name: "2 of hearts" }));
  expect(
    screen.queryByRole("button", { name: /^Add selected cards to/ }),
  ).toBeNull();
  expect(screen.getByRole("button", { name: "Stage" })).toBeTruthy();
  fireEvent.click(hand.getByRole("button", { name: "2 of hearts" }));
  fireEvent.click(hand.getByRole("button", { name: "8 of clubs" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Add selected cards to 8’s" }),
  );
  fireEvent.click(hand.getByRole("button", { name: "2 of hearts" }));
  expect(
    screen.getByRole("button", { name: "Add selected cards to 8’s" }),
  ).toBeTruthy();
  expect(
    (screen.getByRole("button", { name: "New meld" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fireEvent.click(hand.getByRole("button", { name: "A of clubs" }));
  expect(
    screen.queryByRole("button", { name: /^Add selected cards to/ }),
  ).toBeNull();
});

it.each(
  [false, true].flatMap((opened) =>
    [1, 2, 3, 6].map((count) => ({ opened, count })),
  ),
)(
  "handles $count selected red threes with the appropriate controls (opened: $opened)",
  async ({ opened, count }) => {
    const snapshot = fixture();
    snapshot.phase = "play";
    snapshot.sides[0].opened = opened;
    const reds = Array.from({ length: count }, (_, index) => ({
      id: `red-three-${index}`,
      rank: "3",
      suit: index % 2 ? "hearts" : "diamonds",
      value: -300,
      wild: false,
      redThree: true,
    }));
    snapshot.hand.push(...reds);
    vi.mocked(getRoom).mockResolvedValue(snapshot);
    vi.mocked(command).mockResolvedValue({ ...snapshot, revision: 2 });
    openRoom();
    const hand = within(
      await screen.findByRole("region", { name: "Your private hand" }),
    );
    for (const card of hand.getAllByRole("button", {
      name: /3 of (hearts|diamonds), red three/,
    }))
      fireEvent.click(card);
    if (count === 1) {
      expect(screen.queryByRole("button", { name: "Discard" })).toBeNull();
      expect(
        screen.queryByRole("button", { name: "Replace from stack" }),
      ).toBeNull();
      expect(
        screen.queryByRole("button", { name: "Lay down for your side" }),
      ).toBeNull();
      const replace = screen.getByRole("button", {
        name: "Replace",
      }) as HTMLButtonElement;
      expect(replace.disabled).toBe(false);
      fireEvent.click(replace);
      await waitFor(() =>
        expect(command).toHaveBeenCalledWith(snapshot, "red_three", {
          cardIds: [reds[0].id],
          expose: false,
        }),
      );
      return;
    }
    const expose = screen.getByRole("button", {
      name: "Lay down for your side",
    }) as HTMLButtonElement;
    const replace = screen.getByRole("button", {
      name: "Replace from stack",
    }) as HTMLButtonElement;
    expect(expose.disabled).toBe(!opened);
    expect(replace.disabled).toBe(false);
    if (opened) {
      fireEvent.click(expose);
      await waitFor(() =>
        expect(command).toHaveBeenCalledWith(snapshot, "red_three", {
          cardIds: expect.arrayContaining(reds.map((card) => card.id)),
          expose: true,
        }),
      );
    } else {
      expect(
        screen.getByText(
          "Complete your side’s opening meld to lay down red threes.",
        ),
      ).toBeTruthy();
      fireEvent.click(expose);
      expect(command).not.toHaveBeenCalled();
      fireEvent.click(replace);
      await waitFor(() =>
        expect(command).toHaveBeenCalledWith(snapshot, "red_three", {
          cardIds: expect.arrayContaining(reds.map((card) => card.id)),
          expose: false,
        }),
      );
    }
    expect(vi.mocked(command).mock.calls[0][2]?.cardIds).toHaveLength(count);
  },
);

it("only offers red-three actions when every selected card is a red three", async () => {
  const snapshot = fixture();
  snapshot.phase = "play";
  snapshot.sides[0].opened = true;
  snapshot.hand.push(
    ...["diamonds", "hearts"].map((suit) => ({
      id: `red-${suit}`,
      rank: "3",
      suit,
      value: -300,
      wild: false,
      redThree: true,
    })),
  );
  vi.mocked(getRoom).mockResolvedValue(snapshot);
  openRoom();
  const hand = within(
    await screen.findByRole("region", { name: "Your private hand" }),
  );
  fireEvent.click(
    hand.getByRole("button", { name: "3 of diamonds, red three" }),
  );
  fireEvent.click(hand.getByRole("button", { name: "3 of hearts, red three" }));
  expect(
    (
      screen.getByRole("button", {
        name: "Lay down for your side",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(false);
  fireEvent.click(hand.getByRole("button", { name: "A of clubs" }));
  expect(
    screen.queryByRole("button", { name: "Lay down for your side" }),
  ).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Replace from stack" }),
  ).toBeNull();
  expect(
    (screen.getByRole("button", { name: "Discard" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fireEvent.click(
    hand.getByRole("button", { name: "3 of diamonds, red three" }),
  );
  fireEvent.click(hand.getByRole("button", { name: "3 of hearts, red three" }));
  expect(
    (screen.getByRole("button", { name: "Discard" }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
  expect(screen.queryByRole("button", { name: "Replace" })).toBeNull();
});

it("keeps a staged opening intact when selecting and clearing a red three", async () => {
  const snapshot = fixture();
  snapshot.phase = "play";
  snapshot.hand.push({
    id: "red-three",
    rank: "3",
    suit: "hearts",
    value: -300,
    wild: false,
    redThree: true,
  });
  vi.mocked(getRoom).mockResolvedValue(snapshot);
  openRoom();
  const hand = within(
    await screen.findByRole("region", { name: "Your private hand" }),
  );
  for (const ace of hand.getAllByRole("button", { name: /^A of/ }))
    fireEvent.click(ace);
  fireEvent.click(screen.getByRole("button", { name: "Stage" }));
  fireEvent.click(hand.getByRole("button", { name: "3 of hearts, red three" }));
  const replace = screen.getByRole("button", {
    name: "Replace",
  }) as HTMLButtonElement;
  expect(replace.disabled).toBe(true);
  fireEvent.click(replace);
  expect(command).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "clear selection" }));
  expect(hand.queryAllByRole("button", { pressed: true })).toHaveLength(0);
  expect(screen.queryByRole("button", { name: "clear selection" })).toBeNull();
  expect(screen.getByText("Select cards to play")).toBeTruthy();
  expect(command).not.toHaveBeenCalled();
  expect(
    screen.getByRole("button", { name: "Play draft · 60 pts" }),
  ).toBeTruthy();
});
