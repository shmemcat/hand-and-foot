import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./AuthContext";

function Probe() {
  const { user, deleteAccount } = useAuth();
  return (
    <>
      <span>{user?.id ?? "guest"}</span>
      <button
        onClick={() =>
          void deleteAccount("password")
            .then((message) => {
              document.title = message;
            })
            .catch((error) => {
              document.title = error.message;
            })
        }
      >
        Delete
      </button>
    </>
  );
}

it("deletes with fresh CSRF, clears identity, and preserves a pending cleanup message", async () => {
  let serial = 0;
  const fetcher = vi.fn(async (url: string, options: RequestInit) => {
    if (url.endsWith("/session")) serial++;
    const deletion = url.endsWith("/delete");
    if (deletion) {
      expect(options.credentials).toBe("include");
      expect((options.headers as Record<string, string>)["X-CSRF-Token"]).toBe(
        "csrf-2",
      );
      expect(JSON.parse(options.body as string)).toEqual({
        password: "password",
      });
    }
    return new Response(
      JSON.stringify({
        user: deletion ? null : { id: "1", name: "Player" },
        csrf_token: `csrf-${serial}`,
        ...(deletion ? { message: "Account deletion is processing." } : {}),
      }),
      { status: deletion ? 202 : 200 },
    );
  });
  vi.stubGlobal("fetch", fetcher);
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await screen.findByText("1");
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  await screen.findByText("guest");
  expect(document.title).toBe("Account deletion is processing.");
});

it("refuses to delete a different account after another app changes the cookie", async () => {
  let id = "1";
  const fetcher = vi.fn(
    async () =>
      new Response(
        JSON.stringify({ user: { id, name: "Player" }, csrf_token: "csrf" }),
      ),
  );
  vi.stubGlobal("fetch", fetcher);
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await screen.findByText("1");
  id = "2";
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  await screen.findByText("2");
  await waitFor(() => expect(document.title).toContain("Your account changed"));
  expect(
    fetcher.mock.calls.every(([url]: unknown[]) =>
      String(url).endsWith("/session"),
    ),
  ).toBe(true);
});
