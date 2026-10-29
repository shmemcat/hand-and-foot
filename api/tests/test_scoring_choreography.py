import pytest
from handandfoot_server import engine, fixtures, scoring
from test_engine import book, rig, take


@pytest.mark.parametrize("mode", ["individual", "partnership"])
@pytest.mark.parametrize("phase", ["round_over", "finished"])
def test_completed_scoring_restores_every_board_for_every_viewer(mode, phase):
    game = rig(mode=mode)
    if phase == "finished":
        for side in game["sides"]:
            side["score"] = game["targetScore"] + 1000
    for side, rank in zip(game["sides"], ["K", "Q", "J", "10", "9", "8"]):
        owner = next(p for p in game["players"] if p["team"] == side["id"])
        book(game, rank, team=side["id"], creator=owner["id"])
        owner["redThrees"] = take(game, "3", 2, "hearts" if side["id"] % 2 else "diamonds")
    for index, player in enumerate(game["players"]):
        player["hand"] = take(game, "A", 2)
        player["inFoot"] = bool(index % 2)
        player["foot"] = [] if player["inFoot"] else take(game, "4", 2)
    engine.arrange_book_covers(game)
    before = {p["id"]: engine.project(game, p["id"]) for p in game["players"]}
    assert all("roundCards" not in p for view in before.values() for p in view["players"])
    engine.finish_round(game, None, "The stack ran out.")
    for side in game["sides"]:
        seat = next(i for i, p in enumerate(game["players"]) if p["team"] == side["id"])
        game = engine.apply(game, seat, {"type": "score_auto"})
        scoring_view = engine.project(game, game["players"][seat]["id"])
        assert all("roundCards" not in p for p in scoring_view["players"])
        assert any(meld["bonusLost"] for meld in scoring_view["sides"][side["id"]]["melds"])
        game = engine.apply(game, seat, {"type": "score_confirm"})
    assert game["phase"] == phase
    assert all(score["broken"] and score["canceled"] for score in game["history"][-1]["scores"])
    for player in game["players"]:
        view = engine.project(game, player["id"])
        original = before[player["id"]]
        assert view["hand"] == [game["cards"][i] for i in [*player["hand"], *player["foot"]]]
        assert view["footTop"] is None
        for public, prior, actual in zip(view["players"], original["players"], game["players"]):
            remaining = [game["cards"][i] for i in [*actual["hand"], *actual["foot"]]]
            assert public == {**prior, "roundCards": remaining, "handCount": len(remaining), "footCount": 0, "footTop": None}
        assert [side["melds"] for side in view["sides"]] == [side["melds"] for side in original["sides"]]
        assert view["scoringFoot"] is None
    engine.assert_conservation(game)
    engine.deal_round(game)
    for player in game["players"]:
        assert all("roundCards" not in p for p in engine.project(game, player["id"])["players"])


def test_scoring_reveals_the_full_foot_only_to_its_owner():
    game = rig()
    own = game["players"][0]
    own["foot"] = [game["stock"].pop() for _ in range(11)]
    ids = set(own["foot"])
    assert engine.project(game, own["id"])["scoringFoot"] is None
    engine.finish_round(game, None, "The stack ran out.")
    view = engine.project(game, own["id"])
    assert {card["id"] for card in view["scoringFoot"]} == ids
    for player in game["players"][1:]:
        other = engine.project(game, player["id"])
        assert ids.isdisjoint(card["id"] for card in other["scoringFoot"])
        assert next(p for p in other["players"] if p["id"] == own["id"])["footTop"] == view["footTop"]
        assert not any(card_id in str(other) for card_id in own["foot"][1:])


@pytest.mark.parametrize("fixture", fixtures.SCORING_FIXTURES)
def test_live_scoring_fixtures_conserve_cards_and_wait_for_confirmation(fixture):
    players = [{"id": str(i), "name": f"Player {i}", "bot": i != 0} for i in range(6)]
    game = engine.new_game(players, "individual", seed=47)
    fixtures.populate(game, fixture)
    engine.assert_conservation(game)
    assert game["phase"] == "scoring"
    before = game["sides"][0]["score"]
    game = engine.apply(game, 0, {"type": "score_auto"})
    assert game["phase"] == "scoring"
    assert game["sides"][0]["score"] == before
    assert not game["scoring"]["sides"][0]["confirmed"]
    score = scoring.project_review(game, 0)["score"]
    if fixture == "score-reds":
        assert score["total"] == -5 and score["redThrees"] == 0
    if fixture == "score-exhausted":
        assert all(scoring.project_review(game, team)["score"]["goingOut"] == 0 for team in range(6))
    for team in range(6):
        game = engine.apply(game, team, {"type": "score_auto"})
        game = engine.apply(game, team, {"type": "score_confirm"})
    assert game["phase"] == ("finished" if fixture == "score-finish" else "round_over")
    assert game["sides"][0]["score"] == before + score["total"]
