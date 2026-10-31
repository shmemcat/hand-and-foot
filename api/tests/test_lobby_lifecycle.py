import copy
import time
import pytest
from handandfoot_server.application import ROOT, NAMESPACE, create_app
from handandfoot_server.models import MatchResult, Room, db
from handandfoot_server import engine
from test_accounts import app, sign_in
from test_service import client, create, move


def join(http, headers, code, *, seat=None):
    response = http.post(f"{ROOT}/rooms/{code}/join", headers=headers, json={"name": "Friend", "seat": seat})
    assert response.status_code == 200, response.json
    return response.json


def test_members_choose_open_seats_and_wait_without_losing_host_or_membership(app):
    host, auth = client(app)
    guest, guest_auth = client(app)
    room = create(host, auth, capacity=4)
    waiting = join(guest, guest_auth, room["code"])
    guest_id = waiting["viewerId"]
    assert [p["id"] for p in waiting["waitingPlayers"]] == [guest_id]
    assert sum(p is not None for p in waiting["lobbySeats"]) == 1
    current = host.get(f'{ROOT}/rooms/{room["code"]}').json
    assert move(host, auth, current, "start", fillBots=True).status_code == 400
    seated = move(guest, guest_auth, waiting, "seat", seat=2).json
    assert seated["lobbySeats"][2]["id"] == guest_id and seated["waitingPlayers"] == []
    assert move(guest, guest_auth, seated, "seat", seat=0).status_code == 400
    assert move(guest, guest_auth, seated, "seat", seat=True).status_code == 400
    room = host.get(f'{ROOT}/rooms/{room["code"]}').json
    room = move(host, auth, room, "unseat").json
    assert room["hostId"] == room["viewerId"] and room["lobbySeats"][0] is None
    assert [p["id"] for p in room["waitingPlayers"]] == [room["hostId"]]
    assert len(host.get(ROOT + "/active").json["rooms"]) == 1
    room = move(host, auth, room, "seat", seat=3).json
    started = move(host, auth, room, "start", fillBots=True).json
    assert started["players"][3]["id"] == room["viewerId"]
    assert started["players"][2]["id"] == guest_id
    assert len(started["players"]) == 4 and started["decks"] == 5
    assert move(host, auth, started, "unseat").status_code == 400


@pytest.mark.parametrize("seated", [False, True])
def test_host_can_remove_a_member_and_start_while_two_members_remain(app, seated):
    host, auth = client(app)
    guest, guest_auth = client(app)
    room = create(host, auth, capacity=4)
    other = join(guest, guest_auth, room["code"], seat=1 if seated else None)
    third, third_auth = client(app)
    join(third, third_auth, room["code"], seat=3)
    # Closing a tab sends no explicit leave action. The host can recover either
    # an occupied seat or an unseated member without losing the invite code.
    room = host.get(f'{ROOT}/rooms/{room["code"]}').json
    removed = move(host, auth, room, "remove_player", playerId=other["viewerId"])
    assert removed.status_code == 200
    room = removed.json
    assert len(room["players"]) == 2 and room["waitingPlayers"] == []
    assert room["hostId"] == room["viewerId"]
    assert guest.get(ROOT + "/active").json == {"rooms": []}
    response = guest.get(f'{ROOT}/rooms/{room["code"]}')
    assert response.status_code == 403 and response.json["code"] == "SEAT_REMOVED"
    assert response.json["error"] == "The host removed you from this lobby."
    started = move(host, auth, room, "start", fillBots=True)
    assert started.status_code == 200 and len(started.json["players"]) == 4
    assert all(p["id"] != other["viewerId"] for p in started.json["players"])
    with app.app_context():
        assert MatchResult.query.count() == 0


