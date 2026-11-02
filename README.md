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

On phones, the game keeps the shared main navigation above an independently scrolling board, with a private-hand drawer fixed to the bottom. Standard 5:7 cards use ten-card hand pages, three open piles per page, and four completed books per page. Swipe left/right in each card area or use its arrows; vertical gestures keep scrolling the board, and swipes do not select cards or change the viewed player accidentally. Player-board and page changes sweep in the navigation direction, and the drawer opens and closes over 180ms. Actual drawn cards glide and flip from the deck into the drawer before it reveals the new hand; reduced motion shows changes immediately. Follow turn sits under the round badge on mobile. Legal destinations occupy a reserved space beside the foot preview, and the selection controls keep a fixed height so selecting cards and browsing a short last page do not move the drawer. These controls use the same staging and server checks as desktop.

The hand footer follows the viewed board on desktop and mobile. Other players’ hands show face-down cards and their current count, with their name and HAND/FOOT state in the heading. Each chosen foot’s top card is public and appears in the bottom-right foot preview; remaining hand and foot cards stay private. Team boards include a player selector for inspecting either partner’s cards. Return to your own board to play your hand.

Accepted mobile melds fly from the private hand to their actual pile; destinations on other pages come into view in turn, including newly completed books. Discards travel to the header stack, and a final face-down discard flips before counting begins. The opening hand cascades into the drawer. Individual practice counting keeps its running total, reconciliation piles, and hand visible in the drawer while the relevant board piles come into view. Reduced motion, interruptions, and reconnects settle to the accepted game state without replaying old moves.

After the last hand card lands, a mobile foot pickup cascades every returned card from the Foot stack into the drawer, including the card on the next hand page. Controls and Follow turn wait until the cascade finishes. Playing into the foot lets the player keep playing; discarding into it waits for the next turn.

Mobile book completion keeps the pile open until its hand cards arrive, gathers every card into one stack, then moves it to its actual location in Completed books. Newly qualified red threes use the same transition. Multiple completions run in order across their pages, and foot pickup waits for the books to land.

Use `localhost` consistently for all local sites: host cookies cannot cross between `localhost` and `127.0.0.1`. Browser page requests to Hand & Foot's numeric loopback URL redirect to `localhost` automatically. Local development accounts are separate from production accounts on cards.shmem.dev.

`npm run dev:game` runs just this game's API and frontend. For shared login in that mode, supply the account settings below and point `ACCOUNT_PROXY_TARGET` to the already-running local account service. Without account configuration, guest play remains available. Its original standalone game database remains at `api/.local/handandfoot.sqlite`.

On desktop, completed books and open melds stay in two separate horizontal rows. Each row scrolls sideways with the mouse wheel, trackpad, or keyboard when it overflows; piles never wrap into extra rows. Card flights and pile rearrangements stay within their own visual bounds, so a large bot play cannot briefly add page scrollbars or expand the board. The pile area stays 420px tall.

A six-card pile turns the bottom card sideways as a reminder; narrow pile columns use a slight tilt. The seventh card must be played from your hand, never picked up from the discard.

Live games now use the same opening motion with their actual private piles. The first round starts with Arrive; later rounds start with Dealer and pass the badge from the previous dealer to the next seat. Choose waits for a real decision, and Ready up waits for actual players rather than a timer. Each human acknowledges the completed opening before the server allows the first draw or a bot turn. Rejoining a chosen hand resumes at waiting or Begin, and games already in play continue normally.

Browsing another player’s board preserves the opening’s progress and the selected board across beats. Private pile animations continue while out of view, and Choose waits for a decision without replaying its reveals when you return. The waiting message has animated dots. Begin plays one chime after the discard reveal; ordinary turn changes are silent. The board keeps its reserved height as gameplay begins.

## Included

