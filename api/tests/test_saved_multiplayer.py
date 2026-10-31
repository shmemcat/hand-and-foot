"""Saved online seats, explicit concessions, and durable multiplayer groups."""
import copy
import time
import pytest
from handandfoot_server import engine, scoring
from handandfoot_server.application import ROOT, NAMESPACE
from handandfoot_server.models import MatchResult, Room, db
from test_accounts import app, sign_in
from test_service import client, create, move
from test_play_modes import prepare_last_round, confirm
from test_engine import book


def online_group(app, count=6, scoring_mode="partnership"):
    members = [client(app) for _ in range(count)]
    for uid, (http, _) in enumerate(members, 1):
        sign_in(http, str(uid))
    host, auth = members[0]
    room = create(host, auth, capacity=count, scoringMode=scoring_mode)
    for seat, (http, headers) in enumerate(members[1:], 1):
        response = http.post(f'{ROOT}/rooms/{room["code"]}/join', headers=headers, json={"name": "Friend", "seat": seat})
        assert response.status_code == 200, response.json
    room = host.get(f'{ROOT}/rooms/{room["code"]}').json
    room = move(host, auth, room, "start", fillBots=False).json
    return members, room


def socket_for(app, member, code):
    http, auth = member
    socket = app.extensions["socketio"].test_client(app, namespace=NAMESPACE, flask_test_client=http,
        auth={"csrf": auth["X-Handandfoot-CSRF"]})
    assert socket.is_connected(NAMESPACE)
    assert socket.emit("handandfoot:subscribe", {"code": code}, namespace=NAMESPACE, callback=True) == {"ok": True}
    return socket


def view(member, code):
    return member[0].get(f"{ROOT}/rooms/{code}").json


def concede(member, code, **kwargs):
    response = move(*member, view(member, code), "concede", **kwargs)
    assert response.status_code == 200, response.json


def set_phase(app, members, code, phase, *, actor=4, dealer=1):
    if phase != "choose":
        for member in members:
            assert move(*member, view(member, code), "choose", pile=0).status_code == 200
    with app.app_context():
        row = db.session.get(Room, code)
        data = copy.deepcopy(row.payload)
        game = data["game"]
        game.update(actor=actor, dealer=dealer)
        if phase != "choose":
            game.update(openingComplete=True, phase=phase if phase in ("draw", "play") else "play")
        if phase in ("scoring", "round_over"):
            book(game, "K", team=1)
            engine.finish_round(game, 1, "Scoring before concession")
        if phase == "round_over":
            for side in game["sides"]:
                while scoring.options(game, side["id"]):
                    scoring.pay(game, side["id"], scoring.auto_choice(game, side["id"]))
                scoring.confirm(game, side["id"])
        engine.assert_conservation(game)
        row.payload = data
        db.session.commit()
        return copy.deepcopy(game)


def test_last_connection_marks_away_and_http_or_another_player_cannot_reclaim_it(app):
    members, room = online_group(app, 2, "individual")
    code = room["code"]
    first = socket_for(app, members[1], code)
    second = socket_for(app, members[1], code)
    private_piles = view(members[1], code)["footPreview"]
    first.disconnect(namespace=NAMESPACE)
    assert not view(members[0], code)["players"][1]["away"]
    second.disconnect(namespace=NAMESPACE)
    paused = view(members[0], code)
    assert paused["players"][1]["away"] and not paused["players"][1]["bot"]
    assert view(members[1], code)["players"][1]["away"]
    assert members[1][0].get(ROOT + "/active").json["rooms"][0]["code"] == code
    outsider = client(app)
    sign_in(outsider[0], "3")
    socket = app.extensions["socketio"].test_client(app, namespace=NAMESPACE, flask_test_client=outsider[0], auth={"csrf": outsider[1]["X-Handandfoot-CSRF"]})
    assert "error" in socket.emit("handandfoot:subscribe", {"code": code}, namespace=NAMESPACE, callback=True)
    assert view(members[0], code)["players"][1]["away"]
    socket.disconnect(namespace=NAMESPACE)
    returning = socket_for(app, members[1], code)
    rejoined = view(members[1], code)
    assert not rejoined["players"][1]["away"]
    assert rejoined["footPreview"] == private_piles
    assert rejoined["players"][1]["id"] == paused["players"][1]["id"]
    returning.disconnect(namespace=NAMESPACE)


