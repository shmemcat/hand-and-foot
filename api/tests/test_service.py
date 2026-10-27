import copy
import time
import uuid
import pytest
from handandfoot_server.application import ROOT, NAMESPACE, create_app
from handandfoot_server.models import MatchResult, Room, db
from handandfoot_server import engine
from test_engine import book, take


@pytest.fixture
def app(tmp_path):
    return create_app({"TESTING": True, "START_WORKER": False, "SQLALCHEMY_DATABASE_URI": f"sqlite:///{tmp_path / 'game.sqlite'}", "SECRET_KEY": "test-secret-" * 4})


def client(app):
    http = app.test_client()
    csrf = http.get(ROOT + "/session").json["csrf"]
    return http, {"X-Handandfoot-CSRF": csrf, "Origin": "http://127.0.0.1:3004"}


def create(http, headers, **options):
    response = http.post(ROOT + "/rooms", headers=headers, json={"name": "Emily", "capacity": 4, "scoringMode": "partnership", "playMode": "online", **options})
    assert response.status_code == 200, response.json
    return response.json


def move(http, headers, snapshot, action, *, action_id=None, **values):
    body = {"actionId": action_id or str(uuid.uuid4()), "token": snapshot["token"], "revision": snapshot["revision"], "type": action, **values}
    return http.post(f'{ROOT}/rooms/{snapshot["code"]}/commands', headers=headers, json=body)


def test_room_privacy_csrf_and_lobby_seats(app):
    host, headers = client(app)
    other, other_headers = client(app)
    room = create(host, headers, capacity=8)
    assert room["decks"] == 9
    assert other.get(f'{ROOT}/rooms/{room["code"]}').status_code == 403
    assert host.post(ROOT + "/rooms", json={}).status_code == 403
    assert other.post(f'{ROOT}/rooms/{room["code"]}/join', headers=other_headers, json={"name": "Friend"}).status_code == 200
    room = host.get(f'{ROOT}/rooms/{room["code"]}').json
    assert [p["team"] for p in room["players"]] == [0, 1]
    nonhost = other.get(f'{ROOT}/rooms/{room["code"]}').json
    assert move(other, other_headers, nonhost, "start").status_code == 403
    started = move(host, headers, room, "start").json
    assert len(started["players"]) == 8 and started["decks"] == 9
    assert "key" not in str(started["players"])
    assert all("hand" not in p and "foot" not in p for p in started["players"])
    assert len(started["footPreview"]) == 2


def test_unique_action_receipts_stale_turns_and_invalid_atomic_move(app):
    http, headers = client(app)
    room = create(http, headers, playMode="practice", capacity=2, scoringMode="individual")
    action_id = str(uuid.uuid4())
    chosen = move(http, headers, room, "choose", pile=0, action_id=action_id)
    assert chosen.status_code == 200
    duplicate = move(http, headers, room, "choose", pile=0, action_id=action_id)
    assert duplicate.json == chosen.json
    assert move(http, headers, room, "choose", pile=1, action_id=action_id).status_code == 400
    app.extensions["tick"]()
    room = http.get(f'{ROOT}/rooms/{room["code"]}').json
    # Put the human in the active seat without changing any physical cards.
    with app.app_context():
        row = db.session.get(Room, room["code"])
        data = copy.deepcopy(row.payload)
        data["game"]["actor"] = 0
        row.payload = data
        db.session.commit()
    room = http.get(f'{ROOT}/rooms/{room["code"]}').json
    draw_id = str(uuid.uuid4())
    drawn = move(http, headers, room, "draw", action_id=draw_id)
    assert drawn.status_code == 200
    assert len(drawn.json["hand"]) == 13
    duplicate = move(http, headers, room, "draw", action_id=draw_id)
    assert len(duplicate.json["hand"]) == 13
    assert move(http, headers, room, "draw").status_code == 409
    before = copy.deepcopy(drawn.json)
    invalid = move(http, headers, drawn.json, "meld", groups=[{"cardIds": ["not-yours", "another", "nope"]}])
    assert invalid.status_code == 400
    after = http.get(f'{ROOT}/rooms/{room["code"]}').json
    assert after == before


