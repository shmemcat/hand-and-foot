import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { AuthProvider } from "../context/AuthContext";
import { CardBackProvider, useCardBack } from "../context/CardBackContext";
import { CardBackOption } from "./CardBackOption";
import { CardBackDisplayOption } from "./CardBackDisplayOption";
import { Card } from "./Card";
import { PublicHand } from "./PublicHand";
import { FootPreview } from "./FootPreview";
import { CARD_BACKS } from "../lib/cardBacks";
import type { AccountUser } from "../lib/account";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});

function setup(initial: AccountUser | null = { id: "42", name: "Emily" }) {
  const state = {
    user: initial,
    reject: false,
    pause: null as Promise<void> | null,
  };
  const requests: object[] = [];
  const fetcher = vi.fn(async (url: string, options?: RequestInit) => {
    if (url.endsWith("/profile")) {
      const body = JSON.parse(options!.body as string);
      requests.push(body);
      expect((options!.headers as Record<string, string>)["X-CSRF-Token"]).toBe(
        "fresh-token",
      );
      await state.pause;
      if (state.reject)
        return new Response(JSON.stringify({ error: "Please try again." }), {
          status: 503,
        });
      const { design, display } = body.card_back;
      state.user = {
        ...state.user!,
        card_backs: {
          handandfoot:
            design ?? state.user?.card_backs?.handandfoot ?? "single-leaves",
        },
        card_back_display: {
          handandfoot:
            display ?? state.user?.card_back_display?.handandfoot ?? "uniform",
        },
      };
    }
    return new Response(
      JSON.stringify({ user: state.user, csrf_token: "fresh-token" }),
    );
  });
  vi.stubGlobal("fetch", fetcher);
  function Settings() {
    const settings = useCardBack();
    return (
      <>
        <output data-testid="value">
          {settings.cardBack}/{settings.displayMode}
        </output>
        <CardBackOption />
        <CardBackDisplayOption />
        <div data-testid="deck">
          <Card small />
        </div>
        <div data-testid="owner">
          <PublicHand
            playerId="other"
            title="Other hand"
            count={2}
            mobile={false}
            ownerBack="ginkgo"
            foot={<FootPreview topCard={null} count={11} ownerBack="ginkgo" />}
          />
        </div>
        <div data-testid="fallback">
          <Card ownerBack="unknown" />
        </div>
      </>
    );
  }
  const tree = (
    <AuthProvider>
      <CardBackProvider>
        <Settings />
      </CardBackProvider>
    </AuthProvider>
  );
  return { state, requests, tree, view: render(tree) };
}
const backs = (testId: string) =>
  [
    ...screen
      .getByTestId(testId)
      .querySelectorAll<HTMLElement>("[data-card-back]"),
  ].map((el) => el.dataset.cardBack);

it("keeps the current design as default and offers the 34 approved additions", async () => {
  const { requests } = setup();
  await waitFor(() =>
    expect(
      (
        screen.getByRole("radio", {
          name: "One design everywhere",
        }) as HTMLInputElement
      ).matches(":disabled"),
    ).toBe(false),
  );
  expect(screen.getByTestId("value").textContent).toBe("single-leaves/uniform");
  expect(backs("deck")).toEqual(["single-leaves"]);
  screen.getByRole("button", { name: "Change design" }).focus();
  fireEvent.click(screen.getByRole("button", { name: "Change design" }));
  expect(
    screen.getByRole("dialog", { name: "Choose a Card Back" }),
  ).toBeTruthy();
  expect(screen.getAllByRole("radio")).toHaveLength(37);
  for (const back of CARD_BACKS)
    expect(screen.getByRole("radio", { name: back.name })).toBeTruthy();
  expect(screen.queryByRole("radio", { name: "Garden trellis" })).toBeNull();
  expect(screen.queryByRole("radio", { name: "Four leaf" })).toBeNull();
  expect(
    screen.queryByRole("radio", { name: "Literary butterfly" }),
  ).toBeNull();
  expect(screen.getByRole("radio", { name: "Butterfly" })).toBeTruthy();
  fireEvent.click(screen.getByRole("radio", { name: "Royal crest" }));
  await waitFor(() =>
    expect(requests).toEqual([
      { card_back: { game: "handandfoot", design: "trump-crest" } },
    ]),
  );
  await waitFor(() =>
    expect(
      (
        screen.getByRole("radio", { name: "Royal crest" }) as HTMLInputElement
      ).matches(":disabled"),
    ).toBe(false),
  );
  expect(backs("deck")).toEqual(["trump-crest"]);
  expect(backs("owner").every((back) => back === "trump-crest")).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Change design" }),
  );
});