Bots offer **Easy**, **Medium** (the default), and **Hard** in Create Game. Online hosts can also change the level in the waiting lobby; the choice applies to every bot, persists across rematches, and stays fixed during a match. Existing saved tables use Medium. Historical bot results without a recorded difficulty also count as Medium in personal statistics and the leaderboard, retaining their original completion dates. New completed results save their selected difficulty; online results remain in Multiplayer. Easy plays straightforward melds; Medium compares meld combinations, uses legal discard pickups, and extends natural runs. Hard considers more combinations, saves wilds for useful books, protects clean-book prospects, and weighs visible opponents and end-of-round debt. All levels see only the same private hand and public cards as a human.

For repeatable strategy comparisons, run `uv run --directory api python -m handandfoot_server.benchmark_bots --seeds 50 --start-seed 100`. This plays 150 six-player partnership rounds, rotating Easy, Medium, and Hard through every team on each seeded deal. Results report round wins, mean round scores, foot entries, pickups, and decision time; they are simulated round results, not human playtests or full-match win probabilities. For a complete match, use `uv run --directory api python -m handandfoot_server.simulate --difficulties easy medium hard easy medium hard`.

- Two to six individuals, or four or six players in teams of two, in both practice and private online rooms. The host chooses the table size, can swap occupied seats to arrange partners, then fill open seats with bots. Partners sit opposite one another around the roster (A/B/A/B or A/B/C/A/B/C).
- Choose **Create Game → Versus Bots** for single player, or **Online** to invite friends with the lobby code or copied link. **Join Game** accepts that code. Only one active table is allowed per account or guest browser. Play automatically returns online members to their saved lobby; direct create/join routes do the same. Practice games retain their Continue/Concede dialog. Signed-in players recover their table from another browser without remembering the code. Joining through an invite subscribes the new seat to live updates immediately.
- The Golf-style lobby includes separate copyable Code/URL fields, responsive profile cards, shared Start with X players/Fill with bots options, and Leave Lobby and Home buttons. Only the host changes start options; everyone can see the current selection. Starting without bots uses the seated count and that count plus one decks; teams must have both partners seated so existing partnerships are preserved. Pink Select Seat and Leave Seat buttons let each member choose their own position, including the first seat when open; hosting follows the person rather than a seat number. Unseated members stay in a waiting area immediately below the seats; the deal waits for everyone to select a seat. Leaving transfers hosting to a remaining member; a host cannot close everyone else's saved lobby.
- One more deck than the number of seated players, two Jokers per deck, and distinct IDs for every physical card. Disconnecting preserves the roster and deck count. A removed scoring side's private cards and melds are retired for that round; the next round uses the remaining player count.
- Two 11-card piles, with just the top and bottom of each visible before choosing a hand. Feet and other hands remain private.
- Red-three replacement puts the red face up on the discard pile and draws a private replacement without ending the turn. A normal final discard covers the red and ends the turn; red threes cannot be picked up.
- Atomic multi-pile openings, single-top-card discard pickup followed by one required deck card, matching piles, clean/dirty books, natural straight flushes and extensions, red-three choices, both foot-entry paths, and a required final discard. A pickup opening must meet the side's point minimum including the discard. After the pickup meld lands, the deck highlights for exactly one card without a +2 badge; both discard controls remain disabled with a draw-first tooltip until the draw is complete. This pending draw is authoritative and survives rejoining.
- Partners share one board of melds, books, and red threes. Paired names share a score, the rose outline marks the individual taking their turn, and the caret marks the viewed team board. Seats alternate teams (A/B/A/B or A/B/C/A/B/C). Browsing and Follow turn, the private hand dock, keyboard/touch selection, and draft recovery remain available.
- Matches play to 10,000 points, with cumulative-score opening thresholds. A player or team more than 5,000 points behind first place draws three cards instead of two from the deck; taking the top discard still requires only one follow-up deck card.
- Scoring stays on the playing board in individual and partnership games, against bots or online: gather the foot, automatically cover debt, reconcile physical cards, open broken books, then count surviving books and card values. Partners use the same animation with both teammates' hands, feet, and red threes. Partial cards wait above the reserved settlement footer. The completed count advances directly to the end-of-round results without a debt-review popup or confirmation controls; Skip animation opens results as soon as settlement is ready. Match totals roll up in their existing seats before the next deal or winner reveal.
- Individual and partnership scores settle automatically. Bots settle sides with no present human. Cover removes short-red penalties first and uses unfinished piles before comparing combined bonus losses across all books, flushes, and qualified reds. It preserves the most points while covering as much debt as legally possible, rather than always breaking dirty books before clean books.
- Private per-viewer snapshots; CSRF and origin checks; serialized mutations; persistent action receipts; stale-turn rejection; socket updates with polling recovery; SQLite persistence by default, with PostgreSQL configuration support.
- Online lobbies save automatically and have no inactivity or disconnect deadline. Closing a tab or leaving the page keeps membership, cards, and the current turn indefinitely, including across service restarts. Disconnected humans have dimmed badges with the Font Awesome broken-link icon and a dashed turn outline. Play continues to their turn and waits; disconnected clients do not hold up other players' turn animations. A player stays connected until their last subscribed tab disconnects. During a match the menu offers **Concede**; **Leave Lobby** is available before the deal and after a match. Conceding replaces a partner with a Hard bot only while a human teammate remains; otherwise that scoring side is removed. Individual concessions remove that player. When a departure leaves at most one human member, the lobby closes and frees the remaining member to start or join another lobby. If only one team remains with multiple humans, the match ends for review without counting an unfinished match as a completed result, and that group can play again. Practice pauses while the human is absent. Guest lobby members who sign in retain their member ID, chosen seat or waiting position, and host status without creating a second player. Old guest sockets reconnect under the signed-in identity.
- Saved results that survive rematches, round histories, readiness between rounds, host-started rematches, and shared wins for equal highest scores.
- Public Leaderboard with Easy, Medium, Hard, and Multiplayer win tabs, Monthly and All-Time top-ten account winners, and current shared profile icons. Completed server-owned matches count once per winning account, including both teammates on a shared win. Guests, departed seats, deleted accounts, and missing profiles are excluded. Monthly standings use UTC calendar months; old preview results without a recorded game type are excluded rather than assigned a category.
- Sign in with your shared Cards account **before starting** to record account wins. The shared Cards “Pssst” component appears in setup and lobbies and returns you to the same screen after sign-in. Final results link directly to the match's leaderboard category. Completed results keep their game type and survive retries, restarts, and rematches.
- Shared Cards sign-in/logout and profile icons, account-owned rooms recoverable across browsers, and account-owned match history. Only waiting guest lobbies transfer on sign-in; already-started guest games/results stay guest-owned. The game validates the shared opaque cookie server-side and never receives passwords or account signing secrets. Account changes clear the old view; revoked credentials cannot keep reading a private hand.
- Private, authenticated account-deletion cleanup with persistent tombstones, idempotent replies, removal of account links/names, and bot takeover for active seats. Cards waits for Hand & Foot's acknowledgement before completing deletion when its peer is configured.
- Selected O2 petal/antique-gold light/dark palettes, Bitter/Figtree fonts served locally, native Single Leaves backs, readable standard faces/Jokers, and seven-track jazz rotation with the shared Cards playback lock.

