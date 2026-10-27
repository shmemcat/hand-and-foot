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
from . import bots, engine, scoring
from .models import DeletedAccount, MatchResult, Receipt, Room, db
from .account_remote import RemoteAccounts
from .account_contracts import AccountsUnavailable
from .rules import FAMILY, validate_setup

ROOT = "/api/hand-and-foot"
NAMESPACE = "/hand-and-foot"


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
        MAX_CONTENT_LENGTH=32768, START_WORKER=True, BOT_INTERVAL=.65,
        DEVELOPMENT_FIXTURES=os.environ.get("HANDANDFOOT_DEVELOPMENT_FIXTURES") == "1",
        ALLOWED_ORIGINS=["http://127.0.0.1:3004", "http://localhost:3004", "https://cards.shmem.dev"],
        CARDS_ACCOUNTS_URL=os.environ.get("CARDS_ACCOUNTS_URL", ""),
        CARDS_SERVICE_ID=os.environ.get("CARDS_SERVICE_ID", "handandfoot-game"),
        CARDS_SERVICE_TOKEN=os.environ.get("CARDS_SERVICE_TOKEN", ""),
        CARDS_COOKIE_SECURE=os.environ.get("HANDANDFOOT_SECURE_COOKIE") == "1",
        CARDS_PUBLIC_URL=os.environ.get("CARDS_PUBLIC_URL", "https://cards.shmem.dev"),
        GAME_ACCOUNT_TOKENS=json.loads(os.environ.get("CARDS_GAME_ACCOUNT_TOKENS", "{}")),
    )
    app.config.update(config or {})
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
    with app.app_context():
        db.create_all()
        # Preserve tables created by the early v1 preview as the preset settles.
        for row in Room.query.all():
            data = copy.deepcopy(row.payload)
            game = data.get("game")
            if game and ("matchId" not in game or "shuffleSeed" not in game):
                game.setdefault("matchId", engine.uid())
                game.setdefault("shuffleSeed", secrets.randbits(128))
                game.setdefault("targetScore", data.get("targetScore", 10000))
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
            if current and previous != current and session.get("guest"):
                # Only signed browser-owned waiting seats transfer. Played guest
                # games and their results never become account results.
                for row in Room.query.all():
                    data = copy.deepcopy(row.payload)
                    if data["status"] != "lobby":
                        continue
                    guest = next((p for p in data["players"] if p.get("key") == session["guest"]), None)
                    if not guest:
                        continue
                    existing = next((p for p in data["players"] if p.get("key") == key), None)
                    if existing:
                        data["players"].remove(guest)
                        if data["hostId"] == guest["id"]:
                            data["hostId"] = existing["id"]
                        existing["name"] = user.username
                        existing["accountId"] = user.id
                    else:
                        guest.update(key=key, name=user.username, accountId=user.id)
                    data["token"] = engine.uid()
                    save(row, data)
                    announce(row.code, data["revision"])
            session["account_owner"] = current
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

    def member(data, key):
        player = next((p for p in players(data) if p.get("key") == key), None)
        if not player:
            raise PermissionError("Join this table before viewing it.")
        return player

    def projection(data, key):
        player = member(data, key)
        base = {key: data[key] for key in ("code", "capacity", "scoringMode", "playMode", "revision", "hostId", "status", "targetScore")}
        base["viewerId"] = player["id"]
        if data.get("game"):
            base.update(engine.project(data["game"], player["id"]))
        else:
            side_count = data["capacity"] // 2 if data["scoringMode"] == "partnership" else data["capacity"]
            base.update(players=[{"id": p["id"], "name": p["name"], "bot": p["bot"], "team": i % side_count, "handCount": 0, "footCount": 0, "inFoot": False, "chosen": False, "redThrees": [], "ready": False, "away": False} for i, p in enumerate(data["players"])],
                        sides=[], phase="lobby", token=data["token"], decks=data["capacity"] + 1,
                        round=0, actorId=None, dealerId=None, hand=[], footPreview=None, footTop=None, discard=None, discardCount=0,
                        stockCount=0, history=[], winners=[], scoring=None, message="Invite your friends to the table.", ruleset=FAMILY.id)
        return base

    def save(row, data, *, changed=True):
        if changed:
            data["revision"] += 1
        row.payload = data
        row.updated_at = time.time()
        game = data.get("game")
        if game and game["phase"] == "finished" and not db.session.get(MatchResult, game["matchId"]):
            db.session.add(MatchResult(id=game["matchId"], completed_at=time.time(), payload={
                "code": data["code"], "mode": data["scoringMode"], "playMode": data["playMode"], "targetScore": game["targetScore"],
                "players": [{"key": p.get("key"), "accountId": p.get("accountId"), "team": p["team"]} for p in game["players"]],
                "scores": [side["score"] for side in game["sides"]], "winners": game["winners"],
                "history": game["history"], "ruleset": game["ruleset"],
            }))
        db.session.commit()

    def announce(code, revision):
        socketio.emit("handandfoot:updated", {"code": code, "revision": revision}, to=code, namespace=NAMESPACE)

    from .account_cleanup import register_cleanup
    register_cleanup(app, lock, announce)

    def new_player(name, key=None, *, bot=False):
        owner = int(key.split(":")[1]) if isinstance(key, str) and key.startswith("account:") else None
        return {"id": engine.uid(), "key": key, "accountId": owner, "name": name, "bot": bot, "lastSeen": time.time(), "away": False}

    def start(data):
        while len(data["players"]) < data["capacity"]:
            index = len(data["players"])
            names = ["Clover", "Poppy", "Hazel", "Jasper", "Ivy", "Olive", "Fern", "Rowan"]
            data["players"].append(new_player(names[index], bot=True))
        data["game"] = engine.new_game(data["players"], data["scoringMode"], target_score=data["targetScore"])
        data["status"] = "playing"

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

    @app.after_request
    def private_response(response):
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    @app.get("/health")
    @app.get(ROOT + "/health")
    def health():
        return jsonify(status="ok", service="handandfoot-game", component="handandfoot-game", schema=1)

    @app.get("/ready")
    def ready():
        db.session.execute(text("SELECT 1"))
        return jsonify(status="ready", schema=1)

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
        if type(target) is not int or target not in (10000, 15000, 20000):
            raise ValueError("Choose a target of 10,000, 15,000, or 20,000 points.")
        with lock:
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
                    "status": "lobby", "game": None, "targetScore": target}
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
        from .fixtures import BOARD_FIXTURES, HAND_FIXTURES, OPENING_FIXTURES, populate
        if fixture not in ("scoring", "dense", "catchup", *BOARD_FIXTURES, *HAND_FIXTURES, *OPENING_FIXTURES):
            raise ValueError("Choose one of the available development previews.")
        with lock:
            code = ''.join(secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(6))
            while db.session.get(Room, code):
                code = ''.join(secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(6))
            player = new_player("You", actor())
            individual_fixture = fixture in HAND_FIXTURES or fixture in BOARD_FIXTURES or fixture in OPENING_FIXTURES
            data = {"code": code, "capacity": 4 if individual_fixture else 8, "scoringMode": "individual" if individual_fixture else "partnership", "playMode": "practice", "players": [player], "hostId": player["id"], "revision": 0, "token": engine.uid(), "status": "lobby", "game": None, "targetScore": 10000}
            start(data)
            populate(data["game"], fixture)
            db.session.add(Room(code=code, payload=data, updated_at=time.time()))
            db.session.commit()
            return jsonify(projection(data, actor()))

    @app.post(ROOT + "/rooms/<code>/join")
    def join(code):
        guard()
        name = player_name(body().get("name"))
        with lock:
            row = room_for(code)
            data = copy.deepcopy(row.payload)
            if any(p.get("key") == actor() for p in players(data)):
                return jsonify(projection(data, actor()))
            if data["status"] != "lobby" or len(data["players"]) >= data["capacity"]:
                raise ValueError("This table has already started or is full.")
            if data["playMode"] != "online":
                raise PermissionError("This is a practice table.")
            joined = new_player(name, actor())
            data["players"].append(joined)
            if not data["hostId"]:
                data["hostId"] = joined["id"]
            data["token"] = engine.uid()
            save(row, data)
            result = projection(data, actor())
        announce(code, data["revision"])
        return jsonify(result)

    @app.get(ROOT + "/rooms/<code>")
    def get_room(code):
        with lock:
            row = room_for(code)
            data = copy.deepcopy(row.payload)
            player = member(data, actor())
            player["lastSeen"] = time.time()
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
            if action == "start":
                if data["hostId"] != player["id"] or data["status"] != "lobby":
                    raise PermissionError("Only the host can start the table.")
                start(data)
            elif action == "swap_seats":
                if data["hostId"] != player["id"] or data["status"] != "lobby":
                    raise PermissionError("Only the host can arrange seats before the deal.")
                first = next((i for i,p in enumerate(data["players"]) if p["id"] == values.get("firstId")), None)
                second = next((i for i,p in enumerate(data["players"]) if p["id"] == values.get("secondId")), None)
                if first is None or second is None or first == second:
                    raise ValueError("Choose two occupied seats to swap.")
                data["players"][first], data["players"][second] = data["players"][second], data["players"][first]
                data["token"] = engine.uid()
            elif action == "rematch":
                if not data.get("game") or data["game"]["phase"] != "finished":
                    raise ValueError("Finish this match before playing again.")
                game = data["game"]
                if player["id"] not in game["ready"]:
                    game["ready"].append(player["id"])
                if all(p["bot"] or p["id"] in game["ready"] for p in game["players"]):
                    data["players"] = [{k: p[k] for k in ("id", "key", "name", "bot", "lastSeen", "away")} | {"accountId": p.get("accountId")} for p in game["players"]]
                    start(data)
            elif action == "leave":
                if data["status"] == "lobby":
                    data["players"] = [p for p in data["players"] if p["id"] != player["id"]]
                else:
                    player.update(key=None, bot=True, away=False, name=player["name"] + " (bot)")
                if data["hostId"] == player["id"]:
                    candidates = [p for p in players(data) if p.get("key")]
                    data["hostId"] = candidates[0]["id"] if candidates else ""
                data["token"] = engine.uid()
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
            for row in MatchResult.query.order_by(MatchResult.completed_at.desc()).limit(1000):
                data = row.payload
                player = next((p for p in data["players"] if p.get("key") == key), None)
                if player:
                    recent.append({"id": row.id, "code": data["code"], "mode": data["mode"], "score": data["scores"][player["team"]], "won": player["team"] in data["winners"], "date": row.completed_at})
        return jsonify(recent[:30])

    @app.get(ROOT + "/leaderboard")
    def leaderboard():
        from .leaderboard import standings
        return jsonify(standings(request.args.get("mode", "practice"), accounts, lock))

    @socketio.on("connect", namespace=NAMESPACE)
    def socket_connect(auth):
        try:
            guard((auth or {}).get("csrf"))
            socket_actors[request.sid] = resolve_identity(transfer=False)
            return True
        except (PermissionError, AccountsUnavailable):
            return False

    @socketio.on("disconnect", namespace=NAMESPACE)
    def socket_disconnect(reason=None):
        socket_actors.pop(request.sid, None)

    @socketio.on("handandfoot:subscribe", namespace=NAMESPACE)
    def subscribe(values):
        try:
            key = resolve_identity(transfer=False)
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
        with app.app_context(), lock:
            rows = Room.query.filter(Room.updated_at > time.time() - 7 * 86400).all()
            for row in rows:
                data = copy.deepcopy(row.payload)
                game = data.get("game")
                if not game:
                    continue
                humans = [p for p in game["players"] if p.get("key")]
                # Practice pauses when nobody is present. Online seats keep their roster.
                if data["playMode"] == "practice" and all(time.time() - p["lastSeen"] > 120 for p in humans):
                    continue
                if not humans:
                    continue
                changed = False
                for player in humans:
                    if time.time() - player["lastSeen"] > 120 and not player["away"]:
                        player.update(away=True, bot=True)
                        changed = True
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
                        move = bots.decide(view)
                    try:
                        game = engine.apply(game, bot_seat, move)
                        data["game"] = game
                        changed = True
                    except ValueError:
                        app.logger.exception("Bot move rejected in table %s", row.code)
                elif game["phase"] in ("round_over", "finished"):
                    if all(p["bot"] or p["id"] in game["ready"] for p in game["players"]) and any(p["bot"] for p in game["players"]):
                        if game["phase"] == "round_over":
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
