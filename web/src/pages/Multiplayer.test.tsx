import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { Room } from "./Room";
import { GameApiError, getRoom, request } from "../lib/api";
import { ENDING_EXAMPLES, endingSnapshot } from "../lib/endingExamples";

const socket = vi.hoisted(() => ({
  on: vi.fn(),
  emit: vi.fn(),
  disconnect: vi.fn(),
}));
vi.mock("socket.io-client", () => ({ io: () => socket }));
vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: null, loading: false }),
}));
vi.mock("../context/SoundContext", () => ({
  useSound: () => ({ play: vi.fn() }),
}));
vi.mock("../lib/api", async (original) => ({
  ...(await original<typeof import("../lib/api")>()),
  getRoom: vi.fn(),
  request: vi.fn(),
  socketCredentials: vi.fn().mockResolvedValue({ csrf: "test" }),
}));

it("subscribes after joining through an invite even when the socket connected before seating", async () => {
  const lobby = {
    ...endingSnapshot(ENDING_EXAMPLES[1]),
    code: "INVITE",
    phase: "lobby" as const,
    status: "lobby" as const,
    playMode: "online" as const,
  };
  vi.mocked(getRoom).mockRejectedValue(
    new GameApiError("Join this table before viewing it.", 403),
  );
  vi.mocked(request).mockResolvedValue(lobby);
  render(
    <MemoryRouter initialEntries={["/room/INVITE"]}>
      <Routes>
        <Route path="/room/:code" element={<Room />} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByRole("button", { name: "Join Game" });
  const connected = socket.on.mock.calls.find(
    ([event]) => event === "connect",
  )?.[1];
  connected?.();
  const before = socket.emit.mock.calls.length;
  fireEvent.change(screen.getByRole("textbox", { name: "Your name" }), {
    target: { value: "Friend" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Join Game" }));
  await screen.findByLabelText("Copy URL");
  await waitFor(() =>
    expect(socket.emit.mock.calls.length).toBeGreaterThan(before),
  );
  expect(socket.emit).toHaveBeenLastCalledWith("handandfoot:subscribe", {
    code: "INVITE",
  });
  expect(request).toHaveBeenCalledWith("/rooms/INVITE/join", {
    name: "Friend",
    seat: null,
  });
});

it("shows the authoritative nine-minute inactivity warning", async () => {
  const state = {
    ...endingSnapshot(ENDING_EXAMPLES[1]),
    code: "INVITE",
    playMode: "online" as const,
    idleWarning: true,
  };
  vi.mocked(getRoom).mockResolvedValue(state);
  render(
    <MemoryRouter initialEntries={["/room/INVITE"]}>
      <Routes>
        <Route path="/room/:code" element={<Room />} />
      </Routes>
    </MemoryRouter>,
  );
  expect((await screen.findByRole("alert")).textContent).toContain(
    "inactive for 9 minutes",
  );
});

it("explains a timed-out seat and returns to Play without offering to join the running game", async () => {
  vi.mocked(getRoom).mockRejectedValue(
    new GameApiError(
      "You were inactive for 10 minutes. A bot has taken over your seat.",
      403,
      "SEAT_REMOVED",
    ),
  );
  render(
    <MemoryRouter initialEntries={["/room/INVITE"]}>
      <Routes>
        <Route path="/room/:code" element={<Room />} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByRole("heading", { name: "TABLE LEFT" });
  expect(
    screen.getByRole("link", { name: "Back to Play" }).getAttribute("href"),
  ).toBe("/play");
  expect(screen.queryByRole("button", { name: "Join Game" })).toBeNull();
});