Desktop practice games use that same cascade for both live foot-entry paths, after the final meld or discard lands. The foot pile dissolves over 500ms. Cards stay locked until the cascade finishes; playing the last hand card keeps the turn, and discarding waits for the next turn. Follow turn waits for the foot to finish opening before switching boards. Rejoining, repeated snapshots, resizing, and reduced motion settle directly to the current game state. Mobile and online games retain their existing behavior.

Going out now checks the entire staged draft before enabling Play draft in the foot, including books completed by that draft and the required follow-up draw after a discard pickup. Without a clean and a dirty book, the tooltip explains that one card must remain after discarding; every going-out play must still reserve the final discard. With one card left and both book types, the button reads “Discard & go out” and retains the same width as Stage meld and Play draft. The final card turns face down, then rests on the pile for 1.2 seconds with the going-out message visible before score review opens. Scrolling, changing boards, and repeated updates preserve this pause; reduced motion shows the face-down pile immediately and keeps the same pause. The final card’s face stays hidden in every player’s snapshot.

Desktop draw and discard cues remain visible while browsing other boards. Private stock draws use card backs and fade at the divider below the piles; discards fade in from that divider. The viewer’s own draw/discard also uses the divider while browsing someone else’s board. A bounded public cue history handles batched updates without replaying old actions on rejoin, and never includes privately drawn card identities.

