import { StrictMode } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { AchievementNotifications } from "./AchievementNotifications";
import { AchievementEvents } from "./AchievementEvents";
import { ACHIEVEMENT_EVENT, MUSIC_OFF_EVENT } from "../lib/achievementEvents";
import type { AccountSummary } from "../lib/achievements";

const auth = vi.hoisted(() => ({
  user: { id: "alice" } as { id: string } | null,
}));
const request = vi.hoisted(() => vi.fn());
vi.mock("../context/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("../lib/api", () => ({ request }));

const key = (id = "alice") =>
  `handandfoot.achievements-seen.v1:${encodeURIComponent(id)}`;
let summary: AccountSummary;
const empty = (): AccountSummary => ({
  stats: {} as AccountSummary["stats"],
  counters: {},
  unlocks: [],
});
const refresh = async (event = ACHIEVEMENT_EVENT) => {
  await act(async () => {
    window.dispatchEvent(new Event(event));
  });
};
const seed = async () => {
  const view = render(<AchievementNotifications />);
  await waitFor(() => expect(localStorage.getItem(key())).not.toBeNull());
  return view;
};
const dismiss = (name: string) =>
  fireEvent.click(
    screen.getByRole("button", {
      name: `Dismiss ${name} achievement notification`,
    }),
  );

beforeEach(() => {
  auth.user = { id: "alice" };
  summary = empty();
  request.mockReset().mockImplementation(async () => summary);
});

it("quietly seeds historical achievements and shows new unlocks with their icons", async () => {
  summary.unlocks = ["first_chapter"];
  await seed();
  expect(screen.queryByRole("status")).toBeNull();
  summary.unlocks.push("first_victory", "a_leg_up");
  await refresh();
  const notice = screen.getByRole("status");
  expect(notice.textContent).toContain("Foot in the Door");
  expect(notice.textContent).toContain("A Leg Up");
  expect(notice.textContent).not.toContain("Footloose");
  expect(within(notice).getAllByText("Achievement Unlocked!")).toHaveLength(2);
  expect(notice.querySelectorAll("svg")).toHaveLength(2);
});

it("limits the stack to three and reveals queued unlocks when dismissed", async () => {
  await seed();
  summary.unlocks = [
    "first_chapter",
    "first_victory",
    "a_leg_up",
    "geezer",
    "spooky",
  ];
  await refresh();
  const notice = screen.getByRole("status");
  expect(within(notice).getAllByText("Achievement Unlocked!")).toHaveLength(3);
  expect(notice.textContent).toContain("+2 more");
  expect(screen.queryByText("Locked in")).toBeNull();
  dismiss("Footloose");
  expect(notice.textContent).toContain("Locked in");
  expect(notice.textContent).toContain("+1 more");
});

it("gives every queued batch three seconds before automatically dismissing it", async () => {
  await seed();
  vi.useFakeTimers();
  try {
    summary.unlocks = [
      "first_chapter",
      "first_victory",
      "a_leg_up",
      "geezer",
      "spooky",
    ];
    await refresh();
    act(() => vi.advanceTimersByTime(2999));
    expect(screen.getAllByText("Achievement Unlocked!")).toHaveLength(3);
    act(() => vi.advanceTimersByTime(1));
    const notice = screen.getByRole("status");
    expect(within(notice).getAllByText("Achievement Unlocked!")).toHaveLength(
      2,
    );
    expect(notice.textContent).toContain("Locked in");
    expect(notice.textContent).toContain("Spooky");
    expect(screen.queryByText("Footloose")).toBeNull();
    act(() => vi.advanceTimersByTime(2999));
    expect(screen.queryByRole("status")).not.toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole("status")).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

it("retains active notices when another achievement arrives", async () => {
  await seed();
  summary.unlocks = ["geezer"];
  await refresh();
  summary.unlocks.push("a_leg_up");
  await refresh();
  expect(screen.getByRole("status").textContent).toContain("Locked in");
  expect(screen.getByRole("status").textContent).toContain("A Leg Up");
});

it.each([ACHIEVEMENT_EVENT, "focus", "online"])(
  "checks saved achievements on %s",
  async (event) => {
    await seed();
    summary.unlocks = ["geezer"];
    await refresh(event);
    expect(screen.getByRole("status").textContent).toContain("Locked in");
    expect(request).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenLastCalledWith("/achievements");
  },
);

it("announces the music-off achievement after it has been saved", async () => {
  request.mockImplementation(async (_path, body) => {
    if (body) {
      summary.unlocks = ["geezer"];
      return { unlocks: ["geezer"] };
    }
    return summary;
  });
  render(
    <>
      <AchievementNotifications />
      <AchievementEvents />
    </>,
  );
  await waitFor(() => expect(localStorage.getItem(key())).toBe("[]"));
  await refresh(MUSIC_OFF_EVENT);
  expect(request).toHaveBeenCalledWith("/achievements", {
    id: "geezer",
    userId: "alice",
  });
  expect(screen.getByRole("status").textContent).toContain("Locked in");
});

it("remembers notices across duplicate events, remounts and account switches", async () => {
  const view = await seed();
  summary.unlocks = ["geezer"];
  await refresh();
  dismiss("Locked in");
  await refresh();
  expect(screen.queryByRole("status")).toBeNull();
  auth.user = { id: "bob" };
  summary = empty();
  view.rerender(<AchievementNotifications />);
  await waitFor(() => expect(localStorage.getItem(key("bob"))).toBe("[]"));
  auth.user = { id: "alice" };
  summary.unlocks = ["geezer"];
  view.rerender(<AchievementNotifications />);
  await act(async () => {});
  expect(screen.queryByRole("status")).toBeNull();
  view.unmount();
  await seed();
  expect(screen.queryByRole("status")).toBeNull();
});

it("announces milestone upgrades once and remembers all lower tiers", async () => {
  summary.counters.games = 10;
  await seed();
  summary.counters.games = 50;
  await refresh();
  expect(screen.getByRole("status").textContent).toContain("Table Regular");
  expect(
    screen.getByRole("status").querySelector('[data-tier="silver"] svg'),
  ).not.toBeNull();
  expect(screen.getByRole("status").textContent).toContain("silver");
  dismiss("Table Regular");
  summary.counters.games = 10;
  await refresh();
  expect(screen.queryByRole("status")).toBeNull();
  summary.counters.games = 200;
  await refresh();
  expect(
    screen.getByRole("status").querySelector('[data-tier="gold"] svg'),
  ).not.toBeNull();
  expect(JSON.parse(localStorage.getItem(key())!)).toEqual(
    expect.arrayContaining(["games_bronze", "games_silver", "games_gold"]),
  );
});

it("ignores delayed responses and clears notices when the account changes", async () => {
  const view = await seed();
  summary.unlocks = ["geezer"];
  await refresh();
  let resolve!: (value: AccountSummary) => void;
  request.mockImplementationOnce(
    () =>
      new Promise<AccountSummary>((done) => {
        resolve = done;
      }),
  );
  await refresh();
  auth.user = { id: "bob" };
  summary = empty();
  view.rerender(<AchievementNotifications />);
  expect(screen.queryByRole("status")).toBeNull();
  await waitFor(() => expect(localStorage.getItem(key("bob"))).toBe("[]"));
  await act(async () => resolve({ ...empty(), unlocks: ["first_victory"] }));
  expect(localStorage.getItem(key("alice"))).toBe('["geezer"]');
  expect(localStorage.getItem(key("bob"))).toBe("[]");
  expect(screen.queryByRole("status")).toBeNull();
});

it("ignores superseded refreshes and retries failed requests on reconnect", async () => {
  await seed();
  let resolve!: (value: AccountSummary) => void;
  request.mockImplementationOnce(
    () =>
      new Promise<AccountSummary>((done) => {
        resolve = done;
      }),
  );
  await refresh();
  summary.unlocks = ["geezer"];
  await refresh();
  await act(async () => resolve(empty()));
  expect(screen.getByRole("status").textContent).toContain("Locked in");
  dismiss("Locked in");
  request.mockRejectedValueOnce(new Error("Offline"));
  summary.unlocks.push("first_chapter");
  await refresh();
  expect(screen.queryByRole("status")).toBeNull();
  await refresh("online");
  expect(screen.getByRole("status").textContent).toContain("Footloose");
});

it("keeps the first successful load quiet after an initial failure", async () => {
  request.mockRejectedValueOnce(new Error("Offline"));
  render(<AchievementNotifications />);
  await act(async () => {});
  expect(localStorage.getItem(key())).toBeNull();
  summary.unlocks = ["geezer"];
  await refresh("online");
  expect(localStorage.getItem(key())).toBe('["geezer"]');
  expect(screen.queryByRole("status")).toBeNull();
});

it("keeps duplicate protection when browser storage is unavailable", async () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("Blocked");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Blocked");
  });
  render(<AchievementNotifications />);
  await act(async () => {});
  summary.unlocks = ["geezer"];
  await refresh();
  expect(screen.getByRole("status").textContent).toContain("Locked in");
  dismiss("Locked in");
  await refresh();
  expect(screen.queryByRole("status")).toBeNull();
});

