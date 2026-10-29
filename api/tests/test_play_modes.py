"""Saved sessions and server-owned wins through the playable room API."""
import copy
import time
import pytest
from handandfoot_server import engine
from handandfoot_server.application import ROOT, NAMESPACE, create_app
from handandfoot_server.models import MatchResult, Room, db
from test_accounts import app, sign_in
from test_engine import book
from test_service import client, create, move


def prepare_last_round(app, code, winning_teams=(0,)):
    with app.app_context():
        row = db.session.get(Room, code)
        data = copy.deepcopy(row.payload)
        game = data["game"]
        game.update(stock=list(game["cards"]), discard=[], replaced=[], phase="play")
        for player in game["players"]:
            player.update(hand=[], foot=[], piles=[], redThrees=[], chosen=True, inFoot=True)
        for side in game["sides"]:
            side.update(score=9900 if side["id"] in winning_teams else 0, melds=[])
            if side["id"] in winning_teams:
                book(game, "K", team=side["id"])
        engine.finish_round(game, None, "Last round")
        engine.assert_conservation(game)
        row.payload = data
        db.session.commit()


def confirm(http, headers, code):
    view = http.get(f"{ROOT}/rooms/{code}").json
    result = move(http, headers, view, "score_confirm")
    assert result.status_code == 200, result.json
    return result.json


def test_saved_tables_are_private_cross_browser_and_listing_does_not_reclaim(app):
    host, headers = client(app)
    sign_in(host)
    solo = create(host, headers, playMode="practice", capacity=2, scoringMode="individual")
    stranger, _ = client(app)
    assert stranger.get(ROOT + "/active").json == {"rooms": []}
    sign_in(stranger, "2")
    assert stranger.get(ROOT + "/active").json == {"rooms": []}
    sign_in(stranger)
    with app.app_context():
        row = db.session.get(Room, solo["code"])
        data = copy.deepcopy(row.payload)
        data["game"]["players"][0].update(away=True, bot=True, lastSeen=time.time() - 121)
        row.payload = data
        db.session.commit()
        before = copy.deepcopy(row.payload)
    rooms = stranger.get(ROOT + "/active").json["rooms"]
    assert [r["code"] for r in rooms] == [solo["code"]]
    assert all(set(r) == {"code", "playMode", "scoringMode", "capacity", "phase", "round"} for r in rooms)
    with app.app_context():
        assert db.session.get(Room, solo["code"]).payload == before
    reclaimed = stranger.get(f'{ROOT}/rooms/{solo["code"]}').json
    assert not reclaimed["players"][0]["bot"]
    assert move(host, headers, reclaimed, "leave").status_code == 200
    lobby = create(host, headers, capacity=4)
    assert move(host, headers, lobby, "leave").status_code == 200
    assert stranger.get(ROOT + "/active").json == {"rooms": []}


def test_guest_saved_tables_follow_only_waiting_lobbies_on_sign_in(app):
    http, headers = client(app)
    lobby = create(http, headers)
    guest, guest_headers = client(app)
    solo = create(guest, guest_headers, playMode="practice")
    sign_in(http)
    assert [r["code"] for r in http.get(ROOT + "/active").json["rooms"]] == [lobby["code"]]
    sign_in(guest)
    assert [r["code"] for r in guest.get(ROOT + "/active").json["rooms"]] == [lobby["code"]]
    guest.delete_cookie("cards_session")
    assert [r["code"] for r in guest.get(ROOT + "/active").json["rooms"]] == [solo["code"]]


def test_one_active_table_is_enforced_across_create_join_and_browsers(app):
    host, headers = client(app)
    sign_in(host)
    solo = create(host, headers, playMode="practice", capacity=2, scoringMode="individual")
    device, auth = client(app)
    sign_in(device)
    denied = device.post(ROOT + "/rooms", headers=auth, json={"name": "ignored", "capacity": 2, "scoringMode": "individual", "playMode": "online"})
    assert denied.status_code == 409 and denied.json["code"] == "TABLE_IN_PROGRESS"
    assert denied.json["activeCode"] == solo["code"]
    friend, friend_headers = client(app)
    sign_in(friend, "2")
    lobby = create(friend, friend_headers, capacity=2, scoringMode="individual")
    denied = device.post(f'{ROOT}/rooms/{lobby["code"]}/join', headers=auth, json={"name": "ignored"})
    assert denied.status_code == 409 and denied.json["activeCode"] == solo["code"]
    assert move(host, headers, solo, "leave").status_code == 200
    joined = device.post(f'{ROOT}/rooms/{lobby["code"]}/join', headers=auth, json={"name": "ignored"})
    assert joined.status_code == 200
    assert [r["code"] for r in device.get(ROOT + "/active").json["rooms"]] == [lobby["code"]]
    assert device.get(ROOT + "/scores").json == []