def test_everyone_can_disconnect_for_a_year_without_closing_or_changing_private_cards(app, monkeypatch):
    members, room = online_group(app, 2, "individual")
    sockets = [socket_for(app, member, room["code"]) for member in members]
    with app.app_context():
        original = copy.deepcopy(db.session.get(Room, room["code"]).payload["game"])
    for socket in sockets:
        socket.disconnect(namespace=NAMESPACE)
    now = time.time()
    monkeypatch.setattr("handandfoot_server.application.time.time", lambda: now + 365 * 86400)
    app.extensions["tick"]()
    with app.app_context():
        data = db.session.get(Room, room["code"]).payload
        assert data["status"] == "playing"
        assert data["game"]["cards"] == original["cards"]
        for before, after in zip(original["players"], data["game"]["players"]):
            assert after["key"] == before["key"] and after["piles"] == before["piles"]
            assert after["away"] and not after["bot"]
        engine.assert_conservation(data["game"])
    for member in members:
        assert member[0].get(ROOT + "/active").json["rooms"][0]["code"] == room["code"]


def test_conceding_partner_is_replaced_by_a_hard_bot_with_the_same_cards(app, monkeypatch):
    members, room = online_group(app, 4)
    original = set_phase(app, members, room["code"], "draw", actor=0, dealer=1)
    assert move(*members[0], view(members[0], room["code"]), "leave").status_code == 400
    concede(members[0], room["code"])
    current = view(members[1], room["code"])
    assert current["players"][0]["id"] == original["players"][0]["id"]
    assert current["players"][0]["bot"] and not current["players"][0]["away"]
    assert current["hostId"] == current["players"][1]["id"]
    assert members[0][0].get(ROOT + "/active").json == {"rooms": []}
    assert members[0][0].post(f'{ROOT}/rooms/{room["code"]}/join', headers=members[0][1], json={"name": "Back"}).status_code == 400
    observed = []
    monkeypatch.setattr("handandfoot_server.bots.decide", lambda snapshot, difficulty: observed.append(difficulty) or {"type": "draw"})
    app.extensions["tick"]()
    assert observed == ["hard"]
    with app.app_context():
        game = db.session.get(Room, room["code"]).payload["game"]
        assert game["players"][0]["hand"][:11] == original["players"][0]["hand"]
        assert game["players"][0]["foot"] == original["players"][0]["foot"]
        assert game["players"][0]["key"] is None
        engine.assert_conservation(game)


@pytest.mark.parametrize("phase", ["choose", "draw", "play", "scoring", "round_over"])
def test_last_partner_concession_removes_the_team_in_every_phase_without_losing_cards(app, phase):
    members, room = online_group(app)
    code = room["code"]
    original = set_phase(app, members, code, phase)
    concede(members[1], code)
    concede(members[4], code)
    current = view(members[0], code)
    assert current["status"] == "playing" and len(current["players"]) == 4
    assert [p["id"] for p in current["players"]] == [p["id"] for p in original["players"] if p["team"] != 1]
    assert [p["team"] for p in current["players"]] == [0, 1, 0, 1]
    assert current["actorId"] == original["players"][5]["id"]
    assert current["dealerId"] == original["players"][0]["id"]
    assert current["decks"] == 7 and not any(p["bot"] for p in current["players"])
    with app.app_context():
        data = db.session.get(Room, code).payload
        game = data["game"]
        assert data["capacity"] == 4 and len(game["cards"]) == len(original["cards"])
        assert game["stock"] == original["stock"] and game["discard"] == original["discard"]
        assert len(game["replaced"]) > len(original["replaced"])
        if phase == "play":
            assert game["phase"] == "draw" and not game["pickupDrawPending"]
        if phase == "scoring":
            assert [s["team"] for s in game["scoring"]["sides"]] == [0, 1]
            assert game["scoring"]["wentOut"] is None
        for record in game["history"]:
            assert [s["team"] for s in record["scores"]] == [0, 1]
        engine.assert_conservation(game)
        engine.deal_round(game)
        assert len(game["cards"]) == 270 and game["replaced"] == []
        engine.assert_conservation(game)