it("moves notices into native modal dialogs and back when closed", async () => {
  const view = render(
    <>
      <AchievementNotifications />
      <dialog aria-label="Round record" />
    </>,
  );
  const dialog = view.container.querySelector("dialog")!;
  await waitFor(() => expect(localStorage.getItem(key())).toBe("[]"));
  summary.unlocks = ["geezer"];
  await refresh();
  expect(screen.getByRole("status").parentElement).toBe(document.body);
  await act(async () => {
    dialog.open = true;
  });
  expect(screen.getByRole("status").parentElement).toBe(dialog);
  await act(async () => {
    dialog.open = false;
  });
  expect(screen.getByRole("status").parentElement).toBe(document.body);
  dismiss("Locked in");
  expect(screen.queryByRole("status")).toBeNull();
});

it("handles Strict Mode without announcing historical unlocks", async () => {
  summary.unlocks = ["geezer"];
  render(
    <StrictMode>
      <AchievementNotifications />
    </StrictMode>,
  );
  await waitFor(() => expect(localStorage.getItem(key())).toBe('["geezer"]'));
  expect(screen.queryByRole("status")).toBeNull();
  summary.unlocks.push("first_chapter");
  await refresh();
  expect(screen.getAllByText("Achievement Unlocked!")).toHaveLength(1);
});

it("clears visible and pending notices and listeners on sign-out", async () => {
  const view = await seed();
  summary.unlocks = ["first_chapter", "first_victory", "a_leg_up", "geezer"];
  await refresh();
  expect(screen.getByRole("status").textContent).toContain("+1 more");
  auth.user = null;
  view.rerender(<AchievementNotifications />);
  expect(screen.queryByRole("status")).toBeNull();
  const calls = request.mock.calls.length;
  await refresh();
  expect(request).toHaveBeenCalledTimes(calls);
});

it("does not fetch or show account achievements for guests", () => {
  auth.user = null;
  render(<AchievementNotifications />);
  expect(request).not.toHaveBeenCalled();
  expect(screen.queryByRole("status")).toBeNull();
});