def test_sign_in_does_not_claim_a_second_guest_lobby(app):
    account, auth = client(app)
    sign_in(account)
    current = create(account, auth, playMode="practice")
    guest, headers = client(app)
    waiting = create(guest, headers)
    sign_in(guest)
    assert [r["code"] for r in guest.get(ROOT + "/active").json["rooms"]] == [current["code"]]
    assert guest.get(f'{ROOT}/rooms/{waiting["code"]}').status_code == 403
    # Once the existing account table is left, the same browser claims its
    # original guest membership rather than joining as a second person.
    current = guest.get(f'{ROOT}/rooms/{current["code"]}').json
    assert move(guest, headers, current, "leave").status_code == 200
    claimed = guest.get(f'{ROOT}/rooms/{waiting["code"]}').json
    assert len(claimed["players"]) == 1 and claimed["viewerId"] == waiting["viewerId"]
    guest.delete_cookie("cards_session")
    assert guest.get(f'{ROOT}/rooms/{waiting["code"]}').status_code == 403


def test_lobby_close_is_host_only_releases_all_seats_and_creates_no_result(app):
    host, headers = client(app)
    guest, auth = client(app)
    room = create(host, headers, capacity=2, scoringMode="individual")
    guest.post(f'{ROOT}/rooms/{room["code"]}/join', headers=auth, json={"name": "Friend"})
    view = guest.get(f'{ROOT}/rooms/{room["code"]}').json
    assert move(guest, auth, view, "close").status_code == 403
    room = host.get(f'{ROOT}/rooms/{room["code"]}').json
    assert move(host, headers, room, "close").json["status"] == "closed"
    assert guest.get(f'{ROOT}/rooms/{room["code"]}').json["status"] == "closed"
    assert host.get(ROOT + "/active").json == guest.get(ROOT + "/active").json == {"rooms": []}
    assert create(host, headers)["phase"] == "lobby"
    with app.app_context():
        assert MatchResult.query.count() == 0


def test_starting_with_only_humans_requires_a_valid_table_and_never_adds_bots(app):
    host, headers = client(app)
    room = create(host, headers, capacity=4)
    waiting = move(host, headers, room, "start", fillBots=False)
    assert waiting.status_code == 400 and "players" in waiting.json["error"]
    assert host.get(f'{ROOT}/rooms/{room["code"]}').json["phase"] == "lobby"
    assert move(host, headers, room, "start", fillBots="yes").status_code == 400
    started = move(host, headers, room, "start", fillBots=True).json
    assert len(started["players"]) == 4 and sum(p["bot"] for p in started["players"]) == 3


@pytest.mark.parametrize("play_mode", ["practice", "online"])
@pytest.mark.parametrize("phase", ["choose", "scoring", "round_over"])
def test_abandoned_games_never_count_as_played_even_after_a_finished_round(app, play_mode, phase):
    http, headers = client(app)
    sign_in(http)
    room = create(http, headers, playMode=play_mode, capacity=2, scoringMode="individual")
    if play_mode == "online":
        room = move(http, headers, room, "start").json
    if phase != "choose":
        prepare_last_round(app, room["code"])
        if phase == "round_over":
            with app.app_context():
                row = db.session.get(Room, room["code"])
                data = copy.deepcopy(row.payload)
                for side in data["game"]["sides"]:
                    side["score"] = 0
                row.payload = data
                db.session.commit()
            confirm(http, headers, room["code"])
            app.extensions["tick"]()
    room = http.get(f'{ROOT}/rooms/{room["code"]}').json
    assert room["phase"] == phase
    if phase == "round_over":
        assert len(room["history"]) == 1
    before = http.get(ROOT + "/achievements").json
    assert move(http, headers, room, "leave").status_code == 200
    after = http.get(ROOT + "/achievements").json
    assert before == after
    assert after["stats"]["all"]["games"] == after["stats"][play_mode]["games"] == 0
    assert after["stats"]["all"]["rounds"] == after["counters"]["games"] == 0
    assert http.get(ROOT + "/scores").json == []
    with app.app_context():
        assert MatchResult.query.count() == 0