def test_removing_members_is_host_only_before_the_deal_and_allows_rejoining(app):
    host, auth = client(app)
    guest, guest_auth = client(app)
    room = create(host, auth, capacity=4)
    other = join(guest, guest_auth, room["code"], seat=1)
    third, third_auth = client(app)
    join(third, third_auth, room["code"], seat=3)
    other = guest.get(f'{ROOT}/rooms/{room["code"]}').json
    assert move(guest, guest_auth, other, "remove_player", playerId=room["viewerId"]).status_code == 403
    room = host.get(f'{ROOT}/rooms/{room["code"]}').json
    assert move(host, auth, room, "remove_player", playerId=room["viewerId"]).status_code == 400
    assert move(host, auth, room, "remove_player", playerId="missing").status_code == 400
    room = move(host, auth, room, "remove_player", playerId=other["viewerId"]).json
    other = join(guest, guest_auth, room["code"], seat=2)
    assert other["viewerId"] != room["viewerId"]
    room = host.get(f'{ROOT}/rooms/{room["code"]}').json
    started = move(host, auth, room, "start", fillBots=True).json
    assert move(host, auth, started, "remove_player", playerId=other["viewerId"]).status_code == 403


@pytest.mark.parametrize("seated", [False, True])
@pytest.mark.parametrize("entry", ["session", "active", "room", "join", "socket"])
def test_guest_sign_in_keeps_one_member_and_the_same_selected_or_waiting_seat(app, seated, entry):
    host, auth = client(app)
    guest, guest_auth = client(app)
    room = create(host, auth, capacity=4)
    before = join(guest, guest_auth, room["code"], seat=3 if seated else None)
    socket = app.extensions["socketio"].test_client(app, namespace=NAMESPACE, flask_test_client=guest,
        auth={"csrf": guest_auth["X-Handandfoot-CSRF"]}, headers={"Origin": "http://127.0.0.1:3004"})
    assert socket.is_connected(NAMESPACE)
    guest.set_cookie("cards_session", "2")
    replacement = None
    if entry == "session":
        assert guest.get(ROOT + "/session").status_code == 200
    elif entry == "active":
        assert len(guest.get(ROOT + "/active").json["rooms"]) == 1
    elif entry == "room":
        assert guest.get(f'{ROOT}/rooms/{room["code"]}').status_code == 200
    elif entry == "join":
        join(guest, guest_auth, room["code"])
    else:
        replacement = app.extensions["socketio"].test_client(app, namespace=NAMESPACE, flask_test_client=guest,
            auth={"csrf": guest_auth["X-Handandfoot-CSRF"]}, headers={"Origin": "http://127.0.0.1:3004"})
    after = guest.get(f'{ROOT}/rooms/{room["code"]}').json
    assert len(after["players"]) == 2 and after["viewerId"] == before["viewerId"]
    assert next(p for p in after["players"] if p["id"] == after["viewerId"])["name"] == "Player2"
    if seated:
        assert after["lobbySeats"][3]["id"] == before["viewerId"]
    else:
        assert after["waitingPlayers"][0]["id"] == before["viewerId"]
    assert not socket.is_connected(NAMESPACE)
    if replacement and replacement.is_connected(NAMESPACE):
        replacement.disconnect(namespace=NAMESPACE)


def test_sleeping_lobbies_persist_and_last_explicit_departure_closes_them(app, monkeypatch):
    now = [time.time()]
    monkeypatch.setattr("handandfoot_server.application.time.time", lambda: now[0])
    host, auth = client(app)
    guest, guest_auth = client(app)
    room = create(host, auth, capacity=4)
    other = join(guest, guest_auth, room["code"])
    now[0] += 30 * 86400
    app.extensions["tick"]()
    room = host.get(f'{ROOT}/rooms/{room["code"]}').json
    assert room["status"] == "lobby" and len(room["players"]) == 2
    assert move(host, auth, room, "leave").status_code == 200
    other = guest.get(f'{ROOT}/rooms/{room["code"]}').json
    assert other["hostId"] == other["viewerId"] and other["waitingPlayers"]
    assert other["status"] == "closed" and other["closedReason"] == "one_player"
    assert guest.get(ROOT + "/active").json == {"rooms": []}
    assert move(guest, guest_auth, other, "start").status_code == 400
    assert move(guest, guest_auth, other, "leave").status_code == 200
    with app.app_context():
        saved = db.session.get(Room, room["code"]).payload
        assert saved["status"] == "closed" and saved["players"] == []
        assert MatchResult.query.count() == 0
    assert host.post(f'{ROOT}/rooms/{room["code"]}/join', headers=auth, json={"name": "Back"}).status_code == 400


