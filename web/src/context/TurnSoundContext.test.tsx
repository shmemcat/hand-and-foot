import { render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { PreferencesProvider } from "./PreferencesContext";
import { TurnSoundProvider, useTurnIndicator } from "./TurnSoundContext";
const player = vi.hoisted(() => ({
  play: vi.fn(),
  stop: vi.fn(),
  setVolume: vi.fn(),
}));
vi.mock("../lib/turnSound", async (original) => ({
  ...(await original<typeof import("../lib/turnSound")>()),
  createTurnSoundPlayer: () => player,
}));
function Indicator({ ready, decision }: { ready: boolean; decision: string }) {
  useTurnIndicator(ready, decision);
  return null;
}
const view = (ready: boolean, decision: string) => (
  <PreferencesProvider>
    <TurnSoundProvider>
      <Indicator ready={ready} decision={decision} />
    </TurnSoundProvider>
  </PreferencesProvider>
);
it("announces each new actionable decision once with its own sound and level, even with effects muted", () => {
  player.play.mockClear();
  localStorage.setItem("handandfoot.muted.v1", "true");
  localStorage.setItem(
    "handandfoot.preferences.v1",
    JSON.stringify({
      turnSound: true,
      turnSoundOptions: { sound: "ding", volume: 0.65 },
    }),
  );
  const page = render(view(false, "turn-1"));
  expect(player.play).not.toHaveBeenCalled();
  page.rerender(view(true, "turn-1"));
  expect(player.play).toHaveBeenCalledExactlyOnceWith("ding", 0.65);
  page.rerender(view(false, "turn-1"));
  page.rerender(view(true, "turn-1"));
  expect(player.play).toHaveBeenCalledTimes(1);
  page.rerender(view(true, "turn-2"));
  expect(player.play).toHaveBeenCalledTimes(2);
  page.unmount();
  expect(player.stop).toHaveBeenCalled();
});
it.each([
  { turnSound: false },
  { turnSound: true, turnSoundOptions: { sound: "pop", volume: 0 } },
])("keeps disabled and zero-volume turn indicators silent", (options) => {
  player.play.mockClear();
  localStorage.setItem("handandfoot.preferences.v1", JSON.stringify(options));
  render(view(true, "turn-1"));
  expect(player.play).not.toHaveBeenCalled();
});