def test_bot_finishing_after_a_player_leaves_only_counts_for_the_remaining_player(app):
    host, headers = client(app)
    friend, friend_headers = client(app)
    sign_in(host)
    sign_in(friend, "2")
    room = create(host, headers, capacity=2, scoringMode="individual")
    assert friend.post(f'{ROOT}/rooms/{room["code"]}/join', headers=friend_headers,
                       json={"name": "ignored", "seat": 1}).status_code == 200
    room = host.get(f'{ROOT}/rooms/{room["code"]}').json
    room = move(host, headers, room, "start").json
    assert move(host, headers, room, "leave").status_code == 200
    prepare_last_round(app, room["code"])
    confirm(friend, friend_headers, room["code"])
    app.extensions["tick"]()
    assert friend.get(f'{ROOT}/rooms/{room["code"]}').json["phase"] == "finished"
    departed = host.get(ROOT + "/achievements").json
    remaining = friend.get(ROOT + "/achievements").json
    assert departed["stats"]["all"]["games"] == departed["stats"]["online"]["games"] == departed["counters"]["games"] == 0
    assert remaining["stats"]["all"]["games"] == remaining["stats"]["online"]["games"] == remaining["counters"]["games"] == 1
    assert remaining["stats"]["all"]["wins"] == 0


@pytest.mark.parametrize("play_mode", ["practice", "online"])
def test_completed_account_wins_count_once_across_retries_rematches_and_restart(app, play_mode):
    http, headers = client(app)
    sign_in(http)
    room = create(http, headers, playMode=play_mode, capacity=2, scoringMode="individual")
    if play_mode == "online":
        room = move(http, headers, room, "start").json
    assert http.get(ROOT + "/achievements").json["stats"]["all"]["games"] == 0
    assert http.get(ROOT + f"/leaderboard?mode={play_mode}").json["all_time"] == []
    prepare_last_round(app, room["code"])
    confirm(http, headers, room["code"])
    app.extensions["tick"]()
    room = http.get(f'{ROOT}/rooms/{room["code"]}').json
    assert room["phase"] == "finished"
    for _ in range(2):
        assert http.get(f'{ROOT}/rooms/{room["code"]}').json["phase"] == "finished"
        app.extensions["tick"]()
    board = http.get(ROOT + f"/leaderboard?mode={play_mode}").json
    assert board["monthly"][0]["games_won"] == board["all_time"][0]["games_won"] == 1
    other_mode = "practice" if play_mode == "online" else "online"
    assert http.get(ROOT + f"/leaderboard?mode={other_mode}").json["all_time"] == []
    result = http.get(ROOT + "/scores").json
    assert len(result) == 1 and result[0]["won"] and result[0]["playMode"] == play_mode
    stats = http.get(ROOT + "/achievements").json
    assert stats["stats"]["all"]["games"] == stats["stats"][play_mode]["games"] == stats["counters"]["games"] == 1
    saved = http.get(ROOT + "/active").json["rooms"]
    assert len(saved) == (1 if play_mode == "online" else 0)
    room = move(http, headers, room, "rematch").json
    assert room["phase"] == "choose"
    assert http.get(ROOT + "/scores").json == result
    assert http.get(ROOT + "/achievements").json == stats
    prepare_last_round(app, room["code"])
    confirm(http, headers, room["code"])
    app.extensions["tick"]()
    assert http.get(ROOT + f"/leaderboard?mode={play_mode}").json["all_time"][0]["games_won"] == 2
    restarted = create_app({**app.config, "START_WORKER": False})
    app.extensions["accounts"].app = restarted
    recovered, recovered_headers = client(restarted)
    sign_in(recovered)
    assert len(recovered.get(ROOT + "/scores").json) == 2
    assert recovered.get(ROOT + "/achievements").json["stats"]["all"]["games"] == 2
    finished = recovered.get(f'{ROOT}/rooms/{room["code"]}').json
    assert move(recovered, recovered_headers, finished, "leave").status_code == 200
    assert recovered.get(ROOT + "/achievements").json["stats"]["all"]["games"] == 2
    assert recovered.get(ROOT + f"/leaderboard?mode={play_mode}").json == http.get(ROOT + f"/leaderboard?mode={play_mode}").json