it("saves display independently, uses each owner's back on hands and feet, and reloads the profile", async () => {
  const { requests, view, tree } = setup({
    id: "42",
    name: "Emily",
    card_backs: { handandfoot: "compass" },
  });
  await waitFor(() =>
    expect(screen.getByTestId("value").textContent).toBe("compass/uniform"),
  );
  fireEvent.click(screen.getByRole("radio", { name: "Each player’s design" }));
  await waitFor(() =>
    expect(requests).toEqual([
      { card_back: { game: "handandfoot", display: "players" } },
    ]),
  );
  await waitFor(() =>
    expect(
      (
        screen.getByRole("radio", {
          name: "Each player’s design",
        }) as HTMLInputElement
      ).matches(":disabled"),
    ).toBe(false),
  );
  expect(backs("deck")).toEqual(["compass"]);
  expect(backs("owner")).toEqual(Array(5).fill("ginkgo"));
  expect(backs("fallback")).toEqual(["single-leaves"]);
  view.unmount();
  render(tree);
  await waitFor(() =>
    expect(screen.getByTestId("value").textContent).toBe("compass/players"),
  );
});

it("holds the optimistic back while saving, rolls back a failure and allows retry", async () => {
  const { state } = setup();
  let finish!: () => void;
  state.pause = new Promise<void>((resolve) => {
    finish = resolve;
  });
  state.reject = true;
  fireEvent.click(screen.getByRole("button", { name: "Change design" }));
  await waitFor(() =>
    expect(
      (
        screen.getByRole("radio", { name: "Ginkgo" }) as HTMLInputElement
      ).matches(":disabled"),
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole("radio", { name: "Ginkgo" }));
  await waitFor(() =>
    expect(screen.getByTestId("value").textContent).toBe("ginkgo/uniform"),
  );
  expect(backs("deck")).toEqual(["ginkgo"]);
  await act(async () => finish());
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Please try again",
  );
  expect(backs("deck")).toEqual(["single-leaves"]);
  state.reject = false;
  fireEvent.click(screen.getByRole("radio", { name: "Ginkgo" }));
  await waitFor(() =>
    expect(
      (
        screen.getByRole("radio", { name: "Ginkgo" }) as HTMLInputElement
      ).matches(":disabled"),
    ).toBe(false),
  );
  expect(backs("deck")).toEqual(["ginkgo"]);
});

it("resets to another account's settings and clears the choice on sign out", async () => {
  const { state } = setup({
    id: "42",
    name: "Emily",
    card_backs: { handandfoot: "compass" },
    card_back_display: { handandfoot: "players" },
  });
  await waitFor(() =>
    expect(screen.getByTestId("value").textContent).toBe("compass/players"),
  );
  state.user = { id: "99", name: "Other" };
  fireEvent.focus(window);
  await waitFor(() =>
    expect(screen.getByTestId("value").textContent).toBe(
      "single-leaves/uniform",
    ),
  );
  state.user = null;
  fireEvent.focus(window);
  await screen.findByText("Sign in to save your card back.");
  expect(
    (
      screen.getByRole("radio", {
        name: "One design everywhere",
      }) as HTMLInputElement
    ).matches(":disabled"),
  ).toBe(true);
});
