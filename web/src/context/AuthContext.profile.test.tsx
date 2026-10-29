import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./AuthContext";

function Probe() {
  const { user, updateProfile } = useAuth();
  return (
    <>
      <span>{user?.profile_icon}</span>
      <button
        onClick={() =>
          void updateProfile({ profile_icon: "turtle" }).catch(() => {})
        }
      >
        Change icon
      </button>
    </>
  );
}
it("saves profiles with a fresh account CSRF token and updates the shared identity", async () => {
  let icon = "cat",
    serial = 0;
  const fetcher = vi.fn(async (url: string, options: RequestInit) => {
    if (url.endsWith("/session")) serial++;
    if (url.endsWith("/profile")) {
      expect((options.headers as Record<string, string>)["X-CSRF-Token"]).toBe(
        `token-${serial}`,
      );
      expect(JSON.parse(options.body as string)).toEqual({
        profile_icon: "turtle",
      });
      icon = "turtle";
    }
    return new Response(
      JSON.stringify({
        user: { id: "1", name: "Player", profile_icon: icon },
        csrf_token: `token-${serial}`,
        message: "Profile saved.",
      }),
    );
  });
  vi.stubGlobal("fetch", fetcher);
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await screen.findByText("cat");
  fireEvent.click(screen.getByRole("button", { name: "Change icon" }));
  await screen.findByText("turtle");
  expect(serial).toBe(2);
  expect(
    fetcher.mock.calls.every(
      ([, options]) => options.credentials === "include",
    ),
  ).toBe(true);
});
it("does not save into a different account after the shared cookie changes", async () => {
  let uid = "1";
  const fetcher = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          user: { id: uid, name: "Player", profile_icon: "cat" },
          csrf_token: "csrf",
        }),
      ),
  );
  vi.stubGlobal("fetch", fetcher);
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await screen.findByText("cat");
  uid = "2";
  fireEvent.click(screen.getByRole("button", { name: "Change icon" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(
    fetcher.mock.calls.every(([url]: unknown[]) =>
      String(url).endsWith("/session"),
    ),
  ).toBe(true);
});
