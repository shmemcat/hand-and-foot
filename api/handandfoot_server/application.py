"""Single-worker room host with atomic state/receipt persistence and private views."""
import copy
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import threading
import time
from flask import Flask, jsonify, request, session
from flask_socketio import SocketIO, join_room
from sqlalchemy import text
from sqlalchemy.engine import make_url
from . import bots, engine, scoring, lobby, inactivity
from .models import AchievementUnlock, DeletedAccount, MatchResult, Receipt, Room, db
from .account_remote import RemoteAccounts
from .account_contracts import AccountsUnavailable
from .rules import FAMILY, MAX_PLAYERS, validate_setup, validate_target_score
from .achievement_events import GAMEPLAY_ACHIEVEMENTS
from .schema import REVISION, schema_ready, upgrade_schema

ROOT = "/api/hand-and-foot"
NAMESPACE = "/hand-and-foot"
BOT_NAMES = ("Emily", "Nelson", "Maddie", "Tim", "Mary", "John", "Ariel", "Brad", "Kelly", "Sam")


class TableInProgress(ValueError):
    def __init__(self, code):
        super().__init__("Continue or leave your current table before starting another.")
        self.code = code


class SeatRemoved(PermissionError):
    pass


def create_app(config=None):
    local = Path(__file__).resolve().parents[1] / ".local"
    local.mkdir(parents=True, exist_ok=True)
    secret_file = local / "session-secret"
    secret = os.environ.get("HANDANDFOOT_SECRET_KEY")
    if not secret:
        if not secret_file.exists():
            try:
                with secret_file.open("x") as handle:
                    handle.write(secrets.token_hex(32))
            except FileExistsError:
                pass
        secret = secret_file.read_text().strip()
    app = Flask(__name__)
    app.config.from_mapping(
        SECRET_KEY=secret,
        SQLALCHEMY_DATABASE_URI=os.environ.get("HANDANDFOOT_DATABASE_URL", f"sqlite:///{local / 'handandfoot.sqlite'}"),
        SQLALCHEMY_TRACK_MODIFICATIONS=False,
        SESSION_COOKIE_NAME="handandfoot_session", SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax", SESSION_COOKIE_SECURE=os.environ.get("HANDANDFOOT_SECURE_COOKIE") == "1",
        MAX_CONTENT_LENGTH=32768, START_WORKER=True, BOT_INTERVAL=1.5,
        DEVELOPMENT_FIXTURES=os.environ.get("HANDANDFOOT_DEVELOPMENT_FIXTURES") == "1",
        ALLOWED_ORIGINS=[value.strip() for value in os.environ.get("CORS_ORIGINS", "http://127.0.0.1:3004,http://localhost:3004,https://cards.shmem.dev").split(",") if value.strip()],
        CARDS_ACCOUNTS_URL=os.environ.get("CARDS_ACCOUNTS_URL", ""),
        CARDS_SERVICE_ID=os.environ.get("CARDS_SERVICE_ID", "handandfoot-game"),
        CARDS_SERVICE_TOKEN=os.environ.get("CARDS_SERVICE_TOKEN", ""),
        CARDS_COOKIE_SECURE=os.environ.get("HANDANDFOOT_SECURE_COOKIE") == "1",
        CARDS_PUBLIC_URL=os.environ.get("CARDS_PUBLIC_URL", "https://cards.shmem.dev"),
        GAME_ACCOUNT_TOKENS=json.loads(os.environ.get("CARDS_GAME_ACCOUNT_TOKENS", "{}")),
        AUTO_CREATE_SCHEMA=os.environ.get("HANDANDFOOT_AUTO_CREATE_SCHEMA", "1") == "1",
        REQUIRE_ACCOUNTS=os.environ.get("HANDANDFOOT_REQUIRE_ACCOUNTS") == "1",
        COMPONENT_VERSION=os.environ.get("HANDANDFOOT_SERVER_VERSION", "development"),
        SOURCE_REVISION=os.environ.get("HANDANDFOOT_SOURCE_REVISION", "unknown"),
    )
    app.config.update(config or {})
    database_url = make_url(app.config["SQLALCHEMY_DATABASE_URI"])
    if database_url.drivername == "postgresql":
        database_url = database_url.set(drivername="postgresql+psycopg2")
    app.config["SQLALCHEMY_DATABASE_URI"] = database_url
    if len(app.config["SECRET_KEY"]) < 32:
        raise ValueError("Use a secret key of at least 32 characters.")
    db.init_app(app)
    socketio = SocketIO(app, path="/hand-and-foot/socket.io", async_mode="threading",
                        cors_allowed_origins=app.config["ALLOWED_ORIGINS"], manage_session=False,
                        max_http_buffer_size=32768)
    app.extensions["socketio"] = socketio
    lock = threading.RLock()
    app.extensions["room_lock"] = lock
    accounts = app.config.get("ACCOUNTS_PROVIDER")
    if accounts is None and app.config["CARDS_ACCOUNTS_URL"]:
        accounts = RemoteAccounts(app.config["CARDS_ACCOUNTS_URL"], app.config["CARDS_SERVICE_ID"], app.config["CARDS_SERVICE_TOKEN"])
    callback = app.config["GAME_ACCOUNT_TOKENS"].get("handandfoot", "")
    if accounts is not None and (not isinstance(callback, str) or len(callback) < 32):
        raise ValueError("Shared accounts require a separate strong Hand & Foot deletion callback token.")
    app.extensions["accounts"] = accounts
    socket_actors = {}
    if app.config["AUTO_CREATE_SCHEMA"]:
        with app.app_context():
            upgrade_schema()
            # Preserve tables created by the early v1 preview as the preset settles.
            for row in Room.query.all():
                data = copy.deepcopy(row.payload)
                lobby.normalize(data)
                game = data.get("game")
                if game and ("matchId" not in game or "shuffleSeed" not in game):
                    game.setdefault("matchId", engine.uid())
                    game.setdefault("shuffleSeed", secrets.randbits(128))
                    game.setdefault("targetScore", data.get("targetScore", 10000))
                if data != row.payload:
                    row.payload = data
            db.session.commit()

    def actor():
        user = request.environ.get("handandfoot.user")
        if user:
            if db.session.get(DeletedAccount, user.id):
                raise PermissionError("This account is no longer available.")
            return f"account:{user.id}"
        if "guest" not in session:
            session["guest"] = secrets.token_hex(24)
        return session["guest"]

    def resolve_identity(*, transfer=True):
        # Complete private network validation before taking the room write lock.
        if accounts:
            accounts.refresh()
            user = accounts.cookie_user()
        else:
            if request.cookies.get("cards_session") or request.cookies.get("__Host-cards_session"):
                raise AccountsUnavailable("Shared accounts are not configured for this game.")
            user = None
        request.environ["handandfoot.user"] = user
        if not transfer:
            return actor()
        previous = session.get("account_owner")
        current = f"account:{user.id}" if user else None
        with lock:
            key = actor()
            if current and (previous != current or session.get("guest_claim_pending")) and session.get("guest"):
                session["guest_claim_pending"] = False
                # Only signed browser-owned waiting seats transfer. Played guest
                # games and their results never become account results.
                for row in Room.query.all():
                    data = copy.deepcopy(row.payload)
                    if data["status"] != "lobby":
                        continue
                    guest = next((p for p in data["players"] if p.get("key") == session["guest"]), None)
                    if not guest:
                        continue
                    if any(other.code != row.code and active_table(other.payload, key) for other in Room.query.yield_per(200)):
                        session["guest_claim_pending"] = True
                        continue
                    existing = next((p for p in data["players"] if p.get("key") == key), None)
                    if existing:
                        if existing.get("lobbySeat") is None or data["hostId"] == guest["id"]:
                            existing["lobbySeat"] = guest.get("lobbySeat")
                        data["players"].remove(guest)
                        if data["hostId"] == guest["id"]:
                            data["hostId"] = existing["id"]
                        existing["name"] = user.username
                        existing["accountId"] = user.id
                        existing["profileIcon"] = user.profile_icon
                    else:
                        guest.update(key=key, name=user.username, accountId=user.id, profileIcon=user.profile_icon)
                    data["token"] = engine.uid()
                    save(row, data)
                    announce(row.code, data["revision"])
                    for sid, principal in list(socket_actors.items()):
                        if principal == session["guest"]:
                            socket_actors.pop(sid, None)
                            socketio.server.disconnect(sid, namespace=NAMESPACE)
            if previous != current:
                session["account_owner"] = current
            if not current:
                session.pop("guest_claim_pending", None)
        return key

    @app.before_request
    def shared_identity():
        if request.path.startswith(ROOT + "/") and request.path != ROOT + "/health":
            resolve_identity()

    def player_name(value):
        user = request.environ.get("handandfoot.user")
        return user.username if user else clean_name(value)

    def guard(token=None):
        origin = request.headers.get("Origin")
        if origin and origin not in app.config["ALLOWED_ORIGINS"]:
            raise PermissionError("This request did not come from the game site.")
        supplied = request.headers.get("X-Handandfoot-CSRF") if token is None else token
        expected = session.get("csrf")
        if not expected or not isinstance(supplied, str) or not secrets.compare_digest(expected, supplied):
            raise PermissionError("Refresh the page to reconnect securely.")

    def body():
        value = request.get_json(silent=True)
        if not isinstance(value, dict):
            raise ValueError("Submit a JSON object.")
        return value

    def room_for(code):
        if not re.fullmatch(r"[A-Z0-9]{6}", code):
            raise LookupError("Table codes have six letters or numbers.")
        row = db.session.get(Room, code)
        if not row:
            raise LookupError("That table was not found. Check the code and try again.")
        return row

    def players(data):
        return data["game"]["players"] if data.get("game") else data["players"]

    def active_table(data, key):
        return (data["status"] != "closed" and not data.get("developmentFixture")
                and any(p.get("key") == key for p in players(data))
                and not (data["playMode"] == "practice" and data.get("game", {})
                         and data["game"]["phase"] == "finished"))

    def require_free_seat(key, *, except_code=None):
        # Called under the room lock so two browser tabs cannot create/join twice.
        for row in Room.query.yield_per(200):
            if row.code != except_code and active_table(row.payload, key):
                raise TableInProgress(row.code)

    def member(data, key):
        player = next((p for p in players(data) if p.get("key") == key), None)
        if not player:
            if data.get("removed", {}).get(key) == "idle":
                raise SeatRemoved("You were inactive for 10 minutes. A bot has taken over your seat.")
            if data.get("removed", {}).get(key) == "removed":
                raise SeatRemoved("The host removed you from this lobby.")
            raise PermissionError("Join this table before viewing it.")
        return player

    def projection(data, key):
        player = member(data, key)
        base = {key: data[key] for key in ("code", "capacity", "scoringMode", "playMode", "revision", "hostId", "status", "targetScore")}
        base["viewerId"] = player["id"]
        base["botDifficulty"] = data.get("botDifficulty", bots.DEFAULT_DIFFICULTY)
        base["developmentFixture"] = bool(data.get("developmentFixture"))
        if data.get("game"):
            base.update(engine.project(data["game"], player["id"]))
            timer = data.get("inactivity", {}).get(player["id"], {})
            base["idleWarning"] = bool(timer.get("warned"))
        else:
            lobby.normalize(data)
            side_count = data["capacity"] // 2 if data["scoringMode"] == "partnership" else data["capacity"]
            roster = [{"id": p["id"], "name": p["name"], "profileIcon": p.get("profileIcon", "user"), "bot": p["bot"], "team": p["lobbySeat"] % side_count if p["lobbySeat"] is not None else -1, "handCount": 0, "footCount": 0, "inFoot": False, "chosen": False, "redThrees": [], "ready": False, "away": False} for p in data["players"]]
            by_id = {p["id"]: p for p in roster}
            base.update(players=roster,
                        lobbyFillBots=data.get("lobbyFillBots", True),
                        lobbySeats=[next((by_id[p["id"]] for p in data["players"] if p["lobbySeat"] == seat), None) for seat in range(data["capacity"])],
                        waitingPlayers=[by_id[p["id"]] for p in data["players"] if p["lobbySeat"] is None],
                        sides=[], phase="lobby", token=data["token"], decks=data["capacity"] + 1,
                        round=0, actorId=None, dealerId=None, hand=[], footPreview=None, footTop=None, discard=None, discardCount=0,
                        stockCount=0, history=[], winners=[], scoring=None, message="Invite your friends to the table.", ruleset=FAMILY.id)
        return base

    def save(row, data, *, changed=True):
        inactivity.sync(data, time.time())
        if changed:
            data["revision"] += 1
        row.payload = data
        row.updated_at = time.time()
        game = data.get("game")
        if game and game.get("playerAchievements") and not data.get("developmentFixture"):
            earned = set()
            for player in game["players"]:
                key = player.get("key")
                if not isinstance(key, str) or not re.fullmatch(r"account:([1-9][0-9]{0,18})", key):
                    continue
                user_id = int(key.split(":")[1])
                if db.session.get(DeletedAccount, user_id):
                    continue
                for achievement_id in game.get("playerAchievements", {}).get(player["id"], []):
                    if achievement_id in GAMEPLAY_ACHIEVEMENTS:
                        earned.add((user_id, achievement_id))
            if earned:
                existing = {(row.user_id, row.achievement_id) for row in AchievementUnlock.query.filter(
                    AchievementUnlock.user_id.in_({uid for uid, _ in earned}),
                    AchievementUnlock.achievement_id.in_(GAMEPLAY_ACHIEVEMENTS),
                )}
                for user_id, achievement_id in earned - existing:
                    db.session.add(AchievementUnlock(user_id=user_id, achievement_id=achievement_id))
        if game and game["phase"] == "finished" and not data.get("developmentFixture") and not db.session.get(MatchResult, game["matchId"]):
            db.session.add(MatchResult(id=game["matchId"], completed_at=time.time(), payload={
                "code": data["code"], "mode": data["scoringMode"], "playMode": data["playMode"], "targetScore": game["targetScore"],
                "botDifficulty": data.get("botDifficulty", bots.DEFAULT_DIFFICULTY),
                "players": [{"key": p.get("key"), "accountId": p.get("accountId"), "team": p["team"], "utcOffsetMinutes": p.get("utcOffsetMinutes"), "achievements": game.get("playerAchievements", {}).get(p["id"], [])} for p in game["players"]],
                "startedAt": game.get("startedAt"),
                "scores": [side["score"] for side in game["sides"]], "winners": game["winners"],
                "history": game["history"], "ruleset": game["ruleset"],
            }))
        db.session.commit()

    def announce(code, revision):
        socketio.emit("handandfoot:updated", {"code": code, "revision": revision}, to=code, namespace=NAMESPACE)

    from .account_cleanup import register_cleanup
    register_cleanup(app, lock, announce)

    def utc_offset():
        value = request.headers.get("X-Handandfoot-UTC-Offset")
        if value is None:
            return None
        if not re.fullmatch(r"-?[0-9]{1,4}", value) or not -840 <= int(value) <= 720:
            raise ValueError("Your time zone could not be read. Refresh the page and try again.")
        return int(value)

    def new_player(name, key=None, *, bot=False):
        owner = int(key.split(":")[1]) if isinstance(key, str) and key.startswith("account:") else None
        user = request.environ.get("handandfoot.user")
        return {"id": engine.uid(), "key": key, "accountId": owner, "profileIcon": user.profile_icon if user and owner == user.id else "user", "name": name, "bot": bot, "lastSeen": time.time(), "away": False, "utcOffsetMinutes": None if bot else utc_offset()}

    def start(data, *, fill_bots=True):
        validate_setup(data["scoringMode"], data["capacity"], data["playMode"])
        validate_target_score(data["targetScore"])
        bots.validate_difficulty(data.get("botDifficulty", bots.DEFAULT_DIFFICULTY))
        lobby.prepare_start(data, fill_bots)
        roster = [next((p for p in data["players"] if p["lobbySeat"] == seat), None) for seat in range(data["capacity"])]
        used_names = {player["name"].casefold() for player in data["players"]}
        names = [name for name in BOT_NAMES if name.casefold() not in used_names]
        for seat, player in enumerate(roster):
            if player is not None:
                continue
            name = secrets.choice(names)
            names.remove(name)
            roster[seat] = new_player(name, bot=True) | {"lobbySeat": seat}
        data["players"] = roster
        data["game"] = engine.new_game(data["players"], data["scoringMode"], target_score=data["targetScore"])
        data["game"]["startedAt"] = time.time()
        data["status"] = "playing"

    def depart(data, player, reason="left"):
        key = player.get("key")
        if key:
            data.setdefault("removed", {})[key] = reason
        if not data.get("game"):
            data["players"] = [p for p in data["players"] if p["id"] != player["id"]]
        else:
            player.update(key=None, bot=True, away=False, name=player["name"] + " (bot)")
        candidates = [p for p in players(data) if p.get("key")]
        if data["hostId"] == player["id"]:
            data["hostId"] = candidates[0]["id"] if candidates else ""
        if not candidates:
            data.update(status="closed", closedReason="empty")
        data["token"] = engine.uid()

    @app.errorhandler(SeatRemoved)
    def seat_removed(error):
        db.session.rollback()
        return jsonify(error=str(error), code="SEAT_REMOVED"), 403

    @app.errorhandler(ValueError)
    @app.errorhandler(LookupError)
    @app.errorhandler(PermissionError)
    def rejected(error):
        db.session.rollback()
        status = 403 if isinstance(error, PermissionError) else 404 if isinstance(error, LookupError) else 400
        return jsonify(error=str(error), code="CSRF_INVALID" if "reconnect securely" in str(error) else "REJECTED"), status

    @app.errorhandler(AccountsUnavailable)
    def unavailable(error):
        db.session.rollback()
        return jsonify(error="Shared accounts are temporarily unavailable. Please try again.", code="ACCOUNTS_UNAVAILABLE"), 503

    @app.errorhandler(TableInProgress)
    def table_in_progress(error):
        db.session.rollback()
        return jsonify(error=str(error), code="TABLE_IN_PROGRESS", activeCode=error.code), 409

    @app.after_request
    def private_response(response):
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    @app.get("/health")
    @app.get(ROOT + "/health")
    def health():
        return jsonify(status="ok", service="handandfoot-game", component="handandfoot-game", schema=1,
                       schemaRevision=REVISION, accountsContract=1, version=app.config["COMPONENT_VERSION"], revision=app.config["SOURCE_REVISION"])

    @app.get("/ready")
    def ready():
        good = schema_ready() and (not app.config["REQUIRE_ACCOUNTS"] or accounts is not None)
        return jsonify(status="ready" if good else "unavailable", component="handandfoot-game", schema=1,
                       schemaRevision=REVISION), 200 if good else 503

    @app.get(ROOT + "/session")
    def get_session():
        actor()
        if "csrf" not in session:
            session["csrf"] = secrets.token_hex(32)
        user = request.environ.get("handandfoot.user")
        return jsonify(csrf=session["csrf"], accountsConfigured=accounts is not None,
                       user={"id": str(user.id), "name": user.username, "profile_icon": user.profile_icon} if user else None)

    @app.post(ROOT + "/rooms")
    def create_room():
        guard()
        values = body()
        scoring, count, mode = values.get("scoringMode"), values.get("capacity"), values.get("playMode")
        validate_setup(scoring, count, mode)
        name = player_name(values.get("name"))
        target = values.get("targetScore", FAMILY.target_score)
        validate_target_score(target)
        difficulty = bots.validate_difficulty(values.get("botDifficulty", bots.DEFAULT_DIFFICULTY))
        with lock:
            require_free_seat(actor())
            # Bound accidental repeated creates; rooms are private, not discoverable.
            recent = Room.query.filter(Room.updated_at > time.time() - 3600).all()
            if sum(any(p.get("key") == actor() for p in players(row.payload)) for row in recent) >= 20:
                raise ValueError("You have several recent tables. Return to one before creating another.")
            code = ''.join(secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(6))
            while db.session.get(Room, code):
                code = ''.join(secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(6))
            player = new_player(name, actor())
            data = {"code": code, "capacity": count, "scoringMode": scoring, "playMode": mode,
                    "players": [player], "hostId": player["id"], "revision": 0, "token": engine.uid(),
                    "status": "lobby", "game": None, "targetScore": target, "botDifficulty": difficulty}
            if mode == "practice":
                start(data)
            row = Room(code=code, payload=data, updated_at=time.time())
            db.session.add(row)
            db.session.commit()
            return jsonify(projection(data, actor()))

    @app.post(ROOT + "/fixtures")
    def create_fixture():
        if not app.config["DEVELOPMENT_FIXTURES"]:
            raise LookupError("This preview is available only in development.")
        guard()
        fixture = body().get("fixture")
        from .fixtures import BOARD_FIXTURES, HAND_FIXTURES, OPENING_FIXTURES, FOOT_FIXTURES, GOING_OUT_FIXTURES, RED_THREE_FIXTURES, SCORING_FIXTURES, populate
        if fixture not in ("scoring", "dense", "catchup", *BOARD_FIXTURES, *HAND_FIXTURES, *OPENING_FIXTURES, *FOOT_FIXTURES, *GOING_OUT_FIXTURES, *RED_THREE_FIXTURES, *SCORING_FIXTURES):
            raise ValueError("Choose one of the available development previews.")
        with lock:
            code = ''.join(secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(6))
            while db.session.get(Room, code):
                code = ''.join(secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(6))
            player = new_player("You", actor())
            individual_fixture = fixture in HAND_FIXTURES or fixture in BOARD_FIXTURES or fixture in OPENING_FIXTURES or fixture in FOOT_FIXTURES or fixture in GOING_OUT_FIXTURES or fixture in RED_THREE_FIXTURES or fixture in SCORING_FIXTURES
            data = {"code": code, "capacity": MAX_PLAYERS, "scoringMode": "individual" if individual_fixture else "partnership", "playMode": "practice", "players": [player], "hostId": player["id"], "revision": 0, "token": engine.uid(), "status": "lobby", "game": None, "targetScore": FAMILY.target_score, "developmentFixture": True}
            start(data)
            populate(data["game"], fixture)
            db.session.add(Room(code=code, payload=data, updated_at=time.time()))
            db.session.commit()
            return jsonify(projection(data, actor()))

    @app.post(ROOT + "/rooms/<code>/join")
    def join(code):
        guard()
        values = body()
        name = player_name(values.get("name"))
        with lock:
            row = room_for(code)
            data = copy.deepcopy(row.payload)
            if any(p.get("key") == actor() for p in players(data)):
                return jsonify(projection(data, actor()))
            require_free_seat(actor())
            if data["status"] != "lobby" or len(data["players"]) >= data["capacity"]:
                raise ValueError("This table has already started or is full.")
            if data["playMode"] != "online":
                raise PermissionError("This is a practice table.")
            joined = new_player(name, actor())
            lobby.normalize(data)
            joined["lobbySeat"] = None
            seat = values.get("seat") if "seat" in values else next((i for i in range(data["capacity"]) if all(p["lobbySeat"] != i for p in data["players"])), None)
            if seat is not None:
                lobby.choose(data, joined, seat)
            data["players"].append(joined)
            data.get("removed", {}).pop(actor(), None)
            if not data["hostId"]:
                data["hostId"] = joined["id"]
            data["token"] = engine.uid()
            save(row, data)
            result = projection(data, actor())
        announce(code, data["revision"])
        return jsonify(result)

    @app.get(ROOT + "/active")
    def active_rooms():
        key = actor()
        recent = []
        with lock:
            for row in Room.query.order_by(Room.updated_at.desc(), Room.code).yield_per(200):
                data = row.payload
                game = data.get("game")
                if not active_table(data, key):
                    continue
                # Listing saved tables does not reclaim an absent seat or expose cards.
                recent.append({"code": row.code, "playMode": data["playMode"],
                    "scoringMode": data["scoringMode"], "capacity": data["capacity"],
                    "phase": game["phase"] if game else "lobby", "round": game["round"] if game else 0})
                if len(recent) == 30:
                    break
        return jsonify(rooms=recent)

    @app.get(ROOT + "/rooms/<code>")
    def get_room(code):
        with lock:
            row = room_for(code)
            data = copy.deepcopy(row.payload)
            player = member(data, actor())
            player["lastSeen"] = time.time()
            if not data.get("game") and utc_offset() is not None:
                player["utcOffsetMinutes"] = utc_offset()
            if player.get("away"):
                player.update(away=False, bot=False)
            save(row, data, changed=False)
            return jsonify(projection(data, actor()))

    @app.post(ROOT + "/rooms/<code>/commands")
    def command(code):
        guard()
        values = body()
        action_id = values.get("actionId")
        if not isinstance(action_id, str) or not re.fullmatch(r"[A-Za-z0-9-]{12,64}", action_id):
            raise ValueError("This move needs a unique action ID.")
        fingerprint = hashlib.sha256(json.dumps(values, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
        with lock:
            row = room_for(code)
            data = copy.deepcopy(row.payload)
            player = member(data, actor())
            receipt = db.session.get(Receipt, (code, action_id))
            if receipt:
                if receipt.principal != actor() or receipt.fingerprint != fingerprint:
                    raise ValueError("That action ID has already been used for a different move.")
                return jsonify(projection(data, actor()))
            expected = projection(data, actor())["token"]
            if values.get("token") != expected or type(values.get("revision")) is not int or values["revision"] > data["revision"]:
                return jsonify(error="The table has moved on. Your cards are safe; refresh the view and try again.", code="STALE_STATE"), 409
            action = values.get("type")
            if action in ("start", "rematch") and utc_offset() is not None:
                player["utcOffsetMinutes"] = utc_offset()
            if action == "start":
                if data["hostId"] != player["id"] or data["status"] != "lobby":
                    raise PermissionError("Only the host can start the table.")
                fill_bots = values.get("fillBots", data.get("lobbyFillBots", True))
                if type(fill_bots) is not bool:
                    raise ValueError("Choose whether to fill empty seats with bots.")
                start(data, fill_bots=fill_bots)
            elif action == "lobby_options":
                if data["hostId"] != player["id"] or data["status"] != "lobby":
                    raise PermissionError("Only the host can choose how to start the lobby.")
                if "fillBots" not in values and "botDifficulty" not in values:
                    raise ValueError("Choose a lobby option to change.")
                if "fillBots" in values and type(values["fillBots"]) is not bool:
                    raise ValueError("Choose whether to fill empty seats with bots.")
                if "botDifficulty" in values:
                    data["botDifficulty"] = bots.validate_difficulty(values["botDifficulty"])
                if "fillBots" in values:
                    data["lobbyFillBots"] = values["fillBots"]
                data["token"] = engine.uid()
            elif action == "close":
                if data["hostId"] != player["id"] or data["status"] != "lobby":
                    raise PermissionError("Only the host can close a waiting lobby.")
                data["status"] = "closed"
                data["token"] = engine.uid()
            elif action == "seat":
                lobby.choose(data, player, values.get("seat"))
                data["token"] = engine.uid()
            elif action == "unseat":
                lobby.unseat(data, player)
                data["token"] = engine.uid()
            elif action == "remove_player":
                if data["hostId"] != player["id"] or data["status"] != "lobby":
                    raise PermissionError("Only the host can remove players before the game starts.")
                target = next((p for p in data["players"] if p["id"] == values.get("playerId")), None)
                if target is None or target["id"] == player["id"]:
                    raise ValueError("Choose another player to remove from the lobby.")
                depart(data, target, "removed")
            elif action == "swap_seats":
                if data["hostId"] != player["id"] or data["status"] != "lobby":
                    raise PermissionError("Only the host can arrange seats before the deal.")
                first = next((i for i,p in enumerate(data["players"]) if p["id"] == values.get("firstId")), None)
                second = next((i for i,p in enumerate(data["players"]) if p["id"] == values.get("secondId")), None)
                if first is None or second is None or first == second:
                    raise ValueError("Choose two occupied seats to swap.")
                lobby.normalize(data)
                data["players"][first]["lobbySeat"], data["players"][second]["lobbySeat"] = data["players"][second]["lobbySeat"], data["players"][first]["lobbySeat"]
                data["players"][first], data["players"][second] = data["players"][second], data["players"][first]
                data["token"] = engine.uid()
            elif action == "rematch":
                if not data.get("game") or data["game"]["phase"] != "finished":
                    raise ValueError("Finish this match before playing again.")
                if data["hostId"] != player["id"]:
                    raise PermissionError("Only the host can start a new game.")
                if not data.get("developmentFixture"):
                    require_free_seat(actor(), except_code=code)
                game = data["game"]
                data["players"] = [{k: p[k] for k in ("id", "key", "name", "bot", "lastSeen", "away")} | {"accountId": p.get("accountId"), "lobbySeat": i, "profileIcon": p.get("profileIcon", "user"), "utcOffsetMinutes": p.get("utcOffsetMinutes")} for i, p in enumerate(game["players"])]
                data["game"] = None
                start(data)
            elif action == "leave":
                depart(data, player)
            else:
                if not data.get("game"):
                    raise ValueError("Start the table first.")
                seat = next(i for i, p in enumerate(players(data)) if p["id"] == player["id"])
                data["game"] = engine.apply(data["game"], seat, values)
            db.session.add(Receipt(code=code, action_id=action_id, principal=actor(), fingerprint=fingerprint, revision=data["revision"] + 1))
            save(row, data)
            result = {"left": True} if action == "leave" else projection(data, actor())
        announce(code, data["revision"])
        return jsonify(result)

    @app.get(ROOT + "/scores")
    def scores():
        key = actor()
        recent = []
        with lock:
            for row in MatchResult.query.order_by(MatchResult.completed_at.desc(), MatchResult.id).yield_per(200):
                data = row.payload
                player = next((p for p in data["players"] if p.get("key") == key), None)
                if player:
                    recent.append({"id": row.id, "code": data["code"], "mode": data["mode"], "playMode": data.get("playMode"), "score": data["scores"][player["team"]], "won": player["team"] in data["winners"], "date": row.completed_at})
                    if len(recent) == 30:
                        break
        return jsonify(recent)

    @app.get(ROOT + "/achievements")
    def achievements():
        from .achievements import account_summary
        if request.environ.get("handandfoot.user") is None:
            return jsonify(error="Sign in to see your statistics and achievements."), 401
        with lock:
            return jsonify(account_summary(actor()))

    @app.post(ROOT + "/achievements")
    def unlock_achievement():
        guard()
        user = request.environ.get("handandfoot.user")
        if user is None:
            return jsonify(error="Sign in to save achievements."), 401
        values = body()
        if values.get("id") != "geezer":
            raise ValueError("This achievement must be earned by playing.")
        if values.get("userId") != str(user.id):
            return jsonify(error="Your account changed. Please try again."), 409
        with lock:
            actor()
            if not db.session.get(AchievementUnlock, (user.id, "geezer")):
                db.session.add(AchievementUnlock(user_id=user.id, achievement_id="geezer"))
                db.session.commit()
        return jsonify(unlocks=["geezer"])

    @app.get(ROOT + "/leaderboard")
    def leaderboard():
        from .leaderboard import standings
        category = request.args.get("category")
        if category is None:
            # Preserve links from older clients and completed matches.
            mode = request.args.get("mode", "practice")
            if mode not in ("practice", "online", "achievements"):
                raise ValueError("Choose Against Bots, Multiplayer, or Achievements.")
            category = {"practice": "medium", "online": "multiplayer", "achievements": "achievements"}[mode]
        return jsonify(standings(category, accounts, lock))

    @socketio.on("connect", namespace=NAMESPACE)
    def socket_connect(auth):
        try:
            guard((auth or {}).get("csrf"))
            socket_actors[request.sid] = resolve_identity()
            return True
        except (PermissionError, AccountsUnavailable):
            return False

    @socketio.on("disconnect", namespace=NAMESPACE)
    def socket_disconnect(reason=None):
        socket_actors.pop(request.sid, None)

    @socketio.on("handandfoot:subscribe", namespace=NAMESPACE)
    def subscribe(values):
        try:
            key = resolve_identity()
            if socket_actors.get(request.sid) != key:
                raise PermissionError("Reconnect after your account changes.")
            if not isinstance(values, dict) or not isinstance(values.get("code"), str):
                return {"error": "Choose a table."}
            with lock:
                row = room_for(values["code"])
                member(row.payload, actor())
                join_room(row.code)
            return {"ok": True}
        except (PermissionError, LookupError, AccountsUnavailable):
            return {"error": "Join this table first."}

    def tick():
        with app.app_context():
            now = time.time()
            with lock:
                user_ids = {p["accountId"] for row in Room.query.all()
                            for p in players(row.payload) if p.get("accountId") and p.get("key")
                            and p["id"] in inactivity.due(row.payload, now)}
            available = True
            if accounts and user_ids:
                try:
                    # An account outage must not remove a player; no remote I/O under the room lock.
                    accounts.public_profiles(list(user_ids))
                except AccountsUnavailable:
                    available = False
            with lock:
                db.session.expire_all()
                for row in Room.query.all():
                    data = copy.deepcopy(row.payload)
                    game = data.get("game")
                    if not game or data["status"] == "closed":
                        continue
                    humans = [p for p in game["players"] if p.get("key")]
                    if not humans:
                        continue
                    # Solo games pause off-page. Online decisions retain their clock through reconnects.
                    if data["playMode"] == "practice" and all(now - p["lastSeen"] > 120 for p in humans):
                        continue
                    inactivity.sync(data, now)
                    for pid, timer in list(data["inactivity"].items()):
                        elapsed = now - timer["startedAt"]
                        if elapsed >= inactivity.WARNING_SECONDS:
                            timer["warned"] = True
                        if elapsed < inactivity.TIMEOUT_SECONDS:
                            continue
                        if not available:
                            timer["recovering"] = True
                        elif timer.pop("recovering", False):
                            timer["startedAt"] = now - inactivity.WARNING_SECONDS
                        else:
                            depart(data, next(p for p in game["players"] if p["id"] == pid), "idle")
                    changed = data != row.payload
                    if data["status"] == "closed":
                        save(row, data)
                        announce(row.code, data["revision"])
                        continue
                    bot_seat = None
                    if game["phase"] == "choose":
                        bot_seat = next((i for i, p in enumerate(game["players"]) if p["bot"] and not p["chosen"]), None)
                    elif game["phase"] in ("draw", "play") and game["players"][game["actor"]]["bot"]:
                        if game["phase"] != "draw" or not engine.opening_pending(game):
                            bot_seat = game["actor"]
                    elif game["phase"] == "scoring":
                        team = next((side["team"] for side in game["scoring"]["sides"] if not side["confirmed"] and all(p["bot"] for p in game["players"] if p["team"] == side["team"])), None)
                        if team is not None:
                            bot_seat = next(i for i, p in enumerate(game["players"]) if p["team"] == team)
                    if bot_seat is not None:
                        player = game["players"][bot_seat]
                        view = engine.project(game, player["id"]) | {"viewerId": player["id"]}
                        if game["phase"] == "scoring":
                            pile = scoring.auto_choice(game, player["team"])
                            move = {"type": "score_pay", "pileId": pile} if pile else {"type": "score_confirm"}
                        else:
                            move = bots.decide(view, data.get("botDifficulty", bots.DEFAULT_DIFFICULTY))
                        try:
                            data["game"] = engine.apply(game, bot_seat, move)
                            changed = True
                        except ValueError:
                            app.logger.exception("Bot move rejected in table %s", row.code)
                    elif game["phase"] == "round_over":
                        if all(p["bot"] or p["id"] in game["ready"] for p in game["players"]) and any(p["bot"] for p in game["players"]):
                            game["dealer"] = (game["dealer"] + 1) % len(game["players"])
                            engine.deal_round(game)
                            changed = True
                    if changed:
                        save(row, data)
                        announce(row.code, data["revision"])
    app.extensions["tick"] = tick

    def worker():
        while True:
            socketio.sleep(app.config["BOT_INTERVAL"])
            try:
                tick()
            except Exception:
                app.logger.exception("Hand & Foot worker error")

    if app.config["START_WORKER"]:
        socketio.start_background_task(worker)
    return app


def clean_name(value):
    if not isinstance(value, str):
        raise ValueError("Enter a name for your seat.")
    name = ' '.join(value.split())
    if not 1 <= len(name) <= 24 or any(ord(char) < 32 for char in name):
        raise ValueError("Use a name between 1 and 24 characters.")
    return name
