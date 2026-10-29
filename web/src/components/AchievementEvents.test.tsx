import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { AchievementEvents } from "./AchievementEvents";
import { ACHIEVEMENT_EVENT, MUSIC_OFF_EVENT } from "../lib/achievementEvents";
const auth = vi.hoisted(() => ({ user: { id: "1" } as { id: string } | null }));
const request = vi.hoisted(() => vi.fn());
vi.mock("../context/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("../lib/api", () => ({ request }));
beforeEach(() => {
  auth.user = { id: "1" };
  request.mockReset().mockResolvedValue({ unlocks: ["geezer"] });
});

it("saves a music-off secret for the signed-in account and refreshes the dashboard", async () => {
  const refreshed = vi.fn();
  window.addEventListener(ACHIEVEMENT_EVENT, refreshed);
  const view = render(<AchievementEvents />);
  expect(request).not.toHaveBeenCalled();
  await act(async () => window.dispatchEvent(new Event(MUSIC_OFF_EVENT)));
  expect(request).toHaveBeenCalledWith("/achievements", {
    id: "geezer",
    userId: "1",
  });
  expect(refreshed).toHaveBeenCalledOnce();
  expect(localStorage.getItem("handandfoot.music-achievement.v1:1")).toBeNull();
  view.unmount();
  window.removeEventListener(ACHIEVEMENT_EVENT, refreshed);
});

it("retries an offline unlock for its original account after focus", async () => {
  request.mockRejectedValueOnce(new Error("Offline"));
  render(<AchievementEvents />);
  await act(async () => window.dispatchEvent(new Event(MUSIC_OFF_EVENT)));
  expect(localStorage.getItem("handandfoot.music-achievement.v1:1")).toBe(
    "true",
  );
  await act(async () => window.dispatchEvent(new Event("focus")));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  expect(localStorage.getItem("handandfoot.music-achievement.v1:1")).toBeNull();
});

it("ignores guest music changes and never syncs another account's pending unlock", async () => {
  localStorage.setItem("handandfoot.music-achievement.v1:1", "true");
  auth.user = null;
  const view = render(<AchievementEvents />);
  await act(async () => window.dispatchEvent(new Event(MUSIC_OFF_EVENT)));
  auth.user = { id: "2" };
  view.rerender(<AchievementEvents />);
  expect(request).not.toHaveBeenCalled();
  await act(async () => window.dispatchEvent(new Event(MUSIC_OFF_EVENT)));
  expect(request).toHaveBeenCalledExactlyOnceWith("/achievements", {
    id: "geezer",
    userId: "2",
  });
  expect(localStorage.getItem("handandfoot.music-achievement.v1:1")).toBe(
    "true",
  );
});
