"""Historical wins retain their dates and move to Medium exactly once."""
import copy
from datetime import datetime, timezone
import uuid
import pytest
from handandfoot_server.application import ROOT
from handandfoot_server.models import MatchResult, db
from test_accounts import app, sign_in
from test_play_modes import confirm, prepare_last_round
from test_service import client, create


def result(app, *, mode="practice", at=None, won=True, **metadata):
    with app.app_context():
        row = MatchResult(id=uuid.uuid4().hex, completed_at=at if at is not None else datetime.now(timezone.utc).timestamp(), payload={
            "code": "ABCDEF", "mode": "individual", "playMode": mode,
            "players": [{"key": "account:1", "accountId": 1, "team": 0}],
            "winners": [0] if won else [1], "scores": [10000, 5000], "history": [], **metadata,
        })
        db.session.add(row)
        db.session.commit()
        return row.id


def test_legacy_bot_wins_become_medium_without_changing_records_or_dates(app):
    month = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0).timestamp()
    result(app, at=month - 1)
    result(app, at=month)
    result(app, mode="online")
    with app.app_context():
        before = {r.id: (r.completed_at, copy.deepcopy(r.payload)) for r in MatchResult.query.all()}
    http = app.test_client()
    expected = http.get(ROOT + "/leaderboard?category=medium").json
    assert expected["monthly"][0]["games_won"] == 1
    assert expected["all_time"][0]["games_won"] == 2
    assert http.get(ROOT + "/leaderboard?category=medium").json == expected
    for category in ("easy", "hard"):
        assert http.get(ROOT + f"/leaderboard?category={category}").json == {"monthly": [], "all_time": []}
    assert http.get(ROOT + "/leaderboard?category=multiplayer").json["all_time"][0]["games_won"] == 1
    sign_in(http)
    stats = http.get(ROOT + "/achievements").json["stats"]
    assert stats["medium"]["games"] == stats["medium"]["wins"] == 2
    assert stats["all"]["games"] == stats["all"]["wins"] == 3
    assert stats["multiplayer"]["games"] == 1
    assert stats["easy"]["games"] == stats["hard"]["games"] == 0
    with app.app_context():
        assert {r.id: (r.completed_at, r.payload) for r in MatchResult.query.all()} == before


def test_new_results_are_separate_and_online_games_stay_multiplayer(app):
    result(app)  # Historical result belongs to Medium.
    for difficulty in ("easy", "medium", "hard"):
        result(app, botDifficulty=difficulty)
    result(app, won=False, botDifficulty="easy")
    result(app, mode="online", botDifficulty="hard")
    http = app.test_client()
    for category, wins in (("easy", 1), ("medium", 2), ("hard", 1), ("multiplayer", 1)):
        data = http.get(ROOT + f"/leaderboard?category={category}").json
        assert data["monthly"][0]["games_won"] == data["all_time"][0]["games_won"] == wins
    # Old links now resolve to Medium rather than mixing bot difficulties.
    assert http.get(ROOT + "/leaderboard?mode=practice").json == http.get(ROOT + "/leaderboard?category=medium").json
    assert http.get(ROOT + "/leaderboard?mode=online").json == http.get(ROOT + "/leaderboard?category=multiplayer").json
    sign_in(http)
    stats = http.get(ROOT + "/achievements").json["stats"]
    assert stats["all"]["games"] == 6 and stats["all"]["wins"] == 5
    assert stats["practice"]["games"] == 5 and stats["online"]["games"] == 1
    assert stats["easy"]["games"] == 2 and stats["easy"]["wins"] == 1
    assert stats["medium"]["wins"] == 2
    assert stats["hard"]["games"] == stats["hard"]["wins"] == 1
    assert stats["multiplayer"]["games"] == stats["multiplayer"]["wins"] == 1


@pytest.mark.parametrize("category", ["practice", "online", "hardest", "", "invalid"])
def test_unknown_categories_are_rejected(app, category):
    assert app.test_client().get(ROOT + "/leaderboard", query_string={"category": category}).status_code == 400


@pytest.mark.parametrize("difficulty", ["easy", "medium", "hard"])
def test_a_completed_game_saves_its_difficulty_and_credits_the_right_category(app, difficulty):
    http, headers = client(app)
    sign_in(http)
    room = create(http, headers, playMode="practice", capacity=2, scoringMode="individual", botDifficulty=difficulty)
    prepare_last_round(app, room["code"])
    confirm(http, headers, room["code"])
    app.extensions["tick"]()
    with app.app_context():
        assert MatchResult.query.one().payload["botDifficulty"] == difficulty
    assert http.get(ROOT + f"/leaderboard?category={difficulty}").json["all_time"][0]["games_won"] == 1
    stats = http.get(ROOT + "/achievements").json["stats"]
    assert stats[difficulty]["games"] == stats[difficulty]["wins"] == 1
    for other in {"easy", "medium", "hard"} - {difficulty}:
        assert stats[other]["games"] == stats[other]["wins"] == 0
