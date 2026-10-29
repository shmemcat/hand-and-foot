import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { io } from "socket.io-client";
import { startContainerStack } from "../../cards/scripts/container-stack.mjs";
import { verifySplitStack } from "../../cards/scripts/verify-split-stack.mjs";

const [statusPath, ...recordPaths] = process.argv.slice(2);
if (!statusPath)
  throw new Error("Use status.json [published-component.json ...]");
const read = async (path) => JSON.parse(await readFile(resolve(path), "utf8"));
const images = { ...(await read(statusPath)).images };
const roles = {
  "cards-accounts": "accounts",
  "cards-gateway": "gateway",
  "handandfoot-game": "handandfoot",
  "handandfoot-web": "handandfoot-web",
};
for (const path of recordPaths) {
  const record = await read(path);
  assert(roles[record.component], "Unsupported rehearsal component");
  images[roles[record.component]] = record.image;
}
let stack;
try {
  stack = await startContainerStack({
    pins: Object.fromEntries(
      ["accounts", "hearts", "euchre", "gateway"].map((key) => [
        key,
        images[key],
      ]),
    ),
    golf: { game: images.golf, web: images["golf-web"] },
    handandfoot: { game: images.handandfoot, web: images["handandfoot-web"] },
    echo: true,
  });
  const base = stack.base("gateway");
  for (const route of [
    "/hand-and-foot/",
    "/hand-and-foot/user",
    "/hand-and-foot/profile",
    "/hand-and-foot/game/create",
  ]) {
    const response = await fetch(base + route);
    assert.equal(response.status, 200, route);
    assert((await response.text()).includes("/hand-and-foot/assets/"));
  }
  assert.equal(
    (await fetch(base + "/hand-and-foot/assets/missing.js")).status,
    404,
  );
  assert.equal(
    (await fetch(base + "/hand-and-foot", { redirect: "manual" })).status,
    308,
  );
  for (const path of [
    "/_internal/accounts/v1/session",
    "/api/account/_internal/accounts/v1/session",
    "/api/hand-and-foot/_internal/accounts/v1/session",
  ])
    assert.equal((await fetch(base + path, { method: "POST" })).status, 404);
  const health = Object.fromEntries(
    await Promise.all(
      ["accounts", "hearts", "euchre", "golf", "handandfoot"].map(
        async (role) => [role, await stack.health(role)],
      ),
    ),
  );
  await verifySplitStack(stack);
  const cookies = new Map();
  const cookieHeader = () =>
    [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  const origin = base.replace("127.0.0.1", "localhost");
  async function call(path, body, headers = {}, expected = 200) {
    const response = await fetch(base + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Cookie: cookieHeader(),
        Origin: origin,
        "Content-Type": "application/json",
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";")[0],
        split = pair.indexOf("=");
      cookies.set(pair.slice(0, split), pair.slice(split + 1));
    }
    const data = await response.json();
    assert.equal(response.status, expected, path + ": " + (data.error || ""));
    return data;
  }
  async function account(path, body, expected) {
    const fresh = await call("/api/account/session");
    return call(
      "/api/account/" + path,
      body,
      { "X-CSRF-Token": fresh.csrf_token },
      expected,
    );
  }
  const username = "hf_" + randomBytes(5).toString("hex"),
    email = username + "@example.test",
    password = "rehearsal-password-123";
  await account("register", { username, email, password }, 201);
  let mail;
  for (let n = 0; n < 40 && !mail; n++) {
    mail = (await stack.mail()).find((item) => item.to === email);
    if (!mail) await new Promise((done) => setTimeout(done, 100));
  }
  assert(mail, "Verification email must stay in the disposable inbox");
  await account("verify-email", {
    token: new URL(mail.url).searchParams.get("token"),
  });
  const signed = await account("login", { username: email, password });
  await account("profile", { profile_icon: "cat" });
  const session = await call("/api/hand-and-foot/session");
  assert.equal(session.user.id, signed.user.id);
  assert.equal((await call("/api/golf/session")).user.id, signed.user.id);
  const room = await call(
    "/api/hand-and-foot/rooms",
    {
      name: "untrusted",
      capacity: 2,
      scoringMode: "individual",
      playMode: "online",
    },
    { "X-Handandfoot-CSRF": session.csrf },
  );
  assert.equal(room.players[0].name, username);
  for (const transport of ["polling", "websocket"]) {
    const socket = io(base + "/hand-and-foot", {
      path: "/hand-and-foot/socket.io",
      transports: [transport],
      reconnection: false,
      timeout: 8000,
      extraHeaders: { Cookie: cookieHeader(), Origin: origin },
      auth: { csrf: session.csrf },
    });
    try {
      await once(socket, "connect", { signal: AbortSignal.timeout(10000) });
      assert.deepEqual(
        await socket
          .timeout(8000)
          .emitWithAck("handandfoot:subscribe", { code: room.code }),
        { ok: true },
      );
      const updated = once(socket, "handandfoot:updated", {
        signal: AbortSignal.timeout(10000),
      });
      const fresh = await call(`/api/hand-and-foot/rooms/${room.code}`);
      await call(
        `/api/hand-and-foot/rooms/${room.code}/commands`,
        {
          actionId: randomUUID(),
          revision: fresh.revision,
          token: fresh.token,
          type: transport === "polling" ? "unseat" : "seat",
          seat: 0,
        },
        { "X-Handandfoot-CSRF": session.csrf },
      );
      assert.equal((await updated)[0].code, room.code);
    } finally {
      socket.disconnect();
    }
  }
  await stack.restart("handandfoot");
  assert.equal(
    (await call(`/api/hand-and-foot/rooms/${room.code}`)).viewerId,
    room.viewerId,
  );
  await account("logout", {});
  await call(`/api/hand-and-foot/rooms/${room.code}`, undefined, {}, 403);
  await account("login", { username, password });
  assert.equal(
    (await call(`/api/hand-and-foot/rooms/${room.code}`)).viewerId,
    room.viewerId,
  );
  await account("delete", { password });
  await call(`/api/hand-and-foot/rooms/${room.code}`, undefined, {}, 403);
  await stack.command([
    "exec",
    "-T",
    "handandfoot",
    "python",
    "-c",
    "from handandfoot_server.wsgi import app; from handandfoot_server.models import db; from sqlalchemy import text; from sqlalchemy.exc import ProgrammingError\nwith app.app_context():\n try: db.session.execute(text('SELECT * FROM users LIMIT 0'))\n except ProgrammingError as error: assert error.orig.pgcode=='42501'\n else: raise AssertionError('Hand and Foot can read account tables')",
  ]);
  const report = {
    healthy: true,
    images,
    health,
    sharedAccounts: true,
    transports: ["polling", "websocket"],
    restartRecovery: true,
    deletion: true,
    privateDatabaseRole: true,
  };
  const reportPath = resolve(stack.directory, "handandfoot-report.json");
  await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ ...report, reportPath }));
} finally {
  await stack?.close();
}
