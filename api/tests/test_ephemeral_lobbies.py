import pytest
from handandfoot_server.application import ROOT, NAMESPACE
from handandfoot_server.models import Room, db
from test_accounts import app
from test_service import client, create, move
from test_saved_multiplayer import socket_for


def test_last_lobby_connection_closes_waiting_room_and_reconnect_cancels_cleanup(app, monkeypatch):
    http, headers = client(app)
    room = create(http, headers)
    socketio = app.extensions["socketio"]
    tasks, delays = [], []
    monkeypatch.setattr(socketio, "start_background_task", lambda fn: tasks.append(fn))
    monkeypatch.setattr(socketio, "sleep", delays.append)
    first = socket_for(app, (http, headers), room["code"])
    first.disconnect(namespace=NAMESPACE)
    returning = socket_for(app, (http, headers), room["code"])
    tasks.pop(0)()
    assert http.get(f'{ROOT}/rooms/{room["code"]}').json["status"] == "lobby"
    returning.disconnect(namespace=NAMESPACE)
    tasks.pop(0)()
    with app.app_context():
        assert db.session.get(Room, room["code"]).payload["status"] == "closed"
    assert http.get(ROOT + "/active").json == {"rooms": []}
    assert delays == [120, 120]


def test_started_game_remains_resumable_when_last_connection_leaves(app, monkeypatch):
    http, headers = client(app)
    room = create(http, headers)
    started = move(http, headers, room, "start").json
    tasks = []
    monkeypatch.setattr(app.extensions["socketio"], "start_background_task", lambda fn: tasks.append(fn))
    socket = socket_for(app, (http, headers), room["code"])
    socket.disconnect(namespace=NAMESPACE)
    assert tasks == []
    assert http.get(ROOT + "/active").json["rooms"][0]["code"] == started["code"]


@pytest.mark.parametrize("guest_also_leaves", [False, True])
def test_waiting_member_expires_and_host_migrates_only_after_the_last_tab_disconnects(app, monkeypatch, guest_also_leaves):
    host, auth = client(app)
    guest, guest_auth = client(app)
    room = create(host, auth)
    joined = guest.post(f'{ROOT}/rooms/{room["code"]}/join', headers=guest_auth, json={"name": "Guest", "seat": 1})
    assert joined.status_code == 200
    socketio = app.extensions["socketio"]
    tasks, delays = [], []
    monkeypatch.setattr(socketio, "start_background_task", lambda fn: tasks.append(fn))
    monkeypatch.setattr(socketio, "sleep", delays.append)
    first = socket_for(app, (host, auth), room["code"])
    other_tab = socket_for(app, (host, auth), room["code"])
    friend = socket_for(app, (guest, guest_auth), room["code"])
    first.disconnect(namespace=NAMESPACE)
    assert tasks == []
    other_tab.disconnect(namespace=NAMESPACE)
    assert len(guest.get(f'{ROOT}/rooms/{room["code"]}').json["players"]) == 2
    if guest_also_leaves:
        friend.disconnect(namespace=NAMESPACE)
    tasks.pop(0)()
    current = guest.get(f'{ROOT}/rooms/{room["code"]}').json
    assert current["status"] == "lobby" and current["hostId"] == current["viewerId"]
    assert len(current["players"]) == 1
    assert host.get(f'{ROOT}/rooms/{room["code"]}').status_code == 403
    if not guest_also_leaves:
        friend.disconnect(namespace=NAMESPACE)
    assert guest.get(f'{ROOT}/rooms/{room["code"]}').json["status"] == "lobby"
    tasks.pop(0)()
    assert guest.get(f'{ROOT}/rooms/{room["code"]}').json["status"] == "closed"
    assert delays == [120, 120]
