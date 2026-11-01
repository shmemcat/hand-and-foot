"""Keep result evidence and active tables while retiring large room payloads."""

import copy
import time

from handandfoot_server.application import ROOT
from handandfoot_server.models import AchievementUnlock, MatchResult, Receipt, Room, db
from handandfoot_server.storage_cleanup import (
    RETENTION_SECONDS,
    cleanup_closed_games,
    mark_terminal,
)
from test_service import app, client, create, move


def finish(app, code, when, *, archive=True):
    with app.app_context():
        row = db.session.get(Room, code)
        data = copy.deepcopy(row.payload)
        data["game"].update(phase="finished", winners=[0])
        data["game"]["sides"][0]["score"] = 10000
        mark_terminal(data, when)
        row.payload, row.updated_at = data, when
        if archive:
            db.session.add(
                MatchResult(
                    id=data["game"]["matchId"],
                    completed_at=when,
                    payload={
                        "scores": [side["score"] for side in data["game"]["sides"]],
                        "winners": [0],
                        "history": [{"round": 1, "scores": [{"total": 10000}]}],
                        "players": [],
                    },
                )
            )
        db.session.add(
            Receipt(
                code=code,
                action_id="old-command",
                principal=data["players"][0]["key"],
                fingerprint="f" * 64,
                revision=data["revision"],
            )
        )
        db.session.commit()
        return data["game"]["matchId"]


def test_day_boundary_clears_cards_and_commands_but_preserves_final_scores(app):
    http, headers = client(app)
    room = create(http, headers, playMode="practice")
    now = time.time()
    match_id = finish(app, room["code"], now)
    with app.app_context():
        db.session.add(AchievementUnlock(user_id=1, achievement_id="geezer"))
        db.session.commit()
        result = copy.deepcopy(db.session.get(MatchResult, match_id).payload)
        cleanup = app.extensions["cleanup_storage"]
        assert cleanup(now + RETENTION_SECONDS - 1) == {
            "rooms_compacted": 0,
            "receipts_deleted": 0,
        }
        assert cleanup(now + RETENTION_SECONDS) == {
            "rooms_compacted": 1,
            "receipts_deleted": 1,
        }
        data = db.session.get(Room, room["code"]).payload
        assert data["_storage_pruned"] and data["game"] is None
        assert data["final_game"]["scores"][0] == 10000
        assert db.session.get(MatchResult, match_id).payload == result
        assert db.session.get(AchievementUnlock, (1, "geezer"))
        assert cleanup(now + RETENTION_SECONDS)["rooms_compacted"] == 0
    retired = http.get(f'{ROOT}/rooms/{room["code"]}')
    assert retired.status_code == 200 and retired.json["status"] == "closed"
    assert move(http, headers, room, "rematch").status_code == 400
    assert (
        move(http, headers, room, "choose", pile=0, action_id="old-command").status_code
        == 400
    )
    assert move(http, headers, room, "concede").json["left"]
    assert http.get(ROOT + "/active").json["rooms"] == []


def test_active_recent_and_unarchived_games_are_retained(app):
    http, headers = client(app)
    rooms = [create(http, headers, playMode="practice")["code"] for _ in range(3)]
    now = time.time()
    finish(app, rooms[1], now - 10)
    finish(app, rooms[2], now - RETENTION_SECONDS - 1, archive=False)
    with app.app_context():
        row = db.session.get(Room, rooms[0])
        row.updated_at = now - RETENTION_SECONDS * 100
        before = copy.deepcopy(row.payload)
        db.session.commit()
        assert app.extensions["cleanup_storage"](now)["rooms_compacted"] == 0
        assert db.session.get(Room, rooms[0]).payload == before
        assert all(db.session.get(Room, code).payload.get("game") for code in rooms)


def test_connected_result_view_is_retained_and_room_cleanup_is_batched(app):
    http, headers = client(app)
    rooms = [create(http, headers, playMode="practice")["code"] for _ in range(2)]
    now = time.time()
    for code in rooms:
        finish(app, code, now - RETENTION_SECONDS)
    with app.app_context():
        subscriptions = {"tab": (rooms[0], "owner")}
        assert cleanup_closed_games(subscriptions, now, limit=1)["rooms_compacted"] == 1
        assert not db.session.get(Room, rooms[0]).payload.get("_storage_pruned")
        assert cleanup_closed_games({}, now, limit=1)["rooms_compacted"] == 1


def test_account_deletion_understands_compacted_room_rosters(tmp_path):
    from test_accounts import Accounts, sign_in
    from handandfoot_server.application import create_app

    provider = Accounts()
    app = create_app(
        {
            "TESTING": True,
            "START_WORKER": False,
            "SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp_path / 'retired.sqlite'}",
            "SECRET_KEY": "test-secret-" * 4,
            "ACCOUNTS_PROVIDER": provider,
            "GAME_ACCOUNT_TOKENS": {"handandfoot": "callback-key-" * 4},
        }
    )
    provider.app = app
    http, headers = client(app)
    sign_in(http)
    room = create(http, headers, playMode="practice")
    now = time.time()
    finish(app, room["code"], now - RETENTION_SECONDS)
    with app.app_context():
        app.extensions["cleanup_storage"](now)
    response = app.test_client().post(
        "/_internal/games/v1/handandfoot/delete-user",
        json={"user_id": 1, "request_id": "a" * 32},
        headers={
            "X-Cards-Service": "accounts",
            "Authorization": "Bearer "
            + app.config["GAME_ACCOUNT_TOKENS"]["handandfoot"],
        },
    )
    assert response.json["deleted"]
    with app.app_context():
        data = db.session.get(Room, room["code"]).payload
        assert data["_storage_pruned"] and data["game"] is None
        assert not any(
            p.get("accountId") == 1 or p.get("key") == "account:1"
            for p in data["players"]
        )
