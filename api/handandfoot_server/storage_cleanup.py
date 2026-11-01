"""Retire detailed room state without deleting durable scores or achievements."""

import copy
import time

from .models import MatchResult, Receipt, Room, db

RETENTION_SECONDS = 24 * 60 * 60
CLEANUP_INTERVAL_SECONDS = 60 * 60


def mark_terminal(data, now=None):
    now = time.time() if now is None else now
    if data["status"] == "closed":
        data.setdefault("_closed_at", now)
    game = data.get("game")
    if (
        game
        and game["phase"] == "finished"
        and data.get("_finished_game") != game["matchId"]
    ):
        data.update(_finished_game=game["matchId"], _finished_at=now)


def compact(data):
    game = data.get("game")
    roster = game["players"] if game else data["players"]
    people = []
    for index, person in enumerate(roster):
        people.append(
            {
                key: person.get(key)
                for key in (
                    "id",
                    "key",
                    "accountId",
                    "name",
                    "profileIcon",
                    "bot",
                    "lastSeen",
                    "away",
                )
            }
            | {"lobbySeat": index}
        )
    result = {
        key: data[key]
        for key in (
            "code",
            "capacity",
            "scoringMode",
            "playMode",
            "targetScore",
            "revision",
            "hostId",
            "token",
        )
    }
    result.update(
        _storage_pruned=True,
        _closed_at=data.get("_closed_at", data.get("_finished_at")),
        status="closed",
        closedReason=data.get("closedReason")
        or ("completed" if game and game["phase"] == "finished" else None),
        botDifficulty=data.get("botDifficulty", "medium"),
        players=people,
        game=None,
        removed=data.get("removed", {}),
        final_game=(
            {
                "id": game["matchId"],
                "scores": [side["score"] for side in game["sides"]],
                "winners": game.get("winners", []),
            }
            if game
            else data.get("final_game")
        ),
    )
    return result


def cleanup_closed_games(subscriptions, now=None, *, limit=200):
    now = time.time() if now is None else now
    cutoff = now - RETENTION_SECONDS
    connected = {code for code, _ in subscriptions.values()}
    compacted, receipts = 0, 0
    rows = Room.query.filter(
        Room.payload["_storage_pruned"].as_boolean().is_not(True)
    ).all()
    for row in rows:
        data = row.payload
        game = data.get("game")
        finished = bool(game and game["phase"] == "finished")
        if data["status"] != "closed" and not finished:
            continue
        terminal_at = (
            data.get("_closed_at")
            if data["status"] == "closed"
            else data.get("_finished_at")
        )
        terminal_at = terminal_at if terminal_at is not None else row.updated_at
        if terminal_at > cutoff or row.code in connected:
            continue
        # A final match whose archive has not committed must retain its source.
        if (
            finished
            and not game.get("endedByConcession")
            and not data.get("developmentFixture")
        ):
            if db.session.get(MatchResult, game["matchId"]) is None:
                continue
        row.payload = compact(copy.deepcopy(data))
        receipts += Receipt.query.filter_by(code=row.code).delete(
            synchronize_session=False
        )
        compacted += 1
        if compacted >= limit:
            break
    db.session.commit()
    return {"rooms_compacted": compacted, "receipts_deleted": receipts}
