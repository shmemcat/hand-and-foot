import time
import uuid
from datetime import datetime, timezone
from handandfoot_server.application import ROOT
from handandfoot_server.models import DeletedAccount, MatchResult, db
from test_accounts import app
from handandfoot_server.achievements import achievement_count
from handandfoot_server.models import AchievementUnlock


def record(app, uid, *, at=None, mode="practice", won=True, extra=()):
    with app.app_context():
        key = f"account:{uid}" if uid is not None else "browser-guest"
        db.session.add(MatchResult(id=uuid.uuid4().hex, completed_at=at if at is not None else time.time(), payload={
            "code": "ABCDEF", "mode": "partnership", "playMode": mode,
            "players": [{"key": key, "accountId": uid, "team": 0}, *extra],
            "winners": [0] if won else [1], "scores": [10000, 5000], "history": []}))
        db.session.commit()


def test_monthly_all_time_modes_and_guest_exclusion(app):
    month = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0).timestamp()
    record(app, 1, at=month)
    record(app, 1)
    record(app, 1, won=False)
    record(app, 2, at=month - 1)
    record(app, 2, mode="online")
    record(app, None)
    # Both partners receive a shared win, and a repeated identity cannot count twice.
    record(app, 1, extra=[{"key": "account:1", "accountId": 1, "team": 0}, {"key": "account:3", "accountId": 3, "team": 0}])
    client = app.test_client()
    data = client.get(ROOT + "/leaderboard").json
    assert [(row["username"], row["games_won"]) for row in data["monthly"]] == [("Player1", 3), ("Player3", 1)]
    assert [(row["username"], row["games_won"]) for row in data["all_time"]] == [("Player1", 3), ("Player2", 1), ("Player3", 1)]
    assert client.get(ROOT + "/leaderboard?mode=online").json["all_time"][0]["username"] == "Player2"
    assert client.get(ROOT + "/leaderboard?mode=invalid").status_code == 400
    assert set(data["monthly"][0]) == {"rank", "username", "profile_icon", "games_won"}


def test_deleted_missing_profiles_and_left_seats_never_rank(app):
    record(app, 1)
    record(app, 2)
    record(app, 3)
    record(app, None, extra=[{"key": None, "accountId": 4, "team": 0}])
    with app.app_context():
        db.session.add(DeletedAccount(user_id=2, request_id=uuid.uuid4().hex))
        db.session.commit()
    app.extensions["accounts"].revoked.add("3")
    data = app.test_client().get(ROOT + "/leaderboard").json
    assert [row["username"] for row in data["all_time"]] == ["Player1"]
    assert data["all_time"][0]["rank"] == 1


def test_rankings_use_current_profiles_and_fail_honestly_on_outage(app):
    for uid in range(1, 13):
        record(app, uid)
    client = app.test_client()
    data = client.get(ROOT + "/leaderboard").json
    assert len(data["all_time"]) == 10
    assert [row["rank"] for row in data["all_time"]] == list(range(1, 11))
    app.extensions["accounts"].unavailable = True
    response = client.get(ROOT + "/leaderboard")
    assert response.status_code == 503 and response.json["code"] == "ACCOUNTS_UNAVAILABLE"


def test_achievement_tiers_are_cumulative_and_unknown_unlocks_do_not_count():
    for value, expected in [(0, 0), (10, 1), (50, 2), (200, 3)]:
        summary = {"unlocks": ["geezer", "geezer", "unknown"], "counters": {
            "games": value, "wins": 0, "clean_books": value, "dirty_books": 0, "going_out": 0, "red_threes": 0}}
        assert achievement_count(summary) == 1 + 2 * expected


def test_achievement_top_ten_combines_modes_and_includes_settings_only(app):
    with app.app_context():
        for uid in range(1, 16):
            db.session.add(AchievementUnlock(user_id=uid, achievement_id="geezer"))
        db.session.add(DeletedAccount(user_id=1, request_id=uuid.uuid4().hex))
        db.session.commit()
    app.extensions["accounts"].revoked.add("2")
    for i in range(10):
        record(app, 14, won=False, mode="practice" if i % 2 else "online")
    record(app, None)  # Browser guests never rank.
    response = app.test_client().get(ROOT + "/leaderboard?mode=achievements")
    assert response.status_code == 200
    assert response.json["monthly"] == []
    rows = response.json["all_time"]
    assert len(rows) == 10
    assert rows[0] == dict(rank=1, username="Player14", profile_icon="cat", achievement_count=4)
    assert [row["rank"] for row in rows] == list(range(1, 11))
    assert not {"Player1", "Player2"} & {row["username"] for row in rows}
    app.extensions["accounts"].unavailable = True
    assert app.test_client().get(ROOT + "/leaderboard?mode=achievements").status_code == 503
