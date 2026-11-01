"""Track pending bot work in the single worker; rebuild once after a restart."""
import time

from flask import current_app, has_app_context
from sqlalchemy import event
from sqlalchemy.orm import Session

from . import engine
from .models import Room


def bot_seat(game):
    if game["phase"] == "choose":
        return next((i for i, p in enumerate(game["players"]) if p["bot"] and not p["chosen"]), None)
    if game["phase"] in ("draw", "play") and game["players"][game["actor"]]["bot"]:
        if game["phase"] != "draw" or not (engine.opening_pending(game) or engine.turn_pending(game)):
            return game["actor"]
    if game["phase"] == "scoring":
        team = next((side["team"] for side in game["scoring"]["sides"] if not side["confirmed"]
                     and all(p["bot"] for p in game["players"] if p["team"] == side["team"])), None)
        if team is not None:
            return next(i for i, p in enumerate(game["players"]) if p["team"] == team)
    return None


def round_ready(game):
    return (game["phase"] == "round_over"
            and any(p["bot"] for p in game["players"])
            and all(p["bot"] or p["id"] in game["ready"] for p in game["players"]))


def needs_work(data, now=None):
    game = data.get("game")
    if not game or data["status"] == "closed":
        return False
    humans = [p for p in game["players"] if p.get("key")]
    if not humans:
        return False
    now = time.time() if now is None else now
    if data["playMode"] == "practice" and all(now - p["lastSeen"] > 120 for p in humans):
        return False
    return bot_seat(game) is not None or round_ready(game)


def queue():
    if has_app_context():
        return current_app.extensions.get("handandfoot_work")
    return None


@event.listens_for(Session, "after_flush")
def stage_work(session, flush_context):
    if queue() is None:
        return
    changes = session.info.setdefault("handandfoot_work", {})
    for row in session.new | session.dirty:
        if isinstance(row, Room):
            changes[row.code] = needs_work(row.payload)
    for row in session.deleted:
        if isinstance(row, Room):
            changes[row.code] = False


@event.listens_for(Session, "after_commit")
def publish_work(session):
    changes = session.info.pop("handandfoot_work", {})
    pending = queue()
    if pending is not None:
        for code, runnable in changes.items():
            if runnable:
                pending.add(code)
            else:
                pending.discard(code)


@event.listens_for(Session, "after_rollback")
def discard_work(session):
    session.info.pop("handandfoot_work", None)