@pytest.fixture
def online(app, monkeypatch):
    now = [time.time()]
    monkeypatch.setattr("handandfoot_server.application.time.time", lambda: now[0])
    host, auth = client(app)
    guest, guest_auth = client(app)
    sign_in(host, "1")
    sign_in(guest, "2")
    room = create(host, auth, capacity=2, scoringMode="individual")
    join(guest, guest_auth, room["code"], seat=1)
    room = host.get(f'{ROOT}/rooms/{room["code"]}').json
    room = move(host, auth, room, "start").json
    room = move(host, auth, room, "choose", pile=0).json
    other = guest.get(f'{ROOT}/rooms/{room["code"]}').json
    other = move(guest, guest_auth, other, "choose", pile=1).json
    room = host.get(f'{ROOT}/rooms/{room["code"]}').json
    assert move(host, auth, room, "opening_ready").status_code == 200
    assert move(guest, guest_auth, other, "opening_ready").status_code == 200
    with app.app_context():
        row = db.session.get(Room, room["code"])
        data = copy.deepcopy(row.payload)
        data["game"]["actor"] = 0
        data["inactivity"] = {}
        row.payload = data
        db.session.commit()
    room = host.get(f'{ROOT}/rooms/{room["code"]}').json
    return host, auth, guest, guest_auth, room, now


def test_online_turns_never_warn_expire_or_replace_a_human(app, online):
    host, auth, guest, guest_auth, room, now = online
    for elapsed in (540, 60, 365 * 86400):
        now[0] += elapsed
        app.extensions["tick"]()
        current = host.get(f'{ROOT}/rooms/{room["code"]}').json
        assert not current.get("idleWarning")
        assert current["actorId"] == room["actorId"] and current["phase"] == room["phase"]
        assert current["hand"] == room["hand"] and current["token"] == room["token"]
        assert not any(p["bot"] for p in current["players"])
    assert len(host.get(ROOT + "/active").json["rooms"]) == 1
    assert len(guest.get(ROOT + "/active").json["rooms"]) == 1
    with app.app_context():
        engine.assert_conservation(db.session.get(Room, room["code"]).payload["game"])


@pytest.mark.parametrize("auto_create_schema", [False, True])
def test_service_restart_keeps_membership_and_cards_and_discards_legacy_clocks(app, online, auto_create_schema, monkeypatch):
    host, auth, guest, guest_auth, room, now = online
    room = move(host, auth, room, "draw").json
    with app.app_context():
        row = db.session.get(Room, room["code"])
        data = copy.deepcopy(row.payload)
        data["inactivity"] = {room["viewerId"]: {"startedAt": now[0] - 1000, "warned": True}}
        row.payload = data
        db.session.commit()
    if not auto_create_schema:
        monkeypatch.setattr("handandfoot_server.application.upgrade_schema", lambda: pytest.fail("Production restarts must not migrate the schema."))
    restarted = create_app({**app.config, "START_WORKER": False, "AUTO_CREATE_SCHEMA": auto_create_schema})
    app.extensions["accounts"].app = restarted
    now[0] += 365 * 86400
    restarted.extensions["tick"]()
    with restarted.app_context():
        data = db.session.get(Room, room["code"]).payload
        assert data["game"]["players"][0]["key"] == "account:1"
        assert data["game"]["players"][0]["away"]
        assert "inactivity" not in data
    recovered, _ = client(restarted)
    sign_in(recovered)
    current = recovered.get(f'{ROOT}/rooms/{room["code"]}').json
    assert current["hand"] == room["hand"] and current["phase"] == room["phase"]
    assert current["viewerId"] == room["viewerId"]
    assert recovered.get(ROOT + "/active").json["rooms"][0]["code"] == room["code"]


def test_account_outage_and_recovery_never_remove_membership(app, online):
    host, auth, guest, guest_auth, room, now = online
    app.extensions["accounts"].unavailable = True
    now[0] += 30 * 86400
    app.extensions["tick"]()
    with app.app_context():
        assert db.session.get(Room, room["code"]).payload["game"]["players"][0]["key"] == "account:1"
    app.extensions["accounts"].unavailable = False
    app.extensions["tick"]()
    assert host.get(f'{ROOT}/rooms/{room["code"]}').status_code == 200
    now[0] += 60
    app.extensions["tick"]()
    current = host.get(f'{ROOT}/rooms/{room["code"]}').json
    assert current["viewerId"] == room["viewerId"] and not current["players"][0]["bot"]