@pytest.mark.parametrize("shared", [False, True])
def test_online_partners_and_tied_sides_receive_wins_from_the_confirmed_match(app, shared):
    seats = [client(app) for _ in range(4)]
    for uid, (http, _) in enumerate(seats, 1):
        sign_in(http, str(uid))
    host, headers = seats[0]
    room = create(host, headers, capacity=4)
    for http, auth in seats[1:]:
        assert http.post(f'{ROOT}/rooms/{room["code"]}/join', headers=auth, json={"name": "ignored"}).status_code == 200
    room = host.get(f'{ROOT}/rooms/{room["code"]}').json
    room = move(host, headers, room, "start").json
    prepare_last_round(app, room["code"], (0, 1) if shared else (0,))
    confirm(host, headers, room["code"])
    # A shared board only needs one confirmation from each partnership.
    confirm(*seats[1], room["code"])
    board = host.get(ROOT + "/leaderboard?mode=online").json["all_time"]
    expected = ["Player1", "Player2", "Player3", "Player4"] if shared else ["Player1", "Player3"]
    assert [r["username"] for r in board] == expected
    assert all(r["games_won"] == 1 for r in board)
    assert seats[1][0].get(ROOT + "/scores").json[0]["won"] is shared
    with app.app_context():
        assert MatchResult.query.count() == 1


def test_preview_games_and_rematches_never_create_results_or_saved_tables(app):
    app.config["DEVELOPMENT_FIXTURES"] = True
    http, headers = client(app)
    sign_in(http)
    response = http.post(ROOT + "/fixtures", headers=headers, json={"fixture": "going-out"})
    assert response.status_code == 200, response.json
    room = response.json
    for _ in range(2):
        prepare_last_round(app, room["code"])
        confirm(http, headers, room["code"])
        for _ in range(5):
            app.extensions["tick"]()
        room = http.get(f'{ROOT}/rooms/{room["code"]}').json
        assert room["phase"] == "finished"
        assert http.get(ROOT + "/scores").json == []
        assert http.get(ROOT + "/active").json == {"rooms": []}
        assert http.get(ROOT + "/leaderboard").json["all_time"] == []
        room = move(http, headers, room, "rematch").json
    with app.app_context():
        assert MatchResult.query.count() == 0


def test_invite_visitor_can_subscribe_after_join_and_receives_no_private_cards(app):
    host, headers = client(app)
    visitor, auth = client(app)
    room = create(host, headers, capacity=2, scoringMode="individual")
    socket = app.extensions["socketio"].test_client(app, namespace=NAMESPACE,
        flask_test_client=visitor, auth={"csrf": auth["X-Handandfoot-CSRF"]}, headers={"Origin": "http://127.0.0.1:3004"})
    assert "error" in socket.emit("handandfoot:subscribe", {"code": room["code"]}, namespace=NAMESPACE, callback=True)
    assert visitor.post(f'{ROOT}/rooms/{room["code"]}/join', headers=auth, json={"name": "Friend"}).status_code == 200
    assert socket.emit("handandfoot:subscribe", {"code": room["code"]}, namespace=NAMESPACE, callback=True) == {"ok": True}
    room = host.get(f'{ROOT}/rooms/{room["code"]}').json
    assert move(host, headers, room, "start").status_code == 200
    messages = socket.get_received(NAMESPACE)
    assert len(messages) == 1 and messages[0]["name"] == "handandfoot:updated"
    assert set(messages[0]["args"][0]) == {"code", "revision"}
    host_view = host.get(f'{ROOT}/rooms/{room["code"]}').json
    visitor_view = visitor.get(f'{ROOT}/rooms/{room["code"]}').json
    assert host_view["viewerId"] != visitor_view["viewerId"]
    assert host_view["footPreview"] != visitor_view["footPreview"]
    socket.disconnect(namespace=NAMESPACE)
