export type AccountUser = {
  id: string;
  name: string;
  profile_icon?: string;
  email?: string;
  email_verified?: boolean;
};
export type ProfileUpdate = { profile_icon?: string; email?: string };
export type AccountSession = {
  user: AccountUser | null;
  csrf_token: string;
  message?: string;
};
export function createAccountClient(
  base = "/api/account",
  fetcher: typeof fetch = fetch,
) {
  const send = async (
    path: string,
    options: RequestInit = {},
  ): Promise<AccountSession> => {
    const response = await fetcher(base.replace(/\/$/, "") + path, {
      credentials: "include",
      cache: "no-store",
      ...options,
      headers: { Accept: "application/json", ...options.headers },
    });
    const data = await response.json().catch(() => null);
    if (!response.ok)
      throw new Error(
        typeof data?.error === "string"
          ? data.error
          : "Unable to connect to your account. Please try again.",
      );
    if (
      !data ||
      typeof data.csrf_token !== "string" ||
      (data.user !== null &&
        (!data.user ||
          typeof data.user.id !== "string" ||
          typeof data.user.name !== "string"))
    ) {
      throw new Error("The account service returned an unexpected response.");
    }
    return data;
  };
  return {
    session: (signal?: AbortSignal) => send("/session", { signal }),
    login: (username: string, password: string, csrf: string) =>
      send("/login", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify({ username, password }),
      }),
    logout: (csrf: string) =>
      send("/logout", { method: "POST", headers: { "X-CSRF-Token": csrf } }),
    deleteAccount: (password: string, csrf: string) =>
      send("/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify({ password }),
      }),
    updateProfile: (data: ProfileUpdate, csrf: string) =>
      send("/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify(data),
      }),
  };
}
