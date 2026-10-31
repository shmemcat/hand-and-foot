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
it("keeps standard cards despite an older style preference and defaults to keeping Follow turn checked", () => {
  localStorage.setItem(
    "handandfoot.preferences.v1",
    JSON.stringify({ cardStyle: "indexed" }),
  );
  render(<Setup />);
  expect(
    screen.getByRole("img", { name: "9 of clubs" }).className,
  ).not.toContain("indexed-card");
  expect(screen.getByRole("heading", { name: "Turn Indicator" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Follow Turn" })).toBeTruthy();
  expect(screen.getAllByRole("radio")).toHaveLength(2);
  expect(
    screen.getByRole<HTMLInputElement>("radio", {
      name: /^Keep Follow turn checked/,
    }).checked,
  ).toBe(true);
  for (const name of ["Card Style", "Appearance", "Sound & Music"]) {
    expect(screen.queryByRole("heading", { name })).toBeNull();
  }
  expect(
    screen.queryByText("Options save automatically in this browser."),
  ).toBeNull();
});
it("saves either Follow turn behavior across visits without changing the sound settings", () => {
  const view = render(<Setup />);
  fireEvent.click(
    screen.getByRole("radio", { name: /^Uncheck Follow turn when browsing/ }),
  );
  view.unmount();
  const remounted = render(<Setup />);
  expect(
    screen.getByRole<HTMLInputElement>("radio", {
      name: /^Uncheck Follow turn when browsing/,
    }).checked,
  ).toBe(true);
  expect(
    screen.getByRole<HTMLInputElement>("checkbox", {
      name: "Play a sound when it’s my turn",
    }).checked,
  ).toBe(true);
  fireEvent.click(
    screen.getByRole("radio", { name: /^Keep Follow turn checked/ }),
  );
  remounted.unmount();
  render(<Setup />);
  expect(
    screen.getByRole<HTMLInputElement>("radio", {
      name: /^Keep Follow turn checked/,
    }).checked,
  ).toBe(true);
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