## Family rules

See [docs/family-rules.md](docs/family-rules.md) for the confirmed preset and scoring interpretation. The original [implementation plan](docs/implementation-plan.md) and [design investigation](docs/design-investigation.json) are retained as historical references; their four-round and seven-discard assumptions are superseded.

## Checks

```powershell
npm run build
npm run test:web
npm run test:accounts
npm test
uv run --directory api python -m handandfoot_server.simulate --players 6 --mode partnership --seed 7
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
- `HANDANDFOOT_API_TARGET`: optional Vite proxy target; defaults to `http://127.0.0.1:5104`.
- `VITE_BASE_PATH`: defaults to `/` in development and `/hand-and-foot/` in builds.
- `CARDS_ACCOUNTS_URL`: private account-service HTTP(S) origin. The game uses only the existing v1 private account contract.
- `CARDS_SERVICE_ID=handandfoot-game` and `CARDS_SERVICE_TOKEN`: dedicated private account credential with `sessions.validate` and `profiles.read` scopes. Cards must register the matching principal in `CARDS_INTERNAL_CLIENTS`.
- `CARDS_GAME_ACCOUNT_TOKENS`: JSON object containing a distinct strong `handandfoot` callback credential. Cards must configure `CARDS_GAME_SERVICES.handandfoot` with this game's private origin and that matching callback token. Both credentials are required for account mode; neither belongs in frontend environment variables.
- `CARDS_PUBLIC_URL=https://cards.shmem.dev` in production, with `HANDANDFOOT_SECURE_COOKIE=1`. The account service continues owning its existing `__Host-cards_session` cookie; Hand & Foot retains an independent game/CSRF cookie.
- `ACCOUNT_PROXY_TARGET`: development browser account proxy, default `http://127.0.0.1:5100`. `VITE_ACCOUNT_API_URL` defaults to the same-origin `/api/account`; `VITE_CARDS_HOME_URL` selects the hub and central account-management/recovery links.

Health/readiness: `/health`, `/ready`. API prefix: `/api/hand-and-foot/`. Socket path: `/hand-and-foot/socket.io`; namespace: `/hand-and-foot`. One worker/replica is intentional; distributed room coordination is future work. Database tables are namespaced with schema version `v1`.

## Production releases

The independent `game-vMAJOR.MINOR.PATCH` and `web-vMAJOR.MINOR.PATCH` workflows test and publish immutable images with source/version metadata and release records. Production uses the reviewed Infra Hand & Foot module and Cards release journal. The first activation requires approval of the infrastructure PR, its explicit database migration, and the separately encrypted account credentials. Publishing a tag does not activate production.

Production disables startup schema creation with `HANDANDFOOT_AUTO_CREATE_SCHEMA=0` and requires shared accounts with `HANDANDFOOT_REQUIRE_ACCOUNTS=1`. Run `python -m handandfoot_server.schema upgrade` only with the migration credential during the reviewed maintenance procedure. Runtime credentials cannot create tables or read account tables. `/ready` checks the adopted `handandfoot_001` schema and account configuration; `/health` reports the component, source revision, and version.

