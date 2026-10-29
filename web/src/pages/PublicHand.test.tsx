import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { getRoom } from "../lib/api";
import { mobilePreviewSnapshot } from "./MobilePreview";
import { Room } from "./Room";

vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("../context/SoundContext", () => ({
  useSound: () => ({ play: vi.fn() }),
}));
vi.mock("socket.io-client", () => ({
  io: () => ({ on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() }),
}));
vi.mock("../lib/api", async (original) => ({
  ...(await original<typeof import("../lib/api")>()),
  getRoom: vi.fn(),
  socketCredentials: vi.fn().mockResolvedValue({ csrf: "test" }),
}));
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([
    {},
  ] as unknown as DOMRectList);
});

it.each([false, true])(
  "browses a concealed hand and public top foot card, then restores your playable hand (mobile: %s)",
  async (mobile) => {
    vi.mocked(window.matchMedia).mockImplementation(
      (query) =>
        ({
          matches:
            query === (mobile ? "(max-width: 768px)" : "(min-width: 769px)"),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }) as unknown as MediaQueryList,
    );
    const snapshot = mobilePreviewSnapshot(8);
    snapshot.players[1].handCount = 23;
    snapshot.players[1].footTop = {
      id: "public-foot-top",
      rank: "A",
      suit: "hearts",
      value: 20,
      wild: false,
      redThree: false,
    };
    vi.mocked(getRoom).mockResolvedValue(snapshot);
    await act(async () => {
      render(
        <MemoryRouter initialEntries={[`/room/${snapshot.code}`]}>
          <Routes>
            <Route path="/room/:code" element={<Room />} />
          </Routes>
        </MemoryRouter>,
      );
    });
    expect(
      screen.getByRole("region", { name: "Your private hand" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next board" }));
    const region = screen.getByRole("region", {
      name: "Maya’s hand",
    });
    expect(
      screen.queryByRole("region", { name: "Your private hand" }),
    ).toBeNull();
    expect(document.querySelector(".board-player-foot")).toBeNull();
    const foot = within(region).getByRole("group", {
      name: "Maya’s foot, 11 cards",
    });
    fireEvent.focus(foot);
    expect(within(foot).getByRole("tooltip").textContent).toContain(
      "A of hearts",
    );
    if (mobile)
      fireEvent.click(
        within(region).getByRole("button", {
          name: /Maya’s hand.*23 cards.*Open hand/i,
        }),
      );
    expect(region.querySelectorAll(".public-hand-cards .card")).toHaveLength(
      mobile ? 10 : 23,
    );
    expect(region.querySelector(".public-hand-cards .card-art")).toBeNull();
    expect(
      within(region).queryByRole("button", { name: "Play draft" }),
    ).toBeNull();
    if (mobile) {
      fireEvent.click(
        within(region).getByRole("button", { name: "Next hand cards" }),
      );
      expect(within(region).getByText("11–20 of 23 cards")).toBeTruthy();
      fireEvent.click(
        within(region).getByRole("button", { name: "Next hand cards" }),
      );
      expect(region.querySelectorAll(".public-hand-cards .card")).toHaveLength(
        3,
      );
      expect(within(region).getByText("21–23 of 23 cards")).toBeTruthy();
    }
    fireEvent.click(screen.getByRole("button", { name: "Previous board" }));
    expect(
      screen.getByRole("region", { name: "Your private hand" }),
    ).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Maya’s hand" })).toBeNull();
    if (mobile)
      fireEvent.click(
        screen.getByRole("button", { name: /your hand.*Open hand/i }),
      );
    expect(document.querySelectorAll(".hand-scroll .card-art")).toHaveLength(8);
  },
);

it("can inspect each partner’s hand and distinguishes an active foot", async () => {
  const snapshot = mobilePreviewSnapshot(8, true);
  const partner = snapshot.players.find(
    (p) => p.team === snapshot.players[0].team && p.id !== snapshot.viewerId,
  )!;
  partner.inFoot = true;
  partner.footCount = 0;
  partner.footTop = null;
  partner.handCount = 7;
  vi.mocked(getRoom).mockResolvedValue(snapshot);
  await act(async () => {
    render(
      <MemoryRouter>
        <Room rehearsal={{ snapshot, onChoose: () => {}, followTurn: false }} />
      </MemoryRouter>,
    );
  });
  fireEvent.change(
    screen.getByRole("combobox", { name: "Player hand to view" }),
    { target: { value: partner.id } },
  );
  const region = screen.getByRole("region", {
    name: `${partner.name}’s foot`,
  });
  expect(region.querySelectorAll(".public-hand-cards .card")).toHaveLength(7);
  expect(
    within(region).queryByRole("group", { name: /foot, 0 cards/ }),
  ).toBeNull();
});

it.each(
  (["round_over", "finished"] as const).flatMap((phase) =>
    [false, true].flatMap((mobile) =>
      [false, true].map((partnership) => ({ phase, mobile, partnership })),
    ),
  ),
)(
  "reveals everyone's remaining cards after $phase (mobile: $mobile, partnership: $partnership)",
  async ({ phase, mobile, partnership }) => {
    vi.mocked(window.matchMedia).mockImplementation(
      (query) =>
        ({
          matches:
            query === (mobile ? "(max-width: 768px)" : "(min-width: 769px)"),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }) as unknown as MediaQueryList,
    );
    const snapshot = mobilePreviewSnapshot(8, partnership);
    snapshot.phase = phase;
    snapshot.actorId = null;
    snapshot.footTop = null;
    snapshot.players = snapshot.players.map((player, index) => {
      const count = index === 0 ? 19 : index === 1 ? 15 : 3;
      const roundCards = Array.from({ length: count }, (_, i) => ({
        ...snapshot.hand[i % snapshot.hand.length],
        id: `ended-${player.id}-${i}`,
      }));
      return {
        ...player,
        roundCards,
        handCount: count,
        footCount: 0,
        footTop: null,
        inFoot: index > 1,
      };
    });
    snapshot.hand = snapshot.players[0].roundCards!;
    vi.mocked(getRoom).mockResolvedValue(snapshot);
    await act(async () => {
      render(
        <MemoryRouter initialEntries={[`/room/${snapshot.code}`]}>
          <Routes>
            <Route path="/room/:code" element={<Room />} />
          </Routes>
        </MemoryRouter>,
      );
    });
    fireEvent.click(screen.getByRole("button", { name: "Hide results" }));
    const own = screen.getByRole("region", { name: "Your Cards" });
    if (mobile)
      fireEvent.click(
        within(own).getByRole("button", { name: /your cards.*open hand/i }),
      );
    expect(own.querySelector(".hand-info")?.textContent).toContain("19 cards");
    expect(own.querySelectorAll(".hand-scroll .card-art")).toHaveLength(
      mobile ? 10 : 19,
    );
    expect(own.querySelector(".foot-status")).toBeNull();
    expect(own.querySelectorAll(".hand-scroll .card-back")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Next board" }));
    const other = screen.getByRole("region", { name: "Maya’s Cards" });
    if (mobile)
      fireEvent.click(
        within(other).getByRole("button", { name: /Maya’s Cards.*open hand/i }),
      );
    expect(other.querySelector(".hand-info")?.textContent).toContain(
      "15 cards",
    );
    expect(other.querySelectorAll(".public-hand-cards .card-art")).toHaveLength(
      mobile ? 10 : 15,
    );
    expect(
      other.querySelectorAll(".public-hand-cards .card-back"),
    ).toHaveLength(0);
    expect(other.querySelector(".foot-status")).toBeNull();
    expect(
      within(other).queryByRole("button", { name: "Play draft" }),
    ).toBeNull();
    if (mobile) {
      fireEvent.click(
        within(other).getByRole("button", { name: "Next hand cards" }),
      );
      expect(
        other.querySelectorAll(".public-hand-cards .card-art"),
      ).toHaveLength(5);
      expect(within(other).getByText("11–15 of 15 cards")).toBeTruthy();
    }
    if (partnership) {
      fireEvent.click(screen.getByRole("button", { name: "Previous board" }));
      const partner = snapshot.players.find(
        (player) =>
          player.team === snapshot.players[0].team &&
          player.id !== snapshot.viewerId,
      )!;
      fireEvent.change(
        screen.getByRole("combobox", { name: "Player hand to view" }),
        { target: { value: partner.id } },
      );
      const partnerHand = screen.getByRole("region", {
        name: `${partner.name}’s Cards`,
      });
      if (mobile)
        fireEvent.click(
          within(partnerHand).getByRole("button", {
            name: /cards.*open hand/i,
          }),
        );
      expect(
        partnerHand.querySelectorAll(".public-hand-cards .card-art"),
      ).toHaveLength(3);
      expect(partnerHand.querySelector(".foot-status")).toBeNull();
    }
    expect(document.querySelector(".turn-message")?.textContent).toBe(
      "End of round board state",
    );
    fireEvent.click(screen.getByRole("button", { name: "Show results" }));
    expect(screen.getByRole("dialog", { name: "Score sheet" })).toBeTruthy();
  },
);
