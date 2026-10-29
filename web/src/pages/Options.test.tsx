import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { Options } from "./Options";
import { PreferencesProvider } from "../context/PreferencesContext";
import { TurnSoundProvider } from "../context/TurnSoundContext";
import { Card } from "../components/Card";
const player = vi.hoisted(() => ({
  play: vi.fn(),
  stop: vi.fn(),
  setVolume: vi.fn(),
}));
vi.mock("../lib/turnSound", async (original) => ({
  ...(await original<typeof import("../lib/turnSound")>()),
  createTurnSoundPlayer: () => player,
}));
function Setup() {
  return (
    <MemoryRouter>
      <PreferencesProvider>
        <TurnSoundProvider>
          <Options />
        </TurnSoundProvider>
        <Card
          card={{
            id: "live",
            rank: "9",
            suit: "clubs",
            value: 5,
            wild: false,
            redThree: false,
          }}
        />
      </PreferencesProvider>
    </MemoryRouter>
  );
}
it("keeps standard cards despite an older style preference and shows only the turn controls", () => {
  localStorage.setItem(
    "handandfoot.preferences.v1",
    JSON.stringify({ cardStyle: "indexed" }),
  );
  render(<Setup />);
  expect(
    screen.getByRole("img", { name: "9 of clubs" }).className,
  ).not.toContain("indexed-card");
  expect(screen.getByRole("heading", { name: "Turn Indicator" })).toBeTruthy();
  for (const name of ["Card Style", "Appearance", "Sound & Music"]) {
    expect(screen.queryByRole("heading", { name })).toBeNull();
  }
  expect(
    screen.queryByText("Options save automatically in this browser."),
  ).toBeNull();
});
it("persists the chosen cue, independent volume, and opt-out and previews the selected sound", () => {
  const view = render(<Setup />);
  fireEvent.change(screen.getByLabelText("Turn indicator sound"), {
    target: { value: "chime" },
  });
  fireEvent.change(screen.getByLabelText("Turn sound volume"), {
    target: { value: "40" },
  });
  fireEvent.pointerUp(screen.getByLabelText("Turn sound volume"));
  fireEvent.click(screen.getByRole("button", { name: "Preview sound" }));
  expect(player.play).toHaveBeenLastCalledWith(
    "chime",
    0.4,
    undefined,
    expect.any(Function),
  );
  view.unmount();
  const remounted = render(<Setup />);
  expect(
    (screen.getByLabelText("Turn indicator sound") as HTMLSelectElement).value,
  ).toBe("chime");
  expect(
    (screen.getByLabelText("Turn sound volume") as HTMLInputElement).value,
  ).toBe("40");
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Play a sound when it’s my turn" }),
  );
  expect(screen.queryByLabelText("Turn indicator sound")).toBeNull();
  remounted.unmount();
  render(<Setup />);
  expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(
    false,
  );
});
