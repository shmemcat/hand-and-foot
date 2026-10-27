import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext";
import { User } from "../pages/User";

function setup() {
  let user: { id: string; name: string } | null = null;
  let serial = 0;
  let rejected = false;
  const fetcher = vi.fn(async (url: string, options: RequestInit) => {
    const path = url.replace("/api/account", "");
    if (path === "/session") serial++;
    if (path !== "/session") {
      expect((options.headers as Record<string, string>)["X-CSRF-Token"]).toBe(
        `csrf-${serial}`,
      );
      if (path === "/login") {
        if (rejected)
          return new Response(
            JSON.stringify({ error: "Check your username and password." }),
            { status: 401 },
          );
        user = { id: "42", name: "Emily" };
      } else if (path === "/logout") user = null;
    }
    return new Response(JSON.stringify({ user, csrf_token: `csrf-${serial}` }));
  });
  vi.stubGlobal("fetch", fetcher);
  function Identity() {
    const auth = useAuth();
    return <span data-testid="identity">{auth.user?.id || "guest"}</span>;
  }
  render(
    <MemoryRouter>
      <AuthProvider>
        <User />
        <Identity />
      </AuthProvider>
    </MemoryRouter>,
  );
  return {
    fetcher,
    reject: () => {
      rejected = true;
    },
    change: () => {
      user = { id: "99", name: "Other" };
    },
  };
}

describe("shared Cards account", () => {
  it("signs in and out with fresh CSRF cookies and keeps credentials out of storage", async () => {
    const { fetcher } = setup();
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Sign In" })
          .hasAttribute("disabled"),
      ).toBe(false),
    );
    fireEvent.change(screen.getByLabelText("Username or Email"), {
      target: { value: "Emily" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "private-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
    await screen.findByRole("button", { name: "Sign Out" });
    expect(screen.getByTestId("identity").textContent).toBe("42");
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(
      fetcher.mock.calls.every(
        ([, options]) => options.credentials === "include",
      ),
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Sign Out" }));
    await screen.findByRole("button", { name: "Sign In" });
    expect(screen.getByTestId("identity").textContent).toBe("guest");
  });
  it("retains rejected fields for retry and provides central account recovery links", async () => {
    const state = setup();
    state.reject();
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Sign In" })
          .hasAttribute("disabled"),
      ).toBe(false),
    );
    fireEvent.change(screen.getByLabelText("Username or Email"), {
      target: { value: "Emily" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "retry-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Check your username",
    );
    expect((screen.getByLabelText("Password") as HTMLInputElement).value).toBe(
      "retry-password",
    );
    expect(
      screen
        .getByRole("link", { name: "Forgot Password?" })
        .getAttribute("href"),
    ).toContain("cards.shmem.dev/user/?view=recover");
  });
  it("refreshes identity when another sister site changes the cookie", async () => {
    const state = setup();
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Sign In" })
          .hasAttribute("disabled"),
      ).toBe(false),
    );
    state.change();
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(screen.getByTestId("identity").textContent).toBe("99");
    await screen.findByText("Other");
  });
});