def test_independent_pile_choices_and_presence_do_not_stale_other_player(app):
    host, headers = client(app)
    friend, friend_headers = client(app)
    room = create(host, headers, capacity=2, scoringMode="individual")
    friend.post(f'{ROOT}/rooms/{room["code"]}/join', headers=friend_headers, json={"name": "Friend"})
    room = host.get(f'{ROOT}/rooms/{room["code"]}').json
    started = move(host, headers, room, "start").json
    other_view = friend.get(f'{ROOT}/rooms/{room["code"]}').json
    host.get(f'{ROOT}/rooms/{room["code"]}')
    assert move(host, headers, started, "choose", pile=0).status_code == 200
    response = move(friend, friend_headers, other_view, "choose", pile=1)
    assert response.status_code == 200
    assert response.json["phase"] == "draw"


def test_restart_preserves_private_state_and_scoring_review(app):
    http, headers = client(app)
    room = create(http, headers, playMode="practice")
    room = move(http, headers, room, "choose", pile=1).json
    cookies = http.get_cookie("handandfoot_session")
    restarted = create_app({**app.config, "START_WORKER": False})
    recovered = restarted.test_client()
    recovered.set_cookie("handandfoot_session", cookies.value)
    assert recovered.get(f'{ROOT}/rooms/{room["code"]}').json == room
    with app.app_context():
        row = db.session.get(Room, room["code"])
        data = copy.deepcopy(row.payload)
        engine.finish_round(data["game"], None, "Restart in scoring")
        row.payload = data
        db.session.commit()
    view = recovered.get(f'{ROOT}/rooms/{room["code"]}').json
    assert view["phase"] == "scoring"
    assert view["scoring"]["debt"] > 0


def test_socket_auth_and_notifications_have_no_private_faces(app):
    http, headers = client(app)
    room = create(http, headers)
    socketio = app.extensions["socketio"]
    rejected = socketio.test_client(app, namespace=NAMESPACE, flask_test_client=http, auth={"csrf": "wrong"})
    assert not rejected.is_connected(NAMESPACE)
    socket = socketio.test_client(app, namespace=NAMESPACE, flask_test_client=http, auth={"csrf": headers["X-Handandfoot-CSRF"]})
    assert socket.is_connected(NAMESPACE)
    socket.emit("handandfoot:subscribe", {"code": room["code"]}, namespace=NAMESPACE)
    assert move(http, headers, room, "start").status_code == 200
    updates = socket.get_received(NAMESPACE)
    assert updates and updates[0]["name"] == "handandfoot:updated"
    assert set(updates[0]["args"][0]) == {"code", "revision"}
    socket.disconnect(namespace=NAMESPACE)


def test_bot_takeover_and_reclaim_preserve_roster_decks_and_foot(app):
    http, headers = client(app)
    room = create(http, headers, playMode="online")
    room = move(http, headers, room, "start").json
    with app.app_context():
        row = db.session.get(Room, room["code"])
        data = copy.deepcopy(row.payload)
        human = data["game"]["players"][0]
        before = copy.deepcopy(human["piles"])
        human["lastSeen"] = time.time() - 121
        row.payload = data
        db.session.commit()
    app.extensions["tick"]()
    with app.app_context():
        game = db.session.get(Room, room["code"]).payload["game"]
        assert game["players"][0]["away"] and game["players"][0]["bot"]
        assert len(game["players"]) == 4
        assert len(game["cards"]) == 270
    reclaimed = http.get(f'{ROOT}/rooms/{room["code"]}').json
    assert not reclaimed["players"][0]["away"] and not reclaimed["players"][0]["bot"]
    assert reclaimed["decks"] == 5


