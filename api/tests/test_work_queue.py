import copy
import time

from sqlalchemy import event
from handandfoot_server.application import create_app
from handandfoot_server.models import Room, db
from handandfoot_server import engine
from test_service import app, client, create


def paused_game():
    return engine.new_game([
        dict(id=str(i), name=f"Player {i}", key="human" if i == 0 else None,
             bot=i != 0, lastSeen=0, away=True)
        for i in range(6)
    ], "individual", seed=42)


def test_idle_tick_does_not_query_120_paused_or_closed_rooms(app):
    with app.app_context():
        game = paused_game()
        for i in range(120):
            db.session.add(Room(code=str(i).zfill(6), updated_at=0, payload={
                "code": str(i).zfill(6), "status": "closed" if i % 2 else "playing",
                "playMode": "practice", "game": game,
            }))
        db.session.commit()
        assert not app.extensions["handandfoot_work"]
        statements = []
        listener = lambda connection, cursor, statement, parameters, context, many: statements.append(statement)
        event.listen(db.engine, "before_cursor_execute", listener)
        try:
            for _ in range(3):
                app.extensions["tick"]()
        finally:
            event.remove(db.engine, "before_cursor_execute", listener)
        assert statements == []


def test_reopening_a_paused_bot_game_queues_only_that_room(app):
    http, headers = client(app)
    room = create(http, headers, playMode="practice")
    code = room["code"]
    with app.app_context():
        row = db.session.get(Room, code)
        data = copy.deepcopy(row.payload)
        data["game"]["players"][0]["lastSeen"] = time.time() - 121
        row.payload = data
        db.session.commit()
        assert code not in app.extensions["handandfoot_work"]
    http.get(f"/api/hand-and-foot/rooms/{code}")
    assert app.extensions["handandfoot_work"] == {code}
    app.extensions["tick"]()
    with app.app_context():
        game = db.session.get(Room, code).payload["game"]
        assert sum(p["chosen"] for p in game["players"] if p["bot"]) == 1


def test_pending_work_survives_restart_and_rollback_does_not_publish_it(app):
    http, headers = client(app)
    room = create(http, headers, playMode="practice")
    code = room["code"]
    restarted = create_app({**app.config, "START_WORKER": False})
    assert restarted.extensions["handandfoot_work"] == {code}
    restarted.extensions["tick"]()
    with app.app_context():
        row = db.session.get(Room, code)
        data = copy.deepcopy(row.payload)
        data["status"] = "closed"
        row.payload = data
        db.session.flush()
        assert code in app.extensions["handandfoot_work"]
        db.session.rollback()
        assert code in app.extensions["handandfoot_work"]
