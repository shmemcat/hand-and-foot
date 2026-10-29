import time
import uuid
from datetime import datetime, timedelta, timezone
import pytest
from handandfoot_server.application import ROOT
from handandfoot_server.models import AchievementUnlock, MatchResult, Room, db
from handandfoot_server.achievements import calendar_achievements
from test_accounts import app, sign_in
from test_service import client, create, move


def result(app, *, uid=1, won=True, history=None, scores=None, play_mode="practice", mode="partnership"):
    with app.app_context():
        db.session.add(MatchResult(id=uuid.uuid4().hex, completed_at=time.time(), payload={
            "players": [{"key": f"account:{uid}", "team": 0}, {"key": None, "team": 1}],
            "scores": scores or [10000, 5000], "winners": [0] if won else [1],
            "history": history or [], "playMode": play_mode, "mode": mode, "targetScore": 10000,
        }))
        db.session.commit()


def round_record(ours, theirs, *, clean=0, dirty=0, reds=0, runs=0, lost=0, debt=0, out=0):
    return {"round": 1, "scores": [
        {"team": 0, "total": ours, "debt": debt, "goingOut": out, "lostBooks": lost},
        {"team": 1, "total": theirs}],
        "achievementData": [{"team": 0, "cleanBooks": clean, "dirtyBooks": dirty, "redThrees": reds, "runs": runs}]}


def test_private_cross_device_stats_include_all_records_and_separate_modes(app):
    for _ in range(31):
        result(app)
    result(app, play_mode="online", won=False, history=[round_record(1000, 2000)])
    result(app, uid=2)
    http = app.test_client()
    assert http.get(ROOT + "/achievements").status_code == 401
    sign_in(http)
    data = http.get(ROOT + "/achievements?user_id=2").json
    assert data["stats"]["all"]["games"] == 32
    assert data["stats"]["all"]["wins"] == 31
    assert data["stats"]["practice"]["games"] == 31
    assert data["stats"]["online"]["games"] == 1
    assert data["stats"]["all"]["rounds"] == 1
    assert data["counters"]["clean_books"] == 0  # Old records do not invent book counts.
    assert "account:" not in str(data)
    second = app.test_client()
    sign_in(second)
    assert second.get(ROOT + "/achievements").json == data
    sign_in(second, "2")
    assert second.get(ROOT + "/achievements").json["stats"]["all"]["games"] == 1
    app.extensions["accounts"].unavailable = True
    assert http.get(ROOT + "/achievements").status_code == 503


def test_books_only_use_retained_evidence_and_secrets_use_correct_conditions(app):
    history = [round_record(3500, 1000, clean=3, dirty=2, reds=6, runs=2, out=100)]
    result(app, history=history, scores=[12000, 11950])
    http = app.test_client()
    sign_in(http)
    data = http.get(ROOT + "/achievements").json
    assert data["counters"] == {"games": 1, "wins": 1, "clean_books": 3, "dirty_books": 2, "red_threes": 6, "going_out": 1}
    assert {"first_chapter", "first_victory", "team_spirit", "straight_ahead", "matched_set", "big_hand", "triple_threat", "seeing_red", "photo_finish", "overachiever", "clean_sweep", "handle_with_care", "private_library", "balancing_act", "scenic_route"} <= set(data["unlocks"])
    assert "comeback" not in data["unlocks"]
    assert "good_company" not in data["unlocks"]


def test_comeback_streaks_losses_ties_and_negative_round_scores(app):
    result(app, won=False)
    result(app, history=[round_record(-500, 1600), round_record(11000, 0)], scores=[10500, 1600])
    result(app)
    result(app)
    result(app)
    result(app)
    http = app.test_client()
    sign_in(http)
    unlocked = http.get(ROOT + "/achievements").json["unlocks"]
    assert "comeback" in unlocked and "hot_streak" in unlocked
    # A shared win does not satisfy the close-finish condition.
    result(app, uid=2, scores=[10000, 10000])
    sign_in(http, "2")
    assert "photo_finish" not in http.get(ROOT + "/achievements").json["unlocks"]


def test_scoring_records_surviving_books_after_debt_payment():
    from handandfoot_server import scoring
    from test_engine import rig, take, book
    game = rig()
    clean = book(game, "9")
    dirty = book(game, "8", dirty=True)
    game["players"][0]["hand"] = take(game, "Joker")
    scoring.prepare(game, None, "Stock exhausted")
    for team in range(len(game["sides"])):
        while choice := scoring.auto_choice(game, team):
            scoring.pay(game, team, choice)
        scoring.confirm(game, team)
    score = game["history"][-1]["scores"][0]
    evidence = game["history"][-1]["achievementData"][0]
    assert evidence["cleanBooks"] == int(clean["id"] not in score["broken"])
    assert evidence["dirtyBooks"] == int(dirty["id"] not in score["broken"])
    assert evidence["dirtyBooks"] == 0  # Dirty books pay debt before clean books.


@pytest.mark.parametrize("badge, day", [
    ("new_year", (2026, 1, 1)), ("lonely_heart", (2026, 2, 14)),
    ("lucky_clover", (2026, 3, 17)), ("easter_egg", (2026, 4, 5)),
    ("easter_egg", (2027, 3, 28)), ("fireworks", (2026, 7, 4)),
    ("spooky", (2026, 10, 31)), ("thankful", (2026, 11, 26)),
    ("thankful", (2027, 11, 25)), ("christmas_spirit", (2026, 12, 25)),
])
def test_shared_holidays_include_moving_dates_and_exclude_neighboring_days(badge, day):
    start = datetime(*day, 12, tzinfo=timezone.utc)
    assert badge in calendar_achievements(start.timestamp(), 0)
    for difference in (-1, 1):
        assert badge not in calendar_achievements((start + timedelta(days=difference)).timestamp(), 0)


