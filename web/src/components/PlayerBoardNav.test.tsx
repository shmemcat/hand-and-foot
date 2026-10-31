import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { PlayerBoardNav } from "./PlayerBoardNav";
import { ENDING_EXAMPLES, endingSnapshot } from "../lib/endingExamples";

it.each(["game-win", "game-partners"])(
  "shows a disconnected player’s badge and restores it on reconnect in %s",
  (id) => {
    const snapshot = endingSnapshot(
      ENDING_EXAMPLES.find((example) => example.id === id)!,
    );
    const player = snapshot.players[0];
    const props = {
      sides: snapshot.sides,
      players: snapshot.players.map((member) => ({
        ...member,
        bot: false,
        away: member.id === player.id,
      })),
      viewed: player.team,
      viewerId: player.id,
      activePlayerId: player.id,
      dealerId: snapshot.dealerId,
      onView: vi.fn(),
    };
    const rendered = render(<PlayerBoardNav {...props} />);
    const badge = rendered.container.querySelector(
      `[data-player-id="${player.id}"]`,
    )!;
    expect(badge.getAttribute("data-away")).toBe("true");
    expect(badge.querySelector(".fa-solid.fa-link-broken")).toBeTruthy();
    expect(screen.getByRole("button", { name: /disconnected/ })).toBeTruthy();
    expect(
      badge.getAttribute("aria-current") ??
        badge.closest("button")?.getAttribute("aria-current"),
    ).toBe("step");
    rendered.rerender(
      <PlayerBoardNav
        {...props}
        players={props.players.map((member) => ({ ...member, away: false }))}
      />,
    );
    expect(badge.getAttribute("data-away")).toBe("false");
    expect(badge.querySelector(".fa-link-broken")).toBeNull();
    expect(screen.queryByRole("button", { name: /disconnected/ })).toBeNull();
  },
);