The gateway serves `/hand-and-foot/`, forwards `/api/hand-and-foot/*` and `/hand-and-foot/socket.io` to this game, and keeps `/api/account/*` owned by Cards. Public gateways block every `/_internal/*` path. `node scripts/rehearse-release.mjs status.json game-record.json web-record.json [cards-record.json ...]` verifies the exact published images against unchanged peers using disposable PostgreSQL data, including shared login/logout, both socket transports, restart recovery, deletion, deep links, and database isolation. The standalone container rehearsal remains guest-only unless connected to that shared gateway and private account configuration.

The user page follows the sister games with all-time and separate Easy/Medium/Hard/Multiplayer statistics and 42 achievements: sixteen visible goals (including bronze/silver/gold milestones) and twenty-six hidden discoveries. Sole Survivor is credited to the only side to reach a foot by round end; A Leg Up belongs only to the first player to reach their foot in the entire game. Caught Red-Handed is personal to a player with red threes left in hand or foot when the round ends. These three unlock during play or at round end, without waiting for match completion, and keep private card evidence out of public snapshots. It includes all fourteen secrets shared by Euchre, Golf, and Hearts: Photo Finish, Better with Friends, Hot Streak (five wins), Early Bird, Night Owl, Locked in, and eight holiday badges. The private `/api/hand-and-foot/achievements` endpoint derives progress from completed, server-owned account results across devices. Calendar badges use the server's game-start timestamp and each player's saved local UTC offset; older records with no start evidence do not guess dates. Turning enabled music off saves Locked in for the current account through a protected, idempotent POST to that endpoint; offline attempts retry for that account and account deletion removes the unlock.

Games Played counts only finished matches, including both wins and losses. Starting a game or finishing a round does not count; conceding excludes that player even if a replacement partner bot later finishes. Disconnecting does not exclude a player. Leaving between matches preserves previously finished results.

The navigation gear opens Options and Profile. Options uses the sister games’ Turn Indicator controls, with a sound picker, preview, and independent volume saved in this browser. Cards use the standard style; appearance, sound effects, and music use the existing toolbar controls. Profile offers the shared Cards icon library and email updates through `/api/account/profile`, including email verification and fresh account CSRF protection. Cross-device game preferences, hub tiles, production database migrations, release automation, monitoring, backups, and production activation remain separate work. Opening and card-flight choreography are simplified; scoring includes count transitions, payment feedback, and reduced-motion support.

Music/font/artwork credits and license notices are in [web/public/ASSET-CREDITS.md](web/public/ASSET-CREDITS.md).

## Storage retention

The existing game worker checks at startup and hourly, compacting finished and
closed rooms after 24 hours in batches of 200. It discards cards, decks, meld
details, animation state, and command receipts. Final scores, round scoring
history, statistics, leaderboard results, achievement evidence, and unlocks
remain in their durable result records. Small closed-room receipts prevent old
tabs and repeated commands from reviving cleared games.

Unfinished games remain resumable indefinitely. Connected result views keep
their rematch controls, and a finished match without its durable result record
retains its source until the result save succeeds. Maintenance runs only hourly,
separate from the bot work queue, so idle bot ticks still perform no room scans.
Existing eligible rooms are included automatically without a schema migration
or additional grants. `app.extensions['cleanup_storage']()` runs the same sweep
manually in an application context.

## Game creation limits

Each account can have 20 unfinished games per app, counting bot and multiplayer
games together. Finished, conceded, and closed games stop counting immediately.
New game/lobby creation allows five per minute per player. Joining and starting
check available space again; rematches also respect the allowance. Resume, moves,
result saves, and concessions remain available at the limit. Waiting lobbies do
not count as unfinished games. `MAX_IN_PROGRESS_GAMES` and
`GAME_CREATIONS_PER_MINUTE` configure these defaults for this single worker.
Guest browser identities apply where games are server-owned; Euchre guest bot
saves stay in the browser and have their own browser allowance.
