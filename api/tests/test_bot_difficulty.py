"""Difficulty selection, persistence, and the live worker's selected policy."""
import copy
import pytest
from handandfoot_server import bots
from handandfoot_server.application import ROOT
from handandfoot_server.models import Room, db
from test_service import app, client, create, move


@pytest.mark.parametrize("difficulty", bots.DIFFICULTIES)
@pytest.mark.parametrize("mode", ["practice", "online"])
def test_create_and_start_preserve_the_selected_difficulty(app, difficulty, mode):
    http, headers = client(app)
    room = create(http, headers, capacity=2, scoringMode="individual", playMode=mode, botDifficulty=difficulty)
    assert room["botDifficulty"] == difficulty
    if mode == "online":
        room = move(http, headers, room, "start").json
    assert room["botDifficulty"] == difficulty
    assert http.get(f'{ROOT}/rooms/{room["code"]}').json["botDifficulty"] == difficulty


@pytest.mark.parametrize("difficulty", [None, True, 1, "expert", [], {}])
def test_invalid_difficulty_does_not_create_a_room(app, difficulty):
    http, headers = client(app)
    response = http.post(ROOT + "/rooms", headers=headers, json={
        "name": "Emily", "capacity": 2, "scoringMode": "individual", "playMode": "practice", "botDifficulty": difficulty,
    })
    assert response.status_code == 400
    with app.app_context():
        assert Room.query.count() == 0


def test_only_host_can_change_difficulty_and_options_update_independently(app):
    host, headers = client(app)
    room = create(host, headers)
    friend, friend_headers = client(app)
    friend.post(f'{ROOT}/rooms/{room["code"]}/join', headers=friend_headers, json={"name": "Friend"})
    current = friend.get(f'{ROOT}/rooms/{room["code"]}').json
    assert move(friend, friend_headers, current, "lobby_options", botDifficulty="hard").status_code == 403
    current = host.get(f'{ROOT}/rooms/{room["code"]}').json
    current = move(host, headers, current, "lobby_options", botDifficulty="hard").json
    assert current["botDifficulty"] == "hard" and current["lobbyFillBots"]
    invalid = move(host, headers, current, "lobby_options", botDifficulty="expert", fillBots=False)
    assert invalid.status_code == 400
    assert host.get(f'{ROOT}/rooms/{room["code"]}').json["lobbyFillBots"]
    current = move(host, headers, current, "lobby_options", fillBots=False).json
    assert current["botDifficulty"] == "hard" and not current["lobbyFillBots"]
    current = move(host, headers, current, "start", fillBots=True).json
    assert move(host, headers, current, "lobby_options", botDifficulty="easy").status_code == 403


@pytest.mark.parametrize("difficulty", bots.DIFFICULTIES)
def test_live_worker_passes_the_saved_difficulty_to_the_bot(app, monkeypatch, difficulty):
    http, headers = client(app)
    room = create(http, headers, playMode="practice", botDifficulty=difficulty)
    observed = []
    original = bots.decide

    def record(public, selected):
        observed.append(selected)
        return original(public, selected)

    monkeypatch.setattr(bots, "decide", record)
    app.extensions["tick"]()
    assert observed == [difficulty]


def test_saved_tables_without_a_difficulty_default_to_medium(app, monkeypatch):
    http, headers = client(app)
    room = create(http, headers, playMode="practice")
    with app.app_context():
        row = db.session.get(Room, room["code"])
        data = copy.deepcopy(row.payload)
        data.pop("botDifficulty")
        row.payload = data
        db.session.commit()
    assert http.get(f'{ROOT}/rooms/{room["code"]}').json["botDifficulty"] == "medium"
    observed = []
    original = bots.decide

    def record(public, selected):
        observed.append(selected)
        return original(public, selected)

    monkeypatch.setattr(bots, "decide", record)
    app.extensions["tick"]()
    assert observed == ["medium"]


def test_rematch_retains_the_difficulty(app):
    http, headers = client(app)
    room = create(http, headers, playMode="practice", botDifficulty="hard")
    with app.app_context():
        row = db.session.get(Room, room["code"])
        data = copy.deepcopy(row.payload)
        data["game"].update(phase="finished", winners=[0])
        row.payload = data
        db.session.commit()
    current = http.get(f'{ROOT}/rooms/{room["code"]}').json
    result = move(http, headers, current, "rematch")
    assert result.status_code == 200
    assert result.json["botDifficulty"] == "hard"
