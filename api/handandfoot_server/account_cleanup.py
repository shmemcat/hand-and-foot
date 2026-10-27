"""Idempotent account-owned deletion callback for this game's records only."""
import copy
import re
import secrets
from . import engine
from flask import jsonify, request
from .models import DeletedAccount, MatchResult, Receipt, Room, db


def scrub_text(value, names):
    if isinstance(value, list):
        return [scrub_text(item, names) for item in value]
    if not isinstance(value, dict):
        return value
    result = {}
    for key, item in value.items():
        if key == "name" and item in names:
            item = "Deleted player"
        elif key in {"message", "reason"} and isinstance(item, str):
            for name in sorted(names, key=len, reverse=True):
                item = re.sub(r"(?<!\w)" + re.escape(name) + r"(?!\w)", "Deleted player", item)
        result[key] = scrub_text(item, names)
    return result


def register_cleanup(app, lock, announce):
    @app.post("/_internal/games/v1/handandfoot/delete-user")
    def delete_user():
        expected = app.config["GAME_ACCOUNT_TOKENS"].get("handandfoot", "")
        if (len(expected) < 32 or request.headers.get("X-Cards-Service") != "accounts"
                or not secrets.compare_digest(request.headers.get("Authorization", ""), "Bearer " + expected)):
            return jsonify(error="Not authorized"), 403
        value = request.get_json(silent=True)
        if (not isinstance(value, dict) or type(value.get("user_id")) is not int
                or not 0 < value["user_id"] < 2**63
                or not isinstance(value.get("request_id"), str)
                or not re.fullmatch(r"[a-f0-9]{32}", value["request_id"])):
            return jsonify(error="Invalid deletion request"), 400
        uid, receipt = value["user_id"], value["request_id"]
        principal = f"account:{uid}"
        changed = []
        with lock:
            names = set()
            for row in Room.query.all():
                groups = [row.payload["players"]]
                if row.payload.get("game"):
                    groups.append(row.payload["game"]["players"])
                for group in groups:
                    names.update(p["name"] for p in group if p.get("key") == principal or p.get("accountId") == uid)
            if not db.session.get(DeletedAccount, uid):
                db.session.add(DeletedAccount(user_id=uid, request_id=receipt))
            for row in Room.query.all():
                data = copy.deepcopy(row.payload)
                touched = False
                for group in [data["players"], data.get("game", {}).get("players", []) if data.get("game") else []]:
                    for player in group:
                        if player.get("key") == principal or player.get("accountId") == uid:
                            player.update(key=None, accountId=None, name="Deleted player", bot=True, away=False)
                            touched = True
                if not touched:
                    continue
                roster = data["game"]["players"] if data.get("game") else data["players"]
                if data["status"] == "lobby":
                    data["players"] = [p for p in roster if p.get("key")]
                    roster = data["players"]
                if not any(p["id"] == data["hostId"] and p.get("key") for p in roster):
                    data["hostId"] = next((p["id"] for p in roster if p.get("key")), "")
                if data.get("game"):
                    for side in data["game"]["sides"]:
                        side["name"] = " & ".join(p["name"] for p in roster if p["team"] == side["id"])
                data["revision"] += 1
                data["token"] = engine.uid()
                row.payload = scrub_text(data, names)
                changed.append((row.code, data["revision"]))
            for row in MatchResult.query.all():
                data = copy.deepcopy(row.payload)
                if any(p.get("key") == principal or p.get("accountId") == uid for p in data["players"]):
                    for player in data["players"]:
                        if player.get("key") == principal or player.get("accountId") == uid:
                            player["key"] = None
                            player["accountId"] = None
                    row.payload = scrub_text(data, names)
            Receipt.query.filter_by(principal=principal).update({"principal": "deleted"})
            db.session.commit()
        for code, revision in changed:
            announce(code, revision)
        return jsonify(version=1, deleted=True, request_id=receipt)
