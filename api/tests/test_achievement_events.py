import copy
import json
import pytest
from handandfoot_server import engine, scoring
from handandfoot_server.models import AchievementUnlock, MatchResult, Room, db
from handandfoot_server.application import ROOT
from test_accounts import app, sign_in
from test_engine import rig, take, chosen
from test_service import client, create


def earned(game, player):
    return set(game.get("playerAchievements", {}).get(str(player), []))


def test_first_foot_is_personal_once_per_game_and_survives_later_rounds():
    game = rig(4, "partnership")
    first, partner = game["players"][2], game["players"][0]
    first["foot"] = take(game, "4", 3)
    partner["foot"] = take(game, "5", 3)
    engine.enter_foot(game, first)
    engine.enter_foot(game, partner)
    engine.enter_foot(game, first)
    assert game["firstFootPlayerId"] == "2"
    assert game["playerAchievements"]["2"] == ["a_leg_up"]
    assert "a_leg_up" not in earned(game, 0)
    engine.assert_conservation(game)
    game = chosen(engine.deal_round(game))
    player = game["players"][1]
    game["stock"].extend(player["hand"])
    player["hand"] = []
    engine.enter_foot(game, player)
    assert game["firstFootPlayerId"] == "2"
    assert "a_leg_up" not in earned(game, 1)
    engine.assert_conservation(game)


def test_a_bot_getting_the_first_foot_does_not_make_the_next_human_first():
    game = rig(2, "individual")
    bot, human = game["players"]
    human["bot"] = False
    for player, rank in [(bot, "4"), (human, "5")]:
        player["foot"] = take(game, rank)
        engine.enter_foot(game, player)
    assert game["firstFootPlayerId"] == bot["id"]
    assert "a_leg_up" not in earned(game, human["id"])


def test_existing_games_without_first_foot_evidence_do_not_guess_the_first_player():
    game = rig(2, "individual")
    game.pop("firstFootPlayerId")
    player = game["players"][0]
    player["foot"] = take(game, "4")
    engine.enter_foot(game, player)
    assert "a_leg_up" not in earned(game, 0)


@pytest.mark.parametrize("count, mode, picked_up, winners", [
    (3, "individual", [], set()), (3, "individual", [0], {0}),
    (3, "individual", [0, 1], set()), (4, "partnership", [0], {0, 2}),
    (4, "partnership", [0, 2], {0, 2}), (4, "partnership", [0, 1], set()),
    (6, "partnership", [0, 3], {0, 3}), (6, "partnership", [0, 4], set()),
])
def test_sole_survivor_counts_individuals_or_distinct_teams_at_round_end(count, mode, picked_up, winners):
    game = rig(count, mode)
    for index in picked_up:
        game["players"][index]["inFoot"] = True
    assert not game.get("playerAchievements")
    scoring.prepare(game, None, "Stock exhausted")
    actual = {index for index in range(count) if "sole_survivor" in earned(game, index)}
    assert actual == winners


@pytest.mark.parametrize("zone", ["hand", "foot"])
def test_caught_red_handed_is_personal_and_excludes_black_and_laid_red_threes(zone):
    game = rig(4, "partnership")
    game["players"][0][zone] = take(game, "3", suit="hearts")
    game["players"][1]["hand"] = take(game, "3", suit="clubs")
    game["players"][2]["redThrees"] = take(game, "3", suit="diamonds")
    scoring.prepare(game, None, "Stock exhausted")
    assert "caught_red_handed" in earned(game, 0)
    for index in (1, 2, 3):
        assert "caught_red_handed" not in earned(game, index)
    view = engine.project(game, "3")
    assert "playerAchievements" not in view
    assert "caught_red_handed" not in json.dumps(view)
    engine.assert_conservation(game)


@pytest.mark.parametrize("fixture", [False, True])
def test_gameplay_unlocks_save_before_game_completion_and_exclude_fixtures(app, fixture):
    http, headers = client(app)
    sign_in(http)
    room = create(http, headers, capacity=4, scoringMode="partnership", playMode="practice")
    with app.app_context():
        row = db.session.get(Room, room["code"])
        data = copy.deepcopy(row.payload)
        data["developmentFixture"] = fixture
        game = data["game"]
        game.update(stock=list(game["cards"]), discard=[], replaced=[], actor=0, phase="play")
        for player in game["players"]:
            player.update(hand=[], foot=[], piles=[], chosen=True, inFoot=False, redThrees=[])
        player = game["players"][0]
        player["foot"] = take(game, "3", suit="hearts") + take(game, "4")
        engine.enter_foot(game, player)
        scoring.prepare(game, None, "Stock exhausted")
        row.payload = data
        db.session.commit()
    for _ in range(2):
        assert http.get(f'{ROOT}/rooms/{room["code"]}').status_code == 200
    expected = set() if fixture else {"a_leg_up", "sole_survivor", "caught_red_handed"}
    summary = http.get(ROOT + "/achievements").json
    assert set(summary["unlocks"]) == expected
    assert summary["stats"]["all"]["games"] == 0
    with app.app_context():
        assert AchievementUnlock.query.count() == len(expected)
        assert MatchResult.query.count() == 0
    second_device = app.test_client()
    sign_in(second_device)
    assert set(second_device.get(ROOT + "/achievements").json["unlocks"]) == expected
    sign_in(second_device, "2")
    assert second_device.get(ROOT + "/achievements").json["unlocks"] == []


def test_completed_result_keeps_private_gameplay_evidence_for_its_owner(app):
    from test_achievements import result
    result(app)
    with app.app_context():
        row = MatchResult.query.one()
        data = copy.deepcopy(row.payload)
        data["players"][0]["achievements"] = ["a_leg_up", "caught_red_handed"]
        row.payload = data
        db.session.commit()
    http = app.test_client()
    sign_in(http)
    assert {"a_leg_up", "caught_red_handed"} <= set(http.get(ROOT + "/achievements").json["unlocks"])
    sign_in(http, "2")
    assert http.get(ROOT + "/achievements").json["unlocks"] == []