def test_conceding_to_one_remaining_player_closes_without_a_bot_or_match_result(app, online):
    host, auth, guest, guest_auth, room, now = online
    assert move(host, auth, room, "leave").status_code == 400
    assert move(host, auth, room, "concede", action_id="concession-12345").json == {"left": True}
    assert move(host, auth, room, "concede", action_id="concession-12345").json == {"left": True}
    closed = guest.get(f'{ROOT}/rooms/{room["code"]}').json
    assert closed["status"] == "closed" and closed["closedReason"] == "one_player"
    assert not any(p["bot"] for p in closed["players"])
    assert guest.get(ROOT + "/active").json == host.get(ROOT + "/active").json == {"rooms": []}
    assert move(guest, guest_auth, closed, "draw").status_code == 400
    assert host.get(f'{ROOT}/rooms/{room["code"]}').json["code"] == "SEAT_REMOVED"
    assert host.get(ROOT + "/scores").json == []
    assert guest.get(ROOT + "/leaderboard?mode=online").json["all_time"] == []
    departed = host.get(ROOT + "/achievements").json
    remaining = guest.get(ROOT + "/achievements").json
    assert departed["stats"]["all"]["games"] == departed["stats"]["online"]["games"] == departed["counters"]["games"] == 0
    assert remaining["stats"]["all"]["games"] == remaining["stats"]["online"]["games"] == remaining["counters"]["games"] == 0
    with app.app_context():
        assert MatchResult.query.count() == 0
    assert create(host, auth)["status"] == "lobby"
    assert create(guest, guest_auth)["status"] == "lobby"


def test_host_can_move_anywhere_and_the_first_seat_is_free_for_another_member(app):
    host, auth = client(app)
    guest, guest_auth = client(app)
    room = create(host, auth, capacity=4)
    room = move(host, auth, room, "seat", seat=3).json
    assert room["lobbySeats"][0] is None and room["lobbySeats"][3]["id"] == room["hostId"]
    other = join(guest, guest_auth, room["code"], seat=0)
    assert other["lobbySeats"][0]["id"] == other["viewerId"]
    assert other["hostId"] != other["viewerId"]


def test_only_host_sets_shared_start_options_and_individuals_can_start_with_fewer_players(app):
    host, auth = client(app)
    guest, guest_auth = client(app)
    room = create(host, auth, capacity=6, scoringMode="individual")
    other = join(guest, guest_auth, room["code"], seat=4)
    assert move(guest, guest_auth, other, "lobby_options", fillBots=False).status_code == 403
    room = host.get(f'{ROOT}/rooms/{room["code"]}').json
    room = move(host, auth, room, "lobby_options", fillBots=False).json
    assert not guest.get(f'{ROOT}/rooms/{room["code"]}').json["lobbyFillBots"]
    started = move(host, auth, room, "start").json
    assert started["capacity"] == 2 and started["decks"] == 3
    assert len(started["players"]) == 2 and not any(p["bot"] for p in started["players"])
    with app.app_context():
        engine.assert_conservation(db.session.get(Room, room["code"]).payload["game"])


@pytest.mark.parametrize("seats,valid", [([1, 3, 4], True), ([1, 2, 3], False)])
def test_starting_two_teams_without_bots_preserves_complete_partners(app, seats, valid):
    host, auth = client(app)
    room = create(host, auth, capacity=6)
    partners = [room["viewerId"]]
    for seat in seats:
        http, headers = client(app)
        other = join(http, headers, room["code"], seat=seat)
        partners.append(other["viewerId"])
    room = host.get(f'{ROOT}/rooms/{room["code"]}').json
    result = move(host, auth, room, "start", fillBots=False)
    if not valid:
        assert result.status_code == 400 and "partners" in result.json["error"]
        assert host.get(f'{ROOT}/rooms/{room["code"]}').json["capacity"] == 6
        return
    started = result.json
    assert started["capacity"] == 4 and started["decks"] == 5
    assert [p["id"] for p in started["players"] if p["team"] == 0] == [partners[0], partners[2]]
    assert not any(p["bot"] for p in started["players"])
