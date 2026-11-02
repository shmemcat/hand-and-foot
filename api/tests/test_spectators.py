import copy

from handandfoot_server.application import ROOT, NAMESPACE
from handandfoot_server.models import Room, db
from test_service import app, client, create, move


def test_started_invite_is_live_read_only_without_a_player_seat(app):
    host, auth = client(app)
    spectator, spec_auth = client(app)
    room = create(host, auth)
    started = move(host, auth, room, "start").json
    code = room["code"]
    with app.app_context():
        before = copy.deepcopy(db.session.get(Room, code).payload)
    view = spectator.get(f"{ROOT}/rooms/{code}").json
    assert view["spectating"] and view["viewerId"] == "" and view["token"] == ""
    assert view["hand"] == [] and view["footPreview"] is None and view["footTop"] is None
    assert view["scoring"] is None and view["scoringHand"] is None and view["scoringFoot"] is None
    assert all(p["footTop"] is None for p in view["players"])
    assert spectator.get(ROOT + "/active").json == {"rooms": []}
    joined = spectator.post(f"{ROOT}/rooms/{code}/join", headers=spec_auth, json={"name": "Watcher"})
    assert joined.json["spectating"]
    socketio = app.extensions["socketio"]
    socket = socketio.test_client(app, namespace=NAMESPACE, flask_test_client=spectator,
        auth={"csrf": spec_auth["X-Handandfoot-CSRF"]}, headers={"Origin": "http://127.0.0.1:3004"})
    assert socket.is_connected(NAMESPACE)
    assert socket.emit("handandfoot:subscribe", {"code": code}, namespace=NAMESPACE, callback=True)["ok"]
    for verb in ("choose", "opening_ready", "turn_ready", "draw", "next_round", "rematch", "leave", "concede"):
        assert move(spectator, spec_auth, view, verb, pile=0).status_code == 403
    with app.app_context():
        assert db.session.get(Room, code).payload == before
    assert move(host, auth, started, "choose", pile=0).status_code == 200
    assert any(e["name"] == "handandfoot:updated" for e in socket.get_received(NAMESPACE))
    assert spectator.get(f"{ROOT}/rooms/{code}").json["revision"] > view["revision"]
    assert host.get(f"{ROOT}/rooms/{code}").json["viewerId"] == started["viewerId"]
    socket.disconnect(namespace=NAMESPACE)


def test_practice_tables_stay_private(app):
    host, auth = client(app)
    spectator, _ = client(app)
    room = create(host, auth, playMode="practice")
    assert spectator.get(f'{ROOT}/rooms/{room["code"]}').status_code == 403