@pytest.mark.parametrize("offset", [420, -330, 0, -840, 720])
@pytest.mark.parametrize("hour, minute, expected", [(0, 0, "night_owl"), (4, 59, "night_owl"), (5, 0, "early_bird"), (7, 59, "early_bird"), (8, 0, None), (23, 59, None)])
def test_time_badges_follow_local_game_start(offset, hour, minute, expected):
    start = datetime(2026, 6, 10, hour, minute, tzinfo=timezone.utc) + timedelta(minutes=offset)
    badges = calendar_achievements(start.timestamp(), offset)
    assert badges & {"early_bird", "night_owl"} == ({expected} if expected else set())


@pytest.mark.parametrize("offset", [None, True, 1.5, "420", -841, 721])
def test_missing_or_invalid_offsets_never_guess_local_calendar_badges(offset):
    assert calendar_achievements(datetime(2026, 1, 1, 1, tzinfo=timezone.utc).timestamp(), offset) == set()
    assert calendar_achievements(None, 0) == set()


def test_local_start_evidence_survives_result_save_and_reconnect_per_player(app, monkeypatch):
    host, headers = client(app)
    friend, friend_headers = client(app)
    sign_in(host)
    sign_in(friend, "2")
    headers["X-Handandfoot-UTC-Offset"] = "420"
    friend_headers["X-Handandfoot-UTC-Offset"] = "-120"
    room = create(host, headers, capacity=2, scoringMode="individual")
    friend.post(f'{ROOT}/rooms/{room["code"]}/join', json={"name": "Friend"}, headers=friend_headers)
    start = datetime(2026, 11, 1, 3, 30, tzinfo=timezone.utc).timestamp()
    monkeypatch.setattr("handandfoot_server.application.time.time", lambda: start)
    room = move(host, headers, host.get(f'{ROOT}/rooms/{room["code"]}').json, "start").json
    assert "spooky" not in host.get(ROOT + "/achievements").json["unlocks"]
    with app.app_context():
        import copy
        row = db.session.get(Room, room["code"])
        data = copy.deepcopy(row.payload)
        assert data["game"]["startedAt"] == start
        assert [p["utcOffsetMinutes"] for p in data["game"]["players"]] == [420, -120]
        data["game"].update(phase="finished", winners=[0])
        data["game"]["sides"][0]["score"] = 10000
        row.payload = data
        db.session.commit()
    # Reading from another time zone cannot change this match's start offset.
    finished = host.get(f'{ROOT}/rooms/{room["code"]}', headers={"X-Handandfoot-UTC-Offset": "-330"}).json
    host_badges = host.get(ROOT + "/achievements").json["unlocks"]
    friend_badges = friend.get(ROOT + "/achievements").json["unlocks"]
    assert "spooky" in host_badges and "spooky" not in friend_badges
    assert "early_bird" in friend_badges and "early_bird" not in host_badges
    assert "better_with_friends" in host_badges and "better_with_friends" in friend_badges
    headers["X-Handandfoot-UTC-Offset"] = "360"
    rematch = move(host, headers, finished, "rematch").json
    with app.app_context():
        game = db.session.get(Room, rematch["code"]).payload["game"]
        assert [p["utcOffsetMinutes"] for p in game["players"]] == [360, -120]


@pytest.mark.parametrize("offset", ["bad", "1.5", "-841", "721"])
def test_invalid_offset_headers_are_rejected_on_seating(app, offset):
    http, headers = client(app)
    headers["X-Handandfoot-UTC-Offset"] = offset
    response = http.post(ROOT + "/rooms", json={"name": "Guest", "capacity": 2, "scoringMode": "individual", "playMode": "practice"}, headers=headers)
    assert response.status_code == 400


def test_music_secret_is_account_owned_durable_idempotent_and_deleted_with_account(app):
    http, headers = client(app)
    sign_in(http)
    path = ROOT + "/achievements"
    for _ in range(2):
        assert http.post(path, json={"id": "geezer", "userId": "1"}, headers=headers).json == {"unlocks": ["geezer"]}
    second = app.test_client()
    sign_in(second)
    assert "geezer" in second.get(path).json["unlocks"]
    sign_in(second, "2")
    assert "geezer" not in second.get(path).json["unlocks"]
    with app.app_context():
        assert AchievementUnlock.query.count() == 1
        assert MatchResult.query.count() == 0
    response = http.post("/_internal/games/v1/handandfoot/delete-user", json={"user_id": 1, "request_id": uuid.uuid4().hex}, headers={"X-Cards-Service": "accounts", "Authorization": "Bearer " + app.config["GAME_ACCOUNT_TOKENS"]["handandfoot"]})
    assert response.status_code == 200
    with app.app_context():
        assert AchievementUnlock.query.count() == 0
    assert http.post(path, json={"id": "geezer", "userId": "1"}, headers=headers).status_code == 403


def test_settings_unlock_only_accepts_music_and_valid_account_csrf_origin(app):
    http, headers = client(app)
    path = ROOT + "/achievements"
    assert http.post(path, json={"id": "geezer", "userId": "1"}, headers=headers).status_code == 401
    sign_in(http)
    assert http.post(path, json={"id": "geezer", "userId": "1"}).status_code == 403
    assert http.post(path, json={"id": "geezer", "userId": "1"}, headers={**headers, "Origin": "https://example.test"}).status_code == 403
    assert http.post(path, json={"id": "geezer", "userId": "2"}, headers=headers).status_code == 409
    for badge in ("hot_streak", "night_owl", "first_chapter", "spooky", None, []):
        assert http.post(path, json={"id": badge, "userId": "1"}, headers=headers).status_code == 400
    with app.app_context():
        assert AchievementUnlock.query.count() == 0
