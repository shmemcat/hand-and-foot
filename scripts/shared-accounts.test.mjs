import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, mkdtemp } from "node:fs/promises";
import { resolve } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import {
  startNativeStack,
  root,
  freePort,
} from "../../cards/scripts/split-stack.mjs";

test(
  "Hand & Foot shares verified login, identity, logout, room recovery and deletion with the collection",
  { timeout: 180000 },
  async () => {
    await mkdir(resolve(root, ".local"), { recursive: true });
    const directory = await mkdtemp(
      resolve(root, ".local/split-handandfoot-accounts-"),
    );
    const roles = ["hearts", "euchre", "golf", "handandfoot"];
    const webPorts = Object.fromEntries(
      await Promise.all(roles.map(async (role) => [role, await freePort()])),
    );
    let stack;
    const cookies = new Map();
    let csrf = "";
    async function call(base, path, data, headers = {}, expected = 200) {
      const response = await fetch(base + path, {
        method: data === undefined ? "GET" : "POST",
        headers: {
          Cookie: [...cookies]
            .map(([name, value]) => `${name}=${value}`)
            .join("; "),
          Origin: base.replace("127.0.0.1", "localhost"),
          "Content-Type": "application/json",
          ...headers,
        },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      });
      for (const cookie of response.headers.getSetCookie()) {
        const pair = cookie.split(";")[0],
          split = pair.indexOf("=");
        cookies.set(pair.slice(0, split), pair.slice(split + 1));
      }
      const result = await response.json();
      assert.equal(
        response.status,
        expected,
        path + ": " + (result.error || ""),
      );
      return result;
    }
    async function account(base, path, body, expected) {
      const state = await call(
        base,
        "/api/account/" + path,
        body,
        { "X-CSRF-Token": csrf },
        expected,
      );
      if (state.csrf_token) csrf = state.csrf_token;
      return state;
    }
    try {
      stack = await startNativeStack({
        directory,
        golf: true,
        handandfoot: true,
        web: true,
        webPorts,
      });
      const gateway = stack.base("gateway"),
        hand = stack.webBase("handandfoot");
      const username = "hf_" + randomBytes(5).toString("hex");
      const password = "isolated-handandfoot-password-123",
        email = username + "@example.test";
      await account(gateway, "session");
      await account(gateway, "register", { username, password, email }, 201);
      let mail;
      for (let n = 0; n < 40 && !mail; n++) {
        mail = (await stack.mail()).find((item) => item.to === email);
        if (!mail) await delay(50);
      }
      assert(mail, "Verification mail stays in the disposable local inbox");
      await account(gateway, "verify-email", {
        token: new URL(mail.url).searchParams.get("token"),
      });
      const login = await account(hand, "login", { username, password });
      await account(hand, "profile", { profile_icon: "cat" });
      for (const base of [
        gateway,
        ...roles.map((role) => stack.webBase(role)),
      ]) {
        const state = await account(base, "session");
        assert.equal(state.user.id, login.user.id);
        assert.equal(state.user.name, username);
        assert.equal(state.user.profile_icon, "cat");
      }
      const session = await call(hand, "/api/hand-and-foot/session");
      assert.equal(session.user.id, login.user.id);
      const gameHeaders = { "X-Handandfoot-CSRF": session.csrf };
      const room = await call(
        hand,
        "/api/hand-and-foot/rooms",
        {
          name: "Untrusted alias",
          scoringMode: "partnership",
          capacity: 8,
          playMode: "online",
        },
        gameHeaders,
      );
      assert.equal(room.decks, 9);
      assert.equal(room.players[0].name, username);
      const originalGameCookie = cookies.get("handandfoot_session");
      cookies.delete("handandfoot_session");
      assert.equal(
        (await call(hand, `/api/hand-and-foot/rooms/${room.code}`)).viewerId,
        room.viewerId,
      );
      cookies.set("handandfoot_session", originalGameCookie);
      await account(stack.webBase("euchre"), "logout", {});
      for (const base of [gateway, ...roles.map((role) => stack.webBase(role))])
        assert.equal((await account(base, "session")).user, null);
      await call(
        hand,
        `/api/hand-and-foot/rooms/${room.code}`,
        undefined,
        {},
        403,
      );
      await account(hand, "session");
      await account(hand, "login", { username, password });
      assert.equal(
        (await call(hand, `/api/hand-and-foot/rooms/${room.code}`)).viewerId,
        room.viewerId,
      );
      // The Hand & Foot callback participates in the real shared deletion job.
      await account(hand, "session");
      await account(hand, "delete", { password });
      await call(
        hand,
        `/api/hand-and-foot/rooms/${room.code}`,
        undefined,
        {},
        403,
      );
      for (const path of [
        "/api/account/_internal/accounts/v1/session",
        "/api/account/%255finternal/accounts/v1/session",
      ]) {
        assert.equal(
          (await fetch(hand + path, { method: "POST" })).status,
          404,
        );
      }
    } finally {
      await stack?.close();
    }
  },
);
