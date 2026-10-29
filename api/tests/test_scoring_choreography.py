import pytest
from handandfoot_server import engine, fixtures, scoring
from test_engine import rig


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
        assert not any(card_id in str(other) for card_id in ids)


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
