# Hand & Foot v1

A playable local first version of the fourth Cards game: React/TypeScript/Vite on port **3004**, with its own authoritative Python/Flask/Socket.IO service on **5104**. Family rules take precedence over the original Bicycle-based investigation.

## Run locally

Prerequisites: Node.js 22.12+, [uv](https://docs.astral.sh/uv/), and the Cards, Hearts, Euchre, and Golf sibling checkouts with their dependencies installed, as for Golf's shared development runner.

```powershell
npm install
uv sync --directory api
npm run dev
```

Open **http://localhost:3004/**. The runner starts the shared local Cards account service, gateway, and separate game services/frontends. Stop it with Ctrl+C. It refuses occupied ports rather than stopping another preview. Development account and game data persist under `cards/.local/split-dev/`; existing Cards users and service credentials are retained. Local mail stays in the file inbox at **http://localhost:3000/__dev/mail/**.

Use `localhost` consistently for all local sites: host cookies cannot cross between `localhost` and `127.0.0.1`. Browser page requests to Hand & Foot's numeric loopback URL redirect to `localhost` automatically. Local development accounts are separate from production accounts on cards.shmem.dev.

`npm run dev:game` runs just this game's API and frontend. For shared login in that mode, supply the account settings below and point `ACCOUNT_PROXY_TARGET` to the already-running local account service. Without account configuration, guest play remains available. Its original standalone game database remains at `api/.local/handandfoot.sqlite`.

The private development review page at **http://127.0.0.1:3004/preview** provides playable fixtures for full individual boards with eight, nine, or ten open piles plus eight completed books, interactive scoring, an eight-player dense table with a long hand, the catch-up draw, and individual tables with 20-, 32-, and 45-card hands that cannot yet meet their opening. These fixture endpoints are enabled by the development runner only and excluded from the production frontend.

Open piles use tighter spacing from eight piles onward, while smaller groups keep their original spacing.

The six-card reminder preview shows a spacious three-pile board. Its six-card pile turns the bottom card sideways; narrow pile columns use a slight tilt. The seventh card must be played from your hand, never picked up from the discard.

The local **http://localhost:3004/preview/opening** rehearsal lets you review the opening before the first draw. Play the full sequence (it waits for your pile choice), step through or replay eight individual beats, audition existing sound cues, and adjust speed, effects, music, reduced motion, table size, dealer, and individual beat durations. It uses fixed sample cards without creating a room. Timing preferences and refinement notes are saved in the current browser. The route is available only in development.

## Included

- Individual play for 2–6 seats and two-person partnerships for 4, 6, or 8. Practice and private online rooms support the same sizes. The host can swap occupied seats to arrange partners, then fill open seats with bots. Partners alternate around the fixed roster.
- One more deck than the number of seated players, two Jokers per deck, and distinct IDs for every physical card. Leaving and bot takeover preserve the roster and deck count.
- Two 11-card piles, with just the top and bottom of each visible before choosing a hand. Feet and other hands remain private.
- Atomic multi-pile openings, single-top-card discard pickup, matching piles, clean/dirty books, natural straight flushes and extensions, red-three choices, both foot-entry paths, and a required final discard.
- Shared partner piles in creator lanes, active teammate below the other, browsing and Follow turn on every screen size, persistent private hand dock, keyboard/touch selection, and draft recovery after rejected moves.
- Target-score matches (10,000 by default; optional 15,000/20,000), cumulative-score opening thresholds, and the extra catch-up draw.
- Interactive shared scoring: choose piles to cover hand/foot debt, watch the debt and bonus counts change, inspect used cards, and confirm before totals commit. Either partner may settle the shared score. Bots settle only sides with no present human. An automatic cover option protects the least expensive combination of book bonuses where possible.
- Private per-viewer snapshots; CSRF and origin checks; serialized mutations; persistent action receipts; stale-turn rejection; socket updates with polling recovery; SQLite persistence by default, with PostgreSQL configuration support.
- Two-minute online disconnect hold followed by bot takeover; returning in the same browser reclaims the seat. Explicit leaving transfers the seat to a bot. Practice pauses while the human is absent.
- Saved results that survive rematches, round histories, readiness between rounds and rematches, and shared wins for equal highest scores.
- Public Leaderboard with Against Bots and Multiplayer categories, Monthly and All-Time top-ten account winners, and current shared profile icons. Completed server-owned matches count once per winning account, including both teammates on a shared win. Guests, departed seats, deleted accounts, and missing profiles are excluded. Monthly standings use UTC calendar months; old preview results without a recorded game type are excluded rather than assigned a category.
- Shared Cards sign-in/logout and profile icons, account-owned rooms recoverable across browsers, and account-owned match history. Only waiting guest lobbies transfer on sign-in; already-started guest games/results stay guest-owned. The game validates the shared opaque cookie server-side and never receives passwords or account signing secrets. Account changes clear the old view; revoked credentials cannot keep reading a private hand.
- Private, authenticated account-deletion cleanup with persistent tombstones, idempotent replies, removal of account links/names, and bot takeover for active seats. Cards waits for Hand & Foot's acknowledgement before completing deletion when its peer is configured.
- Selected O2 petal/antique-gold light/dark palettes, Bitter/Figtree fonts served locally, native Single Leaves backs, readable standard faces/Jokers, and seven-track jazz rotation with the shared Cards playback lock.

## Family rules

See [docs/family-rules.md](docs/family-rules.md) for the confirmed preset and scoring interpretation. The original [implementation plan](docs/implementation-plan.md) and [design investigation](docs/design-investigation.json) are retained as historical references; their four-round and seven-discard assumptions are superseded.

## Checks

```powershell
npm run build
npm run test:web
npm run test:accounts
npm test
uv run --directory api python -m handandfoot_server.simulate --players 8 --mode partnership --seed 7
uv run --directory api python -m handandfoot_server.simulate --players 6 --mode individual --seed 3
```

`npm run format` formats the frontend and local runner. Tests store their disposable files under this checkout’s ignored `.local/` directories.

`test:accounts` starts disposable copies of all five services and their browser proxies in a new `cards/.local/split-handandfoot-accounts-*` directory. It checks real registration/verification, shared login and profile identity across all sites, server-enforced player names, cross-browser room recovery, sister-site logout, and coordinated deletion. It sends no email and stops its services afterward.

## Optional local containers

```powershell
docker compose up --build
```

This serves the production frontend at **http://127.0.0.1:3004/hand-and-foot/** with a single-worker API and a persistent local SQLite volume. Stop the development runner first so its ports are free. The container configuration is a local rehearsal, not a production activation.

## Service configuration

- `HANDANDFOOT_DATABASE_URL`: defaults to `api/.local/handandfoot.sqlite`; supports a `postgresql+psycopg2://…` URL for an independent database.
- `HANDANDFOOT_SECRET_KEY`: stable secret of at least 32 characters. Local development generates and retains one in `api/.local/session-secret` so sessions survive restarts.
- `HANDANDFOOT_SECURE_COOKIE=1`: required behind production HTTPS.
- `HANDANDFOOT_DEVELOPMENT_FIXTURES=1`: local review fixtures; leave unset outside development.
- `HANDANDFOOT_API_TARGET`: optional Vite proxy target; defaults to `http://127.0.0.1:5104`.
- `VITE_BASE_PATH`: defaults to `/` in development and `/hand-and-foot/` in builds.
- `CARDS_ACCOUNTS_URL`: private account-service HTTP(S) origin. The game uses only the existing v1 private account contract.
- `CARDS_SERVICE_ID=handandfoot-game` and `CARDS_SERVICE_TOKEN`: dedicated private account credential with `sessions.validate` and `profiles.read` scopes. Cards must register the matching principal in `CARDS_INTERNAL_CLIENTS`.
- `CARDS_GAME_ACCOUNT_TOKENS`: JSON object containing a distinct strong `handandfoot` callback credential. Cards must configure `CARDS_GAME_SERVICES.handandfoot` with this game's private origin and that matching callback token. Both credentials are required for account mode; neither belongs in frontend environment variables.
- `CARDS_PUBLIC_URL=https://cards.shmem.dev` in production, with `HANDANDFOOT_SECURE_COOKIE=1`. The account service continues owning its existing `__Host-cards_session` cookie; Hand & Foot retains an independent game/CSRF cookie.
- `ACCOUNT_PROXY_TARGET`: development browser account proxy, default `http://127.0.0.1:5100`. `VITE_ACCOUNT_API_URL` defaults to the same-origin `/api/account`; `VITE_CARDS_HOME_URL` selects the hub and central account-management/recovery links.

Health/readiness: `/health`, `/ready`. API prefix: `/api/hand-and-foot/`. Socket path: `/hand-and-foot/socket.io`; namespace: `/hand-and-foot`. One worker/replica is intentional; distributed room coordination is future work. Database tables are namespaced with schema version `v1`.

## Deferred collection/release work

Shared login and deletion are implemented locally. Production activation still requires deploying the updated Cards accounts service and Hand & Foot service/frontend, provisioning the dedicated private credentials/peer, and routing `/api/hand-and-foot/*` and `/hand-and-foot/socket.io` to this game's host. The existing Cards `/api/account/*` route remains the account owner. Public gateways must block every `/_internal/*` path. The standalone container rehearsal remains guest-only unless it is connected to that shared account gateway and private service configuration.

Achievements, game-specific account preferences, hub tiles, production database migrations, release automation, monitoring, backups, and production activation remain separate work. Opening and card-flight choreography are simplified; scoring includes count transitions, payment feedback, and reduced-motion support.

Music/font/artwork credits and license notices are in [web/public/ASSET-CREDITS.md](web/public/ASSET-CREDITS.md).