def test_results_saved_once_and_survive_rematch(app):
    http, headers = client(app)
    room = create(http, headers, playMode="practice", scoringMode="individual", capacity=2)
    with app.app_context():
        row = db.session.get(Room, room["code"])
        data = copy.deepcopy(row.payload)
        game = data["game"]
        game.update(stock=list(game["cards"]), discard=[], replaced=[], phase="play")
        for player in game["players"]:
            player.update(hand=[], foot=[], piles=[], redThrees=[], chosen=True, inFoot=True)
        book(game, "K", team=0)
        game["sides"][0]["score"] = 9900
        engine.finish_round(game, 0, "Test finish")
        row.payload = data
        db.session.commit()
    room = http.get(f'{ROOT}/rooms/{room["code"]}').json
    room = move(http, headers, room, "score_confirm").json
    app.extensions["tick"]()
    room = http.get(f'{ROOT}/rooms/{room["code"]}').json
    assert room["phase"] == "finished"
    result = http.get(ROOT + "/scores").json
    assert len(result) == 1 and result[0]["won"]
    room = move(http, headers, room, "rematch").json
    assert room["phase"] == "choose"
    assert http.get(ROOT + "/scores").json == result
    with app.app_context():
        assert MatchResult.query.count() == 1
        assert MatchResult.query.one().payload["playMode"] == "practice"


def test_rooms_are_independent_and_leaving_does_not_shrink_roster(app):
    http, headers = client(app)
    first = create(http, headers, playMode="practice")
    second = create(http, headers, playMode="practice")
    second_before = http.get(f'{ROOT}/rooms/{second["code"]}').json
    move(http, headers, first, "choose", pile=0)
    assert http.get(f'{ROOT}/rooms/{second["code"]}').json == second_before
    first = http.get(f'{ROOT}/rooms/{first["code"]}').json
    assert move(http, headers, first, "leave").status_code == 200
    assert http.get(f'{ROOT}/rooms/{first["code"]}').status_code == 403
    with app.app_context():
        game = db.session.get(Room, first["code"]).payload["game"]
        assert len(game["players"]) == 4 and len(game["cards"]) == 270


def test_off_origin_mutations_rejected(app):
    http, headers = client(app)
    headers["Origin"] = "https://another-site.example"
    assert http.post(ROOT + "/rooms", headers=headers, json={}).status_code == 403


def test_red_threes_can_be_played_together_through_the_api_after_opening(app):
    http, headers = client(app)
    room = create(http, headers, playMode="practice", scoringMode="individual", capacity=2)
    with app.app_context():
        row = db.session.get(Room, room["code"])
        data = copy.deepcopy(row.payload)
        game = data["game"]
        game.update(stock=list(game["cards"]), discard=[], replaced=[], phase="play", actor=0)
        for player in game["players"]:
            player.update(hand=[], foot=[], piles=[], redThrees=[], chosen=True, inFoot=False)
        aces = take(game, "A", 3)
        reds = take(game, "3", 1, "hearts") + take(game, "3", 1, "diamonds")
        tail = take(game, "4", 4)
        game["players"][0]["hand"] = aces + reds + tail
        row.payload = data
        db.session.commit()
    room = http.get(f'{ROOT}/rooms/{room["code"]}').json
    rejected = move(http, headers, room, "red_three", cardIds=reds, expose=True)
    assert rejected.status_code == 400 and "opening meld" in rejected.json["error"]
    opened = move(http, headers, room, "meld", groups=[{"cardIds": aces}])
    assert opened.status_code == 200
    result = move(http, headers, opened.json, "red_three", cardIds=reds, expose=True)
    assert result.status_code == 200, result.json
    assert [card["id"] for card in result.json["players"][0]["redThrees"]] == reds
    assert [card["id"] for card in result.json["hand"]] == tail
    assert result.json["phase"] == "play" and result.json["actorId"] == room["viewerId"]
    refreshed = http.get(f'{ROOT}/rooms/{room["code"]}').json
    assert refreshed["players"][0]["redThrees"] == result.json["players"][0]["redThrees"]