def test_last_opposing_team_can_concede_and_remaining_partners_can_start_again(app):
    members, room = online_group(app, 4)
    set_phase(app, members, room["code"], "play", actor=0, dealer=1)
    concede(members[1], room["code"])
    concede(members[3], room["code"])
    finished = view(members[0], room["code"])
    assert finished["phase"] == "finished" and finished["status"] == "playing"
    assert finished["winners"] == [0] and len(finished["players"]) == 2
    assert members[0][0].get(ROOT + "/scores").json == []
    response = move(*members[0], finished, "rematch")
    assert response.status_code == 200, response.json
    next_game = response.json
    assert next_game["phase"] == "choose" and len(next_game["players"]) == 4
    assert next_game["players"][0]["id"] == finished["players"][0]["id"]
    assert next_game["players"][2]["id"] == finished["players"][1]["id"]
    with app.app_context():
        assert MatchResult.query.count() == 0


def test_removing_the_only_unconfirmed_team_completes_scoring_once(app):
    members, room = online_group(app)
    code = room["code"]
    set_phase(app, members, code, "scoring")
    confirm(*members[0], code)
    confirm(*members[2], code)
    concede(members[1], code)
    concede(members[4], code)
    current = view(members[0], code)
    assert current["phase"] == "round_over" and len(current["history"]) == 1
    assert [s["team"] for s in current["history"][0]["scores"]] == [0, 1]
    app.extensions["tick"]()
    assert view(members[0], code)["history"] == current["history"]
    for seat in (0, 2, 3, 5):
        assert move(*members[seat], view(members[seat], code), "next_round").status_code == 200
    current = view(members[0], code)
    assert current["round"] == 2 and current["phase"] == "choose" and current["decks"] == 5


def test_a_conceding_players_bot_cannot_earn_results_for_the_departed_account(app):
    members, room = online_group(app, 4)
    concede(members[0], room["code"])
    prepare_last_round(app, room["code"])
    confirm(*members[1], room["code"])
    confirm(*members[2], room["code"])
    assert view(members[1], room["code"])["phase"] == "finished"
    assert members[0][0].get(ROOT + "/scores").json == []
    assert members[2][0].get(ROOT + "/scores").json[0]["won"]
    assert members[0][0].get(ROOT + "/achievements").json["stats"]["online"]["games"] == 0
    with app.app_context():
        assert MatchResult.query.count() == 1


def test_individual_concession_removes_that_side_and_last_opponent_closes_the_lobby(app):
    members, room = online_group(app, 3, "individual")
    set_phase(app, members, room["code"], "play", actor=1, dealer=0)
    concede(members[1], room["code"])
    current = view(members[0], room["code"])
    assert len(current["players"]) == 2 and current["phase"] == "draw"
    assert current["actorId"] == current["players"][1]["id"]
    assert not any(p["bot"] for p in current["players"])
    concede(members[2], room["code"])
    assert view(members[0], room["code"])["status"] == "closed"
    assert members[0][0].get(ROOT + "/active").json == {"rooms": []}


def test_leaving_between_games_preserves_the_result_and_new_game_omits_the_departed_member(app):
    members, room = online_group(app, 4, "individual")
    prepare_last_round(app, room["code"])
    for member in members:
        confirm(*member, room["code"])
    finished = view(members[1], room["code"])
    assert finished["phase"] == "finished"
    result = members[1][0].get(ROOT + "/scores").json
    assert move(*members[1], finished, "concede").status_code == 400
    assert move(*members[1], finished, "leave").status_code == 200
    group = view(members[0], room["code"])
    assert not group["players"][1]["bot"] and group["players"][1]["away"]
    assert members[1][0].get(ROOT + "/active").json == {"rooms": []}
    assert members[1][0].get(ROOT + "/scores").json == result
    next_game = move(*members[0], group, "rematch").json
    assert next_game["phase"] == "choose"
    assert not any(p["id"] == finished["viewerId"] for p in next_game["players"])
    with app.app_context():
        assert MatchResult.query.count() == 1
